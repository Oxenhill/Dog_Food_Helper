-- P4 study-family deduplication behavioural assertions.
-- Run against supabase/tests/p3_minimal_research_fixture.sql plus
-- supabase/migrations/20260802170000_research_graph_projection.sql plus
-- supabase/migrations/20260802190000_research_document_study_family.sql
-- applied on top, in that order. Disposable validation only -- not part of
-- the migration history.

-- D1: primary document (eligible, no duplicate link).
insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, authors)
values
  ('10000000-0000-0000-0000-000000000001', 'Primary Study', false, 'dog', 'rct', 30, true, false,
   array['smith j', 'doe a']);

-- D2: preprint duplicate of D1, detected automatically.
insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, authors,
   duplicate_of_document_id, duplicate_match_basis, duplicate_detected_at)
values
  ('10000000-0000-0000-0000-000000000002', 'Primary Study (preprint)', false, 'dog', 'rct', 30, true, true,
   array['smith j', 'doe a'],
   '10000000-0000-0000-0000-000000000001',
   '{"method": "title_and_authors", "title_similarity": 0.97, "matched_authors": ["smith j"], "publication_year_delta": 0}'::jsonb,
   now());

-- D3: retracted document, otherwise a duplicate target candidate but should
-- not produce a SAME_STUDY_FAMILY edge because it never becomes an eligible
-- research_graph_documents node.
insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, authors)
values
  ('10000000-0000-0000-0000-000000000003', 'Retracted Study', true, 'dog', 'rct', 30, true, false,
   array['jones k']);

insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, authors,
   duplicate_of_document_id, duplicate_match_basis, duplicate_detected_at)
values
  ('10000000-0000-0000-0000-000000000004', 'Retracted Study (press release)', false, 'dog', 'rct', 30, true, false,
   array['jones k'],
   '10000000-0000-0000-0000-000000000003',
   '{"method": "title_and_authors", "title_similarity": 0.99, "matched_authors": ["jones k"], "publication_year_delta": 0}'::jsonb,
   now());

-- ============ Trigger: no chains ============

do $$
begin
  begin
    insert into public.research_documents (id, title, species, duplicate_of_document_id)
    values ('10000000-0000-0000-0000-000000000005', 'Chained duplicate attempt', 'dog',
            '10000000-0000-0000-0000-000000000002');
    raise exception 'expected trigger to reject duplicate_of_document_id pointing at a duplicate (chain)';
  exception
    when others then
      if position('must reference a primary document' in sqlerrm) = 0 then
        raise exception 'unexpected error from chain-prevention trigger: %', sqlerrm;
      end if;
  end;
end
$$;

do $$
begin
  begin
    insert into public.research_documents (id, title, species, duplicate_of_document_id)
    values ('10000000-0000-0000-0000-000000000006', 'Nonexistent target', 'dog',
            '99999999-0000-0000-0000-000000000000');
    raise exception 'expected trigger to reject duplicate_of_document_id pointing at a nonexistent document';
  exception
    when others then
      if position('does not reference an existing document' in sqlerrm) = 0 then
        raise exception 'unexpected error from nonexistent-target check: %', sqlerrm;
      end if;
  end;
end
$$;

do $$
begin
  begin
    update public.research_documents
    set duplicate_of_document_id = '10000000-0000-0000-0000-000000000001'
    where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'expected self-reference check constraint to reject duplicate_of_document_id = id';
  exception
    when others then
      if position('research_documents_duplicate_not_self' in sqlerrm) = 0 then
        raise exception 'unexpected error from self-reference check: %', sqlerrm;
      end if;
  end;
end
$$;

-- ============ research_graph_edges_same_study_family ============

do $$
declare
  v_count integer;
begin
  -- Exactly one edge expected: D2 -> D1. D4 -> D3 is excluded because D3
  -- (the primary target) is retracted and never becomes an eligible
  -- research_graph_documents node.
  select count(*) into v_count from public.research_graph_edges_same_study_family;
  if v_count <> 1 then
    raise exception 'expected exactly 1 SAME_STUDY_FAMILY edge, got %', v_count;
  end if;

  if not exists (
    select 1 from public.research_graph_edges_same_study_family
    where duplicate_document_id = '10000000-0000-0000-0000-000000000002'
      and primary_document_id = '10000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'expected SAME_STUDY_FAMILY edge D2 (duplicate) -> D1 (primary)';
  end if;

  if exists (
    select 1 from public.research_graph_edges_same_study_family
    where duplicate_document_id = '10000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'D4 -> D3 must not appear: D3 (the primary target) is retracted, so it is not an eligible research_graph_documents node';
  end if;

  raise notice 'P4 SAME_STUDY_FAMILY edge assertions: ALL PASSED';
end
$$;

-- match_basis and detected_at must be carried through onto the edge (the
-- transparency substitute for "reviewed" metadata, since this edge has no
-- human reviewer by construction).

do $$
declare
  v_basis jsonb;
begin
  select match_basis into v_basis
  from public.research_graph_edges_same_study_family
  where duplicate_document_id = '10000000-0000-0000-0000-000000000002';

  if v_basis is null or v_basis ->> 'method' <> 'title_and_authors' then
    raise exception 'expected match_basis to be carried through onto the SAME_STUDY_FAMILY edge, got %', v_basis;
  end if;

  raise notice 'P4 match_basis transparency assertion: PASSED';
end
$$;

-- ============ RLS/grant assertions ============

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'research_graph_edges_same_study_family'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_count <> 0 then
    raise exception 'expected zero anon/authenticated/PUBLIC grants on research_graph_edges_same_study_family, found %', v_count;
  end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'research_graph_edges_same_study_family'
    and grantee = 'service_role'
    and privilege_type = 'SELECT';
  if v_count <> 1 then
    raise exception 'expected exactly 1 service_role SELECT grant on research_graph_edges_same_study_family, found %', v_count;
  end if;

  raise notice 'P4 grant assertions: ALL PASSED';
end
$$;
