import { normalizeResearchStructuredValue } from './researchEvidenceReview';
import type { EvidenceGrade, ResearchClaimDirection, ResearchEvidence } from './types';
import type { ResearchRelevanceResult } from './researchScoring';

/**
 * Gate 5 research scoring policy.
 *
 * Gate 4 (docs/research-gate4-2026-07-29.md) deliberately shipped research
 * evidence as informational-only: every direction and grade scored exactly
 * zero. This module is the "separately reviewed scoring policy" that document
 * said would be required before evidence could move a ranked score --
 * approved by the owner on 2026-08-03.
 *
 * Every number below is named and explained here on purpose (owner:
 * "inspectable and tunable... make sure these numbers are explained in a way
 * admin can understand them as a human"). The admin decision-trace page reads
 * this object directly to render the explanation next to each evidence item
 * -- nothing about the formula should live only as an unlabelled constant
 * buried in arithmetic.
 *
 * Non-negotiable boundary: this module only ever changes what a food's
 * research_relevance number is. It has no access to, and must never gain
 * access to, the hard-filter exclusion decision (hardFilter.ts). Excluding or
 * re-admitting a food is not a scoring question.
 */

interface Explained<T> {
  value: T;
  explain: string;
}

type AccessType = ResearchEvidence['access_type'];

export const RESEARCH_SCORING_POLICY = {
  neutralScore: {
    value: 0.5,
    explain: 'A food with no usable research evidence (or only neutral/inconclusive evidence) scores exactly neutral -- research contributes nothing either way.',
  } satisfies Explained<number>,

  gradeWeight: {
    A: { value: 1.0, explain: 'Grade A evidence (the strongest study designs) counts at full strength.' },
    B: { value: 0.8, explain: 'Grade B evidence counts at 80% of a grade A finding.' },
    C: { value: 0.6, explain: 'Grade C evidence counts at 60% of a grade A finding.' },
    D: { value: 0.35, explain: 'Grade D evidence counts at 35% of a grade A finding -- a real but weak signal.' },
    E: { value: 0.15, explain: 'Grade E evidence counts at only 15% of a grade A finding -- it barely moves the score.' },
  } satisfies Record<EvidenceGrade, Explained<number>>,

  incompleteGradingMultiplier: {
    value: 0.5,
    explain: 'When a claim is missing grading inputs it needed (e.g. sample size, funding declaration), its contribution is cut in half. Thin evidence still counts, but never as much as fully-graded evidence carrying the same letter grade.',
  } satisfies Explained<number>,

  accessWeight: {
    open_access_full_text: { value: 1.0, explain: 'The full paper was available to check, not just a summary -- full weight.' },
    uploaded_full_text_private: { value: 1.0, explain: 'The full paper was available to check, not just a summary -- full weight.' },
    abstract_only: { value: 0.75, explain: 'Only the abstract could be checked, not the full paper, so its weight is reduced to 75%.' },
  } satisfies Record<AccessType, Explained<number>>,

  corroborationBonusPerFamily: {
    value: 0.05,
    explain: 'Every additional INDEPENDENT study backing the exact same finding -- a genuinely different paper, not a preprint or press release repeating one already counted -- adds a small bonus on top of the strongest single study.',
  } satisfies Explained<number>,

  maxCorroborationBonus: {
    value: 0.15,
    explain: 'The corroboration bonus for one finding is capped at 0.15 in total, so a pile of weak repeats can never out-vote one strong independent study.',
  } satisfies Explained<number>,

  maxDeviation: {
    value: 0.3,
    explain: 'Research can move a food’s score at most 0.3 away from neutral (0.5) in either direction, so the final research_relevance always lands between 0.2 and 0.8. Research is one voice alongside nutrition, budget and your dog’s own logged history -- never the deciding one.',
  } satisfies Explained<number>,
} as const;

function gradeWeight(grade: EvidenceGrade): number {
  return RESEARCH_SCORING_POLICY.gradeWeight[grade].value;
}

function completenessMultiplier(complete: boolean): number {
  return complete ? 1 : RESEARCH_SCORING_POLICY.incompleteGradingMultiplier.value;
}

function accessWeight(accessType: AccessType): number {
  return RESEARCH_SCORING_POLICY.accessWeight[accessType].value;
}

function describeStrength(item: ResearchEvidence, strength: number): string {
  const parts = [
    `grade ${item.evidence_grade} (${Math.round(gradeWeight(item.evidence_grade) * 100)}% weight)`,
    item.grading_inputs_complete
      ? 'fully graded'
      : `incomplete grading (×${RESEARCH_SCORING_POLICY.incompleteGradingMultiplier.value})`,
    item.access_type === 'abstract_only'
      ? `abstract only (×${RESEARCH_SCORING_POLICY.accessWeight.abstract_only.value})`
      : 'full text available',
  ];
  return `${parts.join(', ')} → strength ${strength.toFixed(3)}`;
}

export type ResearchTopicDirection = 'supports' | 'cautions_against' | 'contested';

export interface ResearchScoringTopicResult {
  topic_key: string;
  topic_label: string;
  direction: ResearchTopicDirection;
  contribution: number;
  best_evidence_claim_id: string;
  best_strength: number;
  independent_family_count: number;
  corroboration_bonus: number;
  explain: string;
}

export interface ResearchInertEvidenceItem {
  claim_id: string;
  direction: ResearchClaimDirection;
  reason: string;
}

export interface ResearchScoringTrace {
  topics: ResearchScoringTopicResult[];
  inert_evidence: ResearchInertEvidenceItem[];
  raw_sum: number;
  clamped_sum: number;
  final_deviation: number;
  score: number;
  summary: string;
}

interface SideEvaluation {
  best: ResearchEvidence;
  bestStrength: number;
  familyCount: number;
  bonus: number;
}

function evaluateSide(items: ResearchEvidence[]): SideEvaluation | null {
  if (items.length === 0) return null;
  const strengths = items.map((item) => ({
    item,
    strength:
      gradeWeight(item.evidence_grade) *
      completenessMultiplier(item.grading_inputs_complete) *
      accessWeight(item.access_type),
  }));
  strengths.sort((a, b) => b.strength - a.strength);
  const best = strengths[0];
  const independentFamilies = new Set(items.map((item) => item.study_family_id));
  const extraFamilies = Math.max(0, independentFamilies.size - 1);
  const bonus = Math.min(
    extraFamilies * RESEARCH_SCORING_POLICY.corroborationBonusPerFamily.value,
    RESEARCH_SCORING_POLICY.maxCorroborationBonus.value
  );
  return { best: best.item, bestStrength: best.strength, familyCount: independentFamilies.size, bonus };
}

/**
 * Topic-groups evidence, scores each topic, sums and clamps. Every food's
 * evidence list is scored independently -- there is no cross-food state.
 *
 * Topic key: the reviewed cluster id when evidence came through the P4/P5
 * cluster workflow (a cluster already IS one owner-reviewed finding), else
 * `claim:{subject_type}:{subject_value}` for a direct, unclustered claim.
 * Grouping this way means an unrelated supports finding about digestibility
 * and a cautions finding about allergenicity never cancel each other out just
 * because both are attached to the same food.
 */
export function computeResearchScoringTrace(evidence: readonly ResearchEvidence[]): ResearchScoringTrace {
  const inert: ResearchInertEvidenceItem[] = [];
  const byTopic = new Map<string, ResearchEvidence[]>();

  for (const item of evidence) {
    if (item.direction === 'neutral' || item.direction === 'insufficient_evidence') {
      inert.push({
        claim_id: item.claim_id,
        direction: item.direction,
        reason:
          item.direction === 'neutral'
            ? 'Neutral evidence is shown for context but never moves a score in either direction.'
            : 'Insufficient evidence means the research itself could not establish an effect, so it cannot move a score.',
      });
      continue;
    }
    const topicKey =
      item.cluster_id ??
      `claim:${item.subject_type}:${normalizeResearchStructuredValue(item.subject_value)}`;
    const list = byTopic.get(topicKey) ?? [];
    list.push(item);
    byTopic.set(topicKey, list);
  }

  const topics: ResearchScoringTopicResult[] = [];
  for (const [topicKey, items] of byTopic) {
    const supportsItems = items.filter((item) => item.direction === 'supports');
    const cautionsItems = items.filter((item) => item.direction === 'cautions_against');
    const supportsSide = evaluateSide(supportsItems);
    const cautionsSide = evaluateSide(cautionsItems);

    const supportsContribution = supportsSide ? supportsSide.bestStrength + supportsSide.bonus : 0;
    const cautionsContribution = cautionsSide ? cautionsSide.bestStrength + cautionsSide.bonus : 0;
    const net = supportsContribution - cautionsContribution;

    const winningSide = net >= 0 ? supportsSide : cautionsSide;
    if (!winningSide) continue;

    const direction: ResearchTopicDirection =
      supportsSide && cautionsSide
        ? 'contested'
        : net >= 0
          ? 'supports'
          : 'cautions_against';

    const explainParts = [describeStrength(winningSide.best, winningSide.bestStrength)];
    if (winningSide.familyCount > 1) {
      explainParts.push(
        `backed by ${winningSide.familyCount} independent studies (+${winningSide.bonus.toFixed(2)} corroboration)`
      );
    }
    if (direction === 'contested') {
      const losingSide = net >= 0 ? cautionsSide : supportsSide;
      explainParts.push(
        `contested: also has evidence pointing the other way (strength ${losingSide?.bestStrength.toFixed(3)}), netted here`
      );
    }

    topics.push({
      topic_key: topicKey,
      topic_label: items[0].effect_summary || items[0].subject_value,
      direction,
      contribution: net,
      best_evidence_claim_id: winningSide.best.claim_id,
      best_strength: winningSide.bestStrength,
      independent_family_count: winningSide.familyCount,
      corroboration_bonus: winningSide.bonus,
      explain: `${explainParts.join('; ')}. Net contribution toward ${direction === 'contested' ? (net >= 0 ? 'supports' : 'cautions_against') : direction}: ${net >= 0 ? '+' : ''}${net.toFixed(3)} (before the ±${RESEARCH_SCORING_POLICY.maxDeviation.value} overall cap).`,
    });
  }

  const rawSum = topics.reduce((sum, topic) => sum + topic.contribution, 0);
  const clampedSum = Math.max(-1, Math.min(1, rawSum));
  const finalDeviation = clampedSum * RESEARCH_SCORING_POLICY.maxDeviation.value;
  const score = Math.max(
    0,
    Math.min(1, RESEARCH_SCORING_POLICY.neutralScore.value + finalDeviation)
  );

  let summary: string;
  if (topics.length === 0 && inert.length === 0) {
    summary =
      'No approved research evidence matches this food, so research does not affect its score.';
  } else if (topics.length === 0) {
    summary =
      'Reviewed research evidence exists for this food but is neutral or inconclusive, so it does not move the score either way.';
  } else {
    const movedTowards = finalDeviation >= 0 ? 'supports' : 'cautions_against';
    summary = `Reviewed research evidence shifted this food's score ${finalDeviation >= 0 ? '+' : ''}${finalDeviation.toFixed(3)} toward ${movedTowards} across ${topics.length} finding(s), within the ±${RESEARCH_SCORING_POLICY.maxDeviation.value} cap.`;
  }

  return { topics, inert_evidence: inert, raw_sum: rawSum, clamped_sum: clampedSum, final_deviation: finalDeviation, score, summary };
}

/**
 * Thin adapter to the existing ResearchRelevanceResult shape scoreFood()
 * already consumes (recommendationScoring.ts) -- no change needed there.
 */
export function computeResearchRankingResult(
  evidence: readonly ResearchEvidence[]
): ResearchRelevanceResult {
  const trace = computeResearchScoringTrace(evidence);
  return { score: trace.score, summary: trace.summary };
}
