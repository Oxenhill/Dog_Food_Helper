'use client';

import { useState } from 'react';
import BCSChartSelector from './BCSChartSelector';
import WellnessLevelSelector from './WellnessLevelSelector';
import { authHeaders } from '@/lib/clientAuth';

type Level = 'good' | 'questionable' | 'poor';

/**
 * The optional "recalibrate" path (Part B: logRecalibration) — full
 * visual-chart re-selection, for when the owner wants more precision than
 * the quick-log taps. Only submits the fields the owner actually re-selects.
 */
export default function RecalibrationForm({
  dogId,
  onComplete,
}: {
  dogId: string;
  onComplete?: () => void;
}) {
  const [bodyConditionScore, setBodyConditionScore] = useState<number | null>(null);
  const [coatCondition, setCoatCondition] = useState<Level | null>(null);
  const [stoolOdor, setStoolOdor] = useState<Level | null>(null);
  const [gasFrequency, setGasFrequency] = useState<Level | null>(null);
  const [gasOdor, setGasOdor] = useState<Level | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    const entries: { metric: string; raw_value: string }[] = [];
    if (bodyConditionScore !== null)
      entries.push({ metric: 'body_condition_score', raw_value: String(bodyConditionScore) });
    if (coatCondition) entries.push({ metric: 'coat_condition', raw_value: coatCondition });
    if (stoolOdor) entries.push({ metric: 'stool_odor', raw_value: stoolOdor });
    if (gasFrequency) entries.push({ metric: 'gas_frequency', raw_value: gasFrequency });
    if (gasOdor) entries.push({ metric: 'gas_odor', raw_value: gasOdor });

    if (entries.length === 0) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/logs/recalibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ dog_id: dogId, entries }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save recalibration');
        return;
      }
      setSuccess(true);
      onComplete?.();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  const hasAnySelection =
    bodyConditionScore !== null ||
    coatCondition !== null ||
    stoolOdor !== null ||
    gasFrequency !== null ||
    gasOdor !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="callout-disclaimer">
        Re-select the full chart for any indicator you want to recalibrate — this compares against
        the original baseline and gives the correlation engine a precise reading, not just a
        trend. Leave anything unchanged blank.
      </div>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="callout border-better/25 bg-better-tint text-better" role="status">
          Recalibration saved.
        </div>
      )}

      <BCSChartSelector value={bodyConditionScore} onChange={setBodyConditionScore} />
      <WellnessLevelSelector metric="coat_condition" value={coatCondition} onChange={setCoatCondition} />
      <WellnessLevelSelector metric="stool_odor" value={stoolOdor} onChange={setStoolOdor} />
      <WellnessLevelSelector metric="gas_frequency" value={gasFrequency} onChange={setGasFrequency} />
      <WellnessLevelSelector metric="gas_odor" value={gasOdor} onChange={setGasOdor} />

      <button onClick={handleSubmit} disabled={!hasAnySelection || submitting} className="btn-primary btn-block">
        {submitting ? 'Saving…' : 'Save recalibration'}
      </button>
    </div>
  );
}
