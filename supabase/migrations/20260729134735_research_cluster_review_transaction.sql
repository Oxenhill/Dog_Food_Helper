alter table public.research_documents
  add column access_type text not null default 'metadata_pending'
  check (access_type in (
    'open_access_full_text',
    'abstract_only',
    'uploaded_full_text_private',
    'metadata_pending'
  ));

update public.research_documents
set access_type = case
  when open_access then 'open_access_full_text'
  when abstract_only then 'abstract_only'
  else 'metadata_pending'
end;

comment on column public.research_documents.access_type
is 'Honest source-access label. An uploaded private full text is never mislabeled as open access.';

-- Existing successfully parsed dog reports may have been marked needs_review
-- solely because one extracted label was uncertain. Exact accepted findings
-- are already safe to use; uncertain findings remain excluded individually.
update public.dog_documents d
set processing_status = 'partial'
where d.processing_status = 'needs_review'
  and d.source_file_deleted_at is not null
  and exists (
    select 1
    from public.dog_document_findings f
    where f.document_id = d.id
      and f.review_status = 'accepted'
  );

create or replace function public.review_research_evidence_cluster(
  p_cluster_id uuid,
  p_action text,
  p_reviewer_id uuid,
  p_review_note text default null
)
returns public.research_evidence_clusters
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cluster public.research_evidence_clusters;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'Unsupported cluster review action';
  end if;
  if p_action = 'reject' and length(btrim(coalesce(p_review_note, ''))) = 0 then
    raise exception 'A rejection note is required';
  end if;

  select *
  into v_cluster
  from public.research_evidence_clusters
  where id = p_cluster_id
  for update;

  if not found then
    raise exception 'Evidence cluster not found';
  end if;
  if v_cluster.status not in ('draft', 'queued_for_review') then
    raise exception 'Evidence cluster is not awaiting review';
  end if;
  if not exists (
    select 1
    from public.research_evidence_cluster_members m
    where m.cluster_id = p_cluster_id
  ) then
    raise exception 'Evidence cluster has no source-backed claims';
  end if;

  if p_action = 'approve' then
    if exists (
      select 1
      from public.research_evidence_cluster_members m
      join public.research_claims c on c.id = m.claim_id
      join public.research_documents d on d.id = c.document_id
      left join public.research_chunks ch
        on ch.id = c.chunk_id and ch.document_id = c.document_id
      where m.cluster_id = p_cluster_id
        and (
          c.status in ('rejected', 'superseded')
          or d.retracted
          or d.superseded_by is not null
          or ch.id is null
          or position(c.supporting_quote in ch.content) = 0
        )
    ) then
      raise exception 'Cluster contains an ineligible source claim';
    end if;

    update public.research_claims c
    set
      status = 'active',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
    from public.research_evidence_cluster_members m
    where m.cluster_id = p_cluster_id
      and m.claim_id = c.id
      and c.status in ('draft', 'queued_for_review');

    update public.research_evidence_cluster_members
    set independently_reviewed = true
    where cluster_id = p_cluster_id;

    update public.research_evidence_clusters
    set
      status = 'active',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
    where id = p_cluster_id
    returning * into v_cluster;
  else
    update public.research_claims c
    set
      status = 'rejected',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
    from public.research_evidence_cluster_members m
    where m.cluster_id = p_cluster_id
      and m.claim_id = c.id
      and c.status in ('draft', 'queued_for_review');

    update public.research_evidence_clusters
    set
      status = 'rejected',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
    where id = p_cluster_id
    returning * into v_cluster;
  end if;

  return v_cluster;
end
$function$;

revoke all on function public.review_research_evidence_cluster(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.review_research_evidence_cluster(uuid, text, uuid, text)
  to service_role;

comment on function public.review_research_evidence_cluster(uuid, text, uuid, text)
is 'Atomic explicit review of a structured proposition cluster and its queued source claims. No automatic activation path calls this function.';
