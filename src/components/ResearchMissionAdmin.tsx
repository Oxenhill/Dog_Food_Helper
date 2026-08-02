'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';

type Row = Record<string, any>;

interface UsageAggregate {
  calls: { total: number; started: number; succeeded: number; failed: number };
  actual_provider_reported: {
    calls_with_usage: number;
    completed_calls_without_usage: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    reasoning_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_usd: number;
    calls_with_cost: number;
  };
  estimates_not_actual: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
  };
  measured_timing: {
    calls_with_client_duration: number;
    client_duration_ms: number;
    calls_with_provider_duration: number;
    provider_duration_ms: number;
  };
}

interface MissionDetail {
  mission: Row;
  budget_policy: Row | null;
  usage: UsageAggregate;
  stages: Array<{
    stage: Row;
    model_configuration: Row | null;
    model_routes: Row[];
    budget_cap: Row | null;
    provider_calls: Row[];
    usage: UsageAggregate;
  }>;
  events: Row[];
}

function readable(value: unknown): string {
  return typeof value === 'string' ? value.replace(/_/g, ' ') : 'not recorded';
}

function number(value: unknown): string {
  return Number(value ?? 0).toLocaleString();
}

function money(value: unknown): string {
  return `$${Number(value ?? 0).toFixed(6)}`;
}

function shortId(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  return text ? `${text.slice(0, 8)}…` : '—';
}

function mergeEvents(previous: Row[], incoming: Row[]): Row[] {
  const bySequence = new Map<number, Row>();
  for (const event of [...previous, ...incoming]) {
    bySequence.set(Number(event.sequence_number), event);
  }
  return [...bySequence.values()].sort(
    (left, right) => Number(left.sequence_number) - Number(right.sequence_number)
  );
}

function UsageSummary({ usage }: { usage: UsageAggregate }) {
  const actual = usage.actual_provider_reported;
  const estimates = usage.estimates_not_actual;
  const timing = usage.measured_timing;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded border border-line bg-paper p-3">
        <p className="eyebrow">Actual — provider reported</p>
        <p className="mt-2 metric text-[14px]">
          {number(actual.input_tokens)} input · {number(actual.output_tokens)} output
        </p>
        <p className="help-text mt-1">
          {number(actual.total_tokens)} total · {actual.calls_with_usage}/{usage.calls.succeeded + usage.calls.failed} completed calls reported usage
        </p>
        <p className="help-text mt-1">
          Actual cost: {actual.calls_with_cost > 0 ? money(actual.cost_usd) : 'not reported by provider/gateway'}
        </p>
        {actual.completed_calls_without_usage > 0 && (
          <p className="error-text mt-2">
            {actual.completed_calls_without_usage} completed call(s) have no provider-reported usage; estimates were not substituted.
          </p>
        )}
      </div>
      <div className="rounded border border-amber-300 bg-amber-50 p-3">
        <p className="eyebrow">Estimate — not actual</p>
        <p className="mt-2 metric text-[14px]">
          {number(estimates.input_tokens)} input · {number(estimates.output_tokens)} output cap
        </p>
        <p className="help-text mt-1">
          {number(estimates.total_tokens)} estimated/capped tokens · {money(estimates.cost_usd)} estimated cost
        </p>
      </div>
      <div className="rounded border border-line bg-paper p-3">
        <p className="eyebrow">Measured call timing</p>
        <p className="mt-2 metric text-[14px]">
          {number(timing.client_duration_ms)} ms client wall time
        </p>
        <p className="help-text mt-1">
          {timing.calls_with_client_duration} measured call(s)
          {timing.calls_with_provider_duration > 0
            ? ` · ${number(timing.provider_duration_ms)} ms provider-reported`
            : ' · provider duration not separately reported'}
        </p>
      </div>
    </div>
  );
}

export default function ResearchMissionAdmin() {
  const [missions, setMissions] = useState<MissionDetail[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cursorRef = useRef(0);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/research/missions', {
        headers: sessionAuthHeaders(),
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load research missions');
      const rows = Array.isArray(body.missions) ? body.missions : [];
      setMissions(rows);
      setSelectedId((current) => current || rows[0]?.mission?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load research missions');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (
    missionId: string,
    afterSequence: number | null,
    merge: boolean
  ) => {
    const query = new URLSearchParams({ mission_id: missionId });
    if (afterSequence !== null) query.set('after_sequence', String(afterSequence));
    const response = await fetch(`/api/admin/research/missions?${query}`, {
      headers: sessionAuthHeaders(),
      cache: 'no-store',
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Could not load mission detail');
    const incoming = body.missions?.[0] as MissionDetail | undefined;
    if (!incoming) return;
    setDetail((current) => merge && current?.mission.id === missionId
      ? { ...incoming, events: mergeEvents(current.events, incoming.events) }
      : incoming);
    const lastSequence = Number(body.polling?.last_sequence ?? afterSequence ?? 0);
    cursorRef.current = Number.isSafeInteger(lastSequence) ? lastSequence : 0;
    if (body.polling?.has_more) {
      await loadDetail(missionId, cursorRef.current, true);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    cursorRef.current = 0;
    setError('');
    void loadDetail(selectedId, null, false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Could not load mission detail');
    });
  }, [loadDetail, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const interval = window.setInterval(() => {
      void loadDetail(selectedId, cursorRef.current, true).catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Mission polling failed');
      });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [loadDetail, selectedId]);

  return (
    <section className="card card-pad flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Persisted global research operations</p>
          <h2 className="section-title mt-1">Mission progress, usage and caps</h2>
          <p className="help-text mt-2 max-w-3xl">
            Polling resumes from the last persisted event sequence. Actual provider-reported usage is kept separate from estimates. Private dog reports never enter these missions, calls, events, or totals.
          </p>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={() => void loadList()}>
          Refresh missions
        </button>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}
      {loading && <p className="help-text">Loading persisted missions…</p>}
      {!loading && missions.length === 0 && (
        <div className="rounded border border-line bg-paper p-4">
          <p className="font-semibold">No research missions yet</p>
          <p className="help-text mt-1">This is the expected production baseline before a new owner-authorized operation runs.</p>
        </div>
      )}

      {missions.length > 0 && (
        <label className="field max-w-3xl">
          <span className="label">Mission</span>
          <select className="select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {missions.map((row) => (
              <option key={row.mission.id} value={row.mission.id}>
                {readable(row.mission.mission_type)} · {readable(row.mission.status)} · {new Date(row.mission.created_at).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      )}

      {detail && (
        <div className="flex flex-col gap-5">
          <div className="rounded border border-line bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Mission {shortId(detail.mission.id)}</p>
                <p className="mt-1 font-semibold text-ink">{detail.mission.objective}</p>
              </div>
              <span className="badge-pine">{readable(detail.mission.status)}</span>
            </div>
            {(detail.mission.terminal_reason_code || detail.mission.terminal_message) && (
              <div className="callout-alarm mt-3">
                <p className="font-semibold">Deterministic halt: {readable(detail.mission.terminal_reason_code)}</p>
                {detail.mission.terminal_message && <p className="mt-1 text-[13px]">{detail.mission.terminal_message}</p>}
              </div>
            )}
            {detail.budget_policy && (
              <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="muted">Budget policy</dt><dd className="metric">{detail.budget_policy.policy_key} v{detail.budget_policy.version}</dd></div>
                <div><dt className="muted">Mission call cap</dt><dd className="metric">{number(detail.budget_policy.mission_max_provider_calls)}</dd></div>
                <div><dt className="muted">Mission actual-token cap</dt><dd className="metric">{number(detail.budget_policy.mission_max_actual_total_tokens)}</dd></div>
                <div><dt className="muted">Mission estimate-token cap</dt><dd className="metric">{number(detail.budget_policy.mission_max_estimated_total_tokens)}</dd></div>
                <div><dt className="muted">Mission estimate-cost cap</dt><dd className="metric">{money(detail.budget_policy.mission_max_estimated_cost_usd)}</dd></div>
                <div><dt className="muted">Mission elapsed cap</dt><dd className="metric">{number(detail.budget_policy.mission_max_elapsed_ms)} ms</dd></div>
              </dl>
            )}
          </div>

          <UsageSummary usage={detail.usage} />

          <div className="flex flex-col gap-3">
            <h3 className="section-title">Stage attempts</h3>
            {detail.stages.map((attempt) => (
              <article key={attempt.stage.id} className="rounded border border-line bg-paper p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{readable(attempt.stage.stage_key)} · attempt {attempt.stage.attempt_number}</p>
                    <p className="help-text">Stage {attempt.stage.id}</p>
                  </div>
                  <span className="badge-pine">{readable(attempt.stage.status)}</span>
                </div>
                {attempt.stage.reason_code && (
                  <p className="error-text mt-2">Halt reason: {attempt.stage.reason_code}</p>
                )}

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded border border-line p-3">
                    <p className="eyebrow">Pinned model configuration</p>
                    <p className="help-text mt-2 break-all">{attempt.stage.model_stage_configuration_version_id}</p>
                    <p className="help-text mt-1">Version {attempt.model_configuration?.version ?? '—'} · {readable(attempt.model_configuration?.fallback_policy)}</p>
                    <div className="mt-3 flex flex-col gap-2">
                      {attempt.model_routes.map((route) => (
                        <div key={route.id} className="rounded bg-canvas px-3 py-2 text-[12px]">
                          <p className="font-semibold">{route.route_key} · {route.model_identifier}</p>
                          <p className="help-text">{route.provider} · {readable(route.execution_kind)} · route {route.id}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded border border-line p-3">
                    <p className="eyebrow">Pinned stage cap</p>
                    {attempt.budget_cap ? (
                      <dl className="mt-2 grid gap-2 text-[12px] sm:grid-cols-2">
                        <div><dt className="muted">Calls</dt><dd className="metric">{number(attempt.budget_cap.max_provider_calls)}</dd></div>
                        <div><dt className="muted">Actual tokens</dt><dd className="metric">{number(attempt.budget_cap.max_actual_total_tokens)}</dd></div>
                        <div><dt className="muted">Estimated tokens</dt><dd className="metric">{number(attempt.budget_cap.max_estimated_total_tokens)}</dd></div>
                        <div><dt className="muted">Estimated cost</dt><dd className="metric">{money(attempt.budget_cap.max_estimated_cost_usd)}</dd></div>
                        <div><dt className="muted">Input/call estimate</dt><dd className="metric">{number(attempt.budget_cap.max_estimated_input_tokens_per_call)}</dd></div>
                        <div><dt className="muted">Output/call estimate</dt><dd className="metric">{number(attempt.budget_cap.max_estimated_output_tokens_per_call)}</dd></div>
                      </dl>
                    ) : <p className="error-text mt-2">Pinned cap was not found.</p>}
                  </div>
                </div>

                <div className="mt-4"><UsageSummary usage={attempt.usage} /></div>
                <div className="mt-4 flex flex-col gap-2">
                  <p className="eyebrow">Provider calls</p>
                  {attempt.provider_calls.length === 0 && <p className="help-text">No provider calls for this attempt.</p>}
                  {attempt.provider_calls.map((call) => (
                    <div key={call.id} className="rounded border border-line p-3 text-[12px]">
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="font-semibold">{call.call_key} · {readable(call.status)}</p>
                        <p className="metric">{number(call.client_duration_ms)} ms measured</p>
                      </div>
                      <p className="help-text mt-1 break-all">Route {call.model_route_id} · config {call.model_stage_configuration_version_id} · job {call.research_ingestion_job_id ?? 'none'}</p>
                      <p className="mt-2">
                        Actual provider-reported: {call.actual_usage_source === 'provider_reported'
                          ? `${number(call.actual_input_tokens)} input · ${number(call.actual_output_tokens)} output · ${number(call.actual_total_tokens)} total`
                          : 'not reported; no estimate substituted'}
                      </p>
                      <p className="mt-1 text-amber-800">
                        Estimate — not actual: {number(call.estimated_input_tokens)} input · {number(call.estimated_output_tokens)} output cap · {money(call.estimated_cost_usd)}
                      </p>
                      <p className="help-text mt-1">{call.estimate_method} · {call.estimate_version} · rate {call.estimate_rate_version_id ?? 'none'}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div>
            <h3 className="section-title">Persisted ordered events</h3>
            <div className="mt-3 flex flex-col gap-2">
              {detail.events.length === 0 && <p className="help-text">No events recorded.</p>}
              {detail.events.map((event) => (
                <div key={`${event.mission_id}:${event.sequence_number}`} className="rounded border border-line bg-paper p-3 text-[12px]">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold">#{event.sequence_number} · {event.event_type}</p>
                    <p className="help-text">{new Date(event.occurred_at).toLocaleString()}</p>
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-ink-soft">{JSON.stringify(event.payload, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
