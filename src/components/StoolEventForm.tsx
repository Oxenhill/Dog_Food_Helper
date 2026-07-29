'use client';

import { useCallback, useEffect, useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import BristolChartSelector from './BristolChartSelector';
import { DailyStoolSummary } from '@/lib/stoolEventAggregation';

const FLAGS = [
  ['mucus', 'Mucus'],
  ['blood', 'Blood'],
  ['urgency', 'Urgency'],
  ['straining', 'Straining'],
  ['undigested_food', 'Undigested food'],
] as const;

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function StoolEventForm({ dogId }: { dogId: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [summaries, setSummaries] = useState<DailyStoolSummary[]>([]);
  const [monitoring, setMonitoring] = useState<{ baseline_id?: string | null } | null>(null);
  const [monitoringLoaded, setMonitoringLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/stools?dog_id=${dogId}`, { headers: authHeaders() });
    const data = await response.json();
    if (response.ok) {
      setSummaries(data.daily_summaries ?? []);
      setMonitoring(data.monitoring_window ?? null);
    }
    setMonitoringLoaded(true);
  }, [dogId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit() {
    if (score === null || !occurredAt) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const local = new Date(occurredAt);
      const response = await fetch('/api/stools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          dog_id: dogId,
          occurred_on: occurredAt.slice(0, 10),
          occurred_at: local.toISOString(),
          score,
          note,
          ...flags,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to record stool');
        return;
      }
      setSuccess(true);
      setScore(null);
      setFlags({});
      setNote('');
      setOccurredAt(localDateTimeValue());
      await refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="callout-info">
        Log each stool separately. Bowl derives the day&apos;s count, highest loose-stool score,
        median and spread from these events.
      </div>

      {monitoringLoaded && !monitoring && (
        <div className="callout-disclaimer">
          No food-change monitoring window is open. Record a food change first; Bowl will then
          open monitoring and compare each day with the saved baseline.
        </div>
      )}

      {monitoring && (
        <div className={monitoring.baseline_id ? 'callout-info' : 'callout-alarm'}>
          {monitoring.baseline_id
            ? 'Food-change monitoring is active. These observations are being compared with the recorded baseline.'
            : 'Food-change monitoring is active, but no stool baseline was available when it opened. Events are saved; comparison remains unconfirmable.'}
        </div>
      )}

      {error && <div className="callout-alarm">{error}</div>}
      {success && <div className="callout border-better/25 bg-better-tint text-better">Stool recorded.</div>}

      <div className="field">
        <label className="label" htmlFor="stool-occurred-at">
          When
        </label>
        <input
          id="stool-occurred-at"
          type="datetime-local"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
          className="input"
        />
      </div>

      <BristolChartSelector value={score} onChange={setScore} />

      <fieldset className="rounded-lg border border-line p-4">
        <legend className="label px-1">Anything else noticed? (optional)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FLAGS.map(([name, label]) => (
            <button
              key={name}
              type="button"
              aria-pressed={flags[name] === true}
              onClick={() => setFlags((current) => ({ ...current, [name]: !current[name] }))}
              className={`rounded-full border px-3 py-2 text-[13px] font-semibold ${
                flags[name] ? 'border-pine bg-pine-tint text-pine' : 'border-line-strong bg-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {flags.blood && (
          <p className="mt-3 text-[13px] font-semibold text-alarm">
            Blood in stool can need urgent veterinary advice. Use the urgent-check route as well.
          </p>
        )}
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="stool-note">
          Note (optional)
        </label>
        <textarea
          id="stool-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="input min-h-20"
          maxLength={1000}
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={score === null || !occurredAt || !monitoring || submitting}
        className="btn-primary btn-block"
      >
        {submitting ? 'Saving…' : 'Record this stool'}
      </button>

      {summaries.length > 0 && (
        <div>
          <h2 className="section-title">Recent daily summaries</h2>
          <div className="mt-3 grid gap-3">
            {summaries.slice(0, 7).map((summary) => (
              <div key={summary.date} className="rounded-lg border border-line p-3 text-[13px]">
                <div className="font-semibold text-ink">{summary.date}</div>
                <div className="mt-1 text-ink-soft">
                  {summary.count} stool{summary.count === 1 ? '' : 's'} · highest score{' '}
                  {summary.worst_score ?? 'unknown'} · median {summary.median_score ?? 'unknown'} ·
                  spread {summary.spread ?? 'unknown'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
