/**
 * Discovery asks where a potentially relevant document may exist. This module
 * runs later and answers a different question: whether the acquired record is
 * admissible for the declared evidence scope. Source permission is evaluated
 * separately in researchLiteratureSources.ts.
 */

export type EvidenceAdmissibilityRejectionCode =
  | 'evidence_retracted'
  | 'evidence_not_canine_direct';

export interface EvidenceAdmissibilityInput {
  evidenceScope: 'canine_direct' | 'veterinary_methodology';
  species: string | null;
  meshHeadings: string[];
  retracted: boolean;
}

export type EvidenceAdmissibilityDecision =
  | {
      admissible: true;
      recommendationEvidenceEligible: boolean;
      reason: 'canine_direct' | 'methodology_context_only';
    }
  | {
      admissible: false;
      recommendationEvidenceEligible: false;
      code: EvidenceAdmissibilityRejectionCode;
    };

export function evaluateResearchEvidenceAdmissibility(
  input: EvidenceAdmissibilityInput
): EvidenceAdmissibilityDecision {
  if (input.retracted) {
    return {
      admissible: false,
      recommendationEvidenceEligible: false,
      code: 'evidence_retracted',
    };
  }
  if (input.evidenceScope === 'veterinary_methodology') {
    return {
      admissible: true,
      recommendationEvidenceEligible: false,
      reason: 'methodology_context_only',
    };
  }
  if (input.species !== 'dog' || !input.meshHeadings.includes('Dogs')) {
    return {
      admissible: false,
      recommendationEvidenceEligible: false,
      code: 'evidence_not_canine_direct',
    };
  }
  return {
    admissible: true,
    recommendationEvidenceEligible: true,
    reason: 'canine_direct',
  };
}
