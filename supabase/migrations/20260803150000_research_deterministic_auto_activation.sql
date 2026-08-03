-- Deterministic research-evidence auto-activation (design doc:
-- docs/research-review-automation-design-2026-08-03.md, owner-approved
-- 2026-08-03). Wires up the auto-activation rule RESEARCH_LAYER_DESIGN.md
-- section 5 specified in July but never implemented -- both existing review
-- paths (review_research_evidence_cluster, PATCH .../claims/[claimId]) are
-- explicit human-only and remain completely untouched by this migration.
--
-- No model call anywhere in this file. This is the "deterministic tier"
-- only -- grade A/B, canine-direct, fully graded, corroborated by two
-- independent study families, not retracted, not cautions_against. The
-- model-assisted tier for the next confidence band down is a separate,
-- later, shadow-mode-validated piece of work and is NOT built here.
--
-- Ships disabled by default (research_automation_settings row), matching
-- this project's own Gate 5 precedent of shipping a scoring/automation
-- change behind an explicit off-by-default switch.

-- ---------------------------------------------------------------------------
-- 1. Auto-activation provenance columns
-- ---------------------------------------------------------------------------

alter table public.research_claims
  add column auto_activated_by_rule text,
  add column auto_activated_at timestamptz,
  add column auto_activation_explain jsonb;

alter table public.research_evidence_clusters
  add column auto_activated_by_rule text,
  add column auto_activated_at timestamptz,
  add column auto_activation_explain jsonb;

comment on column public.research_claims.auto_activated_by_rule
is 'Non-null only when this claim reached active status via the deterministic auto-activation rule rather than a human review action. Never set alongside reviewed_by -- a claim is either human-reviewed or rule-activated, never both, so provenance is never ambiguous.';
comment on column public.research_evidence_clusters.auto_activated_by_rule
is 'Non-null only when this cluster reached active status via the deterministic auto-activation rule rather than a human review action.';

-- A claim/cluster is either human-reviewed (reviewed_by + reviewed_at) or
-- rule-activated (auto_activated_by_rule) to become active -- never neither.
alter table public.research_claims
  drop constraint research_claims_active_review_check,
  add constraint research_claims_active_review_check
    check (
      status <> 'active'
      or (reviewed_by is not null and reviewed_at is not null)
      or auto_activated_by_rule is not null
    );

alter table public.research_evidence_clusters
  drop constraint research_evidence_clusters_active_review_check,
  add constraint research_evidence_clusters_active_review_check
    check (
      status <> 'active'
      or (reviewed_by is not null and reviewed_at is not null)
      or auto_activated_by_rule is not null
    );

-- ---------------------------------------------------------------------------
-- 2. Settings (single row, off by default) and circuit breaker
-- ---------------------------------------------------------------------------

create table public.research_automation_settings (
  id boolean primary key default true check (id),
  deterministic_auto_activation_enabled boolean not null default false,
  daily_activation_cap integer not null default 10 check (daily_activation_cap > 0),
  paused boolean not null default false,
  paused_reason text,
  paused_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.research_automation_settings (id) values (true);

comment on table public.research_automation_settings
is 'Single-row switch for the deterministic research-evidence auto-activation tier. Off by default. daily_activation_cap is the circuit breaker: reaching it sets paused=true and raises a system_alerts row until an admin clears it.';

alter table public.research_automation_settings enable row level security;
revoke all on table public.research_automation_settings from anon, authenticated;

create policy "service role manages research automation settings"
  on public.research_automation_settings for all to service_role
  using (true) with check (true);

create or replace function public.touch_research_automation_settings()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end
$function$;

create trigger research_automation_settings_touch_updated_at
before update on public.research_automation_settings
for each row execute function public.touch_research_automation_settings();

comment on function public.touch_research_automation_settings()
is 'Keeps research_automation_settings.updated_at current on every admin toggle.';

-- ---------------------------------------------------------------------------
-- 3. Append-only decision log (full audit trail requirement)
-- ---------------------------------------------------------------------------

create table public.research_auto_activation_log (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.research_evidence_clusters(id),
  rule_version text not null,
  decision text not null
    check (decision in ('activated', 'skipped_ineligible', 'skipped_paused', 'skipped_disabled', 'skipped_circuit_breaker')),
  activated_claim_ids uuid[] not null default '{}'::uuid[],
  explain jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.research_auto_activation_log
is 'Append-only record of every deterministic auto-activation attempt, whether or not it resulted in activation. This is the audit trail: what rule version ran, what it saw, and why it decided what it decided. Never updated or deleted.';

create index research_auto_activation_log_recent_idx
  on public.research_auto_activation_log (created_at desc);
create index research_auto_activation_log_cluster_idx
  on public.research_auto_activation_log (cluster_id);
create index research_auto_activation_log_activated_recent_idx
  on public.research_auto_activation_log (created_at)
  where decision = 'activated';

alter table public.research_auto_activation_log enable row level security;
revoke all on table public.research_auto_activation_log from anon, authenticated;

create policy "service role manages research auto activation log"
  on public.research_auto_activation_log for all to service_role
  using (true) with check (true);

create or replace function public.prevent_research_auto_activation_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'research_auto_activation_log is append-only and cannot be updated or deleted';
end
$function$;

create trigger research_auto_activation_log_immutable
before update or delete on public.research_auto_activation_log
for each row execute function public.prevent_research_auto_activation_log_mutation();

-- ---------------------------------------------------------------------------
-- 4. Pure eligibility evaluation (also used to explain queued items in the
--    admin UI, whether or not automation is enabled)
-- ---------------------------------------------------------------------------

create or replace function public.compute_cluster_deterministic_eligibility(p_cluster_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_cluster public.research_evidence_clusters;
  v_member_count integer;
  v_has_ineligible_member boolean;
  v_all_grade_ab boolean;
  v_all_canine_direct boolean;
  v_all_grading_complete boolean;
  v_family_count integer;
  v_criteria jsonb;
  v_eligible boolean;
begin
  select * into v_cluster
  from public.research_evidence_clusters
  where id = p_cluster_id;

  if not found then
    return jsonb_build_object(
      'eligible', false,
      'rule_version', 'deterministic_grade_ab_v1',
      'criteria', jsonb_build_array(
        jsonb_build_object('key', 'cluster_exists', 'pass', false, 'detail', 'Evidence cluster not found.')
      )
    );
  end if;

  select count(*) into v_member_count
  from public.research_evidence_cluster_members m
  where m.cluster_id = p_cluster_id;

  select exists (
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
  ) into v_has_ineligible_member;

  select
    coalesce(bool_and(c.evidence_grade in ('A', 'B')), false),
    coalesce(bool_and(c.evidence_scope = 'canine_direct'), false),
    coalesce(bool_and(c.grading_inputs_complete), false),
    count(distinct coalesce(d.duplicate_of_document_id, d.id))
  into
    v_all_grade_ab,
    v_all_canine_direct,
    v_all_grading_complete,
    v_family_count
  from public.research_evidence_cluster_members m
  join public.research_claims c on c.id = m.claim_id
  join public.research_documents d on d.id = c.document_id
  where m.cluster_id = p_cluster_id;

  v_eligible :=
    v_cluster.status in ('draft', 'queued_for_review')
    and v_member_count > 0
    and not v_has_ineligible_member
    and v_all_grade_ab
    and v_all_canine_direct
    and v_all_grading_complete
    and v_cluster.direction <> 'cautions_against'
    and v_family_count >= 3;

  v_criteria := jsonb_build_array(
    jsonb_build_object(
      'key', 'cluster_awaiting_review',
      'pass', v_cluster.status in ('draft', 'queued_for_review'),
      'detail', 'Cluster status is ' || v_cluster.status || '.'
    ),
    jsonb_build_object(
      'key', 'has_source_claims',
      'pass', v_member_count > 0,
      'detail', v_member_count || ' source claim(s) in this cluster.'
    ),
    jsonb_build_object(
      'key', 'no_ineligible_member',
      'pass', not v_has_ineligible_member,
      'detail', case when v_has_ineligible_member
        then 'At least one source claim is rejected/superseded, its document is retracted/superseded, or its quote no longer matches its chunk.'
        else 'Every source claim, document and quote is intact.'
      end
    ),
    jsonb_build_object(
      'key', 'grade_a_or_b',
      'pass', v_all_grade_ab,
      'detail', case when v_all_grade_ab
        then 'Every source claim is grade A or B.'
        else 'At least one source claim is below grade B.'
      end
    ),
    jsonb_build_object(
      'key', 'canine_direct_scope',
      'pass', v_all_canine_direct,
      'detail', case when v_all_canine_direct
        then 'Every source claim is direct canine evidence.'
        else 'At least one source claim is outside canine-direct scope (e.g. veterinary-methodology or cross-species).'
      end
    ),
    jsonb_build_object(
      'key', 'grading_inputs_complete',
      'pass', v_all_grading_complete,
      'detail', case when v_all_grading_complete
        then 'Every source claim has complete grading metadata (study design, species, sample size, funding where applicable).'
        else 'At least one source claim is missing a grading input, so its grade is provisional.'
      end
    ),
    jsonb_build_object(
      'key', 'not_cautions_against',
      'pass', v_cluster.direction <> 'cautions_against',
      'detail', case when v_cluster.direction = 'cautions_against'
        then 'This finding steers a user away from a food -- it always gets human review regardless of grade.'
        else 'Direction is ' || v_cluster.direction || '.'
      end
    ),
    jsonb_build_object(
      'key', 'independent_family_count',
      'pass', v_family_count >= 3,
      'detail', v_family_count || ' independent document/study famil' ||
        (case when v_family_count = 1 then 'y' else 'ies' end) ||
        ' (needs at least 3: the finding plus two independent corroborating families).',
      'value', v_family_count
    )
  );

  return jsonb_build_object(
    'eligible', v_eligible,
    'rule_version', 'deterministic_grade_ab_v1',
    'criteria', v_criteria
  );
end
$function$;

comment on function public.compute_cluster_deterministic_eligibility(uuid)
is 'Pure, read-only evaluation of RESEARCH_LAYER_DESIGN.md section 5''s auto-activation rule for one cluster. Used both by the activation actor and by the admin review UI to explain, for every queued cluster, exactly which criteria pass or fail -- so a human reviewer never has to reconstruct that reasoning by hand.';

revoke all on function public.compute_cluster_deterministic_eligibility(uuid) from public, anon, authenticated;
grant execute on function public.compute_cluster_deterministic_eligibility(uuid) to service_role;

create or replace function public.research_cluster_deterministic_eligibility_batch(p_cluster_ids uuid[])
returns table (cluster_id uuid, eligibility jsonb)
language sql
stable
set search_path = ''
as $function$
  select id, public.compute_cluster_deterministic_eligibility(id)
  from public.research_evidence_clusters
  where id = any(p_cluster_ids)
$function$;

comment on function public.research_cluster_deterministic_eligibility_batch(uuid[])
is 'Batched wrapper over compute_cluster_deterministic_eligibility for the admin review list, so the UI issues one call instead of one per cluster.';

revoke all on function public.research_cluster_deterministic_eligibility_batch(uuid[]) from public, anon, authenticated;
grant execute on function public.research_cluster_deterministic_eligibility_batch(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Actor: evaluate + (maybe) activate one cluster, respecting the switch
--    and the circuit breaker. Every call is logged regardless of outcome.
-- ---------------------------------------------------------------------------

create or replace function public.run_deterministic_cluster_auto_activation(p_cluster_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings public.research_automation_settings;
  v_eligibility jsonb;
  v_recent_activations integer;
  v_claim_ids uuid[];
  v_now timestamptz := now();
begin
  select * into v_settings
  from public.research_automation_settings
  where id = true
  for update;

  if not v_settings.deterministic_auto_activation_enabled then
    insert into public.research_auto_activation_log (cluster_id, rule_version, decision, explain)
    values (p_cluster_id, 'deterministic_grade_ab_v1', 'skipped_disabled',
      jsonb_build_object('reason', 'Deterministic auto-activation is currently disabled.'));
    return jsonb_build_object('decision', 'skipped_disabled');
  end if;

  if v_settings.paused then
    insert into public.research_auto_activation_log (cluster_id, rule_version, decision, explain)
    values (p_cluster_id, 'deterministic_grade_ab_v1', 'skipped_paused',
      jsonb_build_object('reason', coalesce(v_settings.paused_reason, 'Automation is paused.')));
    return jsonb_build_object('decision', 'skipped_paused');
  end if;

  v_eligibility := public.compute_cluster_deterministic_eligibility(p_cluster_id);

  if not (v_eligibility->>'eligible')::boolean then
    insert into public.research_auto_activation_log (cluster_id, rule_version, decision, explain)
    values (p_cluster_id, 'deterministic_grade_ab_v1', 'skipped_ineligible', v_eligibility);
    return jsonb_build_object('decision', 'skipped_ineligible', 'explain', v_eligibility);
  end if;

  select count(*) into v_recent_activations
  from public.research_auto_activation_log
  where decision = 'activated'
    and created_at > v_now - interval '24 hours';

  if v_recent_activations >= v_settings.daily_activation_cap then
    update public.research_automation_settings
    set paused = true,
        paused_reason = 'Daily auto-activation cap (' || v_settings.daily_activation_cap || ' per rolling 24h) reached.',
        paused_at = v_now
    where id = true;

    if not exists (
      select 1 from public.system_alerts
      where check_name = 'research_auto_activation:circuit_breaker'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values (
        'research_auto_activation:circuit_breaker',
        'Deterministic research auto-activation paused: reached ' || v_settings.daily_activation_cap
          || ' activations in a rolling 24h window. Review recent research_auto_activation_log entries before clearing.'
      );
    end if;

    insert into public.research_auto_activation_log (cluster_id, rule_version, decision, explain)
    values (p_cluster_id, 'deterministic_grade_ab_v1', 'skipped_circuit_breaker', v_eligibility);
    return jsonb_build_object('decision', 'skipped_circuit_breaker');
  end if;

  select array_agg(m.claim_id) into v_claim_ids
  from public.research_evidence_cluster_members m
  join public.research_claims c on c.id = m.claim_id
  where m.cluster_id = p_cluster_id
    and c.status in ('draft', 'queued_for_review');

  update public.research_claims
  set
    status = 'active',
    auto_activated_by_rule = 'deterministic_grade_ab_v1',
    auto_activated_at = v_now,
    auto_activation_explain = v_eligibility,
    updated_at = v_now
  where id = any(v_claim_ids);

  update public.research_evidence_clusters
  set
    status = 'active',
    auto_activated_by_rule = 'deterministic_grade_ab_v1',
    auto_activated_at = v_now,
    auto_activation_explain = v_eligibility,
    updated_at = v_now
  where id = p_cluster_id;

  insert into public.research_auto_activation_log
    (cluster_id, rule_version, decision, activated_claim_ids, explain)
  values
    (p_cluster_id, 'deterministic_grade_ab_v1', 'activated', coalesce(v_claim_ids, '{}'::uuid[]), v_eligibility);

  return jsonb_build_object('decision', 'activated', 'activated_claim_ids', v_claim_ids, 'explain', v_eligibility);
end
$function$;

comment on function public.run_deterministic_cluster_auto_activation(uuid)
is 'The only path that can activate a cluster/claim without a human. Re-checks the enabled switch, the circuit breaker, and every RESEARCH_LAYER_DESIGN.md section 5 criterion on every call, and logs every attempt -- activated or not -- to research_auto_activation_log. Never sets reviewed_by/reviewed_at: an auto-activated row is honestly distinguishable from a human-reviewed one via auto_activated_by_rule. A human can still reject or supersede an auto-activated cluster/claim through the existing, unmodified review paths at any time.';

revoke all on function public.run_deterministic_cluster_auto_activation(uuid) from public, anon, authenticated;
grant execute on function public.run_deterministic_cluster_auto_activation(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Sweep: run the actor over every queued/draft cluster
-- ---------------------------------------------------------------------------

create or replace function public.run_deterministic_auto_activation_sweep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cluster_id uuid;
  v_result jsonb;
  v_decision text;
  v_considered integer := 0;
  v_activated integer := 0;
  v_skipped_ineligible integer := 0;
  v_skipped_paused integer := 0;
  v_skipped_disabled integer := 0;
  v_skipped_circuit_breaker integer := 0;
begin
  for v_cluster_id in
    select id
    from public.research_evidence_clusters
    where status in ('draft', 'queued_for_review')
    order by created_at asc
  loop
    v_considered := v_considered + 1;
    v_result := public.run_deterministic_cluster_auto_activation(v_cluster_id);
    v_decision := v_result->>'decision';
    if v_decision = 'activated' then
      v_activated := v_activated + 1;
    elsif v_decision = 'skipped_ineligible' then
      v_skipped_ineligible := v_skipped_ineligible + 1;
    elsif v_decision = 'skipped_paused' then
      v_skipped_paused := v_skipped_paused + 1;
      exit; -- a pause encountered mid-sweep (e.g. circuit breaker tripped this run) stops the sweep
    elsif v_decision = 'skipped_disabled' then
      v_skipped_disabled := v_skipped_disabled + 1;
      exit; -- disabled applies globally; no point continuing the loop
    elsif v_decision = 'skipped_circuit_breaker' then
      v_skipped_circuit_breaker := v_skipped_circuit_breaker + 1;
      exit;
    end if;
  end loop;

  return jsonb_build_object(
    'considered', v_considered,
    'activated', v_activated,
    'skipped_ineligible', v_skipped_ineligible,
    'skipped_paused', v_skipped_paused,
    'skipped_disabled', v_skipped_disabled,
    'skipped_circuit_breaker', v_skipped_circuit_breaker
  );
end
$function$;

comment on function public.run_deterministic_auto_activation_sweep()
is 'Runs the deterministic auto-activation actor over every currently queued/draft cluster, oldest first. Stops early on a disabled/paused/circuit-breaker result rather than looping pointlessly over the rest of the queue. Safe to call from pg_cron or from an admin-triggered API action -- every call is a normal, idempotent, already-logged evaluation.';

revoke all on function public.run_deterministic_auto_activation_sweep() from public, anon, authenticated;
grant execute on function public.run_deterministic_auto_activation_sweep() to service_role;

select cron.schedule(
  'research-deterministic-auto-activation-sweep',
  '17 * * * *',
  'select public.run_deterministic_auto_activation_sweep();'
);
