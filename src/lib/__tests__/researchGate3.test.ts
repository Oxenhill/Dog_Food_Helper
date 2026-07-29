import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertGate3DraftingInputs,
  buildGate3DraftingPrompt,
  GATE_3_OUTPUT_SCHEMA_DESCRIPTION,
  GATE_3_SYSTEM_INSTRUCTION,
  gate3DraftIdentity,
  gate3ModeledInputCharacters,
  normalizeGate3Proposition,
  sha256,
  validateGate3Claim,
  type Gate3Claim,
  type Gate3DraftingInput,
} from '../researchGate3';
import { parseApprovedGate3Claims } from '../researchGate3Database';

const content =
  'The study found that the nutrient was associated with lower outcome scores in adult dogs over 30 days.';

const input: Gate3DraftingInput = {
  slot: 'coverage-A',
  group: 'A',
  topic_key: 'example',
  document_id: 'document-1',
  pmid: '1',
  title: 'Example canine study.',
  chunk_id: 'chunk-1',
  chunk_index: 0,
  access_type: 'open_access_full_text',
  chunk_sha256: sha256(content),
  chunk_characters: content.length,
  content,
};

const claim: Gate3Claim = {
  supporting_quote:
    'The study found that the nutrient was associated with lower outcome scores in adult dogs over 30 days.',
  subject_type: 'nutrient',
  subject_value: 'example nutrient',
  applies_to_condition: null,
  applies_to_life_stage: 'adult',
  direction: 'supports',
  effect_summary:
    'The study found that the nutrient was associated with lower outcome scores in adult dogs over 30 days.',
};

test('approved prompt and schema hashes stay frozen', () => {
  assert.equal(
    sha256(GATE_3_SYSTEM_INSTRUCTION),
    '366dae4bdd19a586a4becdb14471e50e2d938d6e5e066df44292d2e224a25cc0',
  );
  assert.equal(
    sha256(GATE_3_OUTPUT_SCHEMA_DESCRIPTION),
    'b7f2a1ff41e4732bc905ad3594cb053af37eda5320f4bd2d837784375dba6bf9',
  );
});

test('prompt contains the exact source and modeled size remains bounded', () => {
  assert.match(buildGate3DraftingPrompt(input), /SOURCE_TEXT:/);
  assert.match(buildGate3DraftingPrompt(input), /adult dogs over 30 days/);
  assert.ok(gate3ModeledInputCharacters(input) < 8192);
  assert.doesNotThrow(() => assertGate3DraftingInputs([input]));
});

test('input assertions reject content hash changes and Group G', () => {
  assert.throws(
    () => assertGate3DraftingInputs([{ ...input, content: `${content} changed` }]),
    /length mismatch/,
  );
  assert.throws(
    () => assertGate3DraftingInputs([{ ...input, group: 'G' }]),
    /Group G/,
  );
});

test('literal cautious claims pass deterministic validation', () => {
  assert.deepEqual(validateGate3Claim(claim, input), {
    valid: true,
    rejection_reasons: [],
  });
});

test('non-literal, advisory, and over-certain claims are rejected', () => {
  const result = validateGate3Claim(
    {
      ...claim,
      supporting_quote: 'A repaired quote that does not exist in the source.',
      effect_summary: 'Owners should always feed this nutrient.',
    },
    input,
  );
  assert.equal(result.valid, false);
  assert.deepEqual(result.rejection_reasons, [
    'supporting_quote_not_literal_substring',
    'effect_summary_missing_cautious_language',
    'effect_summary_contains_instruction_or_advice',
    'effect_summary_overgeneralises_or_claims_certainty',
  ]);
});

test('normalized propositions and deterministic identities are stable', () => {
  assert.equal(normalizeGate3Proposition(claim), normalizeGate3Proposition({
    ...claim,
    subject_value: '  EXAMPLE---NUTRIENT  ',
  }));
  assert.equal(gate3DraftIdentity(claim, input), gate3DraftIdentity(claim, input));
  assert.notEqual(
    gate3DraftIdentity(claim, input),
    gate3DraftIdentity({ ...claim, direction: 'neutral' }, input),
  );
});

test('owner approval must match the immutable reviewed manifest exactly', () => {
  const reviewedClaim = {
    claim_identity: gate3DraftIdentity(claim, input),
    source: {
      pmid: '1',
      doi: null,
      title: input.title,
      document_id: input.document_id,
      chunk_id: input.chunk_id,
      chunk_index: input.chunk_index,
      chunk_sha256: input.chunk_sha256,
      group: 'A',
      access_type: 'open_access_full_text',
      evidence_scope: 'canine_direct',
      evidence_grade: 'D',
      grading_inputs_complete: true,
      missing_grading_inputs: [],
      funding_independent: null,
    },
    claim,
    validation: {
      literal_substring: true,
      chunk_belongs_to_document: true,
      machine_result: 'passed',
      semantic_result: 'recommended_for_queue',
    },
  };
  const manifestRaw = JSON.stringify({
    status: 'awaiting_owner_claim_approval',
    claims_recommended_for_queue: [reviewedClaim],
  });
  const approval = {
    status: 'owner_approved',
    approved_manifest_sha256: sha256(manifestRaw),
    approved_claim_identities: [reviewedClaim.claim_identity],
    claim_identity_migration_approved: true,
    insertion_contract: {
      status: 'queued_for_review',
      active_claims: 0,
      corroborating_claim_ids: [],
      claim_cap: 2,
      generated_columns_written: false,
    },
  };
  assert.equal(
    parseApprovedGate3Claims(manifestRaw, JSON.stringify(approval)).claims.length,
    1,
  );
  assert.throws(
    () => parseApprovedGate3Claims(`${manifestRaw}\n`, JSON.stringify(approval)),
    /does not match/,
  );
});
