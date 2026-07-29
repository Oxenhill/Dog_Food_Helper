import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  centroidVersion,
  cosineSimilarity,
  gate2CandidateRejectionReason,
  maximumChunkSimilarity,
  parseGate1Manifest,
  rankRelevanceRows,
  RELEVANCE_RANKING_POLICY,
  selectGate2Candidates,
} from '../researchGate2';

const miniTopics = [
  {
    key: 'one',
    group: 'A' as const,
    label: 'One',
    terms: ['one'],
    evidenceScope: 'canine_direct' as const,
  },
  {
    key: 'two',
    group: 'A' as const,
    label: 'Two',
    terms: ['two'],
    evidenceScope: 'canine_direct' as const,
  },
];

function candidate(title: string, duplicate = ''): string {
  return `#### 1. ${title}

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/123/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC123)
- DOI: 10.1/example · PMID: 123 · PMCID: PMC123
- Journal/year: Journal · 2024
- Publication types: Journal Article
- MeSH headings: Animals, Dogs
- Study design: rct
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: First line
Second line
- Competing-interests declaration: No competing interests
- Funding independent: yes
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T00:00:00.000Z
- Computed evidence grade: **B**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size
${duplicate}`;
}

describe('Gate 2 manifest and selection guards', () => {
  it('reconstructs one immutable candidate and aggregates duplicate topic membership', () => {
    const report = `# Report

Generated: 2026-07-28T00:00:00.000Z
- Unique candidates: **1**

## Queries and candidates

### A. One

Query: \`"Dogs"[Mesh]\`

${candidate('Paper')}

### A. Two

Query: \`"Dogs"[Mesh]\`

${candidate('Paper', '- Deduplication: duplicate of MED:123 (title similarity 1)')}
`;
    const manifest = parseGate1Manifest(report, 'fixture.md', miniTopics);
    assert.equal(manifest.candidate_count, 1);
    assert.deepEqual(
      manifest.candidates[0].topic_memberships.map((topic) => topic.key),
      ['one', 'two'],
    );
    assert.equal(manifest.candidates[0].funding_declaration, 'First line\nSecond line');
  });

  it('fails closed when canine-direct evidence lacks structured Dogs MeSH', () => {
    const candidateValue = {
      source_id: 'MED:1',
      title: 'x',
      doi: null,
      pmid: '1',
      pmcid: null,
      journal: null,
      publication_year: null,
      source_url: '',
      full_text_url: null,
      open_access: false,
      abstract_only: true,
      evidence_grade: 'D' as const,
      evidence_scope: 'canine_direct' as const,
      study_design: 'other',
      species: 'dog',
      species_terms: ['Dogs'],
      mesh_headings: ['Animals'],
      sample_size: null,
      funding_declaration: null,
      competing_interests_declaration: null,
      funding_independent: null,
      is_preprint: false,
      retracted: false,
      grading_inputs_complete: true,
      missing_grading_inputs: [],
      topic_memberships: [{ key: 'x', group: 'A' as const, label: 'x', query: 'x' }],
    };
    assert.equal(
      gate2CandidateRejectionReason(candidateValue),
      'canine_scope_without_dogs_mesh',
    );
  });

  it('requires an exact, unique, frozen PMID selection', () => {
    const candidateValue = {
      source_id: 'MED:1',
      title: 'x',
      doi: null,
      pmid: '1',
      pmcid: null,
      journal: null,
      publication_year: null,
      source_url: '',
      full_text_url: null,
      open_access: false,
      abstract_only: true,
      evidence_grade: 'D' as const,
      evidence_scope: 'canine_direct' as const,
      study_design: 'other',
      species: 'dog',
      species_terms: ['Dogs'],
      mesh_headings: ['Animals', 'Dogs'],
      sample_size: null,
      funding_declaration: null,
      competing_interests_declaration: null,
      funding_independent: null,
      is_preprint: false,
      retracted: false,
      grading_inputs_complete: true,
      missing_grading_inputs: [],
      topic_memberships: [{ key: 'x', group: 'A' as const, label: 'x', query: 'x' }],
    };
    const manifest = {
      schema_version: 1 as const,
      source_report: 'fixture',
      source_report_sha256: 'hash',
      generated_at: 'now',
      candidate_count: 1,
      candidates: [candidateValue],
    };
    assert.throws(
      () => selectGate2Candidates(manifest, [{ group: 'A', pmid: '1' }]),
      /must contain 30 identifiers/,
    );
  });
});

describe('Gate 2 relevance policy', () => {
  const unit = (first: number) => [first, ...new Array(1535).fill(0)];

  it('requires exact 1536-dimensional vectors and uses maximum chunk similarity', () => {
    assert.equal(cosineSimilarity(unit(1), unit(1)), 1);
    assert.throws(() => cosineSimilarity([1], [1]), /1536 dimensions/);
    assert.equal(maximumChunkSimilarity([unit(-1), unit(1)], unit(1)), 1);
  });

  it('uses a deterministic top-five plus absolute-floor drafting gate', () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      document_id: `doc-${index}`,
      topic_key: 'topic',
      topic_group: 'A' as const,
      similarity: 0.8 - index * 0.1,
    }));
    const ranked = rankRelevanceRows(rows);
    assert.equal(ranked.filter((row) => row.drafting_eligible).length, 5);
    assert.equal(ranked[0].rank, 1);
    assert.equal(
      ranked[5].drafting_eligible,
      false,
      `rank 6 must fail even above ${RELEVANCE_RANKING_POLICY.minimumSimilarity}`,
    );
  });

  it('versions centroids from text, model and dimensions', () => {
    const first = centroidVersion('topic', 'text', 'text-embedding-3-small');
    assert.match(first, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(
      first,
      centroidVersion('topic', 'changed', 'text-embedding-3-small'),
    );
  });
});
