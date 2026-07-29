'use client';

import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';

interface Suspect {
  ingredient_name: string;
  poor_food_count: number;
  implicated_metrics: string[];
  suspect_reason: 'retained_across_failed_switches' | 'removed_on_improvement' | 'added_on_worsening';
}

interface Insights {
  suspect_set_size: number;
  narrowed_enough: boolean;
  failed_switch_count: number;
  switches_analysed: number;
  min_failed_switches_needed: number;
  suspects: Suspect[];
  treat_confounder_unmeasured: boolean;
  has_unknown_ingredient_data: boolean;
  vet_framing: string;
}

const METRIC_LABELS: Record<string, string> = {
  stool_score: 'stool consistency',
  stool_frequency: 'stool frequency',
  stool_odor: 'stool odour',
  gas_frequency: 'wind',
  gas_odor: 'wind odour',
  coat_condition: 'coat',
  body_condition_score: 'body condition',
};

const REASON_LABELS: Record<Suspect['suspect_reason'], string> = {
  retained_across_failed_switches: 'in every food that hasn’t worked',
  removed_on_improvement: 'dropped when things improved',
  added_on_worsening: 'added when things got worse',
};

/**
 * What the food-change analysis has learned.
 *
 * The "not narrowed enough yet" state is a first-class case, not an error or an
 * empty state to hide. Cheap foods share the same generic staples, so an early
 * suspect set can still be 15+ ingredients — showing that list would look like
 * a finding when it isn't. The size is reported honestly instead.
 */
export default function FoodInsightsCard({ dogId }: { dogId: string }) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/dogs/${dogId}/food-insights`, { headers: authHeaders() });
        if (!res.ok) return;
        setInsights(await res.json());
      } catch {
        // Non-fatal — this is a supplementary panel, not the page.
      } finally {
        setLoading(false);
      }
    })();
  }, [dogId]);

  if (loading || !insights) return null;

  // Nothing analysed yet at all: stay quiet rather than show an empty shell.
  if (insights.switches_analysed === 0 && insights.suspect_set_size === 0) return null;

  const switchesNeeded = Math.max(
    0,
    insights.min_failed_switches_needed - insights.failed_switch_count
  );

  return (
    <div className="card card-pad mt-6">
      <h2 className="section-title">Patterns across food changes</h2>

      {insights.narrowed_enough ? (
        <>
          <p className="lead mt-2">
            Across the <span className="metric">{insights.failed_switch_count}</span> foods your
            dog hasn&apos;t done well on, these ingredients were present every time — and none of
            them appear in a food your dog did well on.
          </p>

          <ul className="mt-4 flex flex-col gap-3">
            {insights.suspects.map((suspect) => (
              <li key={suspect.ingredient_name} className="hairline pt-3 first:border-0 first:pt-0">
                <p className="font-semibold text-ink">{suspect.ingredient_name}</p>
                <p className="help-text mt-1">
                  {REASON_LABELS[suspect.suspect_reason]}
                  {suspect.implicated_metrics.length > 0 && (
                    <>
                      {' · affecting '}
                      {suspect.implicated_metrics
                        .map((m) => METRIC_LABELS[m] ?? m)
                        .join(', ')}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="lead mt-2">Not narrowed down enough yet.</p>
          <p className="help-text mt-2">
            {insights.suspect_set_size > 0 ? (
              <>
                There are currently{' '}
                <span className="metric">{insights.suspect_set_size}</span> ingredients common to
                the foods that haven&apos;t worked. That&apos;s still too broad to mean much —
                most foods share the same handful of staples.
              </>
            ) : (
              <>We haven&apos;t found a pattern across food changes yet.</>
            )}
            {switchesNeeded > 0 && (
              <>
                {' '}
                Each further food change that doesn&apos;t help narrows the list. Another{' '}
                <span className="metric">{switchesNeeded}</span> would start to make it
                meaningful.
              </>
            )}
          </p>
        </>
      )}

      {/* Limits stated plainly rather than left implied. */}
      {(insights.treat_confounder_unmeasured || insights.has_unknown_ingredient_data) && (
        <div className="callout-info mt-4">
          <p className="text-[14px] font-semibold">What could change this</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[14px]">
            {insights.treat_confounder_unmeasured && (
              <li>
                Treats aren&apos;t being logged, so anything your dog gets outside meals is
                invisible to this — it could be the real cause.
              </li>
            )}
            {insights.has_unknown_ingredient_data && (
              <li>
                We don&apos;t have the ingredient list for at least one food your dog has been on,
                so it couldn&apos;t be compared. Scanning its packet would fill that gap.
              </li>
            )}
          </ul>
        </div>
      )}

      <p className="callout-disclaimer mt-4">{insights.vet_framing}</p>
    </div>
  );
}
