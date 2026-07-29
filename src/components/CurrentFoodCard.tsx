'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/lib/clientAuth';
import { DietExposureAudit, DogDietComponent, DogDietPeriod } from '@/lib/types';
import DietComponentEditor, { DietComponentDraft } from './DietComponentEditor';
import FoodPicker, { PickableFood } from './FoodPicker';

interface TreatEvent {
  id: string;
  food_or_treat_freetext: string | null;
  started_at: string;
  food: PickableFood | null;
}

interface TreatSuggestion {
  suggested: boolean;
  worseLogCount: number;
  metrics: string[];
}

interface DietResponse {
  current_diet: DogDietPeriod | null;
  diet_history: DogDietPeriod[];
  in_transition: boolean;
  exposure: DietExposureAudit;
}

interface TreatResponse {
  treats: TreatEvent[];
  treat_logging_enabled: boolean;
  treat_logging_prompt_dismissed: boolean;
  treat_logging_suggestion: TreatSuggestion;
}

const TRANSITION_OPTIONS = [
  { days: 7, label: 'Over about a week' },
  { days: 10, label: 'Over about 10 days' },
  { days: 0, label: 'Straight away' },
];

function componentName(component: DogDietComponent): string {
  if (component.food) return `${component.food.brand} ${component.food.name}`;
  return component.food_freetext ?? 'Unnamed food';
}

function treatName(event: TreatEvent): string {
  if (event.food) return `${event.food.brand} ${event.food.name}`;
  return event.food_or_treat_freetext ?? 'Unnamed treat';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB');
}

function toDraft(component: DogDietComponent): DietComponentDraft {
  return {
    client_id: component.id,
    food_id: component.food_id ?? null,
    food_freetext: component.food_freetext ?? null,
    role: component.role ?? null,
    share: component.share ?? null,
    schedule: component.schedule ?? null,
    days_of_week: component.days_of_week ?? null,
    meal_slot: component.meal_slot ?? null,
    food: component.food
      ? {
          id: component.food.id,
          brand: component.food.brand,
          name: component.food.name,
          food_type: component.food.food_type,
          is_treat: false,
        }
      : null,
  };
}

export default function CurrentFoodCard({ dogId }: { dogId: string }) {
  const [dietData, setDietData] = useState<DietResponse | null>(null);
  const [treatData, setTreatData] = useState<TreatResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'idle' | 'edit-diet' | 'log-treat'>('idle');
  const [draft, setDraft] = useState<DietComponentDraft[]>([]);
  const [transitionDays, setTransitionDays] = useState(7);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dietRes, treatRes] = await Promise.all([
        fetch(`/api/diets?dog_id=${dogId}`, { headers: authHeaders() }),
        fetch(`/api/food-events?dog_id=${dogId}`, { headers: authHeaders() }),
      ]);
      const [dietJson, treatJson] = await Promise.all([dietRes.json(), treatRes.json()]);
      if (!dietRes.ok) throw new Error(dietJson.error ?? 'Failed to load diet');
      if (!treatRes.ok) throw new Error(treatJson.error ?? 'Failed to load treats');
      setDietData(dietJson);
      setTreatData(treatJson);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load feeding history');
    } finally {
      setLoading(false);
    }
  }, [dogId]);

  useEffect(() => {
    void load();
  }, [load]);

  function beginDietEdit() {
    setDraft((dietData?.current_diet?.components ?? []).map(toDraft));
    setMode('edit-diet');
  }

  async function saveDiet() {
    if (draft.length === 0) {
      setError('Add at least one food to the diet');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/diets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          dog_id: dogId,
          transition_days: dietData?.current_diet ? transitionDays : 0,
          components: draft.map(({ client_id: _clientId, food: _food, ...component }) => component),
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? 'Failed to record diet');
        return;
      }
      setMode('idle');
      await load();
    } catch {
      setError('Something went wrong recording the diet.');
    } finally {
      setSaving(false);
    }
  }

  async function logTreat(food: PickableFood | null, freetext?: string) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/food-events/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          dog_id: dogId,
          event_type: 'treat',
          food_or_treat_id: food?.id,
          food_or_treat_freetext: food ? undefined : freetext,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? 'Failed to record treat');
        return;
      }
      setMode('idle');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateTreatLogging(body: { enabled?: boolean; dismiss_prompt?: boolean }) {
    const response = await fetch(`/api/dogs/${dogId}/treat-logging`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (response.ok) await load();
  }

  if (loading) {
    return (
      <div className="card card-pad mt-6">
        <h2 className="section-title">What your dog is eating</h2>
        <p className="muted mt-2 text-[14px]">Loading…</p>
      </div>
    );
  }

  const current = dietData?.current_diet ?? null;
  const suggestion = treatData?.treat_logging_suggestion;
  const showTreatNudge =
    suggestion?.suggested &&
    !treatData?.treat_logging_enabled &&
    !treatData?.treat_logging_prompt_dismissed;

  return (
    <div className="card card-pad mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">What your dog is eating</h2>
        {mode === 'idle' && (
          <button type="button" onClick={beginDietEdit} className="btn-primary btn-sm shrink-0">
            {current ? 'Change diet' : 'Set current diet'}
          </button>
        )}
      </div>

      {error && (
        <div className="callout-alarm mt-3" role="alert">
          {error}
        </div>
      )}

      {mode === 'idle' &&
        (current ? (
          <div className="mt-3">
            <ul className="flex flex-col gap-2">
              {current.components.map((component) => (
                <li key={component.id} className="text-[14px]">
                  <span className="font-semibold text-ink">{componentName(component)}</span>
                  {component.role && <span className="muted ml-2">{component.role}</span>}
                  {component.food && (
                    <Link
                      href={`/foods/${component.food.id}?dog=${dogId}`}
                      className="ml-2 text-[13px] font-semibold text-pine hover:underline"
                    >
                      Ingredients →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <p className="help-text mt-2">
              {current.started_at
                ? `Recorded from ${formatDate(current.started_at)}`
                : 'Start date was not captured in the legacy record.'}
            </p>

            {dietData?.in_transition && (
              <div className="callout-info mt-3">
                Change still being phased in. Logs remain inside the settling window until{' '}
                <span className="metric">{formatDate(current.in_transition_until!)}</span>.
              </div>
            )}

            {dietData?.exposure.status === 'unconfirmable' && (
              <div className="callout-disclaimer mt-3">
                {dietData.exposure.opaque_component_count} component
                {dietData.exposure.opaque_component_count === 1 ? ' has' : 's have'} no confirmable
                composition data. The whole diet is unconfirmable; Bowl will not treat a partial
                ingredient union as clear.
              </div>
            )}
          </div>
        ) : (
          <p className="lead mt-3">No diet recorded yet.</p>
        ))}

      {mode === 'edit-diet' && (
        <div className="mt-4">
          {current && (
            <label className="field mb-4">
              <span className="label">How are you making the change?</span>
              <select
                className="select"
                value={transitionDays}
                onChange={(event) => setTransitionDays(Number(event.target.value))}
              >
                {TRANSITION_OPTIONS.map((option) => (
                  <option key={option.days} value={option.days}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <DietComponentEditor value={draft} onChange={setDraft} dogId={dogId} />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveDiet()} disabled={saving} className="btn-primary btn-sm">
              {saving ? 'Saving…' : current ? 'Record diet change' : 'Save diet'}
            </button>
            <button type="button" onClick={() => setMode('idle')} disabled={saving} className="btn-ghost btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'idle' && (dietData?.diet_history.length ?? 0) > 1 && (
        <details className="hairline mt-4 pt-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-pine">
            Diet history ({dietData?.diet_history.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {dietData?.diet_history.map((period) => (
              <li key={period.id} className="text-[14px]">
                {period.components.map(componentName).join(' + ')}
                <span className="metric muted ml-2 text-[13px]">
                  {period.started_at ? formatDate(period.started_at) : 'start unknown'}
                  {period.ended_at ? ` – ${formatDate(period.ended_at)}` : ' – now'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="hairline mt-4 pt-4">
        {showTreatNudge && (
          <div className="callout-info">
            <p className="text-[14px]">
              You&apos;ve logged {suggestion?.worseLogCount} entries where things got worse. Treats
              can matter as much as foods in the recorded diet.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void updateTreatLogging({ enabled: true })} className="btn-secondary btn-sm">
                Start logging treats
              </button>
              <button type="button" onClick={() => void updateTreatLogging({ dismiss_prompt: true })} className="btn-ghost btn-sm">
                Not now
              </button>
            </div>
          </div>
        )}

        {treatData?.treat_logging_enabled ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h3 className="section-title text-[15px]">Treats</h3>
              {mode === 'idle' && (
                <button type="button" onClick={() => setMode('log-treat')} className="btn-secondary btn-sm">
                  Log a treat
                </button>
              )}
            </div>
            {mode === 'log-treat' && (
              <div className="mt-3">
                <FoodPicker
                  type="treat"
                  dogId={dogId}
                  autoFocus
                  onSelect={(food) => void logTreat(food)}
                  onSelectFreetext={(text) => void logTreat(null, text)}
                />
                <button type="button" onClick={() => setMode('idle')} className="btn-ghost btn-sm mt-3">
                  Cancel
                </button>
              </div>
            )}
            {mode === 'idle' && (
              <>
                <ul className="mt-2 flex flex-col gap-1">
                  {(treatData?.treats ?? []).slice(0, 8).map((event) => (
                    <li key={event.id} className="text-[14px]">
                      {treatName(event)}
                      <span className="metric muted ml-2 text-[13px]">{formatDate(event.started_at)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => void updateTreatLogging({ enabled: false })} className="btn-ghost btn-sm mt-3">
                  Stop logging treats
                </button>
              </>
            )}
          </>
        ) : (
          !showTreatNudge && (
            <button type="button" onClick={() => void updateTreatLogging({ enabled: true })} className="btn-ghost btn-sm">
              Turn on treat logging
            </button>
          )
        )}
      </div>
    </div>
  );
}
