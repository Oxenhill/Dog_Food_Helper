import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeResearchRankingResult,
  computeResearchScoringTrace,
  RESEARCH_SCORING_POLICY,
} from '../researchScoringPolicy';
import type { ResearchEvidence } from '../types';

function evidence(overrides: Partial<ResearchEvidence> = {}): ResearchEvidence {
  return {
    claim_id: 'claim-1',
    claim_identity: 'identity-1',
    subject_type: 'ingredient',
    subject_value: 'chicken',
    direction: 'supports',
    effect_summary: 'A cautious effect summary.',
    supporting_quote: 'the quote',
    evidence_grade: 'A',
    grading_inputs_complete: true,
    access_type: 'open_access_full_text',
    title: 'A study',
    doi: null,
    source_url: null,
    cluster_id: null,
    outcome_type: null,
    outcome_value: null,
    matched_dog_context: [],
    document_id: 'doc-1',
    study_family_id: 'doc-1',
    ...overrides,
  };
}

test('no evidence stays exactly neutral', () => {
  const trace = computeResearchScoringTrace([]);
  assert.equal(trace.score, RESEARCH_SCORING_POLICY.neutralScore.value);
  assert.equal(trace.topics.length, 0);
  assert.equal(trace.inert_evidence.length, 0);
});

test('neutral and insufficient_evidence never move the score', () => {
  const trace = computeResearchScoringTrace([
    evidence({ claim_id: 'a', direction: 'neutral' }),
    evidence({ claim_id: 'b', direction: 'insufficient_evidence' }),
  ]);
  assert.equal(trace.score, RESEARCH_SCORING_POLICY.neutralScore.value);
  assert.equal(trace.topics.length, 0);
  assert.equal(trace.inert_evidence.length, 2);
});

test('a single grade-A, complete, full-text supports claim hits the upper cap', () => {
  const trace = computeResearchScoringTrace([evidence({ direction: 'supports' })]);
  assert.equal(trace.topics.length, 1);
  assert.equal(trace.topics[0].direction, 'supports');
  assert.equal(trace.topics[0].best_strength, 1);
  // strength 1.0 clamps to +1, so deviation is the full cap
  assert.equal(trace.final_deviation, RESEARCH_SCORING_POLICY.maxDeviation.value);
  assert.equal(trace.score, RESEARCH_SCORING_POLICY.neutralScore.value + RESEARCH_SCORING_POLICY.maxDeviation.value);
  assert.equal(trace.score, 0.8);
});

test('a single cautions_against claim moves the score down, never below the floor', () => {
  const trace = computeResearchScoringTrace([evidence({ direction: 'cautions_against' })]);
  assert.equal(trace.topics[0].direction, 'cautions_against');
  assert.ok(trace.score < RESEARCH_SCORING_POLICY.neutralScore.value);
  assert.ok(trace.score >= RESEARCH_SCORING_POLICY.neutralScore.value - RESEARCH_SCORING_POLICY.maxDeviation.value);
});

test('grade, incomplete-grading and abstract-only dampening multiply as documented', () => {
  const trace = computeResearchScoringTrace([
    evidence({
      direction: 'supports',
      evidence_grade: 'E',
      grading_inputs_complete: false,
      access_type: 'abstract_only',
    }),
  ]);
  const expectedStrength =
    RESEARCH_SCORING_POLICY.gradeWeight.E.value *
    RESEARCH_SCORING_POLICY.incompleteGradingMultiplier.value *
    RESEARCH_SCORING_POLICY.accessWeight.abstract_only.value;
  assert.equal(trace.topics[0].best_strength, expectedStrength);
});

test('the score never leaves the documented [0.2, 0.8] band regardless of evidence volume', () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    evidence({
      claim_id: `claim-${i}`,
      cluster_id: `cluster-${i}`,
      document_id: `doc-${i}`,
      study_family_id: `doc-${i}`,
      direction: 'supports',
    })
  );
  const trace = computeResearchScoringTrace(many);
  assert.equal(trace.score, 0.5 + RESEARCH_SCORING_POLICY.maxDeviation.value);
  assert.ok(trace.score <= 0.8);
});

test('two evidence items from the same study family do not corroborate each other', () => {
  const trace = computeResearchScoringTrace([
    evidence({ claim_id: 'a', cluster_id: 'cluster-x', document_id: 'doc-1', study_family_id: 'doc-1', evidence_grade: 'C' }),
    // A preprint of the same underlying study, already counted -- must not add a corroboration bonus.
    evidence({ claim_id: 'b', cluster_id: 'cluster-x', document_id: 'doc-1-preprint', study_family_id: 'doc-1', evidence_grade: 'C' }),
  ]);
  assert.equal(trace.topics.length, 1);
  assert.equal(trace.topics[0].independent_family_count, 1);
  assert.equal(trace.topics[0].corroboration_bonus, 0);
});

test('two independent study families backing the same topic add a capped corroboration bonus', () => {
  const trace = computeResearchScoringTrace([
    evidence({ claim_id: 'a', cluster_id: 'cluster-x', document_id: 'doc-1', study_family_id: 'doc-1', evidence_grade: 'C' }),
    evidence({ claim_id: 'b', cluster_id: 'cluster-x', document_id: 'doc-2', study_family_id: 'doc-2', evidence_grade: 'C' }),
  ]);
  assert.equal(trace.topics[0].independent_family_count, 2);
  assert.equal(trace.topics[0].corroboration_bonus, RESEARCH_SCORING_POLICY.corroborationBonusPerFamily.value);
});

test('unrelated topics on the same food do not cancel each other out', () => {
  const trace = computeResearchScoringTrace([
    evidence({ claim_id: 'a', subject_type: 'ingredient', subject_value: 'chicken', direction: 'supports', cluster_id: null }),
    evidence({ claim_id: 'b', subject_type: 'nutrient', subject_value: 'taurine', direction: 'cautions_against', cluster_id: null }),
  ]);
  assert.equal(trace.topics.length, 2);
  const directions = trace.topics.map((t) => t.direction).sort();
  assert.deepEqual(directions, ['cautions_against', 'supports']);
});

test('conflicting direct claims about the exact same subject are netted as contested, not double-counted', () => {
  const trace = computeResearchScoringTrace([
    evidence({ claim_id: 'a', subject_type: 'ingredient', subject_value: 'chicken', direction: 'supports', cluster_id: null, evidence_grade: 'A' }),
    evidence({ claim_id: 'b', subject_type: 'ingredient', subject_value: 'chicken', direction: 'cautions_against', cluster_id: null, evidence_grade: 'E' }),
  ]);
  assert.equal(trace.topics.length, 1);
  assert.equal(trace.topics[0].direction, 'contested');
  assert.ok(trace.topics[0].contribution > 0);
});

test('computeResearchRankingResult adapts the trace to the {score, summary} shape scoreFood() expects', () => {
  const evidenceList = [evidence({ direction: 'supports' })];
  const trace = computeResearchScoringTrace(evidenceList);
  const result = computeResearchRankingResult(evidenceList);
  assert.equal(result.score, trace.score);
  assert.equal(result.summary, trace.summary);
});
