import { createHash } from 'node:crypto';
import { z } from 'zod';

export const GATE_3_MODEL = 'anthropic/claude-sonnet-5' as const;
export const GATE_3_MAX_INPUT_CHARACTERS = 8192;
export const GATE_3_MAX_OUTPUT_TOKENS = 320;
export const GATE_3_MAX_DOCUMENTS = 8;
export const GATE_3_MAX_CHUNKS = 8;
export const GATE_3_MAX_CLAIMS = 8;

export const GATE_3_SYSTEM_INSTRUCTION =
  'You draft at most one review-only canine research claim from one supplied source chunk. '
  + 'Return null when the chunk does not contain a self-contained, substantively supported result. '
  + 'The supporting_quote must be a verbatim literal substring of SOURCE_TEXT and must directly support the proposition, studied population, and direction. '
  + 'Do not quote headings, background claims, author recommendations, or speculative discussion as results. '
  + 'Do not repair or paraphrase a quote. '
  + 'Use only these subject_type values: ingredient, nutrient, ingredient_class, processing_method, biome_marker. '
  + 'Use only these direction values: supports, cautions_against, neutral, insufficient_evidence. '
  + 'effect_summary must be one cautious plain-English sentence using wording such as ?may,? ?was associated with,? or ?the study found.? '
  + 'Never give veterinary, diagnostic, treatment, or feeding instructions. '
  + 'Do not generalise beyond the population, intervention, comparator, outcome, or duration in the text. '
  + 'Do not convert absence of evidence into evidence of absence. '
  + 'Do not infer missing metadata. '
  + 'Preserve nulls for applies_to_condition and applies_to_life_stage unless explicitly supported. '
  + 'Output only the seven permitted claim fields: supporting_quote, subject_type, subject_value, applies_to_condition, applies_to_life_stage, direction, effect_summary.';

const SubjectTypeSchema = z.enum([
  'ingredient',
  'nutrient',
  'ingredient_class',
  'processing_method',
  'biome_marker',
]);

const DirectionSchema = z.enum([
  'supports',
  'cautions_against',
  'neutral',
  'insufficient_evidence',
]);

export const Gate3ClaimSchema = z.object({
  supporting_quote: z.string().min(1),
  subject_type: SubjectTypeSchema,
  subject_value: z.string().min(1),
  applies_to_condition: z.string().min(1).nullable(),
  applies_to_life_stage: z.string().min(1).nullable(),
  direction: DirectionSchema,
  effect_summary: z.string().min(1),
}).strict();

export const Gate3DraftResponseSchema = z.object({
  claim: Gate3ClaimSchema.nullable(),
}).strict();

export type Gate3Claim = z.infer<typeof Gate3ClaimSchema>;

export const GATE_3_OUTPUT_SCHEMA_DESCRIPTION = JSON.stringify({
  claim: {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: [
          'supporting_quote',
          'subject_type',
          'subject_value',
          'applies_to_condition',
          'applies_to_life_stage',
          'direction',
          'effect_summary',
        ],
        properties: {
          supporting_quote: { type: 'string' },
          subject_type: {
            enum: [
              'ingredient',
              'nutrient',
              'ingredient_class',
              'processing_method',
              'biome_marker',
            ],
          },
          subject_value: { type: 'string' },
          applies_to_condition: { type: ['string', 'null'] },
          applies_to_life_stage: { type: ['string', 'null'] },
          direction: {
            enum: [
              'supports',
              'cautions_against',
              'neutral',
              'insufficient_evidence',
            ],
          },
          effect_summary: { type: 'string' },
        },
      },
      { type: 'null' },
    ],
  },
});

export interface Gate3DraftingInput {
  slot: string;
  group: string;
  topic_key: string;
  document_id: string;
  pmid: string;
  title: string;
  chunk_id: string;
  chunk_index: number;
  access_type: 'open_access_full_text' | 'abstract_only';
  chunk_sha256: string;
  chunk_characters: number;
  content: string;
}

export interface Gate3ValidationResult {
  valid: boolean;
  rejection_reasons: string[];
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildGate3DraftingPrompt(input: Gate3DraftingInput): string {
  return [
    `TITLE: ${input.title}`,
    `PMID: ${input.pmid}`,
    `TOPIC_GROUP: ${input.group}`,
    `TOPIC_KEY: ${input.topic_key}`,
    `ACCESS: ${input.access_type}`,
    'SOURCE_TEXT:',
    input.content,
  ].join('\n');
}

export function gate3ModeledInputCharacters(input: Gate3DraftingInput): number {
  return (
    GATE_3_SYSTEM_INSTRUCTION.length
    + GATE_3_OUTPUT_SCHEMA_DESCRIPTION.length
    + buildGate3DraftingPrompt(input).length
  );
}

export function assertGate3DraftingInputs(inputs: Gate3DraftingInput[]): void {
  if (inputs.length === 0 || inputs.length > GATE_3_MAX_DOCUMENTS) {
    throw new Error(`Gate 3 document cap exceeded or empty: ${inputs.length}`);
  }
  if (inputs.length > GATE_3_MAX_CHUNKS) {
    throw new Error(`Gate 3 chunk cap exceeded: ${inputs.length}`);
  }

  const documentIds = new Set<string>();
  const chunkIds = new Set<string>();
  for (const input of inputs) {
    if (documentIds.has(input.document_id)) {
      throw new Error(`Duplicate Gate 3 document: ${input.document_id}`);
    }
    if (chunkIds.has(input.chunk_id)) {
      throw new Error(`Duplicate Gate 3 chunk: ${input.chunk_id}`);
    }
    documentIds.add(input.document_id);
    chunkIds.add(input.chunk_id);

    if (input.group === 'G') {
      throw new Error(`Group G cannot be drafted: PMID ${input.pmid}`);
    }
    if (input.content.length !== input.chunk_characters) {
      throw new Error(`Chunk length mismatch: PMID ${input.pmid}`);
    }
    if (sha256(input.content) !== input.chunk_sha256) {
      throw new Error(`Chunk hash mismatch: PMID ${input.pmid}`);
    }
    const characters = gate3ModeledInputCharacters(input);
    if (characters > GATE_3_MAX_INPUT_CHARACTERS) {
      throw new Error(`Input exceeds ${GATE_3_MAX_INPUT_CHARACTERS} characters: PMID ${input.pmid}`);
    }
  }
}

function sentenceCount(value: string): number {
  return value.match(/[.!?](?:["')\]]*)?(?=\s|$)/g)?.length ?? 0;
}

export function validateGate3Claim(
  claim: Gate3Claim,
  input: Gate3DraftingInput,
): Gate3ValidationResult {
  const reasons: string[] = [];
  const quote = claim.supporting_quote;
  const summary = claim.effect_summary.trim();

  if (!input.content.includes(quote)) {
    reasons.push('supporting_quote_not_literal_substring');
  }
  if (quote.trim().length < 30) {
    reasons.push('supporting_quote_too_short_for_substantive_support');
  }
  if (claim.subject_value.trim() !== claim.subject_value || !claim.subject_value.trim()) {
    reasons.push('invalid_subject_value_whitespace_or_empty');
  }
  if (summary !== claim.effect_summary || sentenceCount(summary) !== 1) {
    reasons.push('effect_summary_not_one_trimmed_sentence');
  }
  if (
    !/\b(may|might|was associated with|were associated with|the study found|the study reported|the analysis found|the review found|suggests?|did not find|found no significant)\b/i.test(
      summary,
    )
  ) {
    reasons.push('effect_summary_missing_cautious_language');
  }
  if (
    /\b(should|must|recommend(?:ed|ation)?|consult|veterinar(?:y|ian)|feed this|do not feed|treat(?:ment)?)\b/i.test(
      summary,
    )
  ) {
    reasons.push('effect_summary_contains_instruction_or_advice');
  }
  if (
    /\b(proves?|always|never|guarantees?|cures?|prevents?|completely safe|appropriate for use)\b/i.test(
      summary,
    )
  ) {
    reasons.push('effect_summary_overgeneralises_or_claims_certainty');
  }

  return {
    valid: reasons.length === 0,
    rejection_reasons: reasons,
  };
}

export function normalizeGate3Proposition(claim: Gate3Claim): string {
  return [
    claim.subject_type,
    claim.subject_value,
    claim.applies_to_condition ?? '',
    claim.applies_to_life_stage ?? '',
    claim.direction,
    claim.effect_summary,
  ]
    .map((value) =>
      value
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim(),
    )
    .join('|');
}

export function gate3DraftIdentity(
  claim: Gate3Claim,
  input: Pick<Gate3DraftingInput, 'document_id' | 'chunk_id'>,
): string {
  return sha256(
    JSON.stringify({
      document_id: input.document_id,
      chunk_id: input.chunk_id,
      supporting_quote: claim.supporting_quote,
      proposition: normalizeGate3Proposition(claim),
    }),
  );
}
