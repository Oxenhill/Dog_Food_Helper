-- Owner edit-before-approval for queued structured evidence.
--
-- The application validates the same food-match and dog-context allowlists used
-- at runtime. This function supplies the transactional database boundary:
-- queued/draft only, optimistic concurrency, collision-safe identity update,
-- and atomic replacement of applicability rows.

alter table public.research_evidence_clusters
  add column last_edited_by uuid references auth.users(id) on delete set null,
  add column last_edited_at timestamptz,
  add constraint research_evidence_clusters_edit_metadata_check
    check (
      (last_edited_by is null and last_edited_at is null)
      or (last_edited_by is not null and last_edited_at is not null)
    );

comment on column public.research_evidence_clusters.last_edited_by
is 'Last authenticated admin to edit this queued proposition before review.';
comment on column public.research_evidence_clusters.last_edited_at
is 'Time of the last queued proposition edit. Approval remains a separate action.';

create or replace function public.edit_research_evidence_cluster(
  p_cluster_id uuid,
  p_expected_updated_at timestamptz,
  p_editor_id uuid,
  p_cluster_identity text,
  p_label text,
  p_subject_type text,
  p_subject_value text,
  p_outcome_type text,
  p_outcome_value text,
  p_direction text,
  p_cautious_summary text,
  p_contexts jsonb
)
returns public.research_evidence_clusters
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cluster public.research_evidence_clusters;
  v_context jsonb;
  v_context_count integer;
begin
  if p_editor_id is null then
    raise exception 'Editor identity is required';
  end if;
  if p_cluster_identity !~ '^[0-9a-f]{64}$' then
    raise exception 'Cluster identity is invalid';
  end if;
  if p_contexts is null or jsonb_typeof(p_contexts) <> 'array' then
    raise exception 'Applicability contexts must be an array';
  end if;
  v_context_count := jsonb_array_length(p_contexts);
  if v_context_count > 8 then
    raise exception 'No more than eight applicability contexts are allowed';
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
    raise exception 'Only queued evidence clusters may be edited';
  end if;
  if v_cluster.reviewed_by is not null or v_cluster.reviewed_at is not null then
    raise exception 'Reviewed evidence clusters may not be edited';
  end if;
  if v_cluster.updated_at is distinct from p_expected_updated_at then
    raise exception 'Evidence cluster changed since it was loaded';
  end if;
  if exists (
    select 1
    from public.research_evidence_clusters other
    where other.cluster_identity = p_cluster_identity
      and other.id <> p_cluster_id
  ) then
    raise exception 'An evidence cluster with this identity already exists';
  end if;

  for v_context in select value from jsonb_array_elements(p_contexts)
  loop
    if coalesce(v_context->>'context_type', '') not in (
      'health_condition',
      'document_finding',
      'life_stage',
      'restriction',
      'outcome_metric'
    ) then
      raise exception 'Unsupported applicability context type';
    end if;
    if length(btrim(coalesce(v_context->>'context_key', ''))) = 0 then
      raise exception 'Applicability context key is required';
    end if;
    if coalesce(v_context->>'match_operator', 'exact') not in ('exact', 'enum') then
      raise exception 'Unsupported applicability match operator';
    end if;
    if v_context->>'context_type' = 'document_finding'
      and lower(btrim(v_context->>'context_key')) not in (
        'firmicutes',
        'proteobacteria',
        'fusobacteria',
        'bacteroidales',
        'clostridia',
        'prevotella',
        'diversity',
        'species richness',
        'dysbiosis pattern score',
        'microbiome classification'
      ) then
      raise exception 'Unsupported document finding context';
    end if;
    if v_context->>'context_type' = 'life_stage'
      and lower(btrim(v_context->>'context_key')) not in (
        'growth',
        'puppy',
        'adult',
        'senior'
      ) then
      raise exception 'Unsupported life-stage context';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_contexts) as items(context)
    group by
      context->>'context_type',
      lower(btrim(context->>'context_key')),
      lower(btrim(coalesce(context->>'context_value', '')))
    having count(*) > 1
  ) then
    raise exception 'Applicability contexts must be unique';
  end if;

  update public.research_evidence_clusters
  set
    cluster_identity = p_cluster_identity,
    label = p_label,
    subject_type = p_subject_type,
    subject_value = p_subject_value,
    outcome_type = p_outcome_type,
    outcome_value = p_outcome_value,
    direction = p_direction,
    cautious_summary = p_cautious_summary,
    last_edited_by = p_editor_id,
    last_edited_at = now(),
    updated_at = now()
  where id = p_cluster_id
  returning * into v_cluster;

  delete from public.research_cluster_applicability
  where cluster_id = p_cluster_id;

  insert into public.research_cluster_applicability (
    cluster_id,
    context_type,
    context_key,
    context_value,
    match_operator,
    required
  )
  select
    p_cluster_id,
    context->>'context_type',
    btrim(context->>'context_key'),
    nullif(btrim(context->>'context_value'), ''),
    coalesce(context->>'match_operator', 'exact'),
    true
  from jsonb_array_elements(p_contexts) as items(context);

  return v_cluster;
end
$function$;

revoke all on function public.edit_research_evidence_cluster(
  uuid,
  timestamptz,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.edit_research_evidence_cluster(
  uuid,
  timestamptz,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

comment on function public.edit_research_evidence_cluster(
  uuid,
  timestamptz,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) is 'Atomically edits only unreviewed queued evidence and replaces deterministic dog-profile applicability before explicit approval.';
