'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { sessionAuthHeaders } from '@/lib/session';
import { RESEARCH_DISCOVERY_TOPICS } from '@/lib/researchTopics';
import type { ResearchCandidate } from '@/lib/researchEvidence';
import type { ResearchTopic } from '@/lib/types';

interface DiscoveryCandidateRow {
  id: string;
  imported_document_id: string | null;
  selected: boolean;
  candidate: ResearchCandidate;
}

interface IngestionJob {
  id: string;
  job_type: string;
  status: string;
  error_message: string | null;
  gateway_model: string | null;
  gateway_cost_usd: number | null;
  result_summary: Record<string, unknown>;
  created_at: string;
  label: string | null;
}

async function readBody(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return { error: `The server returned an unreadable response (${response.status}).` };
  }
}

export default function ResearchIngestionAdmin() {
  const pdfInput = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<DiscoveryCandidateRow[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTopic, setSourceTopic] = useState('amino-acids');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfSourceUrl, setPdfSourceUrl] = useState('');
  const [pdfTopic, setPdfTopic] = useState<ResearchTopic>('general');

  async function refresh() {
    const [discoveryResponse, jobsResponse] = await Promise.all([
      fetch('/api/admin/research/discovery', { headers: sessionAuthHeaders() }),
      fetch('/api/admin/research/ingestion', { headers: sessionAuthHeaders() }),
    ]);
    const [discovery, jobBody] = await Promise.all([
      readBody(discoveryResponse),
      readBody(jobsResponse),
    ]);
    if (discoveryResponse.ok) setCandidates(discovery.candidates ?? []);
    if (jobsResponse.ok) setJobs(jobBody.jobs ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runDiscovery() {
    setBusy('discovery');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/discovery', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates_per_topic: 2, document_cap: 30 }),
      });
      const body = await readBody(response);
      if (!response.ok) throw new Error(body.error ?? 'Research check failed');
      setCandidates(body.candidates ?? []);
      setNotice(
        `Found ${body.run_summary?.unique_candidate_count ?? 0} unique candidates. No model or embedding call was used for discovery.`
      );
      await refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Research check failed');
    } finally {
      setBusy('');
    }
  }

  async function importCandidate(candidateId: string) {
    setBusy(candidateId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/ingestion', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_candidate', candidate_id: candidateId }),
      });
      const body = await readBody(response);
      if (!response.ok) throw new Error(body.error ?? 'Import failed');
      setNotice(
        body.already_imported
          ? 'That paper is already in the knowledge base.'
          : `Paper imported and embedded through the Gateway (${body.result?.chunkCount ?? 0} chunks).`
      );
      await refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed');
    } finally {
      setBusy('');
    }
  }

  async function importUrl(event: FormEvent) {
    event.preventDefault();
    setBusy('url');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/ingestion', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_url',
          url: sourceUrl,
          topic_key: sourceTopic,
        }),
      });
      const body = await readBody(response);
      if (!response.ok) throw new Error(body.error ?? 'Source import failed');
      setSourceUrl('');
      setNotice(
        `Source resolved through PubMed and embedded through the Gateway (${body.result?.chunkCount ?? 0} chunks).`
      );
      await refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Source import failed');
    } finally {
      setBusy('');
    }
  }

  async function uploadPdf(event: FormEvent) {
    event.preventDefault();
    const file = pdfInput.current?.files?.[0];
    if (!file) {
      setError('Choose a PDF first.');
      return;
    }
    setBusy('pdf');
    setError('');
    setNotice('');
    try {
      const prepareResponse = await fetch('/api/admin/research/ingestion', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare_pdf',
          original_filename: file.name,
          file_size: file.size,
          title: pdfTitle,
          topic: pdfTopic,
          source_url: pdfSourceUrl || null,
        }),
      });
      const prepared = await readBody(prepareResponse);
      if (!prepareResponse.ok) throw new Error(prepared.error ?? 'Could not prepare PDF');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('Storage is not configured');
      const storage = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: uploadError } = await storage.storage
        .from('research-ingestion')
        .uploadToSignedUrl(
          prepared.storage_path,
          prepared.upload_token,
          file,
          { contentType: 'application/pdf' }
        );
      if (uploadError) throw new Error('Could not upload PDF');

      const finalizeResponse = await fetch('/api/admin/research/ingestion', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize_pdf', job_id: prepared.job_id }),
      });
      const finalized = await readBody(finalizeResponse);
      if (!finalizeResponse.ok) {
        throw new Error(finalized.error ?? 'Could not process PDF');
      }
      setPdfTitle('');
      setPdfSourceUrl('');
      if (pdfInput.current) pdfInput.current.value = '';
      const discarded = finalized.result?.discardedChunkCount ?? 0;
      setNotice(
        `PDF imported and embedded through the Gateway (${finalized.result?.chunkCount ?? 0} chunks).` +
          (discarded > 0
            ? ` ${discarded} cat-only passage${discarded === 1 ? '' : 's'} discarded before embedding.`
            : '')
      );
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'PDF import failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="card card-pad flex flex-col gap-5">
      <div>
        <p className="eyebrow">Build the knowledge base</p>
        <h2 className="section-title mt-1">Research intake</h2>
        <p className="help-text mt-2">
          Discovery uses PubMed and Europe PMC without AI. Imported text is semantically
          organised with Voyage through Vercel AI Gateway. Nothing becomes recommendation
          evidence until the resulting literature claim is reviewed.
        </p>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}
      {notice && <div className="callout-info" role="status">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded border border-line bg-paper p-4">
          <p className="font-semibold text-ink">Find recent research</p>
          <p className="help-text mt-2">
            Runs the bounded canine-nutrition topic scan and shows candidates before import.
          </p>
          <button
            className="btn-primary btn-sm mt-4"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runDiscovery()}
          >
            {busy === 'discovery' ? 'Checking sources…' : 'Check for new research'}
          </button>
        </div>

        <form className="rounded border border-line bg-paper p-4" onSubmit={importUrl}>
          <p className="font-semibold text-ink">Add a link</p>
          <label className="field mt-3">
            <span className="label">PubMed URL, PMID, or DOI</span>
            <input
              className="input"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              required
            />
          </label>
          <label className="field mt-3">
            <span className="label">Research question</span>
            <select
              className="select"
              value={sourceTopic}
              onChange={(event) => setSourceTopic(event.target.value)}
            >
              {RESEARCH_DISCOVERY_TOPICS.filter(
                (topic) => topic.evidenceScope === 'canine_direct'
              ).map((topic) => (
                <option key={topic.key} value={topic.key}>{topic.label}</option>
              ))}
            </select>
          </label>
          <button className="btn-primary btn-sm mt-4" disabled={Boolean(busy)}>
            {busy === 'url' ? 'Resolving and processing…' : 'Import link'}
          </button>
        </form>

        <form className="rounded border border-line bg-paper p-4" onSubmit={uploadPdf}>
          <p className="font-semibold text-ink">Upload a paper</p>
          <label className="field mt-3">
            <span className="label">Source title</span>
            <input
              className="input"
              value={pdfTitle}
              onChange={(event) => setPdfTitle(event.target.value)}
              required
            />
          </label>
          <label className="field mt-3">
            <span className="label">Source link (if available)</span>
            <input
              className="input"
              type="url"
              value={pdfSourceUrl}
              onChange={(event) => setPdfSourceUrl(event.target.value)}
            />
          </label>
          <label className="field mt-3">
            <span className="label">Area</span>
            <select
              className="select"
              value={pdfTopic}
              onChange={(event) => setPdfTopic(event.target.value as ResearchTopic)}
            >
              <option value="gut_biome">Gut biome</option>
              <option value="allergy">Allergy</option>
              <option value="health_condition">Health condition</option>
              <option value="general">General nutrition</option>
            </select>
          </label>
          <label className="field mt-3">
            <span className="label">PDF</span>
            <input ref={pdfInput} className="input" type="file" accept=".pdf,application/pdf" required />
            <span className="help-text">Up to 20MB. Removed after processing.</span>
          </label>
          <button className="btn-primary btn-sm mt-4" disabled={Boolean(busy)}>
            {busy === 'pdf' ? 'Processing paper…' : 'Upload and process'}
          </button>
        </form>
      </div>

      {candidates.length > 0 && (
        <div className="hairline pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">Latest discovery candidates</h3>
            <span className="badge-neutral">{candidates.length} candidates</span>
          </div>
          <div className="mt-3 grid gap-3">
            {candidates.map((row) => {
              const candidate = row.candidate;
              const imported = Boolean(row.imported_document_id);
              return (
                <article key={row.id} className="rounded border border-line bg-paper p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{candidate.title}</p>
                      <p className="help-text mt-1">
                        {candidate.discovery_topic_label} · Grade {candidate.evidence_grade} ·{' '}
                        {candidate.open_access ? 'open-access full text' : 'abstract only'}
                      </p>
                    </div>
                    <button
                      className="btn-secondary btn-sm"
                      type="button"
                      disabled={Boolean(busy) || imported}
                      onClick={() => void importCandidate(row.id)}
                    >
                      {imported
                        ? 'Already imported'
                        : busy === row.id
                          ? 'Importing…'
                          : 'Import'}
                    </button>
                  </div>
                  <a
                    className="mt-2 inline-block text-[13px] font-semibold text-pine hover:underline"
                    href={candidate.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open source ↗
                  </a>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {jobs.length > 0 && (
        <details className="hairline pt-4">
          <summary className="cursor-pointer font-semibold text-ink">Recent processing jobs</summary>
          <div className="mt-3 grid gap-2">
            {jobs.map((job) => (
              <div key={job.id} className="flex flex-wrap justify-between gap-2 rounded border border-line p-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{job.label ?? '(untitled)'}</p>
                  <span>{job.job_type.replace(/_/g, ' ')} · {job.status.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-right">
                  <span className="metric block">
                    {job.gateway_model
                      ? `${job.gateway_model} · ${job.gateway_cost_usd === null
                        ? 'actual cost not reported'
                        : `actual provider-reported cost $${Number(job.gateway_cost_usd).toFixed(6)}`}`
                      : 'No provider call recorded'}
                  </span>
                  <span className="help-text block">{new Date(job.created_at).toLocaleString()}</span>
                </div>
                {job.error_message && <p className="error-text w-full">{job.error_message}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
