'use client';

import { useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import { OutcomeMetric, TrendDirection } from '@/lib/types';

const QUICK_LOG_METRICS: { metric: OutcomeMetric; label: string }[] = [
  { metric: 'stool_score', label: 'Stool consistency' },
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
    <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 p-3 rounded text-xs text-gray-600">
        A temporary dip in digestive readings during the first ~10 days after a food switch is
        common and expected — coat and body condition can take weeks to show real change too.
        This context is applied automatically behind the scenes.
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm p-3 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-300 text-green-800 text-sm p-3 rounded">
          Logged. Thanks for keeping this up to date.
        </div>
      )}

      <div className="space-y-3">
        {QUICK_LOG_METRICS.map(({ metric, label }) => (
          <div key={metric} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
            <span className="text-sm font-medium text-gray-900">{label}</span>
            <div className="flex gap-2">
              {TREND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTrend(metric, opt.value)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition ${
                    selections[metric] === opt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                  aria-pressed={selections[metric] === opt.value}
                >
                  <span aria-hidden>{opt.emoji}</span> {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={Object.keys(selections).length === 0 || submitting}
        className="w-full bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg hover:bg-blue-700"
      >
        {submitting ? 'Saving…' : 'Save log'}
      </button>
    </div>
  );
}
