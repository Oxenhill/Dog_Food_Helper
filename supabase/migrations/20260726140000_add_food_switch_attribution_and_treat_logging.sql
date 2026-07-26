-- Food-change attribution + treat logging.
--
-- Context: before this migration the correlation engine could not produce a
-- single result, and structurally never would have. `dog_food_events` had zero
-- rows ever, no dog had `current_food_id` set, so every `dog_log_entries.
-- food_id_active` was null, and computeCorrelationsForDog() filters on
-- `food_id_active is not null`. A whole subsystem was inert for want of an
-- input, the same failure shape as the allergy filter waiting on ingredient
-- data.
--
-- This adds the storage the reworked, switch-based engine needs, plus the
-- per-dog treat-logging preference.

-- ---------------------------------------------------------------------------
-- 1. Treat logging is opt-in, per dog
-- ---------------------------------------------------------------------------
-- Most owners will not log every treat, and a half-kept treat log is worse
-- than none: it produces confident-looking correlations from partial data. So
-- the preference is explicit and defaults to OFF, and the correlation engine
-- records which state was in force when it computed (see
-- dog_food_switch_analyses.treat_logging_enabled).
alter table public.dogs
  add column if not exists treat_logging_enabled boolean not null default false;

-- Set when the owner dismisses the "start logging treats" nudge, so the
-- conditional prompt appears once and does not become a nag.
alter table public.dogs
  add column if not exists treat_logging_prompt_dismissed_at timestamptz;

comment on column public.dogs.treat_logging_enabled is
  'Owner opted in to logging individual treat occasions for this dog. Default false: partial treat data is worse than none, because it looks complete.';
comment on column public.dogs.treat_logging_prompt_dismissed_at is
  'When the owner dismissed the conditional treat-logging suggestion. Non-null suppresses the prompt.';

-- ---------------------------------------------------------------------------
-- 2. dog_food_events integrity + lookup support
-- ---------------------------------------------------------------------------
-- A dog eats one main food at a time. Two simultaneously-open main_food events
-- would make "what was this dog eating on that date" ambiguous and silently
-- corrupt every attribution downstream, so the invariant is enforced in the
-- database rather than trusted to the route handler.
create unique index if not exists dog_food_events_one_open_main_food
  on public.dog_food_events (dog_id)
  where event_type = 'main_food' and ended_at is null;

-- getActiveFoodEvent() looks up by (dog_id, event_type) ordered by started_at.
create index if not exists dog_food_events_dog_type_started_at
  on public.dog_food_events (dog_id, event_type, started_at desc);

-- `food_or_treat_id` had no foreign key at all, so nothing stopped an event
-- pointing at a food row that does not exist — and PostgREST could not embed
-- the food when listing a dog's history. The column was presumably left
-- unconstrained when treats were a separate idea; they now live in `foods`
-- behind `is_treat`, so a plain FK to `foods` is both correct and useful.
--
-- ON DELETE SET NULL, deliberately not CASCADE: retiring a food from the
-- catalogue must not erase a dog's feeding history. The event survives with
-- its freetext description and a null id.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dog_food_events_food_or_treat_id_fkey'
  ) then
    alter table public.dog_food_events
      add constraint dog_food_events_food_or_treat_id_fkey
      foreign key (food_or_treat_id) references public.foods(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Signals now carry the kind of evidence behind them
-- ---------------------------------------------------------------------------
-- Two very different strengths of evidence write to this table:
--
--   'food_switch'        — derived from a natural experiment. The ingredient
--                          sets either side of a switch differ, so a change in
--                          outcome can be attributed to the difference. This
--                          is the diagnostically useful kind.
--   'single_food_period' — logs within one food period, crediting every
--                          ingredient in that food equally. Weak: a 30-item
--                          list yields 30 identically-weighted signals.
--
-- Keeping them in one table but distinguishable means the scorer can prefer
-- switch-derived evidence without losing the weaker signal entirely.
alter table public.ingredient_outcome_signals
  add column if not exists evidence_basis text not null default 'single_food_period';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ingredient_outcome_signals_evidence_basis_check'
  ) then
    alter table public.ingredient_outcome_signals
      add constraint ingredient_outcome_signals_evidence_basis_check
      check (evidence_basis in ('food_switch', 'single_food_period'));
  end if;
end $$;

-- The engine recomputes from scratch each run and must replace, not
-- accumulate. Uniqueness includes evidence_basis so the two bases coexist.
create unique index if not exists ingredient_outcome_signals_unique_signal
  on public.ingredient_outcome_signals (dog_id, ingredient_name, outcome_metric, evidence_basis);

comment on column public.ingredient_outcome_signals.evidence_basis is
  'food_switch = attributed to the ingredient difference across a food change (strong). single_food_period = logs within one food, every ingredient credited equally (weak).';

-- ---------------------------------------------------------------------------
-- 4. Per-switch analysis — the evidence trail
-- ---------------------------------------------------------------------------
-- One row per detected main-food switch. Recomputed idempotently, keyed on the
-- event that STARTED (to_event_id), which is unique per switch.
--
-- Which ingredient set is implicated depends on whether the outcome actually
-- moved, not on presence alone:
--
--   before poor -> improved : removed = suspects,  added = candidates for help
--   before good -> worsened : added   = suspects,  removed = possibly protective
--   unchanged, was poor     : the DIFFERING set is EXONERATED (it changed and
--                             nothing happened); RETAINED ingredients are the
--                             prime suspects
--   unchanged, was good     : weak positive only — the retained set is tolerated
--
-- The third case is the diagnostically important one and the most common in
-- practice: an owner switches food *because* the dog is unwell, and it doesn't
-- work.
create table if not exists public.dog_food_switch_analyses (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,

  -- The event that ended and the event that began. from_event_id is nullable:
  -- the dog's very first recorded food has no predecessor, and is analysed as
  -- a food period rather than a switch.
  from_event_id uuid references public.dog_food_events(id) on delete cascade,
  to_event_id uuid not null references public.dog_food_events(id) on delete cascade,
  from_food_id uuid references public.foods(id) on delete set null,
  to_food_id uuid references public.foods(id) on delete set null,
  switched_at timestamptz not null,

  -- Ingredient sets computed across the switch, including nested
  -- sub-ingredients (a compound ingredient's contents are separate rows in
  -- food_ingredients and are matched by name like any other).
  added_ingredients text[] not null default '{}',
  removed_ingredients text[] not null default '{}',
  retained_ingredients text[] not null default '{}',

  -- False when either side of the switch has no recorded ingredient list (a
  -- free-text food, or one of the 239 catalogue rows still unpopulated).
  --
  -- This has to be explicit. With it absent, three empty arrays would be
  -- indistinguishable from "nothing changed", and a food whose ingredients we
  -- simply do not know would look like a food that contains nothing — every
  -- ingredient of the OTHER side would then be falsely reported as added or
  -- removed. No ingredient attribution is drawn from a switch where this is
  -- false.
  ingredient_sets_known boolean not null default false,

  -- Per-metric classification:
  --   { "stool_score": { "outcome": "unchanged", "before_state": "concerning",
  --                      "sample_size": 4, "net": 0.0, "lag_days": 10 }, ... }
  -- outcome      : improved | worsened | unchanged | insufficient_data
  -- before_state : concerning | acceptable | unknown
  metric_outcomes jsonb not null default '{}'::jsonb,

  -- Whether this dog had treat logging on at compute time. With it off, an
  -- unlogged treat is an unmeasured confounder and the confidence output must
  -- say so rather than silently assume there were none.
  treat_logging_enabled boolean not null default false,

  -- Treat ingredients given inside the analysed window, when treat logging is
  -- on. These are alternative explanations for the observed change, not
  -- suspects attributed to the food switch.
  confounding_treat_ingredients text[] not null default '{}',

  computed_at timestamptz not null default now(),

  constraint dog_food_switch_analyses_unique_to_event unique (to_event_id)
);

create index if not exists dog_food_switch_analyses_dog_id
  on public.dog_food_switch_analyses (dog_id, switched_at desc);

comment on table public.dog_food_switch_analyses is
  'One row per detected main-food switch: what changed in the ingredients, and whether each outcome metric improved, worsened or stayed put. The evidence trail behind dog_ingredient_suspects.';

-- ---------------------------------------------------------------------------
-- 5. The rolling suspect set
-- ---------------------------------------------------------------------------
-- Compounding across failed switches is where the real diagnostic power is:
--
--   ( intersection of ingredients across every food the dog did POORLY on )
--   minus ( any ingredient present in a food the dog did WELL on )
--
-- Each additional failed switch narrows it. That is elimination-diet reasoning
-- derived from logged data instead of guesswork.
--
-- IMPORTANT — this is inference, not diagnosis. Rows here must NEVER reach
-- hardFilter.ts. The deterministic layer is reserved for vet-gated facts
-- (diagnosed allergies, approved contraindications); a logged suspicion is a
-- hypothesis. Suspects influence recommendation SCORING only, as a preference
-- for foods that break the set. Owner-facing copy points at a vet
-- conversation, never "your dog is intolerant to X" — a real elimination diet
-- must be vet-supervised.
create table if not exists public.dog_ingredient_suspects (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  ingredient_name text not null,

  -- How many poorly-tolerated food periods this ingredient was present in.
  -- 1 is one observation and means very little; the set only becomes
  -- interesting across several.
  poor_food_count integer not null default 0,

  -- The metrics that were concerning while this ingredient was present.
  implicated_metrics text[] not null default '{}',

  -- Why it is on the list:
  --   retained_across_failed_switches — present either side of a switch that
  --     changed nothing while the dog was unwell
  --   removed_on_improvement — dropping it coincided with improvement
  --   added_on_worsening — adding it coincided with worsening
  suspect_reason text not null,

  computed_at timestamptz not null default now(),

  constraint dog_ingredient_suspects_unique unique (dog_id, ingredient_name),
  constraint dog_ingredient_suspects_reason_check check (
    suspect_reason in (
      'retained_across_failed_switches',
      'removed_on_improvement',
      'added_on_worsening'
    )
  )
);

create index if not exists dog_ingredient_suspects_dog_id
  on public.dog_ingredient_suspects (dog_id);

comment on table public.dog_ingredient_suspects is
  'Per-dog rolling set of ingredients worth DISCUSSING WITH A VET, narrowed across failed food switches. Inference layer only — must never be used as a hard filter. Not a diagnosis of intolerance.';

-- ---------------------------------------------------------------------------
-- 6. RLS — same owner-scoped shape as dog_food_events / ingredient_outcome_signals
-- ---------------------------------------------------------------------------
-- Both tables are derived per-dog data the owner is shown, so they follow the
-- existing owner-scoped policy pattern rather than the service-role-only
-- (RLS on, no policy) pattern used for cross-owner reference tables.
alter table public.dog_food_switch_analyses enable row level security;
alter table public.dog_ingredient_suspects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dog_food_switch_analyses'
      and policyname = 'owners read their own dogs'' switch analyses'
  ) then
    create policy "owners read their own dogs' switch analyses"
      on public.dog_food_switch_analyses
      for select
      using (dog_id in (select id from public.dogs where owner_id = auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dog_ingredient_suspects'
      and policyname = 'owners read their own dogs'' ingredient suspects'
  ) then
    create policy "owners read their own dogs' ingredient suspects"
      on public.dog_ingredient_suspects
      for select
      using (dog_id in (select id from public.dogs where owner_id = auth.uid()));
  end if;
end $$;

-- Writes are service-role only (the correlation engine runs as the admin
-- client from a cron route). Deliberately no INSERT/UPDATE/DELETE policy: an
-- owner must not be able to hand-edit their dog's derived evidence.
