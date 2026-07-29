'use client';

import { useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import { OutcomeMetric, TrendDirection } from '@/lib/types';

const QUICK_LOG_METRICS: { metric: OutcomeMetric; label: string }[] = [
  { metric: 'body_condition_score', label: 'Body condition' },
  { metric: 'coat_condition', label: 'Coat condition' },
  { metric: 'stool_odor', label: 'Stool odour' },
  { metric: 'gas_frequency', label: 'Gas frequency' },
  { metric: 'gas_odor', label: 'Gas odour' },
  { metric: 'behaviour_tag', label: 'Behaviour / energy' },
];

const TREND_OPTIONS: { value: TrendDirection; label: string; emoji: string }[] = [
  { value: 'better', label: 'Better', emoji: '↑' },
  { value: 'no_change', label: 'No change', emoji: '→' },
  { value: 'worse', label: 'Worse', emoji: '↓' },
];

/**
 * The default, low-friction logging path (Part B: logQuickEntry). A tap of
 * better/worse/no_change per indicator — no chart re-selection. Only the
 * indicators the owner taps get submitted; nothing is required.
 */
export default function QuickLogForm({
  dogId,
  onComplete,
}: {
  dogId: string;
  onComplete?: () => void;
}) {
  const [selections, setSelections] = useState<Partial<Record<OutcomeMetric, TrendDirection>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function setTrend(metric: OutcomeMetric, trend: TrendDirection) {
    setSelections((prev) => ({ ...prev, [metric]: trend }));
  }

  async function handleSubmit() {
    const entries = Object.entries(selections).map(([metric, trend]) => ({ metric, trend }));
    if (entries.length === 0) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/logs/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ dog_id: dogId, entries }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save log');
        return;
      }
      setSuccess(true);
      setSelections({});
      onComplete?.();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="callout-info">
        A temporary dip in digestive readings during the first ~10 days after a food switch is
        common and expected — coat and body condition can take weeks to show real change too.
        This context is applied automatically behind the scenes.
      </div>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="callout border-better/25 bg-better-tint text-better" role="status">
          Logged. Thanks for keeping this up to date.
        </div>
      )}

      <div className="card divide-y divide-line">
        {QUICK_LOG_METRICS.map(({ metric, label }) => (
          <div key={metric} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[14px] font-medium text-ink">{label}</span>
            <div className="grid grid-cols-3 gap-2 sm:w-[280px]">
              {TREND_OPTIONS.map((opt) => {
                const isSelected = selections[metric] === opt.value;
                const selectedTone =
                  opt.value === 'better'
                    ? 'border-better bg-better-tint text-better'
                    : opt.value === 'worse'
                      ? 'border-worse bg-worse-tint text-worse'
                      : 'border-steady bg-steady-tint text-ink';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTrend(metric, opt.value)}
                    className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-[12.5px] font-semibold transition ${
                      isSelected
                        ? selectedTone
                        : 'border-line-strong bg-surface text-ink-soft hover:bg-paper'
                    }`}
                    aria-pressed={isSelected}
                  >
                    <span aria-hidden className="text-base leading-none">
                      {opt.emoji}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={Object.keys(selections).length === 0 || submitting}
        className="btn-primary btn-block"
      >
        {submitting ? 'Saving…' : 'Save log'}
      </button>
    </div>
  );
}
