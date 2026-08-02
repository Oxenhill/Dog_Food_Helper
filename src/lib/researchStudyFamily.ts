import { titleSimilarity } from './researchDiscovery';
import { supabaseAdmin } from './supabase';
import { EvidenceGrade } from './types';

/**
 * Automatic study-family deduplication: detects when a newly ingested
 * research_documents row is a republished form of one already in the
 * system (a preprint whose journal version already exists, a press release
 * describing a paper already indexed, etc.) rather than an independent
 * study. This is bibliographic-identity matching, not claim-similarity
 * corroboration -- it exists to PREVENT the same underlying study from
 * being counted as two independent sources, and to avoid drafting claims
 * twice from the same research. It never asserts that two DIFFERENT
 * studies corroborate each other; that remains the existing owner-reviewed
 * cluster workflow.
 *
 * Fully automatic by design (owner decision, 2026-08-02): no confirmation
 * step. To keep that safe without a human check, two things are true by
 * construction:
 *   - the match is always transparent (duplicate_match_basis records
 *     exactly which signals matched, and the graph explorer labels the
 *     resulting edge "automatically matched, not human-reviewed" rather
 *     than dressing it up as a review);
 *   - a document that already has claims drafted from it is never
 *     demoted or re-pointed. Once claims exist, that document's identity
 *     as the evidentiary source is immutable, matching how every other
 *     approved record in this schema behaves. A later-arriving fuller
 *     version still gets linked into the family, it just never displaces
 *     the one claims already resolve to.
 */

const TITLE_ONLY_THRESHOLD = 0.92;
const TITLE_WITH_AUTHOR_THRESHOLD = 0.85;
const MAX_YEAR_DELTA_WITH_AUTHOR_MATCH = 1;

const GRADE_RANK: Record<EvidenceGrade, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 };

export interface StudyFamilyCandidate {
  title: string;
  authors: string[];
  publication_year: number | null;
  is_preprint: boolean;
  abstract_only: boolean;
  evidence_grade: EvidenceGrade | null;
}

export interface StudyFamilyPrimary extends StudyFamilyCandidate {
  id: string;
  has_claims: boolean;
}

export interface StudyFamilyMatch {
  matched_primary_id: string;
  method: 'title_only' | 'author_and_title';
  title_similarity: number;
  matched_authors: string[];
  publication_year_delta: number | null;
  new_document_is_fuller: boolean;
}

export function authorOverlap(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return a.filter((name) => bSet.has(name));
}

function fullnessScore(doc: StudyFamilyCandidate): number {
  let score = 0;
  if (!doc.abstract_only) score += 2;
  if (!doc.is_preprint) score += 2;
  if (doc.evidence_grade) score += GRADE_RANK[doc.evidence_grade];
  return score;
}

/**
 * Pure matching decision: given a not-yet-linked candidate and the current
 * primary (non-duplicate) documents, decide whether the candidate is the
 * same underlying study as one of them, and if so, which side should be
 * treated as primary. No I/O -- safe to unit test directly.
 */
export function findStudyFamilyMatch(
  candidate: StudyFamilyCandidate,
  existingPrimaries: StudyFamilyPrimary[]
): StudyFamilyMatch | null {
  let best: {
    primary: StudyFamilyPrimary;
    similarity: number;
    matchedAuthors: string[];
    method: 'title_only' | 'author_and_title';
  } | null = null;

  for (const primary of existingPrimaries) {
    const similarity = titleSimilarity(candidate.title, primary.title);
    const matchedAuthors = authorOverlap(candidate.authors, primary.authors);
    const yearDelta =
      candidate.publication_year !== null && primary.publication_year !== null
        ? Math.abs(candidate.publication_year - primary.publication_year)
        : null;

    const authorAndTitleQualifies =
      matchedAuthors.length > 0
      && similarity >= TITLE_WITH_AUTHOR_THRESHOLD
      && (yearDelta === null || yearDelta <= MAX_YEAR_DELTA_WITH_AUTHOR_MATCH);
    const titleOnlyQualifies = similarity >= TITLE_ONLY_THRESHOLD;
    if (!authorAndTitleQualifies && !titleOnlyQualifies) continue;

    if (!best || similarity > best.similarity) {
      best = {
        primary,
        similarity,
        matchedAuthors,
        method: authorAndTitleQualifies ? 'author_and_title' : 'title_only',
      };
    }
  }
  if (!best) return null;

  const candidateIsFuller =
    !best.primary.has_claims && fullnessScore(candidate) > fullnessScore(best.primary);
  const publicationYearDelta =
    candidate.publication_year !== null && best.primary.publication_year !== null
      ? Math.abs(candidate.publication_year - best.primary.publication_year)
      : null;

  return {
    matched_primary_id: best.primary.id,
    method: best.method,
    title_similarity: Number(best.similarity.toFixed(4)),
    matched_authors: best.matchedAuthors,
    publication_year_delta: publicationYearDelta,
    new_document_is_fuller: candidateIsFuller,
  };
}

/**
 * Runs the match against every current primary document and, if found,
 * writes the duplicate link. Called once, right after a new document row
 * is inserted, from both the discovery-import and PDF-upload ingestion
 * paths in researchBrainPipeline.ts.
 */
export async function detectAndLinkStudyFamily(
  newDocumentId: string,
  candidate: StudyFamilyCandidate
): Promise<StudyFamilyMatch | null> {
  const { data: primaryRows, error: primaryError } = await supabaseAdmin
    .from('research_documents')
    .select('id, title, authors, publication_year, is_preprint, abstract_only, evidence_grade')
    .is('duplicate_of_document_id', null)
    .eq('retracted', false)
    .is('superseded_by', null)
    .neq('id', newDocumentId);
  if (primaryError) throw primaryError;
  if (!primaryRows || primaryRows.length === 0) return null;

  const primaryIds = primaryRows.map((row) => row.id as string);
  const { data: claimRows, error: claimError } = await supabaseAdmin
    .from('research_claims')
    .select('document_id')
    .in('document_id', primaryIds);
  if (claimError) throw claimError;
  const documentsWithClaims = new Set((claimRows ?? []).map((row) => row.document_id as string));

  const existingPrimaries: StudyFamilyPrimary[] = primaryRows.map((row) => ({
    id: row.id as string,
    title: (row.title as string | null) ?? '',
    authors: (row.authors as string[] | null) ?? [],
    publication_year: row.publication_year as number | null,
    is_preprint: Boolean(row.is_preprint),
    abstract_only: Boolean(row.abstract_only),
    evidence_grade: (row.evidence_grade as EvidenceGrade | null) ?? null,
    has_claims: documentsWithClaims.has(row.id as string),
  }));

  const match = findStudyFamilyMatch(candidate, existingPrimaries);
  if (!match) return null;

  const duplicateMatchBasis = {
    method: match.method,
    title_similarity: match.title_similarity,
    matched_authors: match.matched_authors,
    publication_year_delta: match.publication_year_delta,
  };
  const detectedAt = new Date().toISOString();

  const loserId = match.new_document_is_fuller ? match.matched_primary_id : newDocumentId;
  const winnerId = match.new_document_is_fuller ? newDocumentId : match.matched_primary_id;
  const { error: linkError } = await supabaseAdmin
    .from('research_documents')
    .update({
      duplicate_of_document_id: winnerId,
      duplicate_match_basis: duplicateMatchBasis,
      duplicate_detected_at: detectedAt,
    })
    .eq('id', loserId);
  if (linkError) throw linkError;

  return match;
}
