-- P1 research control plane: immutable model routing and literature-source policy.
--
-- This migration is deliberately separate from the food-catalogue crawling policy.
-- None of these tables references source_domain_allowlist, crawl_targets,
-- manufacturer_target_domains, manufacturer_entities, or terms_clause_patterns.
-- It adds no crawler and does not change evidence, food, dog, private-report, or
-- recommendation-ranking data.

create table public.research_model_configuration_sets (
  id uuid primary key default gen_random_uuid(),
  configuration_key text not null,
  version integer not null check (version > 0),
  effective_from timestamptz not null,
  effective_until timestamptz,
  change_note text not null,
  created_at timestamptz not null default now(),
  unique (configuration_key, version),
  check (effective_until is null or effective_until > effective_from)
);

create table public.research_model_stage_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  configuration_set_id uuid not null
    references public.research_model_configuration_sets(id) on delete restrict,
  stage_key text not null
    check (stage_key in (
      'discovery',
      'source_acquisition',
      'document_ingestion',
      'relevance_selection',
      'claim_drafting',
      'clustering',
      'review_handoff'
    )),
  version integer not null check (version > 0),
  prompt_template_sha256 text
    check (prompt_template_sha256 is null or prompt_template_sha256 ~ '^[0-9a-f]{64}$'),
  structured_output_schema_version text,
  parameters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(parameters) = 'object'),
  fallback_policy text not null
    check (fallback_policy in ('fail_closed', 'no_fallback')),
  created_at timestamptz not null default now(),
  unique (configuration_set_id, stage_key),
  unique (configuration_set_id, stage_key, version)
);

create table public.research_model_stage_routes (
  id uuid primary key default gen_random_uuid(),
  stage_configuration_version_id uuid not null
    references public.research_model_stage_configuration_versions(id) on delete restrict,
  route_key text not null check (route_key ~ '^[a-z][a-z0-9_]*$'),
  execution_kind text not null
    check (execution_kind in ('deterministic', 'embedding_model', 'language_model', 'human_review')),
  provider text not null,
  model_identifier text not null,
  parameters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(parameters) = 'object'),
  created_at timestamptz not null default now(),
  unique (stage_configuration_version_id, route_key)
);

create table public.research_discovery_question_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version integer not null check (version > 0),
  definition_sha256 text not null check (definition_sha256 ~ '^[0-9a-f]{64}$'),
  definition_reference text not null,
  question_policy jsonb not null check (jsonb_typeof(question_policy) = 'object'),
  effective_from timestamptz not null,
  effective_until timestamptz,
  change_note text not null,
  created_at timestamptz not null default now(),
  unique (policy_key, version),
  check (effective_until is null or effective_until > effective_from)
);

create table public.research_evidence_admissibility_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version integer not null check (version > 0),
  definition_sha256 text not null check (definition_sha256 ~ '^[0-9a-f]{64}$'),
  definition_reference text not null,
  admissibility_rules jsonb not null check (jsonb_typeof(admissibility_rules) = 'object'),
  deterministic_rejection_reason_codes text[] not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  change_note text not null,
  created_at timestamptz not null default now(),
  unique (policy_key, version),
  check (effective_until is null or effective_until > effective_from)
);

create table public.research_literature_registry_versions (
  id uuid primary key default gen_random_uuid(),
  registry_key text not null,
  version integer not null check (version > 0),
  effective_from timestamptz not null,
  effective_until timestamptz,
  owner_approval_reference text not null,
  change_note text not null,
  created_at timestamptz not null default now(),
  unique (registry_key, version),
  check (effective_until is null or effective_until > effective_from)
);

create table public.research_literature_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (source_key ~ '^[a-z][a-z0-9_]*$'),
  authoritative_name text not null,
  owning_organisation text not null,
  created_at timestamptz not null default now()
);

create table public.research_literature_source_versions (
  id uuid primary key default gen_random_uuid(),
  registry_version_id uuid not null
    references public.research_literature_registry_versions(id) on delete restrict,
  source_id uuid not null
    references public.research_literature_sources(id) on delete restrict,
  version integer not null check (version > 0),
  base_url text not null check (base_url ~ '^https://'),
  endpoint_templates jsonb not null check (jsonb_typeof(endpoint_templates) = 'object'),
  capabilities text[] not null,
  authentication_method text not null,
  adapter_key text not null,
  adapter_version integer not null check (adapter_version > 0),
  parser_key text not null,
  parser_version integer not null check (parser_version > 0),
  provenance_mapping jsonb not null check (jsonb_typeof(provenance_mapping) = 'object'),
  created_at timestamptz not null default now(),
  unique (registry_version_id, source_id),
  unique (source_id, version)
);

create table public.research_literature_source_policy_versions (
  id uuid primary key default gen_random_uuid(),
  source_version_id uuid not null
    references public.research_literature_source_versions(id) on delete restrict,
  version integer not null check (version > 0),
  decision text not null check (decision in ('allowed', 'blocked')),
  blocked_reason_code text
    check (blocked_reason_code is null or blocked_reason_code ~ '^[a-z][a-z0-9_]*$'),
  access_method text not null
    check (access_method in ('structured_api', 'owner_upload')),
  allowed_purposes text[] not null,
  robots_status text not null
    check (robots_status in ('reviewed_allowed', 'reviewed_disallowed', 'not_applicable_structured_api')),
  robots_reviewed_at timestamptz not null,
  robots_reference_url text not null check (robots_reference_url ~ '^https://'),
  terms_status text not null
    check (terms_status in ('reviewed_allowed', 'reviewed_with_conditions', 'reviewed_disallowed')),
  terms_reviewed_at timestamptz not null,
  terms_url text not null check (terms_url ~ '^https://'),
  licence_status text not null
    check (licence_status in ('per_record_rights_apply', 'open_access_flag_and_item_licence', 'owner_supplied')),
  licence_policy text not null,
  paywall_policy text not null check (paywall_policy in ('reject', 'not_applicable')),
  captcha_policy text not null check (captcha_policy in ('reject', 'not_applicable')),
  rate_limit_requests integer not null check (rate_limit_requests > 0),
  rate_limit_window_ms integer not null check (rate_limit_window_ms > 0),
  minimum_interval_ms integer not null check (minimum_interval_ms >= 0),
  retry_limit smallint not null check (retry_limit between 0 and 10),
  human_approval_required boolean not null,
  human_approval_status text not null
    check (human_approval_status in ('approved', 'pending', 'rejected', 'not_required')),
  human_approval_reference text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  deterministic_rejection_reason_codes text[] not null,
  notes text not null,
  created_at timestamptz not null default now(),
  unique (source_version_id, version),
  check (effective_until is null or effective_until > effective_from),
  check (
    (decision = 'allowed' and blocked_reason_code is null)
    or (decision = 'blocked' and blocked_reason_code is not null)
  ),
  check (
    not human_approval_required
    or human_approval_status in ('approved', 'pending', 'rejected')
  )
);

create table public.research_literature_source_routes (
  id uuid primary key default gen_random_uuid(),
  registry_version_id uuid not null
    references public.research_literature_registry_versions(id) on delete restrict,
  operation_key text not null check (operation_key ~ '^[a-z][a-z0-9_]*$'),
  route_priority smallint not null check (route_priority > 0),
  source_version_id uuid not null
    references public.research_literature_source_versions(id) on delete restrict,
  source_policy_version_id uuid not null
    references public.research_literature_source_policy_versions(id) on delete restrict,
  endpoint_key text not null check (endpoint_key ~ '^[a-z][a-z0-9_]*$'),
  route_conditions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(route_conditions) = 'object'),
  created_at timestamptz not null default now(),
  unique (registry_version_id, operation_key, route_priority)
);

comment on table public.research_literature_registry_versions is
  'Versioned registry for literature APIs and owner uploads only. It is intentionally independent of the food-catalogue source_domain_allowlist and manufacturer crawl-permission tables.';
comment on table public.research_discovery_question_policy_versions is
  'Versioned definition of questions used to find candidate documents. It does not decide whether acquired evidence is admissible.';
comment on table public.research_evidence_admissibility_policy_versions is
  'Versioned evidence-scope rules applied after permitted acquisition. It does not grant source access or choose discovery endpoints.';

insert into public.research_model_configuration_sets (
  configuration_key, version, effective_from, change_note
) values (
  'bowl_research',
  1,
  '2026-08-01 00:00:00+00',
  'Initial P1 immutable stage-routing snapshot for the existing research mission paths.'
);

insert into public.research_model_stage_configuration_versions (
  configuration_set_id,
  stage_key,
  version,
  prompt_template_sha256,
  structured_output_schema_version,
  parameters,
  fallback_policy
)
select
  model_set.id,
  stage.stage_key,
  1,
  stage.prompt_template_sha256,
  stage.structured_output_schema_version,
  stage.parameters,
  stage.fallback_policy
from public.research_model_configuration_sets model_set
cross join (values
  ('discovery', null, 'research_discovery_candidate_v1', '{"model_calls":0,"generated_queries_are_untrusted":true}'::jsonb, 'no_fallback'),
  ('source_acquisition', null, 'literature_source_route_v1', '{"bypass_fallbacks":false}'::jsonb, 'fail_closed'),
  ('document_ingestion', null, 'research_embedding_1024_v1', '{"batch_size":64,"dimensions":1024}'::jsonb, 'fail_closed'),
  ('relevance_selection', null, 'research_embedding_1024_v1', '{"dimensions":1024,"selection_limit":8}'::jsonb, 'fail_closed'),
  ('claim_drafting', 'e3de90868d2d161dc4450578ca1824b8c15477a4df37c3bb2553f78d16081913', 'research_draft_claim_v2', '{"max_output_tokens":3200,"max_retries":0,"temperature":0,"provider_effort":"low"}'::jsonb, 'fail_closed'),
  ('clustering', null, 'research_cluster_identity_v1', '{"model_calls":0}'::jsonb, 'no_fallback'),
  ('review_handoff', null, 'owner_review_transaction_v1', '{"activation_authority":"owner_only"}'::jsonb, 'no_fallback')
) as stage(stage_key, prompt_template_sha256, structured_output_schema_version, parameters, fallback_policy)
where model_set.configuration_key = 'bowl_research' and model_set.version = 1;

insert into public.research_model_stage_routes (
  stage_configuration_version_id,
  route_key,
  execution_kind,
  provider,
  model_identifier,
  parameters
)
select stage.id, route.route_key, route.execution_kind, route.provider, route.model_identifier, route.parameters
from public.research_model_stage_configuration_versions stage
join public.research_model_configuration_sets model_set on model_set.id = stage.configuration_set_id
join (values
  ('discovery', 'discovery_query', 'deterministic', 'internal', 'bowl/pubmed-query-builder-v1', '{}'::jsonb),
  ('source_acquisition', 'structured_source', 'deterministic', 'internal', 'bowl/literature-source-router-v1', '{}'::jsonb),
  ('document_ingestion', 'semantic_embedding', 'embedding_model', 'vercel_ai_gateway', 'voyage/voyage-4', '{"dimensions":1024}'::jsonb),
  ('relevance_selection', 'semantic_embedding', 'embedding_model', 'vercel_ai_gateway', 'voyage/voyage-4', '{"dimensions":1024}'::jsonb),
  ('claim_drafting', 'draft_generation', 'language_model', 'vercel_ai_gateway', 'anthropic/claude-sonnet-5', '{"temperature":0,"max_output_tokens":3200,"max_retries":0}'::jsonb),
  ('claim_drafting', 'semantic_embedding', 'embedding_model', 'vercel_ai_gateway', 'voyage/voyage-4', '{"dimensions":1024}'::jsonb),
  ('clustering', 'cluster_identity', 'deterministic', 'internal', 'bowl/research-cluster-identity-v1', '{}'::jsonb),
  ('review_handoff', 'owner_review', 'human_review', 'internal', 'bowl/owner-review-v1', '{}'::jsonb)
) as route(stage_key, route_key, execution_kind, provider, model_identifier, parameters)
  on route.stage_key = stage.stage_key
where model_set.configuration_key = 'bowl_research' and model_set.version = 1;

insert into public.research_discovery_question_policy_versions (
  policy_key,
  version,
  definition_sha256,
  definition_reference,
  question_policy,
  effective_from,
  change_note
) values (
  'bowl_research_questions',
  1,
  '77211efe8e0d4ad418314e7afa3fd3bb0490a0b5e24ee52cfb673661763606cb',
  'src/lib/researchTopics.ts',
  '{"purpose":"find_candidate_documents","query_outputs_are_untrusted":true,"admissibility_decision":"not_performed_here"}'::jsonb,
  '2026-08-01 00:00:00+00',
  'Pins the existing owner-reviewed research question definitions without treating queries as evidence.'
);

insert into public.research_evidence_admissibility_policy_versions (
  policy_key,
  version,
  definition_sha256,
  definition_reference,
  admissibility_rules,
  deterministic_rejection_reason_codes,
  effective_from,
  change_note
) values (
  'bowl_canine_outcomes',
  1,
  '47127592f1aa57bac601d0e3a5e6849a63f5af6a3460d5977d96cf5e21a26927',
  'src/lib/researchEvidenceReview.ts',
  '{"tested_food_exposure_required":true,"dog_measured_outcome_required":true,"allowed_outcomes":["dog_clinical_response","dog_biological_response","dog_digestibility_or_nutrient_status","dog_behavior_or_performance"],"product_audit_evidence_allowed":false,"private_reports_are_global_literature":false}'::jsonb,
  array['evidence_retracted','evidence_not_canine_direct','subject_not_tested_food_exposure','outcome_not_measured_as_dog_response','outcome_outside_individual_food_selection_scope'],
  '2026-08-01 00:00:00+00',
  'Separates post-acquisition evidence admissibility from discovery questions and source permission.'
);

insert into public.research_literature_registry_versions (
  registry_key,
  version,
  effective_from,
  owner_approval_reference,
  change_note
) values (
  'bowl_structured_literature',
  1,
  '2026-08-01 00:00:00+00',
  'Owner-requested P1 implementation on 2026-08-01; production release remains separately approval-gated.',
  'Initial registry contains only the existing PubMed E-utilities and Europe PMC REST paths.'
);

insert into public.research_literature_sources (
  source_key, authoritative_name, owning_organisation
) values
  ('pubmed', 'PubMed / NCBI Entrez E-utilities', 'U.S. National Library of Medicine, NCBI'),
  ('europe_pmc', 'Europe PMC RESTful Web Service', 'EMBL-EBI / Europe PMC');

insert into public.research_literature_source_versions (
  registry_version_id,
  source_id,
  version,
  base_url,
  endpoint_templates,
  capabilities,
  authentication_method,
  adapter_key,
  adapter_version,
  parser_key,
  parser_version,
  provenance_mapping
)
select
  registry.id,
  source.id,
  1,
  definition.base_url,
  definition.endpoint_templates,
  definition.capabilities,
  definition.authentication_method,
  definition.adapter_key,
  1,
  definition.parser_key,
  1,
  definition.provenance_mapping
from public.research_literature_registry_versions registry
join public.research_literature_sources source on true
join (values
  (
    'pubmed',
    'https://eutils.ncbi.nlm.nih.gov',
    '{"discovery_search":"/entrez/eutils/esearch.fcgi","citation_fetch":"/entrez/eutils/efetch.fcgi","doi_resolution":"/entrez/eutils/esearch.fcgi","abstract_content":"/entrez/eutils/efetch.fcgi"}'::jsonb,
    array['discovery_search','citation_fetch','doi_resolution','abstract_content'],
    'none_tool_and_email_required',
    'pubmed_eutils',
    'nlm_pubmed_xml',
    '{"canonical_id":"pmid","doi":"ArticleId[IdType=doi]","pmcid":"ArticleId[IdType=pmc]","literal_content":"abstract_text"}'::jsonb
  ),
  (
    'europe_pmc',
    'https://www.ebi.ac.uk/europepmc/webservices/rest',
    '{"metadata_enrichment":"/search","open_access_full_text":"/{pmcid}/fullTextXML"}'::jsonb,
    array['metadata_enrichment','open_access_full_text'],
    'none',
    'europe_pmc_rest',
    'europe_pmc_jats',
    '{"canonical_id":"pmcid","license":"license","retraction":"isRetracted","literal_content":"jats_title_abstract_body"}'::jsonb
  )
) as definition(
  source_key,
  base_url,
  endpoint_templates,
  capabilities,
  authentication_method,
  adapter_key,
  parser_key,
  provenance_mapping
) on definition.source_key = source.source_key
where registry.registry_key = 'bowl_structured_literature' and registry.version = 1;

insert into public.research_literature_source_policy_versions (
  source_version_id,
  version,
  decision,
  access_method,
  allowed_purposes,
  robots_status,
  robots_reviewed_at,
  robots_reference_url,
  terms_status,
  terms_reviewed_at,
  terms_url,
  licence_status,
  licence_policy,
  paywall_policy,
  captcha_policy,
  rate_limit_requests,
  rate_limit_window_ms,
  minimum_interval_ms,
  retry_limit,
  human_approval_required,
  human_approval_status,
  human_approval_reference,
  effective_from,
  deterministic_rejection_reason_codes,
  notes
)
select
  source_version.id,
  1,
  'allowed',
  'structured_api',
  policy.allowed_purposes,
  'not_applicable_structured_api',
  '2026-08-01 00:00:00+00',
  policy.robots_reference_url,
  'reviewed_with_conditions',
  '2026-08-01 00:00:00+00',
  policy.terms_url,
  policy.licence_status,
  policy.licence_policy,
  'reject',
  'reject',
  policy.rate_limit_requests,
  1000,
  policy.minimum_interval_ms,
  5,
  true,
  'approved',
  'Owner-requested P1 registry limited to the already-established PubMed and Europe PMC structured paths; production remains approval-gated.',
  '2026-08-01 00:00:00+00',
  array['source_not_approved','robots_disallowed','terms_disallowed','licence_disallowed','paywall_or_login_required','captcha_or_access_control','rate_limited','unsupported_content','parser_failed'],
  policy.notes
from public.research_literature_source_versions source_version
join public.research_literature_sources source on source.id = source_version.source_id
join (values
  (
    'pubmed',
    array['discovery_search','citation_fetch','doi_resolution','abstract_content'],
    'https://www.ncbi.nlm.nih.gov/robots.txt',
    'https://www.ncbi.nlm.nih.gov/home/about/policies/',
    'per_record_rights_apply',
    'NCBI does not claim copyright in PubMed abstracts; publishers or authors may. Store provenance and use abstracts only through the existing review-gated research path.',
    3,
    500,
    'Use the public E-utilities host with tool and email parameters. No more than three requests per second without an API key; Bowl uses a more conservative 500 ms minimum interval.'
  ),
  (
    'europe_pmc',
    array['metadata_enrichment','open_access_full_text'],
    'https://www.ebi.ac.uk/robots.txt',
    'https://europepmc.org/Copyright',
    'open_access_flag_and_item_licence',
    'Only the Europe PMC REST service may be automated. Full text is attempted only for records marked open access/in PMC; item-level licence metadata and provenance are retained.',
    3,
    350,
    'Europe PMC permits automated retrieval through its REST service, not the main website. The published material remains subject to item-level copyright/licence terms; Bowl applies a conservative project rate.'
  )
) as policy(
  source_key,
  allowed_purposes,
  robots_reference_url,
  terms_url,
  licence_status,
  licence_policy,
  rate_limit_requests,
  minimum_interval_ms,
  notes
) on policy.source_key = source.source_key;

insert into public.research_literature_source_routes (
  registry_version_id,
  operation_key,
  route_priority,
  source_version_id,
  source_policy_version_id,
  endpoint_key,
  route_conditions
)
select
  source_version.registry_version_id,
  route.operation_key,
  route.route_priority,
  source_version.id,
  policy.id,
  route.endpoint_key,
  route.route_conditions
from public.research_literature_source_versions source_version
join public.research_literature_sources source on source.id = source_version.source_id
join public.research_literature_source_policy_versions policy
  on policy.source_version_id = source_version.id and policy.version = 1
join (values
  ('pubmed', 'discovery_search', 1::smallint, 'discovery_search', '{}'::jsonb),
  ('pubmed', 'citation_fetch', 1::smallint, 'citation_fetch', '{}'::jsonb),
  ('pubmed', 'doi_resolution', 1::smallint, 'doi_resolution', '{}'::jsonb),
  ('pubmed', 'abstract_content', 1::smallint, 'abstract_content', '{}'::jsonb),
  ('europe_pmc', 'metadata_enrichment', 1::smallint, 'metadata_enrichment', '{}'::jsonb),
  ('europe_pmc', 'open_access_full_text', 1::smallint, 'open_access_full_text', '{"open_access":true,"in_pmc":true}'::jsonb)
) as route(source_key, operation_key, route_priority, endpoint_key, route_conditions)
  on route.source_key = source.source_key;

alter table public.research_missions
  add column model_configuration_set_version_id uuid
    references public.research_model_configuration_sets(id) on delete restrict,
  add column discovery_question_policy_version_id uuid
    references public.research_discovery_question_policy_versions(id) on delete restrict,
  add column literature_registry_version_id uuid
    references public.research_literature_registry_versions(id) on delete restrict,
  add column evidence_admissibility_policy_version_id uuid
    references public.research_evidence_admissibility_policy_versions(id) on delete restrict;

alter table public.research_mission_stages
  add column model_stage_configuration_version_id uuid
    references public.research_model_stage_configuration_versions(id) on delete restrict,
  add column discovery_question_policy_version_id uuid
    references public.research_discovery_question_policy_versions(id) on delete restrict,
  add column literature_registry_version_id uuid
    references public.research_literature_registry_versions(id) on delete restrict,
  add column evidence_admissibility_policy_version_id uuid
    references public.research_evidence_admissibility_policy_versions(id) on delete restrict;

create or replace function public.assign_research_mission_control_versions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.model_configuration_set_version_id is null then
    select id into new.model_configuration_set_version_id
    from public.research_model_configuration_sets
    where configuration_key = 'bowl_research'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;
  if new.discovery_question_policy_version_id is null then
    select id into new.discovery_question_policy_version_id
    from public.research_discovery_question_policy_versions
    where policy_key = 'bowl_research_questions'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;
  if new.literature_registry_version_id is null then
    select id into new.literature_registry_version_id
    from public.research_literature_registry_versions
    where registry_key = 'bowl_structured_literature'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;
  if new.evidence_admissibility_policy_version_id is null then
    select id into new.evidence_admissibility_policy_version_id
    from public.research_evidence_admissibility_policy_versions
    where policy_key = 'bowl_canine_outcomes'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;

  if new.model_configuration_set_version_id is null
    or new.discovery_question_policy_version_id is null
    or new.literature_registry_version_id is null
    or new.evidence_admissibility_policy_version_id is null then
    raise exception 'No complete active research control-plane version set is available';
  end if;
  return new;
end;
$$;

create trigger research_missions_assign_control_versions
before insert on public.research_missions
for each row execute function public.assign_research_mission_control_versions();

create or replace function public.assign_research_stage_control_versions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mission_row public.research_missions%rowtype;
  expected_stage_configuration_id uuid;
begin
  select * into mission_row
  from public.research_missions
  where id = new.mission_id;
  if mission_row.id is null then
    raise exception 'Research mission not found for stage configuration';
  end if;

  select id into expected_stage_configuration_id
  from public.research_model_stage_configuration_versions
  where configuration_set_id = mission_row.model_configuration_set_version_id
    and stage_key = new.stage_key;
  if expected_stage_configuration_id is null then
    raise exception 'No model configuration exists for research stage %', new.stage_key;
  end if;

  new.model_stage_configuration_version_id := coalesce(
    new.model_stage_configuration_version_id,
    expected_stage_configuration_id
  );
  new.discovery_question_policy_version_id := coalesce(
    new.discovery_question_policy_version_id,
    mission_row.discovery_question_policy_version_id
  );
  new.literature_registry_version_id := coalesce(
    new.literature_registry_version_id,
    mission_row.literature_registry_version_id
  );
  new.evidence_admissibility_policy_version_id := coalesce(
    new.evidence_admissibility_policy_version_id,
    mission_row.evidence_admissibility_policy_version_id
  );

  if new.model_stage_configuration_version_id <> expected_stage_configuration_id
    or new.discovery_question_policy_version_id <> mission_row.discovery_question_policy_version_id
    or new.literature_registry_version_id <> mission_row.literature_registry_version_id
    or new.evidence_admissibility_policy_version_id <> mission_row.evidence_admissibility_policy_version_id then
    raise exception 'Research stage control-plane versions must match the parent mission snapshot';
  end if;
  return new;
end;
$$;

create trigger research_mission_stages_assign_control_versions
before insert on public.research_mission_stages
for each row execute function public.assign_research_stage_control_versions();

-- Backfill defensively in case a mission is created after local review but before
-- an approved production release. P0 production was verified with zero rows.
update public.research_missions
set
  model_configuration_set_version_id = coalesce(
    model_configuration_set_version_id,
    (select id from public.research_model_configuration_sets where configuration_key = 'bowl_research' and version = 1)
  ),
  discovery_question_policy_version_id = coalesce(
    discovery_question_policy_version_id,
    (select id from public.research_discovery_question_policy_versions where policy_key = 'bowl_research_questions' and version = 1)
  ),
  literature_registry_version_id = coalesce(
    literature_registry_version_id,
    (select id from public.research_literature_registry_versions where registry_key = 'bowl_structured_literature' and version = 1)
  ),
  evidence_admissibility_policy_version_id = coalesce(
    evidence_admissibility_policy_version_id,
    (select id from public.research_evidence_admissibility_policy_versions where policy_key = 'bowl_canine_outcomes' and version = 1)
  );

update public.research_mission_stages stage
set
  model_stage_configuration_version_id = coalesce(
    stage.model_stage_configuration_version_id,
    (
      select config.id
      from public.research_missions mission
      join public.research_model_stage_configuration_versions config
        on config.configuration_set_id = mission.model_configuration_set_version_id
       and config.stage_key = stage.stage_key
      where mission.id = stage.mission_id
    )
  ),
  discovery_question_policy_version_id = coalesce(
    stage.discovery_question_policy_version_id,
    (select mission.discovery_question_policy_version_id from public.research_missions mission where mission.id = stage.mission_id)
  ),
  literature_registry_version_id = coalesce(
    stage.literature_registry_version_id,
    (select mission.literature_registry_version_id from public.research_missions mission where mission.id = stage.mission_id)
  ),
  evidence_admissibility_policy_version_id = coalesce(
    stage.evidence_admissibility_policy_version_id,
    (select mission.evidence_admissibility_policy_version_id from public.research_missions mission where mission.id = stage.mission_id)
  );

alter table public.research_missions
  alter column model_configuration_set_version_id set not null,
  alter column discovery_question_policy_version_id set not null,
  alter column literature_registry_version_id set not null,
  alter column evidence_admissibility_policy_version_id set not null;

alter table public.research_mission_stages
  alter column model_stage_configuration_version_id set not null,
  alter column discovery_question_policy_version_id set not null,
  alter column literature_registry_version_id set not null,
  alter column evidence_admissibility_policy_version_id set not null;

create index research_missions_model_configuration_idx
  on public.research_missions (model_configuration_set_version_id);
create index research_missions_literature_registry_idx
  on public.research_missions (literature_registry_version_id);
create index research_missions_discovery_question_policy_idx
  on public.research_missions (discovery_question_policy_version_id);
create index research_missions_evidence_admissibility_policy_idx
  on public.research_missions (evidence_admissibility_policy_version_id);
create index research_mission_stages_model_configuration_idx
  on public.research_mission_stages (model_stage_configuration_version_id);
create index research_mission_stages_literature_registry_idx
  on public.research_mission_stages (literature_registry_version_id);
create index research_mission_stages_discovery_question_policy_idx
  on public.research_mission_stages (discovery_question_policy_version_id);
create index research_mission_stages_evidence_admissibility_policy_idx
  on public.research_mission_stages (evidence_admissibility_policy_version_id);
create index research_literature_routes_source_version_idx
  on public.research_literature_source_routes (source_version_id);
create index research_literature_routes_policy_version_idx
  on public.research_literature_source_routes (source_policy_version_id);

create or replace function public.prevent_research_control_plane_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Research control-plane configuration and policy versions are immutable';
end;
$$;

create trigger research_model_configuration_sets_immutable
before update or delete on public.research_model_configuration_sets
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_model_stage_configurations_immutable
before update or delete on public.research_model_stage_configuration_versions
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_model_stage_routes_immutable
before update or delete on public.research_model_stage_routes
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_discovery_question_policies_immutable
before update or delete on public.research_discovery_question_policy_versions
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_evidence_admissibility_policies_immutable
before update or delete on public.research_evidence_admissibility_policy_versions
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_literature_registries_immutable
before update or delete on public.research_literature_registry_versions
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_literature_sources_immutable
before update or delete on public.research_literature_sources
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_literature_source_versions_immutable
before update or delete on public.research_literature_source_versions
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_literature_source_policies_immutable
before update or delete on public.research_literature_source_policy_versions
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_literature_routes_immutable
before update or delete on public.research_literature_source_routes
for each row execute function public.prevent_research_control_plane_version_mutation();

create or replace function public.prevent_research_mission_identity_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.id is distinct from old.id
    or new.mission_type is distinct from old.mission_type
    or new.objective is distinct from old.objective
    or new.requested_by is distinct from old.requested_by
    or new.input is distinct from old.input
    or new.model_configuration_set_version_id is distinct from old.model_configuration_set_version_id
    or new.discovery_question_policy_version_id is distinct from old.discovery_question_policy_version_id
    or new.literature_registry_version_id is distinct from old.literature_registry_version_id
    or new.evidence_admissibility_policy_version_id is distinct from old.evidence_admissibility_policy_version_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Research mission identity, input, and control-plane versions are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_research_mission_stage_identity_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.id is distinct from old.id
    or new.mission_id is distinct from old.mission_id
    or new.stage_key is distinct from old.stage_key
    or new.attempt_number is distinct from old.attempt_number
    or new.retry_of_stage_id is distinct from old.retry_of_stage_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.input is distinct from old.input
    or new.model_stage_configuration_version_id is distinct from old.model_stage_configuration_version_id
    or new.discovery_question_policy_version_id is distinct from old.discovery_question_policy_version_id
    or new.literature_registry_version_id is distinct from old.literature_registry_version_id
    or new.evidence_admissibility_policy_version_id is distinct from old.evidence_admissibility_policy_version_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Research mission stage identity, input, and control-plane versions are immutable';
  end if;
  return new;
end;
$$;

alter table public.research_model_configuration_sets enable row level security;
alter table public.research_model_stage_configuration_versions enable row level security;
alter table public.research_model_stage_routes enable row level security;
alter table public.research_discovery_question_policy_versions enable row level security;
alter table public.research_evidence_admissibility_policy_versions enable row level security;
alter table public.research_literature_registry_versions enable row level security;
alter table public.research_literature_sources enable row level security;
alter table public.research_literature_source_versions enable row level security;
alter table public.research_literature_source_policy_versions enable row level security;
alter table public.research_literature_source_routes enable row level security;

revoke all on table public.research_model_configuration_sets from anon, authenticated;
revoke all on table public.research_model_stage_configuration_versions from anon, authenticated;
revoke all on table public.research_model_stage_routes from anon, authenticated;
revoke all on table public.research_discovery_question_policy_versions from anon, authenticated;
revoke all on table public.research_evidence_admissibility_policy_versions from anon, authenticated;
revoke all on table public.research_literature_registry_versions from anon, authenticated;
revoke all on table public.research_literature_sources from anon, authenticated;
revoke all on table public.research_literature_source_versions from anon, authenticated;
revoke all on table public.research_literature_source_policy_versions from anon, authenticated;
revoke all on table public.research_literature_source_routes from anon, authenticated;

revoke all on table public.research_model_configuration_sets from service_role;
revoke all on table public.research_model_stage_configuration_versions from service_role;
revoke all on table public.research_model_stage_routes from service_role;
revoke all on table public.research_discovery_question_policy_versions from service_role;
revoke all on table public.research_evidence_admissibility_policy_versions from service_role;
revoke all on table public.research_literature_registry_versions from service_role;
revoke all on table public.research_literature_sources from service_role;
revoke all on table public.research_literature_source_versions from service_role;
revoke all on table public.research_literature_source_policy_versions from service_role;
revoke all on table public.research_literature_source_routes from service_role;

grant select on table public.research_model_configuration_sets to service_role;
grant select on table public.research_model_stage_configuration_versions to service_role;
grant select on table public.research_model_stage_routes to service_role;
grant select on table public.research_discovery_question_policy_versions to service_role;
grant select on table public.research_evidence_admissibility_policy_versions to service_role;
grant select on table public.research_literature_registry_versions to service_role;
grant select on table public.research_literature_sources to service_role;
grant select on table public.research_literature_source_versions to service_role;
grant select on table public.research_literature_source_policy_versions to service_role;
grant select on table public.research_literature_source_routes to service_role;

revoke execute on function public.assign_research_mission_control_versions() from public, anon, authenticated;
revoke execute on function public.assign_research_stage_control_versions() from public, anon, authenticated;
revoke execute on function public.prevent_research_control_plane_version_mutation() from public, anon, authenticated;
grant execute on function public.assign_research_mission_control_versions() to service_role;
grant execute on function public.assign_research_stage_control_versions() to service_role;
grant execute on function public.prevent_research_control_plane_version_mutation() to service_role;
