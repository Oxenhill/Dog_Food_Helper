'use client';

import { useState } from 'react';
import BristolMultiChartSelector from './BristolMultiChartSelector';
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
  const [stoolScores, setStoolScores] = useState<number[]>([]);
  const [stoolCountMin, setStoolCountMin] = useState<number | null>(null);
  const [stoolCountMax, setStoolCountMax] = useState<number | null>(null);
  const [bodyConditionScore, setBodyConditionScore] = useState<number | null>(null);
  const [coatCondition, setCoatCondition] = useState<Level | null>(null);
  const [stoolOdor, setStoolOdor] = useState<Level | null>(null);
  const [gasFrequency, setGasFrequency] = useState<Level | null>(null);
  const [gasOdor, setGasOdor] = useState<Level | null>(null);
  const [behaviourTags, setBehaviourTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isComplete =
    stoolScores.length > 0 &&
    stoolCountMin !== null &&
    stoolCountMax !== null &&
    Number.isInteger(stoolCountMin) &&
    Number.isInteger(stoolCountMax) &&
    stoolCountMin >= 0 &&
    stoolCountMax >= stoolCountMin &&
    stoolCountMax <= 30 &&
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
          stool_scores: stoolScores,
          stools_per_day_min: stoolCountMin,
          stools_per_day_max: stoolCountMax,
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
    <div className="flex flex-col gap-6">
      <div className="callout-disclaimer">
        This is a one-time full check-in used as the reference point everything else compares
        against. Stool baseline records every consistency type that is usual for this dog plus
        the normal daily-count range. Later stools are recorded one event at a time.
      </div>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}

      <BristolMultiChartSelector values={stoolScores} onChange={setStoolScores} />
      <fieldset className="rounded-lg border border-line p-4">
        <legend className="label px-1">Usual number of stools per day</legend>
        <p className="help-text mb-3">
          Record a range. Use the same number twice if it is usually exact.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <label className="label" htmlFor="stool-count-min">
              From
            </label>
            <input
              id="stool-count-min"
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={stoolCountMin ?? ''}
              onChange={(event) =>
                setStoolCountMin(event.target.value === '' ? null : Number(event.target.value))
              }
              className="input"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="stool-count-max">
              To
            </label>
            <input
              id="stool-count-max"
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={stoolCountMax ?? ''}
              onChange={(event) =>
                setStoolCountMax(event.target.value === '' ? null : Number(event.target.value))
              }
              className="input"
            />
          </div>
        </div>
      </fieldset>
      <BCSChartSelector value={bodyConditionScore} onChange={setBodyConditionScore} />
      <WellnessLevelSelector metric="coat_condition" value={coatCondition} onChange={setCoatCondition} />
      <WellnessLevelSelector metric="stool_odor" value={stoolOdor} onChange={setStoolOdor} />
      <WellnessLevelSelector metric="gas_frequency" value={gasFrequency} onChange={setGasFrequency} />
      <WellnessLevelSelector metric="gas_odor" value={gasOdor} onChange={setGasOdor} />

      <div className="field">
        <label className="label" htmlFor="behaviour-tags">
          Behaviour notes (optional)
        </label>
        <input
          id="behaviour-tags"
          type="text"
          value={behaviourTags}
          onChange={(e) => setBehaviourTags(e.target.value)}
          placeholder="e.g. calm, anxious around food, normal energy"
          className="input"
        />
        <p className="help-text">Comma-separated tags, if any stand out.</p>
      </div>

      <button onClick={handleSubmit} disabled={!isComplete || submitting} className="btn-primary btn-block">
        {submitting ? 'Saving baseline…' : 'Save baseline'}
      </button>
    </div>
  );
}
