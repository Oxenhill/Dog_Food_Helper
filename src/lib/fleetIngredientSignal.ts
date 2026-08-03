import { canonicalIngredientKey } from './compositionParser';
import { supabaseAdmin } from './supabase';
import {
  buildEligibleActiveClaims,
  supabaseActiveClaimDataSource,
  toResearchEvidence,
} from './activeClaimRetrieval';
import { computeResearchScoringTrace } from './researchScoringPolicy';
import type { EvidenceBasis, OutcomeMetric, ResearchEvidence } from './types';

/**
 * The "probe" — fleet-wide ingredient signal, compared against literature.
 *
 * Closes the loop the owner named directly (2026-08-03): "the dogs data is
 * also a research layer... their data is possibly the most valuable of all
 * because its real life." Gate 5 (researchScoringPolicy.ts) lets literature
 * move a food's score. This module answers a different question — for a
 * given ingredient, does the WHOLE FLEET's real logged outcome data agree
 * with what the literature says, or diverge from it?
 *
 * Deliberately surface-only. Nothing here writes back into
 * researchScoringPolicy.ts's constants, a claim's grade/direction, or any
 * scoring path — it produces an admin-facing comparison only, the same
 * no-silent-edit boundary CLAUDE.md's AI-governance section holds for
 * anything touching approved research. hardFilter.ts is not imported and
 * cannot be reached from here.
 */

// ---------------------------------------------------------------------------
// Fleet correlation side (real dog outcomes)
// ---------------------------------------------------------------------------

/**
 * Confidence tiers by DISTINCT DOG COUNT, not raw signal-row count — one
 * chatty dog with many logs must not be able to fake a fleet-wide pattern.
 * Scaled up from correlationEngine.ts's per-dog CONFIDENCE_THRESHOLDS
 * (3/6/16 eligible logs for one dog) to a fleet of many dogs. Tunable, same
 * spirit as that constant.
 */
export const FLEET_CONFIDENCE_THRESHOLDS = {
  low_sample_min: 5,
  preliminary_min: 10,
  established_min: 25,
};

export type FleetConfidenceTier = 'low_sample' | 'preliminary' | 'established';

/** Below low_sample_min, a fleet pattern is not shown at all — noise, not signal. */
export function fleetConfidenceTierForDogCount(dogCount: number): FleetConfidenceTier | null {
  if (dogCount < FLEET_CONFIDENCE_THRESHOLDS.low_sample_min) return null;
  if (dogCount < FLEET_CONFIDENCE_THRESHOLDS.preliminary_min) return 'low_sample';
  if (dogCount < FLEET_CONFIDENCE_THRESHOLDS.established_min) return 'preliminary';
  return 'established';
}

/** Average strength within this band of 0 reads as no pattern, not a weak one either way. */
const FLEET_DIRECTION_NEUTRAL_BAND = 0.1;

export type FleetDirection = 'better_outcomes' | 'worse_outcomes' | 'no_clear_pattern';

export interface FleetIngredientPattern {
  ingredient_key: string;
  dog_count: number;
  metrics: OutcomeMetric[];
  avg_strength: number; // [-1, 1]
  direction: FleetDirection;
  confidence_tier: FleetConfidenceTier;
}

export interface FleetSignalRow {
  dog_id: string;
  ingredient_name: string;
  outcome_metric: OutcomeMetric;
  correlation_strength: number | null | undefined;
  evidence_basis: EvidenceBasis | undefined;
}

/**
 * Pure. Reduces raw signal rows across every dog to one pattern per
 * canonical ingredient, applying the fleet confidence floor.
 *
 * Per (dog, ingredient, metric), at most one row counts — preferring
 * 'food_switch' over 'single_food_period' when a dog has both for the exact
 * same pair, same preference correlationScoring.ts applies dog-by-dog.
 */
export function computeFleetIngredientPatterns(
  signals: readonly FleetSignalRow[]
): FleetIngredientPattern[] {
  const perDogPair = new Map<string, FleetSignalRow>();
  for (const row of signals) {
    if (row.correlation_strength == null) continue;
    const key = `${row.dog_id}::${canonicalIngredientKey(row.ingredient_name)}::${row.outcome_metric}`;
    const existing = perDogPair.get(key);
    if (!existing || (row.evidence_basis === 'food_switch' && existing.evidence_basis !== 'food_switch')) {
      perDogPair.set(key, row);
    }
  }

  const byIngredient = new Map<
    string,
    { dogIds: Set<string>; metrics: Set<OutcomeMetric>; strengths: number[] }
  >();
  for (const row of perDogPair.values()) {
    const ingredientKey = canonicalIngredientKey(row.ingredient_name);
    const group = byIngredient.get(ingredientKey) ?? {
      dogIds: new Set<string>(),
      metrics: new Set<OutcomeMetric>(),
      strengths: [] as number[],
    };
    group.dogIds.add(row.dog_id);
    group.metrics.add(row.outcome_metric);
    group.strengths.push(row.correlation_strength as number);
    byIngredient.set(ingredientKey, group);
  }

  const patterns: FleetIngredientPattern[] = [];
  for (const [ingredientKey, group] of byIngredient) {
    const dogCount = group.dogIds.size;
    const tier = fleetConfidenceTierForDogCount(dogCount);
    if (!tier) continue;
    const avgStrength =
      group.strengths.reduce((sum, s) => sum + s, 0) / group.strengths.length;
    const direction: FleetDirection =
      avgStrength > FLEET_DIRECTION_NEUTRAL_BAND
        ? 'better_outcomes'
        : avgStrength < -FLEET_DIRECTION_NEUTRAL_BAND
          ? 'worse_outcomes'
          : 'no_clear_pattern';
    patterns.push({
      ingredient_key: ingredientKey,
      dog_count: dogCount,
      metrics: [...group.metrics],
      avg_strength: Math.round(avgStrength * 1000) / 1000,
      direction,
      confidence_tier: tier,
    });
  }
  return patterns;
}

export async function fetchFleetSignalRows(): Promise<FleetSignalRow[]> {
  const { data, error } = await supabaseAdmin
    .from('ingredient_outcome_signals')
    .select('dog_id, ingredient_name, outcome_metric, correlation_strength, evidence_basis')
    .not('confidence_flag', 'is', null);
  if (error) throw error;
  return (data ?? []) as FleetSignalRow[];
}

// ---------------------------------------------------------------------------
// Literature side (what the reviewed evidence corpus says, fleet-wide)
// ---------------------------------------------------------------------------

export type FleetLiteratureDirection = 'supports' | 'cautions_against' | 'contested';

export interface FleetLiteratureVerdict {
  ingredient_key: string;
  direction: FleetLiteratureDirection;
  net_deviation: number;
  topic_count: number;
  summary: string;
}

/**
 * Every active, reviewed claim whose subject is an ingredient (or an
 * ingredient-subject cluster), scored with the exact same
 * computeResearchScoringTrace() Gate 5 uses per food — just grouped by
 * ingredient across the whole corpus instead of matched to one food's
 * declared composition. No dog-context gating (life stage / condition
 * applicability) is applied here: this answers "what does the literature
 * broadly say about this ingredient", not "would this claim currently apply
 * to one specific dog".
 */
export async function computeFleetLiteratureVerdicts(): Promise<FleetLiteratureVerdict[]> {
  const claims = await supabaseActiveClaimDataSource.loadActiveClaims();
  const documentIds = [...new Set(claims.map((claim) => claim.document_id))];
  const chunkIds = [...new Set(claims.map((claim) => claim.chunk_id))];
  const [documents, chunks] = await Promise.all([
    supabaseActiveClaimDataSource.loadDocuments(documentIds),
    supabaseActiveClaimDataSource.loadChunks(chunkIds),
  ]);
  const eligible = buildEligibleActiveClaims(claims, documents, chunks);

  const clusterMembers =
    (await supabaseActiveClaimDataSource.loadClusterMembers?.(eligible.map((item) => item.claim.id))) ??
    [];
  const clusterIds = [...new Set(clusterMembers.map((member) => member.cluster_id))];
  const clusters = (await supabaseActiveClaimDataSource.loadClusters?.(clusterIds)) ?? [];
  const clustersById = new Map(
    clusters
      .filter((cluster) => cluster.status === 'active' && cluster.reviewed_by && cluster.reviewed_at)
      .map((cluster) => [cluster.id, cluster])
  );
  const clusterIdByClaim = new Map(clusterMembers.map((member) => [member.claim_id, member.cluster_id]));

  const evidenceByIngredient = new Map<string, ResearchEvidence[]>();
  for (const item of eligible) {
    const clusterId = clusterIdByClaim.get(item.claim.id);
    const cluster = clusterId ? clustersById.get(clusterId) : undefined;
    const subjectType = cluster?.subject_type ?? item.claim.subject_type;
    const subjectValue = cluster?.subject_value ?? item.claim.subject_value;
    if (subjectType !== 'ingredient') continue;

    const ingredientKey = canonicalIngredientKey(subjectValue);
    const evidence = toResearchEvidence(item, cluster);
    const list = evidenceByIngredient.get(ingredientKey) ?? [];
    list.push(evidence);
    evidenceByIngredient.set(ingredientKey, list);
  }

  const verdicts: FleetLiteratureVerdict[] = [];
  for (const [ingredientKey, evidenceList] of evidenceByIngredient) {
    const trace = computeResearchScoringTrace(evidenceList);
    if (trace.topics.length === 0) continue; // neutral/inconclusive only -- nothing to compare
    const direction: FleetLiteratureDirection = trace.topics.some((topic) => topic.direction === 'contested')
      ? 'contested'
      : trace.final_deviation >= 0
        ? 'supports'
        : 'cautions_against';
    verdicts.push({
      ingredient_key: ingredientKey,
      direction,
      net_deviation: trace.final_deviation,
      topic_count: trace.topics.length,
      summary: trace.summary,
    });
  }
  return verdicts;
}

// ---------------------------------------------------------------------------
// Combined report
// ---------------------------------------------------------------------------

export type FleetSignalAgreement = 'agrees' | 'diverges' | 'inconclusive' | 'literature_only' | 'fleet_only';

export interface FleetSignalReportRow {
  ingredient_key: string;
  literature: FleetLiteratureVerdict | null;
  fleet: FleetIngredientPattern | null;
  agreement: FleetSignalAgreement;
}

function agreementFor(
  literature: FleetLiteratureVerdict | null,
  fleet: FleetIngredientPattern | null
): FleetSignalAgreement {
  if (literature && !fleet) return 'literature_only';
  if (!literature && fleet) return 'fleet_only';
  if (!literature || !fleet) return 'literature_only';
  if (literature.direction === 'contested' || fleet.direction === 'no_clear_pattern') return 'inconclusive';
  const literatureIsPositive = literature.direction === 'supports';
  const fleetIsPositive = fleet.direction === 'better_outcomes';
  return literatureIsPositive === fleetIsPositive ? 'agrees' : 'diverges';
}

const AGREEMENT_SORT_ORDER: Record<FleetSignalAgreement, number> = {
  diverges: 0,
  agrees: 1,
  inconclusive: 2,
  fleet_only: 3,
  literature_only: 4,
};

export async function computeFleetSignalReport(): Promise<FleetSignalReportRow[]> {
  const [signalRows, literatureVerdicts] = await Promise.all([
    fetchFleetSignalRows(),
    computeFleetLiteratureVerdicts(),
  ]);
  const fleetPatterns = computeFleetIngredientPatterns(signalRows);
  const fleetByKey = new Map(fleetPatterns.map((pattern) => [pattern.ingredient_key, pattern]));
  const literatureByKey = new Map(literatureVerdicts.map((verdict) => [verdict.ingredient_key, verdict]));
  const allKeys = new Set([...fleetByKey.keys(), ...literatureByKey.keys()]);

  const rows: FleetSignalReportRow[] = [];
  for (const key of allKeys) {
    const literature = literatureByKey.get(key) ?? null;
    const fleet = fleetByKey.get(key) ?? null;
    rows.push({ ingredient_key: key, literature, fleet, agreement: agreementFor(literature, fleet) });
  }

  rows.sort((a, b) => {
    const orderDiff = AGREEMENT_SORT_ORDER[a.agreement] - AGREEMENT_SORT_ORDER[b.agreement];
    if (orderDiff !== 0) return orderDiff;
    return (b.fleet?.dog_count ?? 0) - (a.fleet?.dog_count ?? 0);
  });
  return rows;
}
