import { createHash } from 'node:crypto';
import { INGREDIENT_CATEGORIES } from './ingredientCategories';
import type {
  ResearchClaimDirection,
  ResearchClaimSubjectType,
  ResearchEvidenceCluster,
} from './types';

export const RESEARCH_OUTCOME_TYPES = [
  'condition',
  'biome_marker',
  'clinical_marker',
  'outcome_metric',
  'general_health',
] as const;

export const RESEARCH_DIRECTIONS = [
  'supports',
  'cautions_against',
  'neutral',
  'insufficient_evidence',
] as const satisfies readonly ResearchClaimDirection[];

export const RESEARCH_CONTEXT_TYPES = [
  'health_condition',
  'document_finding',
  'life_stage',
  'restriction',
  'outcome_metric',
] as const;

export const RESEARCH_PROCESSING_METHODS = {
  raw: 'raw',
  kibble: 'kibble',
  'cold pressed': 'cold_pressed',
  cooked: 'cooked',
  wet: 'wet',
  other: 'other',
} as const;

export const RESEARCH_NUTRIENT_SUBJECTS = [
  'protein',
  'crude protein',
  'fat',
  'crude fat',
  'fibre',
  'fiber',
  'crude fibre',
  'crude fiber',
  'moisture',
  'ash',
  'crude ash',
  'phosphorus',
  'sodium',
  'calcium',
  'taurine',
  'l-carnitine',
] as const;

export const RESEARCH_DOCUMENT_FINDING_KEYS = [
  'Firmicutes',
  'Proteobacteria',
  'Fusobacteria',
  'Bacteroidales',
  'Clostridia',
  'Prevotella',
  'Diversity',
  'Species Richness',
  'Dysbiosis Pattern Score',
  'Microbiome Classification',
] as const;

export const RESEARCH_LIFE_STAGE_CONTEXTS = [
  'growth',
  'puppy',
  'adult',
  'senior',
] as const;

const NUTRIENT_SUBJECTS: ReadonlySet<string> = new Set(RESEARCH_NUTRIENT_SUBJECTS);
const PROCESSING_METHODS = new Set(Object.keys(RESEARCH_PROCESSING_METHODS));
const INGREDIENT_CLASSES = new Set(
  INGREDIENT_CATEGORIES.flatMap((category) => [
    normalizeResearchStructuredValue(category.value),
    normalizeResearchStructuredValue(category.label),
  ])
);
const DOCUMENT_FINDING_KEYS = new Set(
  RESEARCH_DOCUMENT_FINDING_KEYS.map(normalizeResearchStructuredValue)
);
const LIFE_STAGE_CONTEXTS: ReadonlySet<string> = new Set(RESEARCH_LIFE_STAGE_CONTEXTS);

export interface ResearchClusterEditContext {
  context_type: (typeof RESEARCH_CONTEXT_TYPES)[number];
  context_key: string;
  context_value: string | null;
  match_operator: 'exact' | 'enum';
}

export interface ResearchClusterEdit {
  subject_type: ResearchClaimSubjectType;
  subject_value: string;
  outcome_type: (typeof RESEARCH_OUTCOME_TYPES)[number];
  outcome_value: string;
  direction: ResearchClaimDirection;
  cautious_summary: string;
  applicability: ResearchClusterEditContext[];
}

export function normalizeResearchStructuredValue(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeResearchIdentityValue(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function researchClusterIdentity(
  cluster: Pick<
    ResearchEvidenceCluster,
    'subject_type' | 'subject_value' | 'outcome_type' | 'outcome_value' | 'direction'
  >
): string {
  return createHash('sha256')
    .update(
      [
        cluster.subject_type,
        normalizeResearchIdentityValue(cluster.subject_value),
        cluster.outcome_type,
        normalizeResearchIdentityValue(cluster.outcome_value),
        cluster.direction,
      ].join('|'),
      'utf8'
    )
    .digest('hex');
}

export function researchClusterLabel(
  cluster: Pick<ResearchEvidenceCluster, 'subject_value' | 'outcome_value'>
): string {
  return `${cluster.subject_value.trim()} — ${cluster.outcome_value.trim()}`;
}

function sentenceCount(value: string): number {
  return value.match(/[.!?](?:["')\]]*)?(?=\s|$)/g)?.length ?? 0;
}

export function validateCautiousResearchSummary(value: string): string[] {
  const reasons: string[] = [];
  if (value !== value.trim() || sentenceCount(value) !== 1) {
    reasons.push('Summary must be one complete sentence without surrounding whitespace.');
  }
  if (
    !/\b(may|might|was associated with|were associated with|the study found|the study reported|the analysis found|the review found|suggests?|did not find|found no significant)\b/i.test(
      value
    )
  ) {
    reasons.push('Summary must use cautious evidence language.');
  }
  if (
    /\b(should|must|recommend(?:ed|ation)?|consult|veterinar(?:y|ian)|feed this|do not feed|treat(?:ment)?|proves?|always|never|guarantees?|cures?|prevents?|completely safe|appropriate for use)\b/i.test(
      value
    )
  ) {
    reasons.push('Summary must not contain advice or certainty language.');
  }
  return reasons;
}

export function validateResearchSubject(
  subjectType: ResearchClaimSubjectType,
  subjectValue: string
): string[] {
  const reasons: string[] = [];
  const normalized = normalizeResearchStructuredValue(subjectValue);
  if (!normalized) return ['Subject is required.'];
  if (subjectValue !== subjectValue.trim()) {
    reasons.push('Subject must not have surrounding whitespace.');
  }
  if (subjectType === 'biome_marker') {
    reasons.push('Biome markers are outcomes or dog contexts, not food-matchable subjects.');
  } else if (subjectType === 'nutrient' && !NUTRIENT_SUBJECTS.has(normalized)) {
    reasons.push('Nutrient is not in the runtime nutrient allowlist.');
  } else if (subjectType === 'ingredient_class' && !INGREDIENT_CLASSES.has(normalized)) {
    reasons.push('Ingredient class is not in the food ingredient taxonomy.');
  } else if (subjectType === 'processing_method' && !PROCESSING_METHODS.has(normalized)) {
    reasons.push('Processing method is not in the runtime food-type allowlist.');
  } else if (
    subjectType === 'ingredient' &&
    /,|\band\b|\bor\b/i.test(subjectValue)
  ) {
    reasons.push('Ingredient must name one specific ingredient.');
  }
  return reasons;
}

export function validateResearchContext(
  context: ResearchClusterEditContext
): string[] {
  const reasons: string[] = [];
  const key = normalizeResearchStructuredValue(context.context_key);
  if (!key) return ['Context key is required.'];
  if (context.context_key !== context.context_key.trim()) {
    reasons.push('Context key must not have surrounding whitespace.');
  }
  if (
    context.context_value !== null &&
    context.context_value !== context.context_value.trim()
  ) {
    reasons.push('Context value must not have surrounding whitespace.');
  }
  if (
    context.context_type === 'document_finding' &&
    !DOCUMENT_FINDING_KEYS.has(key)
  ) {
    reasons.push('Document finding is not in the accepted report-field allowlist.');
  }
  if (
    context.context_type === 'life_stage' &&
    !LIFE_STAGE_CONTEXTS.has(key)
  ) {
    reasons.push('Life stage is not in the runtime life-stage allowlist.');
  }
  return reasons;
}

export function validateResearchClusterEdit(edit: ResearchClusterEdit): string[] {
  const reasons = [
    ...validateResearchSubject(edit.subject_type, edit.subject_value),
    ...validateCautiousResearchSummary(edit.cautious_summary),
  ];
  if (!edit.outcome_value.trim()) reasons.push('Measured outcome is required.');
  if (edit.outcome_value !== edit.outcome_value.trim()) {
    reasons.push('Measured outcome must not have surrounding whitespace.');
  }
  if (edit.applicability.length > 8) {
    reasons.push('No more than eight applicability contexts are allowed.');
  }
  for (const context of edit.applicability) {
    reasons.push(...validateResearchContext(context));
  }
  const contextKeys = edit.applicability.map((context) =>
    [
      context.context_type,
      normalizeResearchStructuredValue(context.context_key),
      normalizeResearchStructuredValue(context.context_value ?? ''),
    ].join('|')
  );
  if (new Set(contextKeys).size !== contextKeys.length) {
    reasons.push('Applicability contexts must be unique.');
  }
  return [...new Set(reasons)];
}
