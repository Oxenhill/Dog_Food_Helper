'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import type { OutcomeMetric } from '@/lib/types';

interface LiteratureVerdict {
  ingredient_key: string;
  direction: 'supports' | 'cautions_against' | 'contested';
  net_deviation: number;
  topic_count: number;
  summary: string;
}

interface FleetPattern {
  ingredient_key: string;
  dog_count: number;
  metrics: OutcomeMetric[];
  avg_strength: number;
  direction: 'better_outcomes' | 'worse_outcomes' | 'no_clear_pattern';
  confidence_tier: 'low_sample' | 'preliminary' | 'established';
}

type Agreement = 'agrees' | 'diverges' | 'inconclusive' | 'literature_only' | 'fleet_only';

interface ReportRow {
  ingredient_key: string;
  literature: LiteratureVerdict | null;
  fleet: FleetPattern | null;
  agreement: Agreement;
}

interface ReportResponse {
  rows: ReportRow[];
  fleet_confidence_thresholds: { low_sample_min: number; preliminary_min: number; established_min: number };
  generated_at: string;
}

const AGREEMENT_LABEL: Record<Agreement, string> = {
  diverges: 'Diverges',
  agrees: 'Agrees',
  inconclusive: 'Inconclusive',
  fleet_only: 'Fleet data only — no literature yet',
  literature_only: 'Literature only — no fleet pattern yet',
};

const AGREEMENT_CLASS: Record<Agreement, string> = {
  diverges: 'text-amber-700',
  agrees: 'text-pine-dark',
  inconclusive: 'text-ink-soft',
  fleet_only: 'text-ink-soft',
  literature_only: 'text-ink-soft',
};

export default function ResearchFleetSignal() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/research/fleet-signal', {
        headers: sessionAuthHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load the fleet signal report');
      setReport(body as ReportResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the fleet signal report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card card-pad flex flex-col gap-5">
      <div>
        <p className="eyebrow">Research layer</p>
        <h2 className="section-title mt-1">Fleet signal — the probe</h2>
        <p className="help-text mt-2">
          For every ingredient with approved research evidence, compares what the literature says
          against what the whole dog fleet&apos;s real logged outcomes say for that same ingredient.
          This is informational only — nothing here writes back into the Gate 5 scoring policy or any
          claim. Treat a divergence as a prompt to look closer, not a verdict.
        </p>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}

      <div className="flex items-center gap-3">
        <button type="button" className="button-primary" disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {report && (
          <p className="help-text">
            Fleet pattern shown once at least {report.fleet_confidence_thresholds.low_sample_min} distinct
            dogs contribute to an ingredient (low_sample), {report.fleet_confidence_thresholds.preliminary_min}+
            is preliminary, {report.fleet_confidence_thresholds.established_min}+ is established.
          </p>
        )}
      </div>

      {report && (
        <div className="grid gap-2">
          {report.rows.map((row) => (
            <article key={row.ingredient_key} className="rounded border border-line p-3 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink capitalize">{row.ingredient_key}</span>
                <span className={`text-[12px] font-semibold ${AGREEMENT_CLASS[row.agreement]}`}>
                  {AGREEMENT_LABEL[row.agreement]}
                </span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-line bg-surface p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Literature</p>
                  {row.literature ? (
                    <p className="help-text mt-1">
                      {row.literature.direction} ({row.literature.net_deviation >= 0 ? '+' : ''}
                      {row.literature.net_deviation.toFixed(3)}) across {row.literature.topic_count} finding(s).
                    </p>
                  ) : (
                    <p className="help-text mt-1">No approved research evidence for this ingredient.</p>
                  )}
                </div>
                <div className="rounded border border-line bg-surface p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Fleet ({row.fleet?.confidence_tier ?? 'below sample floor'})</p>
                  {row.fleet ? (
                    <p className="help-text mt-1">
                      {row.fleet.direction} (avg {row.fleet.avg_strength >= 0 ? '+' : ''}
                      {row.fleet.avg_strength.toFixed(3)}) across {row.fleet.dog_count} dog(s),{' '}
                      {row.fleet.metrics.join(', ')}.
                    </p>
                  ) : (
                    <p className="help-text mt-1">No fleet pattern above the sample floor yet.</p>
                  )}
                </div>
              </div>
            </article>
          ))}
          {report.rows.length === 0 && (
            <p className="help-text">No ingredient currently has literature evidence or a fleet pattern to compare.</p>
          )}
        </div>
      )}
    </section>
  );
}
