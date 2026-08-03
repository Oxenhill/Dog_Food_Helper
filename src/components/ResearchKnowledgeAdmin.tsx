'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';

interface ProcessingClaim {
  id: string;
  document_id: string;
  status: string;
  supporting_quote: string;
  subject_type: string;
  subject_value: string;
  direction: string;
  effect_summary: string;
  evidence_grade: string;
  grading_inputs_complete: boolean;
}

interface ProcessingDocument {
  id: string;
  title: string | null;
  source_url: string | null;
  pmid: string | null;
  topic: string;
  evidence_grade: string;
  grading_inputs_complete: boolean;
  access_type: string;
  review_status: string;
  retracted: boolean;
  superseded_by: string | null;
  duplicate_of_document_id: string | null;
  retrieved_at: string;
  claims: ProcessingClaim[];
  draft_attempts: number;
  last_draft_status: string | null;
  last_draft_rejected_count: number | null;
}

interface ClusterContext {
  id: string;
  context_type: string;
  context_key: string;
  context_value: string | null;
  match_operator: 'exact' | 'enum';
  required: boolean;
}

interface ClusterMember {
  claim_id: string;
  independently_reviewed: boolean;
  claim: ProcessingClaim | null;
  document: ProcessingDocument | null;
}

interface EligibilityCriterion {
  key: string;
  pass: boolean;
  detail: string;
  value?: number;
}

interface AutoActivationEligibility {
  eligible: boolean;
  rule_version: string;
  criteria: EligibilityCriterion[];
}

interface EvidenceCluster {
  id: string;
  label: string;
  subject_type: string;
  subject_value: string;
  outcome_type: string;
  outcome_value: string;
  direction: string;
  cautious_summary: string;
  status: string;
  reviewed_at: string | null;
  review_note: string | null;
  auto_activated_by_rule: string | null;
  updated_at: string;
  members: ClusterMember[];
  applicability: ClusterContext[];
  auto_activation_eligibility: AutoActivationEligibility | null;
}

interface AutomationSettings {
  deterministic_auto_activation_enabled: boolean;
  daily_activation_cap: number;
  paused: boolean;
  paused_reason: string | null;
  paused_at: string | null;
}

interface AutomationLogEntry {
  id: string;
  cluster_id: string;
  decision: string;
  rule_version: string;
  created_at: string;
  explain: { criteria?: EligibilityCriterion[]; reason?: string } | null;
}

interface AutomationState {
  settings: AutomationSettings | null;
  activated_last_24h: number;
  recent_log: AutomationLogEntry[];
}

const EMPTY_AUTOMATION: AutomationState = {
  settings: null,
  activated_last_24h: 0,
  recent_log: [],
};

interface ReviewOptions {
  subject_types: string[];
  outcome_types: string[];
  directions: string[];
  context_types: string[];
  nutrient_subjects: string[];
  processing_methods: string[];
  ingredient_classes: Array<{ value: string; label: string }>;
  document_finding_keys: string[];
  life_stages: string[];
}

interface EditableContext {
  context_type: string;
  context_key: string;
  context_value: string;
  match_operator: 'exact' | 'enum';
}

interface EditableCluster {
  expected_updated_at: string;
  subject_type: string;
  subject_value: string;
  outcome_type: string;
  outcome_value: string;
  direction: string;
  cautious_summary: string;
  applicability: EditableContext[];
}

const EMPTY_REVIEW_OPTIONS: ReviewOptions = {
  subject_types: ['ingredient', 'nutrient', 'ingredient_class', 'processing_method'],
  outcome_types: ['condition', 'biome_marker', 'clinical_marker', 'outcome_metric', 'general_health'],
  directions: ['supports', 'cautions_against', 'neutral', 'insufficient_evidence'],
  context_types: ['health_condition', 'document_finding', 'life_stage', 'restriction', 'outcome_metric'],
  nutrient_subjects: [],
  processing_methods: [],
  ingredient_classes: [],
  document_finding_keys: [],
  life_stages: [],
};

export default function ResearchKnowledgeAdmin() {
  const [documents, setDocuments] = useState<ProcessingDocument[]>([]);
  const [clusters, setClusters] = useState<EvidenceCluster[]>([]);
  const [reviewOptions, setReviewOptions] = useState<ReviewOptions>(EMPTY_REVIEW_OPTIONS);
  const [automation, setAutomation] = useState<AutomationState>(EMPTY_AUTOMATION);
  const [capInput, setCapInput] = useState('10');
  const [edits, setEdits] = useState<Record<string, EditableCluster>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/research/processing', {
      headers: sessionAuthHeaders(),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? 'Could not load structured knowledge');
      return;
    }
    setDocuments(body.documents ?? []);
    setClusters(body.clusters ?? []);
    setReviewOptions(body.review_options ?? EMPTY_REVIEW_OPTIONS);
    const nextAutomation: AutomationState = body.automation ?? EMPTY_AUTOMATION;
    setAutomation(nextAutomation);
    if (nextAutomation.settings) {
      setCapInput(String(nextAutomation.settings.daily_activation_cap));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function processDocument(documentId: string) {
    setBusy(documentId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/processing', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft_document', document_id: documentId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not draft structured evidence');
      setNotice(
        `Drafted ${body.result?.drafted ?? 0} source-backed claim(s) into ${body.result?.clusterIds?.length ?? 0} review cluster(s).`
      );
      await load();
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : 'Could not draft structured evidence'
      );
    } finally {
      setBusy('');
    }
  }

  async function reviewCluster(clusterId: string, action: 'approve_cluster' | 'reject_cluster') {
    setBusy(clusterId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/processing', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          cluster_id: clusterId,
          review_note: notes[clusterId]?.trim() || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Cluster review failed');
      setNotice(
        action === 'approve_cluster'
          ? 'The proposition and its literal source claims are now active.'
          : 'The proposition and its queued source claims were rejected.'
      );
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Cluster review failed');
    } finally {
      setBusy('');
    }
  }

  async function postAutomationAction(action: string, extra?: Record<string, unknown>) {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/processing', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Automation action failed');
      await load();
      return body;
    } catch (automationError) {
      setError(
        automationError instanceof Error ? automationError.message : 'Automation action failed'
      );
      return null;
    } finally {
      setBusy('');
    }
  }

  async function toggleAutomationEnabled() {
    const enabled = !automation.settings?.deterministic_auto_activation_enabled;
    const result = await postAutomationAction('set_automation_enabled', { enabled });
    if (result) {
      setNotice(
        enabled
          ? 'Deterministic auto-activation is now enabled. It only ever activates a cluster where every criterion below passes.'
          : 'Deterministic auto-activation is now disabled. Every cluster stays in the manual queue.'
      );
    }
  }

  async function saveAutomationCap() {
    const cap = Number(capInput);
    if (!Number.isInteger(cap) || cap <= 0) {
      setError('Daily activation cap must be a positive whole number.');
      return;
    }
    const result = await postAutomationAction('set_automation_cap', { daily_activation_cap: cap });
    if (result) setNotice(`Circuit breaker cap set to ${cap} activations per rolling 24h.`);
  }

  async function clearAutomationPause() {
    const result = await postAutomationAction('clear_automation_pause');
    if (result) setNotice('Automation pause cleared. It will resume evaluating queued clusters.');
  }

  async function runAutomationSweepNow() {
    const result = await postAutomationAction('run_automation_sweep');
    if (result?.result) {
      const summary = result.result as Record<string, number>;
      setNotice(
        `Sweep considered ${summary.considered}, activated ${summary.activated}, left ${summary.skipped_ineligible} still ineligible for review.`
      );
    }
  }

  function beginEdit(cluster: EvidenceCluster) {
    setEdits((current) => ({
      ...current,
      [cluster.id]: {
        expected_updated_at: cluster.updated_at,
        subject_type: cluster.subject_type,
        subject_value: cluster.subject_value,
        outcome_type: cluster.outcome_type,
        outcome_value: cluster.outcome_value,
        direction: cluster.direction,
        cautious_summary: cluster.cautious_summary,
        applicability: cluster.applicability.map((context) => ({
          context_type: context.context_type,
          context_key: context.context_key,
          context_value: context.context_value ?? '',
          match_operator: context.match_operator,
        })),
      },
    }));
  }

  function updateEdit(clusterId: string, patch: Partial<EditableCluster>) {
    setEdits((current) => ({
      ...current,
      [clusterId]: { ...current[clusterId], ...patch },
    }));
  }

  function updateContext(
    clusterId: string,
    index: number,
    patch: Partial<EditableContext>
  ) {
    const edit = edits[clusterId];
    if (!edit) return;
    updateEdit(clusterId, {
      applicability: edit.applicability.map((context, contextIndex) =>
        contextIndex === index ? { ...context, ...patch } : context
      ),
    });
  }

  async function saveEdit(clusterId: string) {
    const edit = edits[clusterId];
    if (!edit) return;
    setBusy(clusterId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/processing', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_cluster',
          cluster_id: clusterId,
          ...edit,
          applicability: edit.applicability.map((context) => ({
            ...context,
            context_value: context.context_value.trim() || null,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Cluster edit failed');
      setEdits((current) => {
        const next = { ...current };
        delete next[clusterId];
        return next;
      });
      setNotice('The queued proposition was updated. It is still awaiting explicit approval.');
      await load();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Cluster edit failed');
    } finally {
      setBusy('');
    }
  }

  function subjectSuggestions(subjectType: string): string[] {
    if (subjectType === 'nutrient') return reviewOptions.nutrient_subjects;
    if (subjectType === 'processing_method') return reviewOptions.processing_methods;
    if (subjectType === 'ingredient_class') {
      return reviewOptions.ingredient_classes.map((category) => category.value);
    }
    return [];
  }

  function contextSuggestions(contextType: string): string[] {
    if (contextType === 'document_finding') return reviewOptions.document_finding_keys;
    if (contextType === 'life_stage') return reviewOptions.life_stages;
    return [];
  }

  const zeroClaimDocuments = documents.filter(
    (document) =>
      !document.retracted &&
      !document.superseded_by &&
      !document.duplicate_of_document_id &&
      document.claims.length === 0
  );
  // A zero-claim document isn't necessarily untouched -- drafting can run and
  // correctly find nothing claim-worthy, or fail for a scope reason. Split so
  // "awaiting processing" only ever means "the button hasn't been clicked yet".
  const pendingDocuments = zeroClaimDocuments.filter((document) => document.draft_attempts === 0);
  const alreadyAttemptedDocuments = zeroClaimDocuments.filter(
    (document) => document.draft_attempts > 0
  );
  const queuedClusters = clusters.filter(
    (cluster) => cluster.status === 'queued_for_review' || cluster.status === 'draft'
  );

  return (
    <section className="card card-pad flex flex-col gap-5">
      <div>
        <p className="eyebrow">Structured knowledge</p>
        <h2 className="section-title mt-1">Evidence organisation and review</h2>
        <p className="help-text mt-2">
          Processing turns source text into subject → outcome propositions with exact quotes and
          explicit dog-profile requirements. Similar propositions share a cluster. Review activates
          the cluster and its source claims together; it never marks them independently corroborated.
        </p>
        <p className="help-text mt-2">
          Bowl retains outcomes measured in dogs: clinical or biological response, digestibility,
          nutrient status, behaviour, or performance. Product contamination, manufacturing,
          labelling, recall, and composition audits are outside individualized food selection.
        </p>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}
      {notice && <div className="callout-info" role="status">{notice}</div>}

      <div className="rounded border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Deterministic auto-activation</p>
            <p className="help-text mt-1 max-w-2xl">
              Activates a cluster with no human step only when every criterion below passes for
              every one of its source claims: grade A or B, direct canine evidence, complete
              grading metadata, not steering a user away from a food, and corroborated by at
              least two independent study families beyond itself. Everything else stays in the
              queue below, exactly as before.
            </p>
          </div>
          <span className={automation.settings?.deterministic_auto_activation_enabled ? 'badge-pine' : 'badge-neutral'}>
            {automation.settings?.deterministic_auto_activation_enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {automation.settings?.paused && (
          <div className="callout-alarm mt-3 text-[13px]">
            Paused: {automation.settings.paused_reason ?? 'circuit breaker triggered.'} No cluster
            will auto-activate until this is cleared.
            <button
              type="button"
              className="btn-secondary btn-sm ml-3"
              disabled={Boolean(busy)}
              onClick={() => void clearAutomationPause()}
            >
              Clear pause
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <span>{automation.activated_last_24h} activated in the last 24h</span>
          <span>·</span>
          <span>Cap: {automation.settings?.daily_activation_cap ?? '—'} per rolling 24h</span>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={Boolean(busy)}
            onClick={() => void toggleAutomationEnabled()}
          >
            {automation.settings?.deterministic_auto_activation_enabled ? 'Disable' : 'Enable'} auto-activation
          </button>
          <label className="field">
            <span className="label">Daily cap</span>
            <input
              className="input w-24"
              inputMode="numeric"
              value={capInput}
              onChange={(event) => setCapInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={Boolean(busy)}
            onClick={() => void saveAutomationCap()}
          >
            Save cap
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={Boolean(busy)}
            onClick={() => void runAutomationSweepNow()}
          >
            {busy === 'run_automation_sweep' ? 'Running…' : 'Run sweep now'}
          </button>
        </div>

        {automation.recent_log.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-ink">
              Recent automation decisions ({automation.recent_log.length})
            </summary>
            <ul className="mt-2 grid gap-2 text-[13px]">
              {automation.recent_log.map((entry) => (
                <li key={entry.id} className="rounded border border-line bg-paper p-2">
                  <span className="font-semibold">{entry.decision.replace(/_/g, ' ')}</span>
                  {' · '}
                  {new Date(entry.created_at).toLocaleString()}
                  {entry.explain?.reason && <p className="help-text mt-1">{entry.explain.reason}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <details open={queuedClusters.length === 0 && pendingDocuments.length > 0}>
        <summary className="cursor-pointer font-semibold text-ink">
          Papers awaiting structured processing ({pendingDocuments.length})
        </summary>
        {documents.some((document) => document.duplicate_of_document_id) && (
          <p className="help-text mt-2">
            {documents.filter((document) => document.duplicate_of_document_id).length} paper(s)
            automatically matched as a republished form of one already in the system (see the
            admin graph explorer's SAME_STUDY_FAMILY edges) are excluded here to avoid drafting
            the same study twice.
          </p>
        )}
        <div className="mt-3 grid gap-3">
          {pendingDocuments.slice(0, 30).map((document) => (
            <article key={document.id} className="rounded border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{document.title ?? 'Untitled source'}</p>
                  <p className="help-text mt-1">
                    Grade {document.evidence_grade} · {document.access_type.replace(/_/g, ' ')}
                    {document.grading_inputs_complete
                      ? ' · grading metadata complete'
                      : ' · grading metadata incomplete'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={Boolean(busy)}
                  onClick={() => void processDocument(document.id)}
                >
                  {busy === document.id ? 'Organising evidence…' : 'Draft structured evidence'}
                </button>
              </div>
              {document.source_url && (
                <a
                  href={document.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[13px] font-semibold text-pine hover:underline"
                >
                  Open source ↗
                </a>
              )}
            </article>
          ))}
          {pendingDocuments.length === 0 && (
            <p className="help-text">Every current paper has been processed or already has a claim.</p>
          )}
        </div>
      </details>

      {alreadyAttemptedDocuments.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold text-ink">
            Processed, no claims found ({alreadyAttemptedDocuments.length})
          </summary>
          <p className="help-text mt-2">
            Drafting already ran for these -- the model found nothing claim-worthy in the kept
            text (or the source is methodology-context, never evidence-eligible). Not stuck;
            retrying is unlikely to change the result unless the source itself changes.
          </p>
          <div className="mt-3 grid gap-3">
            {alreadyAttemptedDocuments.slice(0, 30).map((document) => (
              <article key={document.id} className="rounded border border-line bg-paper p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{document.title ?? 'Untitled source'}</p>
                    <p className="help-text mt-1">
                      Grade {document.evidence_grade} · {document.access_type.replace(/_/g, ' ')} ·{' '}
                      {document.draft_attempts} attempt{document.draft_attempts === 1 ? '' : 's'}, last{' '}
                      {document.last_draft_status?.replace(/_/g, ' ') ?? 'unknown'}
                      {document.last_draft_rejected_count !== null &&
                        document.last_draft_rejected_count > 0 &&
                        ` (${document.last_draft_rejected_count} draft(s) rejected on review, none accepted)`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={Boolean(busy)}
                    onClick={() => void processDocument(document.id)}
                  >
                    {busy === document.id ? 'Organising evidence…' : 'Retry drafting'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}

      <div className="hairline pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink">
            Proposition clusters awaiting review
          </h3>
          <span className="badge-pine">{queuedClusters.length} queued</span>
        </div>
        <div className="mt-3 grid gap-4">
          {queuedClusters.map((cluster) => {
            const edit = edits[cluster.id];
            return (
              <article key={cluster.id} className="rounded border border-line bg-paper p-4">
                {edit ? (
                  <div className="grid gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="eyebrow">Queued proposition</p>
                        <h4 className="mt-1 font-semibold text-ink">Edit before approval</h4>
                      </div>
                      <span className="badge-pine">Still inactive</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="field">
                        <span className="label">Food subject type</span>
                        <select
                          className="select"
                          value={edit.subject_type}
                          onChange={(event) =>
                            updateEdit(cluster.id, {
                              subject_type: event.target.value,
                              subject_value: '',
                            })
                          }
                        >
                          {reviewOptions.subject_types.map((value) => (
                            <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span className="label">Food subject</span>
                        <input
                          className="input"
                          list={`subject-options-${cluster.id}`}
                          value={edit.subject_value}
                          onChange={(event) =>
                            updateEdit(cluster.id, { subject_value: event.target.value })
                          }
                        />
                        <datalist id={`subject-options-${cluster.id}`}>
                          {subjectSuggestions(edit.subject_type).map((value) => (
                            <option key={value} value={value} />
                          ))}
                        </datalist>
                      </label>
                      <label className="field">
                        <span className="label">Measured outcome type</span>
                        <select
                          className="select"
                          value={edit.outcome_type}
                          onChange={(event) =>
                            updateEdit(cluster.id, { outcome_type: event.target.value })
                          }
                        >
                          {reviewOptions.outcome_types.map((value) => (
                            <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span className="label">Measured outcome</span>
                        <input
                          className="input"
                          value={edit.outcome_value}
                          onChange={(event) =>
                            updateEdit(cluster.id, { outcome_value: event.target.value })
                          }
                        />
                      </label>
                      <label className="field sm:col-span-2">
                        <span className="label">Direction</span>
                        <select
                          className="select"
                          value={edit.direction}
                          onChange={(event) =>
                            updateEdit(cluster.id, { direction: event.target.value })
                          }
                        >
                          {reviewOptions.directions.map((value) => (
                            <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field sm:col-span-2">
                        <span className="label">Cautious summary</span>
                        <textarea
                          className="textarea min-h-[96px]"
                          value={edit.cautious_summary}
                          onChange={(event) =>
                            updateEdit(cluster.id, { cautious_summary: event.target.value })
                          }
                        />
                        <span className="help-text">
                          One cautious sentence; no feeding advice or certainty claims.
                        </span>
                      </label>
                    </div>

                    <div className="rounded border border-line bg-surface p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="eyebrow">Required dog context</p>
                          <p className="help-text mt-1">
                            Every context entered here must match before this evidence can appear.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={edit.applicability.length >= 8}
                          onClick={() =>
                            updateEdit(cluster.id, {
                              applicability: [
                                ...edit.applicability,
                                {
                                  context_type: 'health_condition',
                                  context_key: '',
                                  context_value: '',
                                  match_operator: 'exact',
                                },
                              ],
                            })
                          }
                        >
                          Add context
                        </button>
                      </div>
                      {edit.applicability.length === 0 && (
                        <p className="callout-alarm mt-3 text-[13px]">
                          With no required dog context, runtime retrieval will suppress this cluster.
                        </p>
                      )}
                      <div className="mt-3 grid gap-3">
                        {edit.applicability.map((context, index) => (
                          <div
                            key={`${cluster.id}-context-${index}`}
                            className="grid gap-2 rounded border border-line bg-paper p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                          >
                            <select
                              className="select"
                              aria-label={`Context ${index + 1} type`}
                              value={context.context_type}
                              onChange={(event) =>
                                updateContext(cluster.id, index, {
                                  context_type: event.target.value,
                                  context_key: '',
                                  context_value: '',
                                })
                              }
                            >
                              {reviewOptions.context_types.map((value) => (
                                <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                              ))}
                            </select>
                            <div>
                              <input
                                className="input"
                                aria-label={`Context ${index + 1} key`}
                                list={`context-options-${cluster.id}-${index}`}
                                placeholder="Required fact"
                                value={context.context_key}
                                onChange={(event) =>
                                  updateContext(cluster.id, index, {
                                    context_key: event.target.value,
                                  })
                                }
                              />
                              <datalist id={`context-options-${cluster.id}-${index}`}>
                                {contextSuggestions(context.context_type).map((value) => (
                                  <option key={value} value={value} />
                                ))}
                              </datalist>
                            </div>
                            <input
                              className="input"
                              aria-label={`Context ${index + 1} value`}
                              placeholder="Exact value (optional)"
                              value={context.context_value}
                              onChange={(event) =>
                                updateContext(cluster.id, index, {
                                  context_value: event.target.value,
                                })
                              }
                            />
                            <button
                              type="button"
                              className="btn-danger btn-sm"
                              onClick={() =>
                                updateEdit(cluster.id, {
                                  applicability: edit.applicability.filter(
                                    (_, contextIndex) => contextIndex !== index
                                  ),
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() => void saveEdit(cluster.id)}
                      >
                        {busy === cluster.id ? 'Saving…' : 'Save queued edit'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          setEdits((current) => {
                            const next = { ...current };
                            delete next[cluster.id];
                            return next;
                          })
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="eyebrow">
                          {cluster.subject_type.replace(/_/g, ' ')} →{' '}
                          {cluster.outcome_type.replace(/_/g, ' ')}
                        </p>
                        <h4 className="mt-1 font-semibold text-ink">
                          {cluster.subject_value} → {cluster.outcome_value}
                        </h4>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge-pine">{cluster.direction.replace(/_/g, ' ')}</span>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={Boolean(busy)}
                          onClick={() => beginEdit(cluster)}
                        >
                          Edit before review
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-[14px] leading-6 text-ink">
                      {cluster.cautious_summary}
                    </p>

                    {cluster.auto_activation_eligibility && (
                      <div className="mt-3 rounded border border-line bg-surface p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="eyebrow">Auto-activation reasoning</p>
                          <span
                            className={
                              cluster.auto_activation_eligibility.eligible
                                ? 'badge-pine'
                                : 'badge-neutral'
                            }
                          >
                            {cluster.auto_activation_eligibility.eligible
                              ? 'Would auto-activate'
                              : 'Needs your review'}
                          </span>
                        </div>
                        <ul className="mt-2 grid gap-1 text-[13px]">
                          {cluster.auto_activation_eligibility.criteria.map((criterion) => (
                            <li
                              key={criterion.key}
                              className={criterion.pass ? 'text-ink' : 'text-ink/80'}
                            >
                              {criterion.pass ? '✓' : '✗'} {criterion.detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-3 rounded border border-line bg-surface p-3">
                      <p className="eyebrow">Required dog context</p>
                      {cluster.applicability.length === 0 ? (
                        <p className="help-text mt-1">
                          No dog-specific context was explicit in the source. Runtime retrieval will
                          suppress this cluster unless an owner adds a justified context before approval.
                        </p>
                      ) : (
                        <ul className="mt-2 grid gap-1 text-[13px]">
                          {cluster.applicability.map((context) => (
                            <li key={context.id}>
                              {context.context_type.replace(/_/g, ' ')}: {context.context_key}
                              {context.context_value ? ` = ${context.context_value}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3">
                      {cluster.members.map((member) => (
                        <blockquote
                          key={member.claim_id}
                          className="rounded border-l-4 border-pine bg-pine-tint/30 px-4 py-3"
                        >
                          <p className="font-semibold text-ink">
                            {member.document?.title ?? 'Untitled research source'}
                          </p>
                          <p className="help-text mt-1">
                            {member.document?.access_type?.replace(/_/g, ' ') ?? 'access status unavailable'}
                            {' · '}Grade {member.claim?.evidence_grade ?? '—'} ·{' '}
                            {member.claim?.grading_inputs_complete
                              ? 'grading metadata complete'
                              : 'grading metadata incomplete'}
                          </p>
                          {member.document?.source_url && (
                            <a
                              href={member.document.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-[13px] font-semibold text-pine hover:underline"
                            >
                              Open paper ↗
                            </a>
                          )}
                          <p className="mt-3 font-mono text-[13px] leading-relaxed">
                            “{member.claim?.supporting_quote ?? 'Source claim missing'}”
                          </p>
                        </blockquote>
                      ))}
                    </div>

                    <label className="field mt-4">
                      <span className="label">Review note</span>
                      <textarea
                        className="textarea min-h-[72px]"
                        value={notes[cluster.id] ?? ''}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [cluster.id]: event.target.value }))
                        }
                        placeholder="Required for rejection; optional for approval"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() => void reviewCluster(cluster.id, 'approve_cluster')}
                      >
                        Approve proposition and source claims
                      </button>
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        disabled={Boolean(busy) || !(notes[cluster.id]?.trim())}
                        onClick={() => void reviewCluster(cluster.id, 'reject_cluster')}
                      >
                        Reject
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
          {queuedClusters.length === 0 && (
            <p className="help-text">No structured proposition clusters are awaiting review.</p>
          )}
        </div>
      </div>
    </section>
  );
}
