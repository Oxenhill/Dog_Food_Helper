import { supabaseAdmin } from './supabase';
import {
  gate3DraftIdentity,
  sha256,
  type Gate3Claim,
} from './researchGate3';

const APPROVED_STATUS = 'queued_for_review' as const;
const APPROVED_CLAIM_CAP = 2;

interface ReviewedClaim {
  claim_identity: string;
  source: {
    pmid: string;
    doi: string | null;
    title: string;
    document_id: string;
    chunk_id: string;
    chunk_index: number;
    chunk_sha256: string;
    group: string;
    access_type: 'open_access_full_text' | 'abstract_only';
    evidence_scope: string;
    evidence_grade: string;
    grading_inputs_complete: boolean;
    missing_grading_inputs: string[];
    funding_independent: boolean | null;
  };
  claim: Gate3Claim;
  validation: {
    literal_substring: boolean;
    chunk_belongs_to_document: boolean;
    machine_result: string;
    semantic_result: string;
  };
}

interface OwnerReviewManifest {
  status: string;
  claims_recommended_for_queue: ReviewedClaim[];
}

interface OwnerApproval {
  status: 'owner_approved';
  approved_manifest_sha256: string;
  approved_claim_identities: string[];
  claim_identity_migration_approved: boolean;
  insertion_contract: {
    status: typeof APPROVED_STATUS;
    active_claims: 0;
    corroborating_claim_ids: [];
    claim_cap: 2;
    generated_columns_written: false;
  };
}

interface LiveDocument {
  id: string;
  pmid: string | null;
  doi: string | null;
  title: string | null;
  topic_group: string | null;
  study_design: string | null;
  species: string | null;
  sample_size: number | null;
  funding_independent: boolean | null;
  is_preprint: boolean;
  open_access: boolean;
  abstract_only: boolean;
  retracted: boolean;
  review_status: string;
  evidence_grade: string;
  evidence_scope: string;
  missing_grading_inputs: string[];
  grading_inputs_complete: boolean;
}

interface LiveChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
}

interface InsertedClaim {
  id: string;
  claim_identity: string;
  document_id: string;
  chunk_id: string;
  supporting_quote: string;
  subject_type: string;
  subject_value: string;
  applies_to_condition: string | null;
  applies_to_life_stage: string | null;
  direction: string;
  effect_summary: string;
  study_design: string | null;
  species: string | null;
  sample_size: number | null;
  funding_independent: boolean | null;
  is_preprint: boolean;
  evidence_grade: string;
  evidence_scope: string;
  missing_grading_inputs: string[];
  grading_inputs_complete: boolean;
  corroborating_claim_ids: string[];
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface Gate3ClaimCommitReport {
  dry_run: boolean;
  approved_manifest_sha256: string;
  approved_identities: string[];
  inserted: Array<{ claim_identity: string; claim_id: string }>;
  skipped: Array<{ claim_identity: string; claim_id: string; reason: 'exact_identity_and_content' }>;
  discarded: number;
  deduplicated: number;
}

function sameNullable(left: unknown, right: unknown): boolean {
  return (left ?? null) === (right ?? null);
}

function sameStringArray(left: string[] | null | undefined, right: string[]): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right);
}

export function parseApprovedGate3Claims(
  manifestRaw: string,
  approvalRaw: string,
): {
  manifestSha256: string;
  claims: ReviewedClaim[];
} {
  const manifestSha256 = sha256(manifestRaw);
  const manifest = JSON.parse(manifestRaw) as OwnerReviewManifest;
  const approval = JSON.parse(approvalRaw) as OwnerApproval;

  if (approval.status !== 'owner_approved') {
    throw new Error('Gate 3 claim manifest is not owner-approved');
  }
  if (approval.approved_manifest_sha256 !== manifestSha256) {
    throw new Error('Gate 3 owner approval does not match the immutable claim manifest');
  }
  if (!approval.claim_identity_migration_approved) {
    throw new Error('Gate 3 claim-identity migration is not owner-approved');
  }
  if (
    approval.insertion_contract.status !== APPROVED_STATUS
    || approval.insertion_contract.active_claims !== 0
    || approval.insertion_contract.claim_cap !== APPROVED_CLAIM_CAP
    || approval.insertion_contract.generated_columns_written !== false
    || approval.insertion_contract.corroborating_claim_ids.length !== 0
  ) {
    throw new Error('Gate 3 owner approval changed the insertion contract');
  }

  const recommended = manifest.claims_recommended_for_queue;
  if (
    manifest.status !== 'awaiting_owner_claim_approval'
    || recommended.length === 0
    || recommended.length > APPROVED_CLAIM_CAP
  ) {
    throw new Error('Gate 3 reviewed claim manifest is empty or exceeds its cap');
  }
  const recommendedIds = recommended.map((claim) => claim.claim_identity);
  if (
    new Set(recommendedIds).size !== recommendedIds.length
    || JSON.stringify(approval.approved_claim_identities) !== JSON.stringify(recommendedIds)
  ) {
    throw new Error('Gate 3 approved identities do not exactly match the reviewed claims');
  }
  for (const reviewed of recommended) {
    if (
      reviewed.validation.literal_substring !== true
      || reviewed.validation.chunk_belongs_to_document !== true
      || reviewed.validation.machine_result !== 'passed'
      || reviewed.validation.semantic_result !== 'recommended_for_queue'
    ) {
      throw new Error(`Claim ${reviewed.claim_identity} was not fully validated`);
    }
    const computed = gate3DraftIdentity(reviewed.claim, {
      document_id: reviewed.source.document_id,
      chunk_id: reviewed.source.chunk_id,
    });
    if (computed !== reviewed.claim_identity) {
      throw new Error(`Claim identity mismatch for ${reviewed.claim_identity}`);
    }
  }
  return { manifestSha256, claims: recommended };
}

function assertLiveSource(
  reviewed: ReviewedClaim,
  document: LiveDocument | undefined,
  chunk: LiveChunk | undefined,
): void {
  const source = reviewed.source;
  if (!document || !chunk) {
    throw new Error(`Missing live source for ${reviewed.claim_identity}`);
  }
  if (
    document.id !== source.document_id
    || chunk.id !== source.chunk_id
    || chunk.document_id !== source.document_id
    || chunk.chunk_index !== source.chunk_index
  ) {
    throw new Error(`Document/chunk relationship changed for ${reviewed.claim_identity}`);
  }
  if (
    document.pmid !== source.pmid
    || !sameNullable(document.doi?.toLowerCase(), source.doi?.toLowerCase())
    || document.title !== source.title
    || document.topic_group !== source.group
    || document.evidence_scope !== source.evidence_scope
    || document.evidence_grade !== source.evidence_grade
    || document.grading_inputs_complete !== source.grading_inputs_complete
    || !sameStringArray(document.missing_grading_inputs, source.missing_grading_inputs)
    || !sameNullable(document.funding_independent, source.funding_independent)
  ) {
    throw new Error(`Source metadata changed for ${reviewed.claim_identity}`);
  }
  if (
    document.review_status !== 'pending'
    || document.retracted
    || document.is_preprint
    || document.species !== 'dog'
    || document.evidence_scope !== 'canine_direct'
    || document.evidence_grade === 'E'
    || document.topic_group === 'G'
  ) {
    throw new Error(`Source is no longer Gate 3 insertion-eligible for ${reviewed.claim_identity}`);
  }
  const expectedAccess =
    document.open_access && !document.abstract_only
      ? 'open_access_full_text'
      : 'abstract_only';
  if (expectedAccess !== source.access_type) {
    throw new Error(`Source access type changed for ${reviewed.claim_identity}`);
  }
  if (
    sha256(chunk.content) !== source.chunk_sha256
    || !chunk.content.includes(reviewed.claim.supporting_quote)
  ) {
    throw new Error(`Exact source text changed for ${reviewed.claim_identity}`);
  }
}

function claimInsertRow(reviewed: ReviewedClaim) {
  return {
    claim_identity: reviewed.claim_identity,
    document_id: reviewed.source.document_id,
    chunk_id: reviewed.source.chunk_id,
    supporting_quote: reviewed.claim.supporting_quote,
    subject_type: reviewed.claim.subject_type,
    subject_value: reviewed.claim.subject_value,
    applies_to_condition: reviewed.claim.applies_to_condition,
    applies_to_life_stage: reviewed.claim.applies_to_life_stage,
    direction: reviewed.claim.direction,
    effect_summary: reviewed.claim.effect_summary,
    corroborating_claim_ids: [] as string[],
    status: APPROVED_STATUS,
  };
}

function assertStoredClaim(
  reviewed: ReviewedClaim,
  stored: InsertedClaim,
  document: LiveDocument,
): void {
  const expected = claimInsertRow(reviewed);
  for (const key of [
    'claim_identity',
    'document_id',
    'chunk_id',
    'supporting_quote',
    'subject_type',
    'subject_value',
    'applies_to_condition',
    'applies_to_life_stage',
    'direction',
    'effect_summary',
    'status',
  ] as const) {
    if (!sameNullable(stored[key], expected[key])) {
      throw new Error(`Stored claim differs at ${key} for ${reviewed.claim_identity}`);
    }
  }
  if (
    stored.corroborating_claim_ids.length !== 0
    || stored.reviewed_by !== null
    || stored.reviewed_at !== null
    || stored.study_design !== document.study_design
    || stored.species !== document.species
    || stored.sample_size !== document.sample_size
    || !sameNullable(stored.funding_independent, document.funding_independent)
    || stored.is_preprint !== document.is_preprint
    || stored.evidence_grade !== document.evidence_grade
    || stored.evidence_scope !== document.evidence_scope
    || stored.grading_inputs_complete !== document.grading_inputs_complete
    || !sameStringArray(stored.missing_grading_inputs, document.missing_grading_inputs)
  ) {
    throw new Error(`Stored grading or review metadata differs for ${reviewed.claim_identity}`);
  }
}

const STORED_CLAIM_FIELDS = [
  'id',
  'claim_identity',
  'document_id',
  'chunk_id',
  'supporting_quote',
  'subject_type',
  'subject_value',
  'applies_to_condition',
  'applies_to_life_stage',
  'direction',
  'effect_summary',
  'study_design',
  'species',
  'sample_size',
  'funding_independent',
  'is_preprint',
  'evidence_grade',
  'evidence_scope',
  'missing_grading_inputs',
  'grading_inputs_complete',
  'corroborating_claim_ids',
  'status',
  'reviewed_by',
  'reviewed_at',
].join(',');

export async function commitApprovedGate3Claims(
  manifestRaw: string,
  approvalRaw: string,
  dryRun = true,
): Promise<Gate3ClaimCommitReport> {
  const approved = parseApprovedGate3Claims(manifestRaw, approvalRaw);
  const documentIds = approved.claims.map((claim) => claim.source.document_id);
  const chunkIds = approved.claims.map((claim) => claim.source.chunk_id);
  const identities = approved.claims.map((claim) => claim.claim_identity);

  const [documentsResult, chunksResult, existingResult] = await Promise.all([
    supabaseAdmin
      .from('research_documents')
      .select('id,pmid,doi,title,topic_group,study_design,species,sample_size,funding_independent,is_preprint,open_access,abstract_only,retracted,review_status,evidence_grade,evidence_scope,missing_grading_inputs,grading_inputs_complete')
      .in('id', documentIds),
    supabaseAdmin
      .from('research_chunks')
      .select('id,document_id,chunk_index,content')
      .in('id', chunkIds),
    supabaseAdmin
      .from('research_claims')
      .select(STORED_CLAIM_FIELDS)
      .in('claim_identity', identities),
  ]);
  if (documentsResult.error) throw documentsResult.error;
  if (chunksResult.error) throw chunksResult.error;
  if (existingResult.error) throw existingResult.error;

  const documents = new Map(
    ((documentsResult.data ?? []) as unknown as LiveDocument[]).map((row) => [row.id, row]),
  );
  const chunks = new Map(
    ((chunksResult.data ?? []) as unknown as LiveChunk[]).map((row) => [row.id, row]),
  );
  const existing = new Map(
    ((existingResult.data ?? []) as unknown as InsertedClaim[]).map((row) => [
      row.claim_identity,
      row,
    ]),
  );
  const report: Gate3ClaimCommitReport = {
    dry_run: dryRun,
    approved_manifest_sha256: approved.manifestSha256,
    approved_identities: identities,
    inserted: [],
    skipped: [],
    discarded: 0,
    deduplicated: 0,
  };
  const missing: ReviewedClaim[] = [];

  for (const reviewed of approved.claims) {
    const document = documents.get(reviewed.source.document_id);
    const chunk = chunks.get(reviewed.source.chunk_id);
    assertLiveSource(reviewed, document, chunk);
    const stored = existing.get(reviewed.claim_identity);
    if (stored) {
      assertStoredClaim(reviewed, stored, document!);
      report.skipped.push({
        claim_identity: reviewed.claim_identity,
        claim_id: stored.id,
        reason: 'exact_identity_and_content',
      });
    } else {
      missing.push(reviewed);
    }
  }

  if (dryRun) {
    report.inserted = missing.map((claim) => ({
      claim_identity: claim.claim_identity,
      claim_id: 'dry-run',
    }));
    return report;
  }

  if (missing.length > 0) {
    const { error } = await supabaseAdmin
      .from('research_claims')
      .upsert(missing.map(claimInsertRow), {
        onConflict: 'claim_identity',
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }

  const finalResult = await supabaseAdmin
    .from('research_claims')
    .select(STORED_CLAIM_FIELDS)
    .in('claim_identity', identities);
  if (finalResult.error) throw finalResult.error;
  const finalClaims = new Map(
    ((finalResult.data ?? []) as unknown as InsertedClaim[]).map((row) => [
      row.claim_identity,
      row,
    ]),
  );
  if (finalClaims.size !== approved.claims.length) {
    throw new Error('Gate 3 insertion did not produce every approved identity');
  }
  for (const reviewed of approved.claims) {
    const stored = finalClaims.get(reviewed.claim_identity)!;
    assertStoredClaim(reviewed, stored, documents.get(reviewed.source.document_id)!);
    if (!existing.has(reviewed.claim_identity)) {
      report.inserted.push({
        claim_identity: reviewed.claim_identity,
        claim_id: stored.id,
      });
    }
  }
  return report;
}
