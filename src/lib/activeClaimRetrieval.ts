/**
 * Gate 4 active-claim runtime.
 *
 * This module is deliberately token-free: it reads only active, manually
 * reviewed structured claims and matches them to the already-loaded dog and
 * food records. There is no embedding, chunk search, model call, score-cache
 * lookup or per-food database query.
 */

import { canonicalIngredientKey } from './compositionParser';
import { INGREDIENT_CATEGORIES } from './ingredientCategories';
import type { FoodFull, FoodNutrients } from './foodFull';
import { supabaseAdmin } from './supabase';
import type {
  Dog,
  DogDocumentFinding,
  DogHealthCondition,
  ResearchClaim,
  ResearchClaimDirection,
  ResearchClaimSubjectType,
  ResearchDocument,
  ResearchEvidence,
  ResearchEvidenceCluster,
  ResearchClusterApplicability,
  ResearchChunk,
} from './types';
import type { ResearchRelevanceResult } from './researchScoring';

type NutrientColumn = Exclude<keyof FoodNutrients, 'carbohydrate_band'>;

interface NutrientMatchRule {
  column?: NutrientColumn;
  declaredNames?: readonly string[];
}

/**
 * Explicit allowlist only. Subject values never become property names.
 * Taurine and L-carnitine are recorded as declared composition/additive rows,
 * not guaranteed-analysis columns, so they match only those exact rows.
 */
export const NUTRIENT_MATCH_RULES: Readonly<Record<string, NutrientMatchRule>> = {
  protein: { column: 'protein_pct' },
  'crude protein': { column: 'protein_pct' },
  fat: { column: 'fat_pct' },
  'crude fat': { column: 'fat_pct' },
  fibre: { column: 'fibre_pct' },
  fiber: { column: 'fibre_pct' },
  'crude fibre': { column: 'fibre_pct' },
  'crude fiber': { column: 'fibre_pct' },
  moisture: { column: 'moisture_pct' },
  ash: { column: 'ash_pct' },
  'crude ash': { column: 'ash_pct' },
  phosphorus: { column: 'phosphorus_pct' },
  sodium: { column: 'sodium_pct' },
  calcium: { column: 'calcium_pct' },
  taurine: { declaredNames: ['taurine'] },
  'l-carnitine': { declaredNames: ['l-carnitine'] },
};

const PROCESSING_METHODS: Readonly<Record<string, FoodFull['food_type']>> = {
  raw: 'raw',
  kibble: 'kibble',
  'cold pressed': 'cold_pressed',
  cooked: 'cooked',
  wet: 'wet',
  other: 'other',
};

const CATEGORY_BY_SUBJECT = new Map<string, string>(
  INGREDIENT_CATEGORIES.flatMap((category) => [
    [normalizeStructuredValue(category.value), category.value],
    [normalizeStructuredValue(category.label), category.value],
  ])
);

export interface EligibleActiveClaim {
  claim: ResearchClaim;
  document: ResearchDocument;
  chunk: ResearchChunk;
}

export interface ActiveClaimDataSource {
  loadActiveClaims(): Promise<ResearchClaim[]>;
  loadDocuments(ids: string[]): Promise<ResearchDocument[]>;
  loadChunks(ids: string[]): Promise<ResearchChunk[]>;
  loadDogConditions(dogId: string): Promise<DogHealthCondition[]>;
  loadClusterMembers?(claimIds: string[]): Promise<Array<{ cluster_id: string; claim_id: string }>>;
  loadClusters?(ids: string[]): Promise<ResearchEvidenceCluster[]>;
  loadApplicability?(clusterIds: string[]): Promise<ResearchClusterApplicability[]>;
  loadDogFindings?(dogId: string): Promise<DogDocumentFinding[]>;
  loadDogRestrictions?(dogId: string): Promise<Array<{ substance: string }>>;
  loadDogOutcomeMetrics?(dogId: string): Promise<Array<{ metric: string }>>;
}

export interface ActiveClaimRetrievalResult {
  evidenceByFoodId: Map<string, ResearchEvidence[]>;
  eligibleClaimCount: number;
  unsupportedClaimIds: string[];
}

export interface SubjectMatchResult {
  supported: boolean;
  matches: boolean;
  reason: string;
}

function normalizeStructuredValue(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function ingredientNames(food: FoodFull): string[] {
  const names: string[] = [];
  const walk = (items: FoodFull['ingredients']) => {
    for (const item of items) {
      names.push(item.name);
      walk(item.sub_ingredients);
    }
  };
  walk(food.ingredients);
  names.push(...food.additives.map((item) => item.name));
  return names;
}

function ingredientCategories(food: FoodFull): Set<string> {
  const categories = new Set<string>();
  const walk = (items: FoodFull['ingredients']) => {
    for (const item of items) {
      if (item.category) categories.add(item.category);
      walk(item.sub_ingredients);
    }
  };
  walk(food.ingredients);
  for (const additive of food.additives) categories.add(additive.category);
  return categories;
}

export function matchClaimSubject(
  subjectType: ResearchClaimSubjectType,
  subjectValue: string,
  food: FoodFull
): SubjectMatchResult {
  if (subjectType === 'ingredient') {
    const subject = canonicalIngredientKey(subjectValue);
    const matches = ingredientNames(food).some(
      (name) => canonicalIngredientKey(name) === subject
    );
    return { supported: true, matches, reason: matches ? 'ingredient_exact' : 'ingredient_absent' };
  }

  if (subjectType === 'nutrient') {
    const normalized = normalizeStructuredValue(subjectValue);
    if (!Object.prototype.hasOwnProperty.call(NUTRIENT_MATCH_RULES, normalized)) {
      return { supported: false, matches: false, reason: 'unsupported_nutrient' };
    }
    const rule = NUTRIENT_MATCH_RULES[normalized];

    const columnMatch =
      rule.column !== undefined && food.nutrients[rule.column] !== null;
    const allowedDeclaredNames = new Set(
      (rule.declaredNames ?? []).map(canonicalIngredientKey)
    );
    const declaredMatch =
      allowedDeclaredNames.size > 0 &&
      ingredientNames(food).some((name) =>
        allowedDeclaredNames.has(canonicalIngredientKey(name))
      );
    const matches = columnMatch || declaredMatch;
    return { supported: true, matches, reason: matches ? 'nutrient_recorded' : 'nutrient_absent' };
  }

  if (subjectType === 'ingredient_class') {
    const category = CATEGORY_BY_SUBJECT.get(normalizeStructuredValue(subjectValue));
    if (!category) {
      return { supported: false, matches: false, reason: 'unsupported_ingredient_class' };
    }
    const matches = ingredientCategories(food).has(category);
    return { supported: true, matches, reason: matches ? 'ingredient_class_exact' : 'ingredient_class_absent' };
  }

  if (subjectType === 'processing_method') {
    const recordedType = PROCESSING_METHODS[normalizeStructuredValue(subjectValue)];
    if (!recordedType) {
      return { supported: false, matches: false, reason: 'unsupported_processing_method' };
    }
    const matches = food.food_type === recordedType;
    return { supported: true, matches, reason: matches ? 'processing_method_exact' : 'processing_method_absent' };
  }

  return { supported: false, matches: false, reason: 'unsupported_biome_marker' };
}

export function claimMatchesDog(
  claim: Pick<
    ResearchClaim,
    'applies_to_condition' | 'applies_to_life_stage' | 'direction'
  >,
  dog: Pick<Dog, 'life_stage'>,
  conditions: Pick<DogHealthCondition, 'condition'>[]
): boolean {
  // A neutral result can answer a specific clinical question, but it is not
  // additive evidence for every dog that happens to eat the studied subject.
  // Until the applicability graph can bind it to a lab finding or outcome,
  // require an explicitly reviewed condition context.
  if (claim.direction === 'neutral' && !claim.applies_to_condition) {
    return false;
  }

  if (claim.applies_to_condition) {
    const required = normalizeStructuredValue(claim.applies_to_condition);
    if (!conditions.some((row) => normalizeStructuredValue(row.condition) === required)) {
      return false;
    }
  }

  if (!claim.applies_to_life_stage || claim.applies_to_life_stage === 'all_life_stages') {
    return true;
  }
  if (!dog.life_stage) return false;
  if (claim.applies_to_life_stage === 'growth') return dog.life_stage === 'puppy';
  return claim.applies_to_life_stage === dog.life_stage;
}

export interface StructuredDogResearchContext {
  dog: Pick<Dog, 'life_stage'>;
  conditions: Pick<DogHealthCondition, 'condition'>[];
  findings: Pick<
    DogDocumentFinding,
    'marker_name' | 'value' | 'interpretation_flag' | 'review_status'
  >[];
  restrictions: Array<{ substance: string }>;
  outcomeMetrics: Array<{ metric: string }>;
}

export function clusterMatchesDogContext(
  applicability: ResearchClusterApplicability[],
  context: StructuredDogResearchContext
): { matches: boolean; matched: string[] } {
  const required = applicability.filter((row) => row.required);
  if (required.length === 0) return { matches: false, matched: [] };
  const matched: string[] = [];
  for (const row of required) {
    const key = normalizeStructuredValue(row.context_key);
    const value = row.context_value
      ? normalizeStructuredValue(row.context_value)
      : null;
    let rowMatches = false;
    if (row.context_type === 'health_condition') {
      rowMatches = context.conditions.some(
        (condition) => normalizeStructuredValue(condition.condition) === key
      );
    } else if (row.context_type === 'life_stage') {
      const expected = key === 'growth' ? 'puppy' : key;
      rowMatches =
        context.dog.life_stage !== undefined &&
        context.dog.life_stage !== null &&
        normalizeStructuredValue(context.dog.life_stage) === expected;
    } else if (row.context_type === 'restriction') {
      rowMatches = context.restrictions.some(
        (restriction) => normalizeStructuredValue(restriction.substance) === key
      );
    } else if (row.context_type === 'outcome_metric') {
      rowMatches = context.outcomeMetrics.some(
        (outcome) => normalizeStructuredValue(outcome.metric) === key
      );
    } else if (row.context_type === 'document_finding') {
      rowMatches = context.findings.some((finding) => {
        if (finding.review_status !== 'accepted') return false;
        if (normalizeStructuredValue(finding.marker_name) !== key) return false;
        if (!value) return true;
        return [finding.value, finding.interpretation_flag]
          .filter((candidate): candidate is string | number => candidate !== null)
          .some(
            (candidate) => normalizeStructuredValue(String(candidate)) === value
          );
      });
    }
    if (!rowMatches) return { matches: false, matched: [] };
    matched.push(
      `${row.context_type.replace(/_/g, ' ')}: ${row.context_key}${
        row.context_value ? ` = ${row.context_value}` : ''
      }`
    );
  }
  return { matches: true, matched };
}

/**
 * Reassert every runtime eligibility invariant in memory even though the first
 * database query already filters the obvious status/review/scope fields.
 */
export function buildEligibleActiveClaims(
  claims: ResearchClaim[],
  documents: ResearchDocument[],
  chunks: ResearchChunk[]
): EligibleActiveClaim[] {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  return claims.flatMap((claim) => {
    if (
      claim.status !== 'active' ||
      !claim.reviewed_by ||
      !claim.reviewed_at ||
      claim.evidence_scope !== 'canine_direct'
    ) {
      return [];
    }

    const document = documentsById.get(claim.document_id);
    const chunk = chunksById.get(claim.chunk_id);
    if (
      !document ||
      document.retracted === true ||
      document.superseded_by ||
      !chunk ||
      chunk.document_id !== document.id ||
      claim.supporting_quote.trim().length === 0 ||
      !chunk.content.includes(claim.supporting_quote)
    ) {
      return [];
    }

    // A runtime evidence card must be able to state how the source was
    // accessed. Unknown access metadata is not relabelled or guessed.
    if (
      document.access_type === 'metadata_pending' ||
      (
        !document.access_type &&
        document.abstract_only !== true &&
        document.open_access !== true
      )
    ) {
      return [];
    }

    return [{ claim, document, chunk }];
  });
}

export function toResearchEvidence(
  item: EligibleActiveClaim,
  cluster?: ResearchEvidenceCluster,
  matchedDogContext: string[] = []
): ResearchEvidence {
  const { claim, document } = item;
  return {
    claim_id: claim.id,
    claim_identity: claim.claim_identity,
    subject_type: cluster?.subject_type ?? claim.subject_type,
    subject_value: cluster?.subject_value ?? claim.subject_value,
    direction: cluster?.direction ?? claim.direction,
    effect_summary: cluster?.cautious_summary ?? claim.effect_summary,
    supporting_quote: claim.supporting_quote,
    evidence_grade: claim.evidence_grade,
    grading_inputs_complete: claim.grading_inputs_complete,
    access_type:
      document.access_type === 'uploaded_full_text_private'
        ? 'uploaded_full_text_private'
        : document.abstract_only === true || document.access_type === 'abstract_only'
          ? 'abstract_only'
          : 'open_access_full_text',
    title: document.title?.trim() || 'Untitled research source',
    doi: document.doi ?? null,
    source_url: document.source_url ?? null,
    cluster_id: cluster?.id ?? null,
    outcome_type: cluster?.outcome_type ?? null,
    outcome_value: cluster?.outcome_value ?? null,
    matched_dog_context: matchedDogContext,
  };
}

/**
 * Gate 4 policy boundary: evidence is visible but contributes no ranking value,
 * regardless of direction or grade. A separately reviewed policy is required
 * before any supports/cautions adjustment can exist.
 */
export function researchRankingResult(
  directions: readonly ResearchClaimDirection[] = []
): ResearchRelevanceResult {
  return {
    score: 0,
    summary:
      directions.length > 0
        ? 'Reviewed research evidence is shown separately and does not affect ranking.'
        : 'No matching active reviewed research evidence was found; research does not affect ranking.',
  };
}

export function createActiveClaimEvidenceRetriever(source: ActiveClaimDataSource) {
  return async function retrieveActiveClaimEvidence(
    dog: Pick<Dog, 'id' | 'life_stage'>,
    foods: FoodFull[]
  ): Promise<ActiveClaimRetrievalResult> {
    const [claims, conditions, findings, restrictions, outcomeMetrics] = await Promise.all([
      source.loadActiveClaims(),
      source.loadDogConditions(dog.id),
      source.loadDogFindings?.(dog.id) ?? Promise.resolve([]),
      source.loadDogRestrictions?.(dog.id) ?? Promise.resolve([]),
      source.loadDogOutcomeMetrics?.(dog.id) ?? Promise.resolve([]),
    ]);
    const documentIds = [...new Set(claims.map((claim) => claim.document_id))];
    const chunkIds = [...new Set(claims.map((claim) => claim.chunk_id))];
    const [documents, chunks, clusterMembers] = await Promise.all([
      source.loadDocuments(documentIds),
      source.loadChunks(chunkIds),
      source.loadClusterMembers?.(claims.map((claim) => claim.id)) ?? Promise.resolve([]),
    ]);
    const clusterIds = [...new Set(clusterMembers.map((member) => member.cluster_id))];
    const [clusters, applicability] = await Promise.all([
      source.loadClusters?.(clusterIds) ?? Promise.resolve([]),
      source.loadApplicability?.(clusterIds) ?? Promise.resolve([]),
    ]);
    const clustersById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const memberClusterIdsByClaim = new Map<string, string[]>();
    for (const member of clusterMembers) {
      const ids = memberClusterIdsByClaim.get(member.claim_id) ?? [];
      ids.push(member.cluster_id);
      memberClusterIdsByClaim.set(member.claim_id, ids);
    }
    const applicabilityByCluster = new Map<string, ResearchClusterApplicability[]>();
    for (const row of applicability) {
      const rows = applicabilityByCluster.get(row.cluster_id) ?? [];
      rows.push(row);
      applicabilityByCluster.set(row.cluster_id, rows);
    }
    const dogContext: StructuredDogResearchContext = {
      dog,
      conditions,
      findings,
      restrictions,
      outcomeMetrics,
    };
    const matchedClusterByClaim = new Map<
      string,
      { cluster: ResearchEvidenceCluster; matched: string[] }
    >();
    const eligible = buildEligibleActiveClaims(claims, documents, chunks).filter((item) => {
      const memberClusterIds = memberClusterIdsByClaim.get(item.claim.id) ?? [];
      if (memberClusterIds.length === 0) {
        return claimMatchesDog(item.claim, dog, conditions);
      }
      for (const clusterId of memberClusterIds) {
        const cluster = clustersById.get(clusterId);
        if (
          !cluster ||
          cluster.status !== 'active' ||
          !cluster.reviewed_by ||
          !cluster.reviewed_at
        ) {
          continue;
        }
        const contextMatch = clusterMatchesDogContext(
          applicabilityByCluster.get(clusterId) ?? [],
          dogContext
        );
        if (contextMatch.matches) {
          matchedClusterByClaim.set(item.claim.id, {
            cluster,
            matched: contextMatch.matched,
          });
          return true;
        }
      }
      return false;
    });

    const evidenceByFoodId = new Map<string, ResearchEvidence[]>();
    const unsupportedClaimIds = new Set<string>();
    for (const food of foods) {
      const evidence: ResearchEvidence[] = [];
      for (const item of eligible) {
        const clusterMatch = matchedClusterByClaim.get(item.claim.id);
        const match = matchClaimSubject(
          clusterMatch?.cluster.subject_type ?? item.claim.subject_type,
          clusterMatch?.cluster.subject_value ?? item.claim.subject_value,
          food
        );
        if (!match.supported) {
          unsupportedClaimIds.add(item.claim.id);
        } else if (match.matches) {
          evidence.push(
            toResearchEvidence(
              item,
              clusterMatch?.cluster,
              clusterMatch?.matched ?? []
            )
          );
        }
      }
      evidenceByFoodId.set(food.id, evidence);
    }

    return {
      evidenceByFoodId,
      eligibleClaimCount: eligible.length,
      unsupportedClaimIds: [...unsupportedClaimIds],
    };
  };
}

async function queryRows<T>(
  table: string,
  configure: (query: ReturnType<typeof supabaseAdmin.from>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const { data, error } = await configure(supabaseAdmin.from(table));
  if (error) throw new Error(`Active research retrieval failed for ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

const supabaseActiveClaimDataSource: ActiveClaimDataSource = {
  loadActiveClaims: () =>
    queryRows<ResearchClaim>('research_claims', (query) =>
      query
        .select('*')
        .eq('status', 'active')
        .eq('evidence_scope', 'canine_direct')
        .not('reviewed_by', 'is', null)
        .not('reviewed_at', 'is', null)
    ),
  loadDocuments: (ids) =>
    ids.length === 0
      ? Promise.resolve([])
      : queryRows<ResearchDocument>('research_documents', (query) =>
          query.select('*').in('id', ids)
        ),
  loadChunks: (ids) =>
    ids.length === 0
      ? Promise.resolve([])
      : queryRows<ResearchChunk>('research_chunks', (query) =>
          query.select('id, document_id, content, chunk_index').in('id', ids)
        ),
  loadDogConditions: (dogId) =>
    queryRows<DogHealthCondition>('dog_health_conditions', (query) =>
      query.select('id, dog_id, condition, diagnosed_date, source, notes, created_at').eq('dog_id', dogId)
    ),
  loadClusterMembers: (claimIds) =>
    claimIds.length === 0
      ? Promise.resolve([])
      : queryRows<{ cluster_id: string; claim_id: string }>(
          'research_evidence_cluster_members',
          (query) => query.select('cluster_id, claim_id').in('claim_id', claimIds)
        ),
  loadClusters: (ids) =>
    ids.length === 0
      ? Promise.resolve([])
      : queryRows<ResearchEvidenceCluster>('research_evidence_clusters', (query) =>
          query.select('*').in('id', ids)
        ),
  loadApplicability: (clusterIds) =>
    clusterIds.length === 0
      ? Promise.resolve([])
      : queryRows<ResearchClusterApplicability>(
          'research_cluster_applicability',
          (query) => query.select('*').in('cluster_id', clusterIds)
        ),
  loadDogFindings: (dogId) =>
    queryRows<DogDocumentFinding>('dog_document_findings', (query) =>
      query
        .select('*')
        .eq('dog_id', dogId)
        .eq('review_status', 'accepted')
    ),
  loadDogRestrictions: (dogId) =>
    queryRows<{ substance: string }>('dog_restrictions', (query) =>
      query.select('substance').eq('dog_id', dogId)
    ),
  loadDogOutcomeMetrics: (dogId) =>
    queryRows<{ metric: string }>('dog_log_entries', (query) =>
      query.select('metric').eq('dog_id', dogId)
    ),
};

export const retrieveActiveClaimEvidence = createActiveClaimEvidenceRetriever(
  supabaseActiveClaimDataSource
);
