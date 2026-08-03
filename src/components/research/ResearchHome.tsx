'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';

interface ProcessingSummary {
  documents: Array<{
    id: string;
    retracted: boolean;
    superseded_by: string | null;
    duplicate_of_document_id: string | null;
    claims: unknown[];
    draft_attempts: number;
  }>;
  clusters: Array<{ id: string; status: string }>;
}

interface MissionSummary {
  mission: { id: string; mission_type: string; status: string; created_at: string; objective: string };
}

interface LifecycleEventSummary {
  id: number;
  document_title: string | null;
  event_type: 'retracted' | 'superseded';
  reason: string;
  occurred_at: string;
}

interface ActivityItem {
  key: string;
  when: string;
  text: string;
  tone: 'pine' | 'alarm' | 'gold';
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function ResearchHome() {
  const [processing, setProcessing] = useState<ProcessingSummary | null>(null);
  const [queuedClaimCount, setQueuedClaimCount] = useState<number | null>(null);
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [lifecycleEvents, setLifecycleEvents] = useState<LifecycleEventSummary[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [processingRes, claimsRes, missionsRes, lifecycleRes] = await Promise.all([
          fetch('/api/admin/research/processing', { headers: sessionAuthHeaders() }),
          fetch('/api/admin/research/claims?status=queued_for_review', { headers: sessionAuthHeaders() }),
          fetch('/api/admin/research/missions', { headers: sessionAuthHeaders() }),
          fetch('/api/admin/research/lifecycle-events?limit=5', { headers: sessionAuthHeaders() }),
        ]);
        const [processingBody, claimsBody, missionsBody, lifecycleBody] = await Promise.all([
          safeJson(processingRes),
          safeJson(claimsRes),
          safeJson(missionsRes),
          safeJson(lifecycleRes),
        ]);
        if (!active) return;
        if (processingRes.ok) setProcessing(processingBody as unknown as ProcessingSummary);
        if (claimsRes.ok) setQueuedClaimCount(Array.isArray(claimsBody.claims) ? claimsBody.claims.length : 0);
        if (missionsRes.ok) setMissions(Array.isArray(missionsBody.missions) ? (missionsBody.missions as MissionSummary[]).slice(0, 5) : []);
        if (lifecycleRes.ok) setLifecycleEvents(Array.isArray(lifecycleBody.events) ? (lifecycleBody.events as LifecycleEventSummary[]) : []);
      } catch {
        if (active) setError('Some dashboard tiles could not load — the underlying pages still work independently.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const pendingDocuments = useMemo(
    () =>
      (processing?.documents ?? []).filter(
        (doc) =>
          !doc.retracted &&
          !doc.superseded_by &&
          !doc.duplicate_of_document_id &&
          doc.claims.length === 0 &&
          doc.draft_attempts === 0,
      ).length,
    [processing],
  );
  const queuedClusters = useMemo(
    () => (processing?.clusters ?? []).filter((c) => c.status === 'queued_for_review' || c.status === 'draft').length,
    [processing],
  );
  const activeClusters = useMemo(() => (processing?.clusters ?? []).filter((c) => c.status === 'active').length, [processing]);
  const totalDocuments = processing?.documents.length ?? null;

  const activity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];
    missions.forEach((m) =>
      items.push({
        key: `mission:${m.mission.id}`,
        when: m.mission.created_at,
        text: `${m.mission.mission_type.replace(/_/g, ' ')} mission ${m.mission.status.replace(/_/g, ' ')} — ${m.mission.objective}`,
        tone: m.mission.status === 'failed' ? 'alarm' : 'pine',
      }),
    );
    lifecycleEvents.forEach((event) =>
      items.push({
        key: `lifecycle:${event.id}`,
        when: event.occurred_at,
        text: `${event.event_type === 'retracted' ? 'Retracted' : 'Superseded'}: ${event.document_title ?? 'a source'}`,
        tone: 'alarm',
      }),
    );
    return items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 6);
  }, [missions, lifecycleEvents]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">Research workspace</p>
        <h1 className="page-title mt-2 text-[22px] sm:text-[26px]">Research at a glance</h1>
        <p className="lead mt-2 max-w-3xl">
          Missions, source intake, review and the evidence graph, split into dedicated workspaces.
          Nothing here overrides the deterministic, research-free recommendation ranking.
        </p>
      </div>

      {error && <div className="callout-info" role="status">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
          <p className="metric text-[24px]">{totalDocuments ?? '—'}</p>
          <p className="help-text mt-1">Papers in library</p>
          <p className="mt-2 text-[11px] font-mono text-pine-soft">{pendingDocuments} awaiting structured processing</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
          <p className="metric text-[24px]">{queuedClusters + (queuedClaimCount ?? 0)}</p>
          <p className="help-text mt-1">Awaiting your review</p>
          <p className="mt-2 text-[11px] font-mono text-pine-soft">
            {queuedClusters} cluster(s) · {queuedClaimCount ?? '—'} individual claim(s)
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
          <p className="metric text-[24px]">{activeClusters}</p>
          <p className="help-text mt-1">Active evidence clusters</p>
          <p className="mt-2 text-[11px] font-mono text-pine-soft">Reviewed, projected to the graph</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
          <p className="metric text-[24px]">{lifecycleEvents.length}</p>
          <p className="help-text mt-1">Recent retractions/supersessions</p>
          <p className="mt-2 text-[11px] font-mono text-pine-soft">See Retraction watch</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card card-pad">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Awaiting a decision</p>
              <h2 className="section-title mt-1 text-[16px]">Review queue preview</h2>
            </div>
            <Link href="/admin/research/review" className="btn-ghost btn-sm">Open review queue →</Link>
          </div>
          <p className="help-text mt-3">
            {queuedClusters} proposition cluster(s) and {queuedClaimCount ?? 0} individual claim(s) are
            currently queued for review.
          </p>
        </div>

        <div className="card card-pad">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Just happened</p>
              <h2 className="section-title mt-1 text-[16px]">Activity</h2>
            </div>
            <Link href="/admin/research/missions" className="btn-ghost btn-sm">Open mission monitor →</Link>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {activity.length === 0 && <p className="help-text">No recent missions or lifecycle events.</p>}
            {activity.map((item) => (
              <div key={item.key} className="flex items-start gap-2 text-[13px]">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${
                    item.tone === 'alarm' ? 'bg-alarm' : item.tone === 'gold' ? 'bg-gold' : 'bg-pine'
                  }`}
                />
                <span className="text-ink-soft">
                  <span className="text-ink">{item.text}</span> · {new Date(item.when).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <p className="eyebrow">Quick actions</p>
        <h2 className="section-title mt-1 text-[16px]">Start something</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/research/intake" className="btn-primary btn-sm">Check for new research</Link>
          <Link href="/admin/research/intake" className="btn-secondary btn-sm">Import a link</Link>
          <Link href="/admin/research/intake" className="btn-secondary btn-sm">Upload a PDF</Link>
          <Link href="/admin/research/graph" className="btn-secondary btn-sm">Open graph canvas</Link>
        </div>
      </div>
    </div>
  );
}
