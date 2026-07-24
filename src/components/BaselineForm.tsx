'use client';

import { useState } from 'react';
import BristolChartSelector from './BristolChartSelector';
import BCSChartSelector from './BCSChartSelector';
import WellnessLevelSelector from './WellnessLevelSelector';
import { authHeaders } from '@/lib/clientAuth';

type Level = 'good' | 'questionable' | 'poor';

export default function BaselineForm({
  dogId,
  onComplete,
  forceReset = false,
}: {
  dogId: string;
  onComplete?: () => void;
  forceReset?: boolean;
}) {
  const [stoolScore, setStoolScore] = useState<number | null>(null);
  const [bodyConditionScore, setBodyConditionScore] = useState<number | null>(null);
  const [coatCondition, setCoatCondition] = useState<Level | null>(null);
  const [stoolOdor, setStoolOdor] = useState<Level | null>(null);
  const [gasFrequency, setGasFrequency] = useState<Level | null>(null);
  const [gasOdor, setGasOdor] = useState<Level | null>(null);
  const [behaviourTags, setBehaviourTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isComplete =
    stoolScore !== null &&
    bodyConditionScore !== null &&
    coatCondition !== null &&
    stoolOdor !== null &&
    gasFrequency !== null &&
    gasOdor !== null;

  async function handleSubmit() {
    if (!isComplete) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/baselines/establish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          dog_id: dogId,
          stool_score: stoolScore,
          body_condition_score: bodyConditionScore,
          coat_condition: coatCondition,
          stool_odor: stoolOdor,
          gas_frequency: gasFrequency,
          gas_odor: gasOdor,
          behaviour_tags: behaviourTags
            ? behaviourTags.split(',').map((t) => t.trim()).filter(Boolean)
            : undefined,
          force_reset: forceReset,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to establish baseline');
        return;
      }
      onComplete?.();
    } catch (e) {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
        <p className="text-sm text-gray-700">
          This is a one-time full check-in used as the reference point everything else compares
          against. Ongoing logging afterwards is a quick better/worse/no-change tap — this level
          of detail isn&apos;t needed every day.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm p-3 rounded">
          {error}
        </div>
      )}

      <BristolChartSelector value={stoolScore} onChange={setStoolScore} />
      <BCSChartSelector value={bodyConditionScore} onChange={setBodyConditionScore} />
      <WellnessLevelSelector metric="coat_condition" value={coatCondition} onChange={setCoatCondition} />
      <WellnessLevelSelector metric="stool_odor" value={stoolOdor} onChange={setStoolOdor} />
      <WellnessLevelSelector metric="gas_frequency" value={gasFrequency} onChange={setGasFrequency} />
      <WellnessLevelSelector metric="gas_odor" value={gasOdor} onChange={setGasOdor} />

      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-1">
          Behaviour notes (optional)
        </label>
        <input
          type="text"
          value={behaviourTags}
          onChange={(e) => setBehaviourTags(e.target.value)}
          placeholder="e.g. calm, anxious around food, normal energy"
          className="w-full border border-gray-300 rounded-lg p-2 text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">Comma-separated tags, if any stand out.</p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!isComplete || submitting}
        className="w-full bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg hover:bg-blue-700"
      >
        {submitting ? 'Saving baseline…' : 'Save baseline'}
      </button>
    </div>
  );
}
