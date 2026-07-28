-- Private owner documents and literal, document-backed findings.
--
-- Research-layer sequence steps 1-2 only. These relations stay in public
-- (the authenticated application schema), never catalogue. Every policy is
-- explicit so RLS cannot fail closed in a way that looks like missing data.

create table public.dog_documents (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null
    check (document_type in ('gut_biome', 'allergen_test', 'vet_report', 'other')),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  storage_path text not null unique check (length(btrim(storage_path)) > 0),
  extracted_text text not null default '',
  lab_name text,
  collected_date date,
  processing_status text not null default 'pending'
    check (
      processing_status in (
        'pending', 'extracted', 'partial', 'needs_review',
        'unsupported_lab', 'failed'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dog_documents_id_dog_owner_key unique (id, dog_id, owner_id)
);

create table public.dog_document_findings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  dog_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  finding_type text not null
    check (finding_type in ('biome_marker', 'allergen_reactive', 'allergen_clear')),
  marker_name text not null check (length(btrim(marker_name)) > 0),
  value text,
  unit text,
  reference_range text,
  interpretation_flag text
    check (
      interpretation_flag is null
      or interpretation_flag in ('high', 'low', 'normal', 'reactive', 'unclear')
    ),
  verbatim_source_text text not null,
  created_at timestamptz not null default now(),
  constraint dog_document_findings_document_owner_fkey
    foreign key (document_id, dog_id, owner_id)
    references public.dog_documents (id, dog_id, owner_id)
    on delete cascade,
  -- Database-level backstop for the application assertion. Evidence-bearing
  -- values must occur exactly, case-sensitively, in the stored source text.
  -- Null remains valid and is never replaced with a guessed value.
  constraint dog_document_findings_literal_substrings_check check (
    length(verbatim_source_text) > 0
    and strpos(verbatim_source_text, marker_name) > 0
    and (value is null or strpos(verbatim_source_text, value) > 0)
    and (unit is null or strpos(verbatim_source_text, unit) > 0)
    and (
      reference_range is null
      or strpos(verbatim_source_text, reference_range) > 0
    )
    and (
      interpretation_flag is null
      or strpos(verbatim_source_text, interpretation_flag) > 0
    )
  )
);

create index dog_documents_owner_dog_created_idx
  on public.dog_documents (owner_id, dog_id, created_at desc);

create index dog_document_findings_owner_dog_idx
  on public.dog_document_findings (owner_id, dog_id);

create index dog_document_findings_document_idx
  on public.dog_document_findings (document_id);

alter table public.dog_documents enable row level security;
alter table public.dog_document_findings enable row level security;

create policy "owners select their own dog documents"
on public.dog_documents
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "owners insert their own dog documents"
on public.dog_documents
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.dogs
    where dogs.id = dog_documents.dog_id
      and dogs.owner_id = (select auth.uid())
  )
);

create policy "owners update their own dog documents"
on public.dog_documents
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.dogs
    where dogs.id = dog_documents.dog_id
      and dogs.owner_id = (select auth.uid())
  )
);

create policy "owners delete their own dog documents"
on public.dog_documents
for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy "owners select their own document findings"
on public.dog_document_findings
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "owners insert their own document findings"
on public.dog_document_findings
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.dog_documents
    where dog_documents.id = dog_document_findings.document_id
      and dog_documents.dog_id = dog_document_findings.dog_id
      and dog_documents.owner_id = (select auth.uid())
  )
);

create policy "owners update their own document findings"
on public.dog_document_findings
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.dog_documents
    where dog_documents.id = dog_document_findings.document_id
      and dog_documents.dog_id = dog_document_findings.dog_id
      and dog_documents.owner_id = (select auth.uid())
  )
);

create policy "owners delete their own document findings"
on public.dog_document_findings
for delete
to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.dog_documents from anon;
revoke all on table public.dog_document_findings from anon;
grant select, insert, update, delete on table public.dog_documents to authenticated;
grant select, insert, update, delete on table public.dog_document_findings to authenticated;

-- Private 10 MiB PDF bucket. Object names are always:
-- owner UUID / dog UUID / document UUID.pdf
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dog-documents',
  'dog-documents',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "owners read their own dog document objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owners upload their own dog document objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owners update their own dog document objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owners delete their own dog document objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Explicit privacy inventory. This complements the general catalogue-export
-- boundary with a named list of every permanently private relation, including
-- the two added above. The scheduled wrapper executes it daily.
create or replace function public.assert_private_tables_stay_private()
returns void
language plpgsql
set search_path to ''
as $function$
declare
  private_tables constant text[] := array[
    'dogs',
    'dog_baselines',
    'dog_document_findings',
    'dog_documents',
    'dog_food_events',
    'dog_food_switch_analyses',
    'dog_health_conditions',
    'dog_ingredient_suspects',
    'dog_log_entries',
    'dog_recommendation_sets',
    'dog_red_flag_events',
    'dog_restrictions',
    'dog_weight_logs',
    'user_profiles',
    'contributed_foods'
  ];
  missing_or_unprotected_count integer;
  published_relation_count integer;
  published_dependency_count integer;
  privileged_relation_count integer;
begin
  select count(*) into missing_or_unprotected_count
  from unnest(private_tables) as private_table(table_name)
  left join pg_catalog.pg_namespace n
    on n.nspname = 'public'
  left join pg_catalog.pg_class c
    on c.relnamespace = n.oid
   and c.relname = private_table.table_name
   and c.relkind in ('r', 'p')
  where c.oid is null or not c.relrowsecurity;

  if missing_or_unprotected_count > 0 then
    raise exception
      'private-table boundary: % listed relation(s) are missing from public or do not have RLS enabled',
      missing_or_unprotected_count;
  end if;

  select count(*) into published_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'catalogue'
    and c.relname = any(private_tables)
    and c.relkind in ('r', 'v', 'm', 'p', 'f');

  if published_relation_count > 0 then
    raise exception
      'private-table boundary: % private relation name(s) exist in catalogue',
      published_relation_count;
  end if;

  select count(distinct private_class.oid) into published_dependency_count
  from pg_catalog.pg_rewrite rw
  join pg_catalog.pg_class view_class on view_class.oid = rw.ev_class
  join pg_catalog.pg_namespace view_ns on view_ns.oid = view_class.relnamespace
  join pg_catalog.pg_depend d
    on d.objid = rw.oid
   and d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
   and d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
  join pg_catalog.pg_class private_class on private_class.oid = d.refobjid
  join pg_catalog.pg_namespace private_ns on private_ns.oid = private_class.relnamespace
  where view_ns.nspname = 'catalogue'
    and private_ns.nspname = 'public'
    and private_class.relname = any(private_tables);

  if published_dependency_count > 0 then
    raise exception
      'private-table boundary: catalogue views depend on % private relation(s)',
      published_dependency_count;
  end if;

  select count(*) into privileged_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(private_tables)
    and pg_catalog.has_table_privilege(
      'catalogue_export',
      c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    );

  if privileged_relation_count > 0 then
    raise exception
      'private-table boundary: catalogue_export holds privileges on % private relation(s)',
      privileged_relation_count;
  end if;
end;
$function$;

create or replace function public.run_scheduled_assertions()
returns void
language plpgsql
set search_path to ''
as $function$
begin
  begin
    perform public.assert_complete_foods_have_ingredients();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_complete_foods_have_ingredients'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_complete_foods_have_ingredients', sqlerrm);
    end if;
  end;

  begin
    perform public.assert_catalogue_export_boundary();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_catalogue_export_boundary'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_catalogue_export_boundary', sqlerrm);
    end if;
  end;

  begin
    perform public.assert_catalogue_excludes_unapproved_domains();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_catalogue_excludes_unapproved_domains'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_catalogue_excludes_unapproved_domains', sqlerrm);
    end if;
  end;

  begin
    perform public.assert_private_tables_stay_private();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_private_tables_stay_private'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_private_tables_stay_private', sqlerrm);
    end if;
  end;
end;
$function$;
