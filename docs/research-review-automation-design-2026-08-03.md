# Research evidence review — automation design options (2026-08-03)

**Status:** draft for owner decision. Nothing in this document has been built.
**Owner's ask, verbatim (2026-08-03):** "i hate this manual research review i have to
do, im actually probably less qualified to do it than a well informed AI that has
been specifically scoped to understand the review task. I want a design option to
remove me from this and have the review process done automatically."

---

## 1. What currently exists

`/admin/research/review` is the only gate between a drafted claim/cluster and
`status = 'active'`. Only active + reviewed evidence is eligible to:

- move a real food's score (Gate 5, `researchScoringPolicy.ts`, off by default), or
- appear in the fleet-vs-literature comparison (the Probe, `fleetIngredientSignal.ts`).

Two independent review mechanisms exist and both are **100% human-gated today**:

1. **Cluster review** — `review_research_evidence_cluster()` (SQL function,
   `research_cluster_review_transaction.sql`). Approves/rejects a proposition
   cluster and its member claims atomically. Its own comment states: *"No automatic
   activation path calls this function."*
2. **Per-claim review** — `PATCH /api/admin/research/claims/[claimId]`
   (`approve` / `reject` / `edit_and_approve`). Its own comment states: *"Explicit
   human review only. No path here auto-activates a claim based on its grade."*

Notably: **`RESEARCH_LAYER_DESIGN.md` §5 already specifies a detailed auto-activation
rule** (grade A/B, `species=dog`, `evidence_scope=canine_direct`, complete grading
inputs, `funding_independent=true`, 2 independent corroborating families, source not
retracted, direction ≠ `cautions_against`). **That rule was designed in July but was
never implemented.** Every claim that would already qualify under it today still
sits in the human queue. This matters for the options below — a bounded, narrow
automation exists on paper already and has owner-approved criteria; the open
question is not "should any evidence ever auto-activate" but "how far should that
go, and by what mechanism."

Per the session's live check, the queue is currently empty (0 pending claims, 0
pending clusters) — there is no backlog forcing an urgent choice.

### Infrastructure already in place that any option below can reuse

- **`researchProviderTelemetry.ts` / `research_provider_calls`** — every model call
  in this codebase already goes through a tracked call wrapper: provider, exact
  model identifier, prompt version/hash, estimated vs. actual token usage and cost,
  budget-cap enforcement, replay protection. An automated reviewer's decisions can
  sit on this same rail rather than inventing new audit plumbing.
- **`researchScoringPolicy.ts`** — the existing Gate 5 formula already turns grade,
  completeness, access type and corroboration into a deterministic, explained
  number. A confidence-gated automation option can reuse these exact same inputs
  instead of asking a model to invent its own notion of "strong enough."
- **`fleetIngredientSignal.ts` (the Probe)** — already compares literature-derived
  claims against real fleet-wide dog outcome data, admin-only, surface-only today.
  This is a ready-made mechanism for auditing automated decisions after the fact
  (see Option C below) — not a coincidence worth re-deriving from scratch.
- **`researchEvidenceReview.ts`** — the shared validation module (subject/direction/
  outcome/summary rules) that both drafting and manual editing already run through.
  Any reviewer, human or automated, is already forced through the same gate that
  rejects invented certainty, advice language, and out-of-scope subjects.

### Non-negotiables (apply to every option below, not up for reconsideration here)

- `hardFilter.ts` stays untouched and unreachable. This is an evidence-corpus/scoring
  concern, never a hard-exclusion-safety concern.
- Whatever reviews evidence is held to the same confidence-honesty rules generation
  already obeys: never inflate a grade or corroboration count, never resolve
  contested evidence as settled, never invent or verify a citation.
- Every automated decision gets a full audit trail: model/prompt version, exact
  reasoning, the exact evidence it saw, timestamp — inspectable the same way Gate 5's
  `explain` strings already are.
- `enforce_research_decision_scope` (the contamination/manufacturing/labelling
  exclusion constraint) is a database constraint, not something any option here can
  route around.

---

## 2. Options

### Option A — Confidence-gated auto-approve (recommended)

A scoped model call runs the same grading/completeness/corroboration checks a human
currently applies by eye, using **only the deterministic fields already stored on the
claim/cluster** (grade, scope, completeness, funding, corroborating family count,
retraction status, direction) — not free-form model judgement about whether the
science is "good." Two tiers:

- **Deterministic auto-activate** — no model call at all. A claim/cluster that
  satisfies the already-designed §5 rule (grade A/B, canine_direct, complete,
  funding-independent, 2+ corroborating families, not retracted, direction ≠
  `cautions_against`) activates by a SQL predicate, exactly as originally specified.
  This alone would have cleared a meaningful share of historical queue volume — recall
  the 2026-07-30 audit found 19 of 42 queued clusters were mis-taxonomised, so this
  tier also needs the same or a stronger validation pass than the drafting step
  already runs, not a weaker one.
- **Model-assisted auto-approve for the next tier down** — a Sonnet call, prompted
  narrowly for this exact task (reads the claim, its quote, its chunk, its
  cluster's applicability contexts, and the same criteria a human reviewer sees),
  producing a structured verdict (`approve` / `reject` / `escalate`) with a required
  written justification citing specific fields. Escalates anything it isn't
  confident about, anything contested, anything cautions_against, and anything
  where its own justification doesn't cite a specific disqualifying/qualifying
  field. No claim reaches `active` without either passing the deterministic tier
  or getting a model verdict of `approve` plus passing every non-negotiable above.

**Tradeoffs.** Directly answers the ask — clears the vast majority of the routine
queue without the owner. Reuses existing rails end to end (telemetry, scoring
inputs, validation module). Risk: this is the option that most needs the circuit
breaker in §3 below, because it is the only one that removes a human from the
activation of *any* individual claim.

### Option B — Dual-pass consensus, no auto-activation without agreement

Two independent model passes (or a generate-then-critique pair, ideally on
different prompts or even different models) must both return `approve` before a
claim/cluster can auto-activate. Disagreement — including one pass timing out or
erroring — always escalates to the human queue. Layers on top of Option A's
criteria rather than replacing them.

**Tradeoffs.** Materially reduces single-model-hallucination risk (the exact
failure mode CLAUDE.md's AI-governance section warns about) at roughly double the
per-claim cost and latency of Option A. Still leaves the owner with only the
contested tail, but a smaller one than Option A alone removes. Reasonable move
*to* if Option A's audit-sampling in production shows a disagreement rate the
owner isn't comfortable with — not necessarily where to start.

### Option C — Graduated trust with audit sampling

Start deployment with **zero unattended auto-activation** — every claim still
lands in the human queue, exactly as today — but the automated reviewer runs
in shadow mode: it produces the same structured verdict as Option A on every
incoming claim, logged but never acted on. The owner (or a periodic report) compares
its verdicts against the real human decisions for a trial period. Automation is
switched on for a narrow slice (e.g. deterministic-tier only) only once the shadow
disagreement rate is proven low, and expands from there — the exact mechanism the
Probe (`fleetIngredientSignal.ts`) already models for a different comparison
(fleet outcomes vs. literature), reapplied here as reviewer-verdict vs.
human-verdict.

**Tradeoffs.** Slowest to actually remove the owner from anything — which is a
real cost against the stated ask, since shadow mode doesn't reduce review burden
by itself. But it produces hard evidence of the automated reviewer's real-world
accuracy *before* any claim reaches a dog's recommendation unattended, which is the
strongest possible answer to "how do we know it's actually less error-prone than
me." Cheapest to reverse if the numbers come back bad.

### Option D — Shrink the burden, keep the human (alternative to "remove me")

Not full removal — presented because the owner's literal ask ("remove me from
this") deserves a lower-risk alternative on the table, not a silent substitution.
Redesign `/admin/research/review` so an AI-scoped reviewer pre-drafts a decision
(approve/reject + written reasoning, using the same criteria as Option A) attached
to every queued item; the owner's job becomes confirm-or-override in one click
instead of doing the review from scratch. Every decision is still technically the
owner's, so no new audit-trail or escalation infrastructure is required beyond
what the UI needs — the model's proposal is not itself an approval.

**Tradeoffs.** Doesn't remove the reviewing chore the owner explicitly said they
want gone. But it's the only option with zero new automated-approval risk surface,
ships fastest, and could be step zero under any of A/B/C regardless — the same
pre-drafted verdict UI is reusable as the human-facing side of Option C's shadow
mode.

---

## 3. Cross-cutting: the circuit breaker

Whichever option activates unattended (A, B, or C once expanded), the same
guardrail applies, matching the existing `research_provider_calls` budget-cap
pattern already in this codebase:

- a hard cap on unattended activations per day/week (tunable, owner-set);
- an automatic pause + `system_alerts` row if the cap is hit, or if the model's
  own escalation rate spikes (a spike itself is a signal something upstream
  changed — a new document source, a schema drift, a bad prompt update);
- every unattended activation remains individually reversible — nothing here
  should special-case away from the fact that `status` transitions are ordinary
  rows an owner can still inspect and flip back to `rejected` after the fact.

---

## 4. Recommendation

Start with **Option A's deterministic tier alone** (no model call — just the
already-designed, already-owner-adjacent §5 SQL rule, finally wired up, with the
circuit breaker from §3 from day one). That is the smallest possible step that
actually removes some real review burden today, using criteria that have existed
in this repo's own design doc since July. Add the **model-assisted tier** once
the deterministic tier has run for a trial period with the circuit breaker proving
itself. Treat **Option C's shadow-mode comparison as the validation method** for
turning the model-assisted tier on, rather than a separate track — run it in
shadow for a defined trial window, then flip it live once disagreement rate is
acceptable. Option D's confirm-in-one-click UI is worth building regardless, as
the fallback surface for whatever the automated tiers escalate to — it's cheap,
useful under every option, and directly shrinks the burden on everything that
still needs a human.

Option B (dual-model consensus) is worth revisiting only if Option A's real
production disagreement/error rate turns out higher than the owner is comfortable
with — it's a mitigation, not a starting posture.

---

## 5. Owner decision (2026-08-03)

Owner response to the option question: "probably 1 or 2 [recommended sequence or
Option A], i just dont want to do it myself." Owner also made a substantive point
that reframes the risk framing in §1-§4 above: **the liability argument against
automation is weak, because liability already exists under manual review — it just
sits with one human instead of the system, which the owner considers arguably
worse.** That is recorded here as the actual rationale for greenlighting this,
not just "the owner asked." One condition attached explicitly: **a human must
retain the ability to remove/reject research at any time**, automated or not.

On the specific tuning numbers (circuit-breaker cap, shadow-mode trial length),
the owner deferred to Claude as design authority. Locked in below:

- **Sequence: the recommended path from §4** — deterministic §5-rule tier first
  (no model call), model-assisted tier added only after a shadow-mode trial
  proves an acceptable disagreement rate, Option D's one-click-confirm UI built
  in parallel regardless.
- **Circuit breaker: 10 unattended activations per rolling 24h**, auto-pause plus
  a `system_alerts` row on breach. Also alerts (without pausing) if the
  model-assisted tier's own escalation rate crosses 30% in a rolling window,
  since a spike there is itself a signal something upstream changed. Both
  numbers are named, explained constants (Gate 5 style) — tunable later, not
  hardcoded arithmetic.
- **Shadow-mode trial window: minimum 2 weeks or 25 claims seen, whichever is
  longer**, before the model-assisted tier is allowed to go live, so the sample
  isn't dominated by a single ingest run.
- **Human override is a hard, permanent, structural guarantee, not a policy
  choice**: any claim or cluster — however it reached `active`, deterministic
  auto-activation, model-assisted tier, or original manual review — remains a
  normal row a human can flip to `rejected`/`superseded` at any time through the
  existing review surfaces. No automation tier may remove, lock, or bypass that
  path. This was true structurally before this design and stays true after it;
  it is called out here as a requirement being preserved, not a new feature.
