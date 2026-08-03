'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import type { ResearchEvidence, LifeStage } from '@/lib/types';

interface DogOption {
  id: string;
  name: string;
  life_stage: string | null;
  owner_display_name: string | null;
}

interface RankedRow {
  rank: number;
  food_id: string;
  brand: string;
  name: string;
  score: number;
}

interface Gate5Topic {
  topic_key: string;
  topic_label: string;
  direction: 'supports' | 'cautions_against' | 'contested';
  contribution: number;
  best_evidence_claim_id: string;
  best_strength: number;
  independent_family_count: number;
  corroboration_bonus: number;
  explain: string;
}

interface TraceCandidate {
  food_id: string;
  brand: string;
  name: string;
  food_type: string;
  nutritional_fit_score: number;
  budget_fit_score: number;
  correlation_signal: number;
  correlation_summary: string;
  research_evidence: ResearchEvidence[];
  gate5: {
    score: number;
    summary: string;
    topics: Gate5Topic[];
    inert_evidence: { claim_id: string; direction: string; reason: string }[];
  };
  overall_score_with_research: number;
  overall_score_without_research: number;
}

interface PolicyEntry {
  value: number;
  explain: string;
}

interface Policy {
  neutralScore: PolicyEntry;
  gradeWeight: Record<string, PolicyEntry>;
  incompleteGradingMultiplier: PolicyEntry;
  accessWeight: Record<string, PolicyEntry>;
  corroborationBonusPerFamily: PolicyEntry;
  maxCorroborationBonus: PolicyEntry;
  maxDeviation: PolicyEntry;
}

interface TraceResponse {
  dog: {
    id: string;
    name: string;
    life_stage_recorded: string | null;
    date_of_birth_recorded: string | null;
    life_stage_used_for_hard_filter_and_research: string | null;
    date_of_birth_used_for_nutritional_fit_and_age_checks: string | null;
    overrides_applied: boolean;
  };
  hard_filter: {
    excluded: { food_id: string; brand: string | null; name: string | null; reason: string }[];
    excluded_count: number;
    suitable_food_count: number;
  };
  research_runtime: { eligible_claim_count: number; unsupported_claim_count: number };
  policy: Policy;
  candidates: TraceCandidate[];
  ranked_with_research: RankedRow[];
  ranked_without_research: RankedRow[];
  message?: string;
  generated_at: string;
}

const LIFE_STAGES: LifeStage[] = ['puppy', 'adult', 'senior'];

function parseListInput(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function PolicyExplainer({ policy }: { policy: Policy }) {
  return (
    <div className="grid gap-2 text-[13px]">
      <p className="help-text">
        <strong className="text-ink">Neutral baseline {policy.neutralScore.value}:</strong>{' '}
        {policy.neutralScore.explain}
      </p>
      <p className="help-text">
        <strong className="text-ink">Grade weights:</strong>{' '}
        {(['A', 'B', 'C', 'D', 'E'] as const)
          .map((grade) => `${grade}=${policy.gradeWeight[grade].value}`)
          .join(', ')}
        . {policy.gradeWeight.A.explain}
      </p>
      <p className="help-text">
        <strong className="text-ink">Incomplete grading ×{policy.incompleteGradingMultiplier.value}:</strong>{' '}
        {policy.incompleteGradingMultiplier.explain}
      </p>
      <p className="help-text">
        <strong className="text-ink">Abstract-only ×{policy.accessWeight.abstract_only.value}:</strong>{' '}
        {policy.accessWeight.abstract_only.explain}
      </p>
      <p className="help-text">
        <strong className="text-ink">
          Corroboration +{policy.corroborationBonusPerFamily.value}/study, capped at{' '}
          {policy.maxCorroborationBonus.value}:
        </strong>{' '}
        {policy.corroborationBonusPerFamily.explain}
      </p>
      <p className="help-text">
        <strong className="text-ink">Overall cap ±{policy.maxDeviation.value}:</strong>{' '}
        {policy.maxDeviation.explain}
      </p>
    </div>
  );
}

function RankTable({ title, rows, otherRankByFoodId }: { title: string; rows: RankedRow[]; otherRankByFoodId: Map<string, number> }) {
  return (
    <div className="rounded border border-line">
      <p className="eyebrow border-b border-line bg-surface px-3 py-2">{title}</p>
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map((row) => {
            const otherRank = otherRankByFoodId.get(row.food_id);
            const moved = otherRank !== undefined && otherRank !== row.rank;
            return (
              <tr key={row.food_id} className="border-b border-line last:border-0">
                <td className="px-3 py-1.5 font-mono text-ink-soft">#{row.rank}</td>
                <td className="px-3 py-1.5">
                  <span className="font-semibold text-ink">{row.brand}</span> {row.name}
                </td>
                <td className="px-3 py-1.5 font-mono text-ink-soft">{row.score.toFixed(3)}</td>
                <td className="px-3 py-1.5 text-[12px]">
                  {moved ? (
                    <span className={otherRank! > row.rank ? 'text-pine-dark' : 'text-amber-700'}>
                      was #{otherRank}
                    </span>
                  ) : otherRank === undefined ? (
                    <span className="text-ink-soft">not in other top 10</span>
                  ) : (
                    <span className="text-ink-soft">unchanged</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td className="help-text px-3 py-2" colSpan={4}>No results.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ResearchDecisionTrace() {
  const [dogs, setDogs] = useState<DogOption[]>([]);
  const [dogId, setDogId] = useState('');
  const [useOverrides, setUseOverrides] = useState(false);
  const [restrictionsInput, setRestrictionsInput] = useState('');
  const [conditionsInput, setConditionsInput] = useState('');
  const [lifeStageOverride, setLifeStageOverride] = useState<'' | LifeStage>('');
  const [dateOfBirthOverride, setDateOfBirthOverride] = useState('');

  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedFoodId, setExpandedFoodId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/research/dogs', { headers: sessionAuthHeaders() });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load dogs');
        setDogs(body.dogs as DogOption[]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load dogs');
      }
    })();
  }, []);

  const runTrace = useCallback(async () => {
    if (!dogId) return;
    setLoading(true);
    setError('');
    try {
      const overrides = useOverrides
        ? {
            restrictions: restrictionsInput.trim() ? parseListInput(restrictionsInput) : undefined,
            conditions: conditionsInput.trim() ? parseListInput(conditionsInput) : undefined,
            life_stage: lifeStageOverride || undefined,
            date_of_birth: dateOfBirthOverride || undefined,
          }
        : undefined;

      const response = await fetch('/api/admin/research/decision-trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
        body: JSON.stringify({ dog_id: dogId, overrides }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not run the decision trace');
      setTrace(body as TraceResponse);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Could not run the decision trace');
    } finally {
      setLoading(false);
    }
  }, [dogId, useOverrides, restrictionsInput, conditionsInput, lifeStageOverride, dateOfBirthOverride]);

  const rankByFoodIdWith = useMemo(
    () => new Map((trace?.ranked_with_research ?? []).map((r) => [r.food_id, r.rank])),
    [trace]
  );
  const rankByFoodIdWithout = useMemo(
    () => new Map((trace?.ranked_without_research ?? []).map((r) => [r.food_id, r.rank])),
    [trace]
  );

  const candidatesWithEvidence = useMemo(
    () => (trace?.candidates ?? []).filter((c) => c.research_evidence.length > 0),
    [trace]
  );

  return (
    <section className="card card-pad flex flex-col gap-5">
      <div>
        <p className="eyebrow">Research layer</p>
        <h2 className="section-title mt-1">Decision trace</h2>
        <p className="help-text mt-2">
          Pick any registered dog and run the real recommendation engine. The ranked output is
          computed twice — once with the Gate 5 research contribution applied, once with it forced
          to zero (today&apos;s Gate 4 behaviour) — so you can see exactly what research changes, food
          by food. The what-if sandbox below overrides restrictions/conditions/life-stage for a
          scratch run only; nothing is ever saved to this dog&apos;s real record.
        </p>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-semibold text-ink">Dog</span>
          <select className="select" value={dogId} onChange={(event) => setDogId(event.target.value)}>
            <option value="">Select a dog…</option>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
                {dog.owner_display_name ? ` — ${dog.owner_display_name}` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button-primary" disabled={!dogId || loading} onClick={() => void runTrace()}>
          {loading ? 'Running…' : 'Re-run now'}
        </button>
      </div>

      <details className="rounded border border-line p-3" open={useOverrides}>
        <summary
          className="cursor-pointer select-none text-[13px] font-semibold text-ink"
          onClick={(event) => {
            event.preventDefault();
            setUseOverrides((prev) => !prev);
          }}
        >
          What-if sandbox {useOverrides ? '(active — overriding this run only)' : '(off — using real recorded values)'}
        </summary>
        {useOverrides && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-ink-soft">Restrictions (comma-separated, replaces recorded restrictions)</span>
              <input
                className="input"
                placeholder="e.g. chicken, beef"
                value={restrictionsInput}
                onChange={(event) => setRestrictionsInput(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-ink-soft">Health conditions (comma-separated, replaces recorded conditions)</span>
              <input
                className="input"
                placeholder="e.g. pancreatitis"
                value={conditionsInput}
                onChange={(event) => setConditionsInput(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-ink-soft">Life stage (affects hard filter + research matching)</span>
              <select className="select" value={lifeStageOverride} onChange={(event) => setLifeStageOverride(event.target.value as '' | LifeStage)}>
                <option value="">Use recorded value</option>
                {LIFE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-ink-soft">Date of birth (affects nutritional fit + age checks)</span>
              <input
                className="input"
                type="date"
                value={dateOfBirthOverride}
                onChange={(event) => setDateOfBirthOverride(event.target.value)}
              />
            </label>
          </div>
        )}
      </details>

      {trace && (
        <>
          <div className="rounded border border-line bg-surface p-3 text-[13px]">
            <p>
              <strong className="text-ink">{trace.dog.name}</strong>
              {trace.dog.overrides_applied ? ' — what-if overrides applied for this run' : ' — real recorded profile'}
              {' · '}life stage used: {trace.dog.life_stage_used_for_hard_filter_and_research ?? 'unknown'}
            </p>
            <p className="help-text mt-1">
              {trace.hard_filter.suitable_food_count} foods survived the hard filter,{' '}
              {trace.hard_filter.excluded_count} excluded. {trace.research_runtime.eligible_claim_count} eligible
              active research claim(s) considered.
            </p>
          </div>

          <details className="rounded border border-line p-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-ink">
              Gate 5 formula — how these numbers are computed
            </summary>
            <div className="mt-3">
              <PolicyExplainer policy={trace.policy} />
            </div>
          </details>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankTable title="Ranked WITH research applied" rows={trace.ranked_with_research} otherRankByFoodId={rankByFoodIdWithout} />
            <RankTable title="Ranked WITHOUT research (Gate 4, today's real behaviour)" rows={trace.ranked_without_research} otherRankByFoodId={rankByFoodIdWith} />
          </div>

          {trace.hard_filter.excluded.length > 0 && (
            <details className="rounded border border-line p-3">
              <summary className="cursor-pointer text-[13px] font-semibold text-ink">
                Hard-filter exclusions ({trace.hard_filter.excluded.length})
              </summary>
              <ul className="mt-2 grid gap-1 text-[13px]">
                {trace.hard_filter.excluded.map((row) => (
                  <li key={row.food_id} className="help-text">
                    <span className="text-ink">{row.brand} {row.name}</span> — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div>
            <p className="eyebrow">Foods with matching research evidence ({candidatesWithEvidence.length})</p>
            <div className="mt-2 grid gap-2">
              {candidatesWithEvidence.map((candidate) => {
                const expanded = expandedFoodId === candidate.food_id;
                const delta = candidate.overall_score_with_research - candidate.overall_score_without_research;
                return (
                  <article key={candidate.food_id} className="rounded border border-line">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface"
                      onClick={() => setExpandedFoodId(expanded ? null : candidate.food_id)}
                    >
                      <span>
                        <span className="font-semibold text-ink">{candidate.brand}</span> {candidate.name}
                      </span>
                      <span className="font-mono text-ink-soft">
                        {candidate.overall_score_without_research.toFixed(3)} → {candidate.overall_score_with_research.toFixed(3)}{' '}
                        ({delta >= 0 ? '+' : ''}{delta.toFixed(3)})
                      </span>
                    </button>
                    {expanded && (
                      <div className="border-t border-line p-3">
                        <p className="help-text">{candidate.gate5.summary}</p>
                        <div className="mt-2 grid gap-2">
                          {candidate.gate5.topics.map((topic) => (
                            <div key={topic.topic_key} className="rounded border border-line bg-surface p-2 text-[12.5px]">
                              <p className="font-semibold text-ink">
                                {topic.topic_label} — {topic.direction} ({topic.contribution >= 0 ? '+' : ''}{topic.contribution.toFixed(3)})
                              </p>
                              <p className="help-text mt-1">{topic.explain}</p>
                            </div>
                          ))}
                          {candidate.gate5.inert_evidence.map((item) => (
                            <div key={item.claim_id} className="rounded border border-line p-2 text-[12.5px] text-ink-soft">
                              {item.direction}: {item.reason}
                            </div>
                          ))}
                        </div>
                        <ul className="mt-3 grid gap-1 text-[12.5px] text-ink-soft">
                          {candidate.research_evidence.map((evidence) => (
                            <li key={evidence.claim_id}>
                              “{evidence.supporting_quote}” — {evidence.title} (grade {evidence.evidence_grade}
                              {evidence.grading_inputs_complete ? '' : ', incomplete grading'}
                              {evidence.access_type === 'abstract_only' ? ', abstract only' : ''})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                );
              })}
              {candidatesWithEvidence.length === 0 && (
                <p className="help-text">No surviving food currently has matching active reviewed research evidence.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
