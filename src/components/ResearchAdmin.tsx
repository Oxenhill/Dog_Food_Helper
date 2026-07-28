'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import {
  EvidenceGrade,
  ResearchClaim,
  ResearchClaimDirection,
  ResearchClaimSubjectType,
  ResearchDocument,
} from '@/lib/types';

type ClaimDocument = Pick<
  ResearchDocument,
  | 'id'
  | 'title'
  | 'source_url'
  | 'doi'
  | 'journal'
  | 'publication_year'
  | 'study_design'
  | 'species'
  | 'sample_size'
  | 'funding_declaration'
  | 'competing_interests_declaration'
  | 'funding_independent'
  | 'grading_input_sources'
  | 'missing_grading_inputs'
  | 'grading_inputs_complete'
  | 'is_preprint'
  | 'open_access'
  | 'abstract_only'
  | 'retracted'
  | 'retraction_checked_at'
  | 'evidence_grade'
  | 'evidence_scope'
>;

type ClaimRow = ResearchClaim & {
  document: ClaimDocument | null;
  chunk: { id: string; content: string; chunk_index: number } | null;
};

type ClaimEdit = Pick<
  ResearchClaim,
  | 'effect_summary'
  | 'supporting_quote'
  | 'subject_type'
  | 'subject_value'
  | 'applies_to_condition'
  | 'applies_to_life_stage'
  | 'direction'
>;

const GRADE_CLASS: Record<EvidenceGrade, string> = {
  A: 'signal-better',
  B: 'signal-better',
  C: 'signal-steady',
  D: 'badge-neutral',
  E: 'signal-worse',
};

const STATUS_CLASS: Record<ResearchClaim['status'], string> = {
  active: 'signal-better',
  queued_for_review: 'badge-pine',
  draft: 'badge-neutral',
  rejected: 'signal-worse',
  superseded: 'badge-neutral',
};

const SUBJECT_TYPES: ResearchClaimSubjectType[] = [
  'ingredient',
  'nutrient',
  'ingredient_class',
  'processing_method',
  'biome_marker',
];
const DIRECTIONS: ResearchClaimDirection[] = [
  'supports',
  'cautions_against',
  'neutral',
  'insufficient_evidence',
];

function metadataValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'not supplied';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value).replace(/_/g, ' ');
}

function editFromClaim(claim: ClaimRow): ClaimEdit {
  return {
    effect_summary: claim.effect_summary,
    supporting_quote: claim.supporting_quote,
    subject_type: claim.subject_type,
    subject_value: claim.subject_value,
    applies_to_condition: claim.applies_to_condition ?? null,
    applies_to_life_stage: claim.applies_to_life_stage ?? null,
    direction: claim.direction,
  };
}

export default function ResearchAdmin() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [filter, setFilter] = useState('queued_for_review');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, ClaimEdit>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/research/claims?status=${encodeURIComponent(filter)}`,
        { headers: sessionAuthHeaders() },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? `Could not load claims (${response.status}).`);
        return;
      }
      setClaims(Array.isArray(body.claims) ? body.claims : []);
    } catch {
      setError('Could not load research claims.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  async function review(
    claim: ClaimRow,
    action: 'approve' | 'reject' | 'edit_and_approve',
  ) {
    setBusyId(claim.id);
    setActionErrors((current) => ({ ...current, [claim.id]: '' }));
    const payload: Record<string, unknown> = {
      action,
      review_note: reviewNotes[claim.id]?.trim() || null,
    };
    if (action === 'edit_and_approve') Object.assign(payload, edits[claim.id]);

    try {
      const response = await fetch(`/api/admin/research/claims/${claim.id}`, {
        method: 'PATCH',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setActionErrors((current) => ({
          ...current,
          [claim.id]: body.error ?? `Review failed (${response.status}).`,
        }));
        return;
      }
      setClaims((current) => current.filter((row) => row.id !== claim.id));
      setEditingId(null);
    } catch {
      setActionErrors((current) => ({ ...current, [claim.id]: 'Review request failed.' }));
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(claim: ClaimRow) {
    setEdits((current) => ({ ...current, [claim.id]: editFromClaim(claim) }));
    setEditingId(claim.id);
  }

  function updateEdit<K extends keyof ClaimEdit>(claimId: string, field: K, value: ClaimEdit[K]) {
    setEdits((current) => ({
      ...current,
      [claimId]: { ...current[claimId], [field]: value },
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="callout-disclaimer">
        Claims are drafted offline and reviewed here. A grade is computed from source metadata;
        it is not a reviewer score. Metadata completeness is shown separately, and an incomplete
        claim can never qualify for future unattended activation. Nothing on this screen
        diagnoses, hard-filters a food, or activates a claim without a deliberate review action.
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="field min-w-[220px]">
          <span className="label">Claim status</span>
          <select
            className="select"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="queued_for_review">Queued for review</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="rejected">Rejected</option>
            <option value="superseded">Superseded</option>
            <option value="all">All claims</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void loadClaims()}
          className="btn-secondary btn-sm"
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && claims.length === 0 && (
        <div className="card card-pad">
          <p className="section-title">No {filter.replace(/_/g, ' ')} claims</p>
          <p className="help-text mt-2">
            This is expected before Gate 3 drafting run 2. Dry-run proposals are never written
            into this queue.
          </p>
        </div>
      )}

      {claims.map((claim) => {
        const document = claim.document;
        const edit = edits[claim.id];
        const isEditing = editingId === claim.id && edit;
        const isBusy = busyId === claim.id;
        const rejectionNote = reviewNotes[claim.id] ?? '';

        return (
          <article key={claim.id} className="card card-pad flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={GRADE_CLASS[claim.evidence_grade]}>
                  grade {claim.evidence_grade}
                </span>
                <span className={document?.grading_inputs_complete ? 'signal-better' : 'signal-worse'}>
                  {document?.grading_inputs_complete
                    ? 'grading inputs complete'
                    : 'grading inputs incomplete'}
                </span>
                <span className={STATUS_CLASS[claim.status]}>
                  {claim.status.replace(/_/g, ' ')}
                </span>
                <span className="badge-pine">{claim.direction.replace(/_/g, ' ')}</span>
              </div>
              <span className="metric text-[11px] text-ink-soft">
                {new Date(claim.created_at).toLocaleDateString()}
              </span>
            </div>

            {isEditing ? (
              <div className="flex flex-col gap-4">
                <label className="field">
                  <span className="label">Effect summary</span>
                  <textarea
                    className="textarea"
                    value={edit.effect_summary}
                    onChange={(event) =>
                      updateEdit(claim.id, 'effect_summary', event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span className="label">Verbatim supporting quote</span>
                  <textarea
                    className="textarea font-mono text-[13px]"
                    value={edit.supporting_quote}
                    onChange={(event) =>
                      updateEdit(claim.id, 'supporting_quote', event.target.value)
                    }
                  />
                  <span className="help-text">
                    Save fails unless this exact text occurs in the source chunk.
                  </span>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="field">
                    <span className="label">Subject type</span>
                    <select
                      className="select"
                      value={edit.subject_type}
                      onChange={(event) =>
                        updateEdit(
                          claim.id,
                          'subject_type',
                          event.target.value as ResearchClaimSubjectType,
                        )
                      }
                    >
                      {SUBJECT_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {value.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Subject value</span>
                    <input
                      className="input"
                      value={edit.subject_value}
                      onChange={(event) =>
                        updateEdit(claim.id, 'subject_value', event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="label">Direction</span>
                    <select
                      className="select"
                      value={edit.direction}
                      onChange={(event) =>
                        updateEdit(
                          claim.id,
                          'direction',
                          event.target.value as ResearchClaimDirection,
                        )
                      }
                    >
                      {DIRECTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Condition (optional)</span>
                    <input
                      className="input"
                      value={edit.applies_to_condition ?? ''}
                      onChange={(event) =>
                        updateEdit(claim.id, 'applies_to_condition', event.target.value || null)
                      }
                    />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <p className="eyebrow">
                    {claim.subject_type.replace(/_/g, ' ')} · {claim.subject_value}
                  </p>
                  <p className="mt-2 text-[16px] font-semibold text-ink">
                    {claim.effect_summary}
                  </p>
                  {(claim.applies_to_condition || claim.applies_to_life_stage) && (
                    <p className="help-text mt-2">
                      Applies to: {claim.applies_to_condition ?? 'any condition'}
                      {claim.applies_to_life_stage
                        ? ` · ${claim.applies_to_life_stage.replace(/_/g, ' ')}`
                        : ''}
                    </p>
                  )}
                </div>

                <blockquote className="rounded border-l-4 border-pine bg-pine-tint/40 px-4 py-3">
                  <p className="eyebrow">Verbatim supporting quote</p>
                  <p className="mt-2 whitespace-pre-wrap font-mono text-[13px] leading-relaxed">
                    {claim.supporting_quote}
                  </p>
                  {claim.chunk && (
                    <p className="help-text mt-2">Source chunk {claim.chunk.chunk_index}</p>
                  )}
                </blockquote>
              </>
            )}

            <div className="rounded border border-line bg-paper p-4">
              <p className="eyebrow">Source and grade inputs</p>
              <p className="mt-2 font-semibold">{document?.title ?? 'Source document missing'}</p>
              <p className="help-text mt-1">
                {[document?.journal, document?.publication_year].filter(Boolean).join(' · ') ||
                  'Journal/year not supplied'}
              </p>
              {document?.evidence_scope === 'veterinary_methodology' && (
                <div className="callout-alarm mt-3">
                  <p className="font-semibold">Veterinary methodology context</p>
                  <p className="mt-1 text-[13px]">
                    This informs evidence appraisal but cannot corroborate a biological claim
                    and must never enter scoring, recommendations, or unattended activation.
                  </p>
                </div>
              )}
              {!document?.grading_inputs_complete && (
                <div className="callout-alarm mt-3">
                  <p className="font-semibold">Grade computed with missing metadata</p>
                  <p className="mt-1 text-[13px]">
                    Missing: {document?.missing_grading_inputs?.join(', ') || 'not reported'}.
                    This is not weak evidence; these inputs were not populated from structured
                    source metadata.
                  </p>
                </div>
              )}
              <dl className="mt-4 grid gap-x-5 gap-y-2 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="muted">Evidence scope</dt>
                  <dd className="metric">{metadataValue(document?.evidence_scope)}</dd>
                </div>
                <div>
                  <dt className="muted">Study design</dt>
                  <dd className="metric">{metadataValue(document?.study_design)}</dd>
                  <dd className="help-text">
                    {document?.grading_input_sources?.study_design ?? 'Source not recorded'}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Species</dt>
                  <dd className="metric">{metadataValue(document?.species)}</dd>
                  <dd className="help-text">
                    {document?.grading_input_sources?.species ?? 'Source not recorded'}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Sample size</dt>
                  <dd className="metric">{metadataValue(document?.sample_size)}</dd>
                  <dd className="help-text">
                    {document?.grading_input_sources?.sample_size ?? 'Source not recorded'}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Funding independent</dt>
                  <dd className="metric">{metadataValue(document?.funding_independent)}</dd>
                  <dd className="help-text">
                    {document?.grading_input_sources?.funding_independent ?? 'Source not recorded'}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Preprint</dt>
                  <dd className="metric">{metadataValue(document?.is_preprint)}</dd>
                </div>
                <div>
                  <dt className="muted">Access</dt>
                  <dd className="metric">
                    {document?.open_access
                      ? 'open-access full text'
                      : document?.abstract_only
                        ? 'abstract only'
                        : 'not supplied'}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Retracted</dt>
                  <dd className="metric">{metadataValue(document?.retracted)}</dd>
                </div>
                <div>
                  <dt className="muted">DOI</dt>
                  <dd className="metric break-all">{metadataValue(document?.doi)}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <p className="muted text-[13px]">Funding declaration</p>
                <p className="mt-1 text-[13px]">
                  {document?.funding_declaration || 'Not supplied by structured source metadata.'}
                </p>
              </div>
              <div className="mt-3">
                <p className="muted text-[13px]">Competing-interests declaration</p>
                <p className="mt-1 text-[13px]">
                  {document?.competing_interests_declaration
                    || 'Not supplied by structured source metadata.'}
                </p>
              </div>
              {document?.source_url && (
                <a
                  className="mt-3 inline-block text-[13px] font-semibold text-pine hover:underline"
                  href={document.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source ↗
                </a>
              )}
            </div>

            {claim.status !== 'active' && claim.status !== 'rejected' && claim.status !== 'superseded' && (
              <div className="hairline flex flex-col gap-3 pt-4">
                <label className="field">
                  <span className="label">Review note</span>
                  <textarea
                    className="textarea min-h-[72px]"
                    value={rejectionNote}
                    placeholder="Required for rejection; optional for approval"
                    onChange={(event) =>
                      setReviewNotes((current) => ({
                        ...current,
                        [claim.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={isBusy}
                    onClick={() => void review(claim, 'approve')}
                  >
                    Approve
                  </button>
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={isBusy}
                        onClick={() => void review(claim, 'edit_and_approve')}
                      >
                        Save edits and approve
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={isBusy}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel edit
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={isBusy}
                      onClick={() => startEditing(claim)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    disabled={isBusy || rejectionNote.trim().length === 0}
                    onClick={() => void review(claim, 'reject')}
                  >
                    Reject
                  </button>
                </div>
                {actionErrors[claim.id] && (
                  <p className="error-text" role="alert">
                    {actionErrors[claim.id]}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
