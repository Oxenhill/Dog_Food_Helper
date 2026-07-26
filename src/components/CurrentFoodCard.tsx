'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/lib/clientAuth';
import FoodPicker, { PickableFood } from './FoodPicker';

interface FoodEventFood {
  id: string;
  brand: string;
  name: string;
  food_type: string;
  is_treat: boolean;
}

interface FoodEvent {
  id: string;
  food_or_treat_id: string | null;
  food_or_treat_freetext: string | null;
  started_at: string;
  ended_at: string | null;
  in_transition_until: string | null;
  food: FoodEventFood | null;
}

interface TreatSuggestion {
  suggested: boolean;
  worseLogCount: number;
  metrics: string[];
}

interface FoodEventsResponse {
  current_main_food: FoodEvent | null;
  in_transition: boolean;
  main_food_history: FoodEvent[];
  treats: FoodEvent[];
  treat_logging_enabled: boolean;
  treat_logging_prompt_dismissed: boolean;
  treat_logging_suggestion: TreatSuggestion;
}

/** Default phase-in period offered when switching, in days. */
const TRANSITION_OPTIONS = [
  { days: 7, label: 'Over about a week' },
  { days: 10, label: 'Over about 10 days' },
  { days: 0, label: 'Straight away' },
];

function describeEvent(event: FoodEvent): string {
  if (event.food) return `${event.food.brand} ${event.food.name}`;
  return event.food_or_treat_freetext ?? 'Unnamed food';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB');
}

/**
 * "What is your dog eating now?" and "I've changed foods."
 *
 * This is the entry point for food attribution. Every log entry is tied to the
 * main_food event open on its date, so without this the correlation engine has
 * no input at all — which is exactly the state the product was in: zero food
 * events had ever been recorded.
 */
export default function CurrentFoodCard({ dogId }: { dogId: string }) {
  const [data, setData] = useState<FoodEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'idle' | 'set-food' | 'log-treat'>('idle');
  const [transitionDays, setTransitionDays] = useState(7);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/food-events?dog_id=${dogId}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to load feeding history (${res.status})`);
        return;
      }
      setData(json);
      setError('');
    } catch {
      setError('Something went wrong loading feeding history.');
    } finally {
      setLoading(false);
    }
  }, [dogId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startEvent(
    eventType: 'main_food' | 'treat',
    food: PickableFood | null,
    freetext?: string
  ) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/food-events/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          dog_id: dogId,
          event_type: eventType,
          food_or_treat_id: food?.id,
          food_or_treat_freetext: food ? undefined : freetext,
          ...(eventType === 'main_food'
            ? { transition_days: data?.current_main_food ? transitionDays : 0 }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to record (${res.status})`);
        return;
      }
      setMode('idle');
      await load();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function updateTreatLogging(body: { enabled?: boolean; dismiss_prompt?: boolean }) {
    try {
      const res = await fetch(`/api/dogs/${dogId}/treat-logging`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
    } catch {
      // Non-fatal: a preference toggle failing should not break the page.
    }
  }

  if (loading) {
    return (
      <div className="card card-pad mt-6">
        <h2 className="section-title">What your dog is eating</h2>
        <p className="muted mt-2 text-[14px]">Loading…</p>
      </div>
    );
  }

  const current = data?.current_main_food ?? null;
  const suggestion = data?.treat_logging_suggestion;
  const showTreatNudge =
    suggestion?.suggested && !data?.treat_logging_enabled && !data?.treat_logging_prompt_dismissed;

  return (
    <div className="card card-pad mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">What your dog is eating</h2>
        {mode === 'idle' && (
          <button
            type="button"
            onClick={() => setMode('set-food')}
            className="btn-primary btn-sm shrink-0"
          >
            {current ? "I've changed foods" : 'Set current food'}
          </button>
        )}
      </div>

      {error && (
        <div className="callout-alarm mt-3" role="alert">
          {error}
        </div>
      )}

      {/* --- Current food -------------------------------------------------- */}
      {mode === 'idle' && (
        <>
          {current ? (
            <div className="mt-3">
              <p className="font-semibold text-ink">{describeEvent(current)}</p>
              <p className="help-text mt-1">
                Since <span className="metric">{formatDate(current.started_at)}</span>
                {current.food ? '' : ' · recorded by name only'}
              </p>

              {data?.in_transition && (
                <div className="callout-info mt-3">
                  <p className="text-[14px]">
                    Still settling in. While you&apos;re phasing the change over, your dog is
                    eating a bit of both foods, so logs from this period aren&apos;t clean
                    evidence for the new one — we hold them back from the analysis until{' '}
                    <span className="metric">
                      {current.in_transition_until ? formatDate(current.in_transition_until) : '—'}
                    </span>
                    .
                  </p>
                </div>
              )}

              {!current.food && (
                <div className="callout-info mt-3">
                  <p className="text-[14px]">
                    We only have the name of this food, not what&apos;s in it. Scanning the packet
                    records its ingredient list, which is what lets us work out what might be
                    upsetting your dog.
                  </p>
                  <Link
                    href={`/foods/add?dog=${dogId}`}
                    className="btn-secondary btn-sm mt-3 inline-flex"
                  >
                    Scan the packet
                  </Link>
                </div>
              )}

              {current.food && (
                <Link
                  href={`/foods/${current.food.id}?dog=${dogId}`}
                  className="mt-2 inline-block text-[13px] font-semibold text-pine hover:underline"
                >
                  See ingredients &amp; composition →
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <p className="lead">No food recorded yet.</p>
              <p className="help-text mt-1">
                Telling us what your dog eats is what connects your daily logs to a food. Without
                it we can track how your dog is doing, but not what might be causing it.
              </p>
            </div>
          )}
        </>
      )}

      {/* --- Set / change food --------------------------------------------- */}
      {mode === 'set-food' && (
        <div className="mt-4">
          {current && (
            <div className="field">
              <label className="label" htmlFor="transition">
                How are you making the change?
              </label>
              <select
                id="transition"
                value={transitionDays}
                onChange={(e) => setTransitionDays(Number(e.target.value))}
                className="select"
              >
                {TRANSITION_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="help-text">
                While both foods are being mixed, we won&apos;t treat those logs as evidence about
                the new food.
              </p>
            </div>
          )}

          <div className="mt-3">
            <FoodPicker
              type="meal"
              dogId={dogId}
              autoFocus
              onSelect={(food) => void startEvent('main_food', food)}
              onSelectFreetext={(text) => void startEvent('main_food', null, text)}
            />
          </div>

          <button
            type="button"
            onClick={() => setMode('idle')}
            disabled={saving}
            className="btn-ghost btn-sm mt-3"
          >
            Cancel
          </button>
        </div>
      )}

      {/* --- Food history -------------------------------------------------- */}
      {mode === 'idle' && (data?.main_food_history.length ?? 0) > 1 && (
        <details className="hairline mt-4 pt-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-pine">
            Foods you&apos;ve tried (<span className="metric">{data?.main_food_history.length}</span>)
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {data?.main_food_history.map((event) => (
              <li key={event.id} className="text-[14px]">
                <span className="text-ink">{describeEvent(event)}</span>
                <span className="metric muted ml-2 text-[13px]">
                  {formatDate(event.started_at)}
                  {event.ended_at ? ` – ${formatDate(event.ended_at)}` : ' – now'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* --- Treats -------------------------------------------------------- */}
      <div className="hairline mt-4 pt-4">
        {/* The conditional nudge. Fires only on a real digestive trend, and
            only until it is answered once — a suggestion, not a nag, so it
            uses the calm .callout-info register rather than the red-flag one. */}
        {showTreatNudge && (
          <div className="callout-info">
            <p className="text-[14px]">
              You&apos;ve logged{' '}
              <span className="metric">{suggestion?.worseLogCount}</span> entries where things got
              worse recently. Treats are the most common thing behind that, and they&apos;re easy
              to overlook — a chew or a training treat can matter as much as the food in the bowl.
            </p>
            <p className="help-text mt-2">
              If you start noting treats, we can tell the difference between the food and
              something else your dog is getting.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void updateTreatLogging({ enabled: true })}
                className="btn-secondary btn-sm"
              >
                Start logging treats
              </button>
              <button
                type="button"
                onClick={() => void updateTreatLogging({ dismiss_prompt: true })}
                className="btn-ghost btn-sm"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {data?.treat_logging_enabled ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h3 className="section-title text-[15px]">Treats</h3>
              {mode === 'idle' && (
                <button
                  type="button"
                  onClick={() => setMode('log-treat')}
                  className="btn-secondary btn-sm shrink-0"
                >
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
                  onSelect={(food) => void startEvent('treat', food)}
                  onSelectFreetext={(text) => void startEvent('treat', null, text)}
                />
                <button
                  type="button"
                  onClick={() => setMode('idle')}
                  disabled={saving}
                  className="btn-ghost btn-sm mt-3"
                >
                  Cancel
                </button>
              </div>
            )}

            {mode === 'idle' && (
              <>
                {(data?.treats.length ?? 0) === 0 ? (
                  <p className="help-text mt-2">
                    Nothing logged yet. Note treats on the days you give them — there&apos;s no
                    need to log every day.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1">
                    {data?.treats.slice(0, 8).map((treat) => (
                      <li key={treat.id} className="text-[14px]">
                        <span className="text-ink">{describeEvent(treat)}</span>
                        <span className="metric muted ml-2 text-[13px]">
                          {formatDate(treat.started_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => void updateTreatLogging({ enabled: false })}
                  className="btn-ghost btn-sm mt-3"
                >
                  Stop logging treats
                </button>
              </>
            )}
          </>
        ) : (
          !showTreatNudge && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="section-title text-[15px]">Treats</h3>
                <p className="help-text mt-1">
                  Not being logged. Turn this on if you want treats accounted for.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void updateTreatLogging({ enabled: true })}
                className="btn-ghost btn-sm shrink-0"
              >
                Turn on
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
