import { createHash } from 'node:crypto';
import {
  EvidenceGrade,
  ResearchEvidenceScope,
  ResearchTopicGroup,
} from './types';
import {
  RESEARCH_DISCOVERY_TOPICS,
  ResearchDiscoveryTopic,
} from './researchTopics';

export const GATE_2_DOCUMENT_CAP = 30;
export const GATE_2_GROUP_QUOTAS: Record<ResearchTopicGroup, number> = {
  A: 6,
  B: 4,
  C: 5,
  D: 6,
  E: 4,
  F: 3,
  G: 2,
};

export const RELEVANCE_RANKING_POLICY = {
  minimumSimilarity: 0.35,
  maximumDocumentsPerTopic: 5,
} as const;

export interface Gate1TopicMembership {
  key: string;
  group: ResearchTopicGroup;
  label: string;
  query: string;
}

export interface Gate1ManifestCandidate {
  source_id: string;
  title: string;
  doi: string | null;
  pmid: string;
  pmcid: string | null;
  journal: string | null;
  publication_year: number | null;
  source_url: string;
  full_text_url: string | null;
  open_access: boolean;
  abstract_only: boolean;
  evidence_grade: EvidenceGrade;
  evidence_scope: ResearchEvidenceScope;
  study_design: string | null;
  species: string | null;
  species_terms: string[];
  mesh_headings: string[];
  sample_size: number | null;
  funding_declaration: string | null;
  competing_interests_declaration: string | null;
  funding_independent: boolean | null;
  is_preprint: boolean;
  retracted: boolean;
  grading_inputs_complete: boolean;
  missing_grading_inputs: string[];
  topic_memberships: Gate1TopicMembership[];
}

export interface Gate1Manifest {
  schema_version: 1;
  source_report: string;
  source_report_sha256: string;
  generated_at: string;
  candidate_count: number;
  candidates: Gate1ManifestCandidate[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function nullWhenNotSupplied(value: string | undefined): string | null {
  const cleaned = value?.trim();
  if (!cleaned || cleaned === 'not supplied' || cleaned === 'not supplied by source metadata') {
    return null;
  }
  return cleaned;
}

function lineValue(block: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return nullWhenNotSupplied(
    block.match(new RegExp(`^- ${escaped}: (.+)$`, 'm'))?.[1],
  );
}

function declarationValue(
  block: string,
  startLabel: string,
  nextLabel: string,
): string | null {
  const escapedStart = startLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedNext = nextLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = block.match(
    new RegExp(`^- ${escapedStart}: ([\\s\\S]*?)\\r?\\n- ${escapedNext}:`, 'm'),
  )?.[1];
  return nullWhenNotSupplied(value);
}

function yesNoNull(value: string | null): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

function topicSections(report: string): Array<{
  group: ResearchTopicGroup;
  label: string;
  query: string;
  body: string;
}> {
  const headings = [...report.matchAll(/^### ([A-G])\. (.+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index! + heading[0].length;
    const end = headings[index + 1]?.index ?? report.length;
    const body = report.slice(start, end);
    const queryMatch = body.match(/^\r?\n\r?\nQuery: `([^`]*)`\r?\n\r?\n/m);
    if (!queryMatch) {
      throw new Error(`Gate 1 report topic has no query: ${heading[2]}`);
    }
    return {
      group: heading[1] as ResearchTopicGroup,
      label: heading[2].trim(),
      query: queryMatch[1],
      body: body.slice(queryMatch.index! + queryMatch[0].length),
    };
  });
}

function candidateBlocks(sectionBody: string): Array<{ title: string; body: string }> {
  const headings = [...sectionBody.matchAll(/^#### \d+\. (.+)$/gm)];
  return headings.map((heading, index) => ({
    title: heading[1].trim(),
    body: sectionBody.slice(
      heading.index! + heading[0].length,
      headings[index + 1]?.index ?? sectionBody.length,
    ),
  }));
}

function splitCsv(value: string | null): string[] {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

function parseCandidate(
  title: string,
  block: string,
  membership: Gate1TopicMembership,
): Gate1ManifestCandidate {
  const identifierLine = block.match(
    /^- DOI: (.*?) · PMID: (.*?) · PMCID: (.+)$/m,
  );
  if (!identifierLine) throw new Error(`Missing identifiers for ${title}`);
  const pmid = nullWhenNotSupplied(identifierLine[2]);
  if (!pmid) throw new Error(`Missing PMID for ${title}`);

  const journalLine = block.match(/^- Journal\/year: (.*?) · (.+)$/m);
  const yearValue = Number(journalLine?.[2]);
  const speciesLine = block.match(/^- Species: (.*?) \((.*?)\)$/m);
  const missingInputs = lineValue(block, 'Missing grading inputs');
  const sourceUrl = block.match(/^- Discovery source: \[PubMed\]\(([^)]+)\)$/m)?.[1];
  if (!sourceUrl) throw new Error(`Missing PubMed URL for ${title}`);
  const fullTextUrl = block.match(/^- OA full text: \[Europe PMC\]\(([^)]+)\)$/m)?.[1] ?? null;
  const scope = lineValue(block, 'Evidence scope')?.replace(/ /g, '_');
  if (scope !== 'canine_direct' && scope !== 'veterinary_methodology') {
    throw new Error(`Unsupported evidence scope for ${title}: ${scope}`);
  }

  return {
    source_id: `MED:${pmid}`,
    title,
    doi: nullWhenNotSupplied(identifierLine[1])?.toLowerCase() ?? null,
    pmid,
    pmcid: nullWhenNotSupplied(identifierLine[3]),
    journal: nullWhenNotSupplied(journalLine?.[1]),
    publication_year: Number.isInteger(yearValue) ? yearValue : null,
    source_url: sourceUrl,
    full_text_url: fullTextUrl,
    open_access: yesNoNull(
      block.match(/Open-access full text: (yes|no)/)?.[1] ?? null,
    ) === true,
    abstract_only: yesNoNull(block.match(/Abstract only: (yes|no)/)?.[1] ?? null) === true,
    evidence_grade: (
      block.match(/Computed evidence grade: \*\*([A-E])\*\*/)?.[1] ?? ''
    ) as EvidenceGrade,
    evidence_scope: scope,
    study_design: lineValue(block, 'Study design'),
    species: nullWhenNotSupplied(speciesLine?.[1]),
    species_terms:
      speciesLine?.[2] === 'no structured species term'
        ? []
        : splitCsv(speciesLine?.[2] ?? null),
    mesh_headings: splitCsv(lineValue(block, 'MeSH headings')),
    sample_size: /^\d+$/.test(lineValue(block, 'Sample size') ?? '')
      ? Number(lineValue(block, 'Sample size'))
      : null,
    funding_declaration: declarationValue(
      block,
      'Funding declaration',
      'Competing-interests declaration',
    ),
    competing_interests_declaration: declarationValue(
      block,
      'Competing-interests declaration',
      'Funding independent',
    ),
    funding_independent: yesNoNull(lineValue(block, 'Funding independent')),
    is_preprint: block.match(/Preprint: (yes|no)/)?.[1] === 'yes',
    retracted: block.match(/Retracted: (yes|no)/)?.[1] === 'yes',
    grading_inputs_complete:
      block.match(/Grading inputs complete: \*\*(yes|no)\*\*/)?.[1] === 'yes',
    missing_grading_inputs:
      !missingInputs || missingInputs === 'none' ? [] : splitCsv(missingInputs),
    topic_memberships: [membership],
  };
}

function membershipFor(
  group: ResearchTopicGroup,
  label: string,
  query: string,
  topics: ResearchDiscoveryTopic[],
): Gate1TopicMembership {
  const topic = topics.find(
    (candidate) => candidate.group === group && candidate.label === label,
  );
  if (!topic) throw new Error(`Unknown Gate 1 topic: ${group}. ${label}`);
  return { key: topic.key, group, label, query };
}

export function parseGate1Manifest(
  report: string,
  sourceReport = 'docs/research-gate1-2026-07-28.md',
  topics = RESEARCH_DISCOVERY_TOPICS,
): Gate1Manifest {
  const expectedCount = Number(
    report.match(/^- Unique candidates: \*\*(\d+)\*\*$/m)?.[1],
  );
  const generatedAt = report.match(/^Generated: (.+)$/m)?.[1]?.trim();
  if (!Number.isInteger(expectedCount) || !generatedAt) {
    throw new Error('Gate 1 report summary is missing');
  }

  const canonical = new Map<string, Gate1ManifestCandidate>();
  for (const section of topicSections(report)) {
    const membership = membershipFor(
      section.group,
      section.label,
      section.query,
      topics,
    );
    for (const candidateBlock of candidateBlocks(section.body)) {
      const parsed = parseCandidate(
        candidateBlock.title,
        candidateBlock.body,
        membership,
      );
      const duplicateOf = candidateBlock.body.match(
        /Deduplication: duplicate of (MED:\d+)/,
      )?.[1];
      const canonicalId = duplicateOf ?? parsed.source_id;
      const existing = canonical.get(canonicalId);
      if (existing) {
        if (!existing.topic_memberships.some((item) => item.key === membership.key)) {
          existing.topic_memberships.push(membership);
        }
        continue;
      }
      if (duplicateOf) {
        throw new Error(`Duplicate appeared before canonical record: ${duplicateOf}`);
      }
      canonical.set(parsed.source_id, parsed);
    }
  }

  const candidates = [...canonical.values()]
    .sort((left, right) => Number(left.pmid) - Number(right.pmid));
  if (candidates.length !== expectedCount) {
    throw new Error(
      `Gate 1 manifest count mismatch: expected ${expectedCount}, parsed ${candidates.length}`,
    );
  }

  return {
    schema_version: 1,
    source_report: sourceReport,
    source_report_sha256: sha256(report),
    generated_at: generatedAt,
    candidate_count: candidates.length,
    candidates,
  };
}

export function gate2CandidateRejectionReason(
  candidate: Gate1ManifestCandidate,
): string | null {
  if (candidate.retracted) return 'retracted';
  if (candidate.evidence_grade === 'E') return 'grade_e';
  if (candidate.evidence_scope === 'canine_direct') {
    if (candidate.species !== 'dog') return 'canine_scope_without_dog_species';
    if (!candidate.mesh_headings.includes('Dogs')) return 'canine_scope_without_dogs_mesh';
  } else if (candidate.topic_memberships.some((topic) => topic.group !== 'G')) {
    return 'methodology_outside_group_g';
  }
  return null;
}

export function selectGate2Candidates(
  manifest: Gate1Manifest,
  selectedPmids: Array<{ group: ResearchTopicGroup; pmid: string }>,
  quotas = GATE_2_GROUP_QUOTAS,
): Gate1ManifestCandidate[] {
  if (selectedPmids.length !== GATE_2_DOCUMENT_CAP) {
    throw new Error(
      `Gate 2 selection must contain ${GATE_2_DOCUMENT_CAP} identifiers, got ${selectedPmids.length}`,
    );
  }
  const uniquePmids = new Set(selectedPmids.map(({ pmid }) => pmid));
  if (uniquePmids.size !== selectedPmids.length) {
    throw new Error('Gate 2 selection contains duplicate PMIDs');
  }

  const selected = selectedPmids.map(({ group, pmid }) => {
    const candidate = manifest.candidates.find((item) => item.pmid === pmid);
    if (!candidate) throw new Error(`PMID ${pmid} is not in the frozen Gate 1 manifest`);
    const primaryGroup = candidate.topic_memberships[0]?.group;
    if (primaryGroup !== group) {
      throw new Error(
        `PMID ${pmid} belongs to primary group ${primaryGroup ?? 'none'}, not ${group}`,
      );
    }
    const rejection = gate2CandidateRejectionReason(candidate);
    if (rejection) throw new Error(`PMID ${pmid} is ineligible: ${rejection}`);
    return candidate;
  });

  for (const group of Object.keys(quotas).sort() as ResearchTopicGroup[]) {
    const count = selectedPmids.filter((item) => item.group === group).length;
    if (count !== quotas[group]) {
      throw new Error(`Gate 2 group ${group} must contain ${quotas[group]} records, got ${count}`);
    }
  }
  if (selected.length !== GATE_2_DOCUMENT_CAP) {
    throw new Error(
      `Gate 2 selection must contain ${GATE_2_DOCUMENT_CAP} documents, got ${selected.length}`,
    );
  }
  return selected;
}

export function centroidText(topic: ResearchDiscoveryTopic): string {
  return [
    topic.label,
    ...topic.terms,
    ...(topic.primaryMeshTerms ?? []),
    ...(topic.contextTerms ?? []),
    ...(topic.contextMeshTerms ?? []),
  ].join(' | ');
}

export function centroidVersion(
  topicKey: string,
  text: string,
  embeddingModel: string,
  dimensions = 1536,
): string {
  return `sha256:${sha256(JSON.stringify({
    topic_key: topicKey,
    centroid_text: text,
    embedding_model: embeddingModel,
    dimensions,
  }))}`;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== 1536 || right.length !== 1536) {
    throw new Error('Relevance vectors must contain exactly 1536 dimensions');
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    throw new Error('Relevance vectors must be non-zero');
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function maximumChunkSimilarity(
  chunks: number[][],
  centroid: number[],
): number {
  if (chunks.length === 0) throw new Error('A document must have at least one chunk');
  return Math.max(...chunks.map((chunk) => cosineSimilarity(chunk, centroid)));
}

export interface RankedRelevanceRow {
  document_id: string;
  topic_key: string;
  topic_group: ResearchTopicGroup;
  similarity: number;
  rank: number;
  drafting_eligible: boolean;
}

export function rankRelevanceRows(
  rows: Array<Omit<RankedRelevanceRow, 'rank' | 'drafting_eligible'>>,
): RankedRelevanceRow[] {
  const byTopic = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = byTopic.get(row.topic_key) ?? [];
    current.push(row);
    byTopic.set(row.topic_key, current);
  }
  return [...byTopic.values()].flatMap((topicRows) =>
    [...topicRows]
      .sort(
        (left, right) =>
          right.similarity - left.similarity
          || left.document_id.localeCompare(right.document_id),
      )
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        drafting_eligible:
          index < RELEVANCE_RANKING_POLICY.maximumDocumentsPerTopic
          && row.similarity >= RELEVANCE_RANKING_POLICY.minimumSimilarity,
      })),
  );
}
