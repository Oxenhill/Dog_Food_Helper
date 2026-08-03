import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildEligibleActiveClaims,
  claimMatchesDog,
  clusterMatchesDogContext,
  createActiveClaimEvidenceRetriever,
  matchClaimSubject,
  researchRankingResult,
  toResearchEvidence,
  type ActiveClaimDataSource,
} from '../activeClaimRetrieval';
import type { FoodFull } from '../foodFull';
import type {
  DogHealthCondition,
  ResearchClaim,
  ResearchChunk,
  ResearchDocument,
  ResearchClusterApplicability,
  ResearchEvidenceCluster,
} from '../types';

const QUOTE = 'the inclusion of 45% green lentil in extruded diets does not lower taurine';

function claim(overrides: Partial<ResearchClaim> = {}): ResearchClaim {
  return {
    id: 'claim-active',
    claim_identity: 'identity-active',
    document_id: 'document-1',
    chunk_id: 'chunk-1',
    supporting_quote: QUOTE,
    subject_type: 'ingredient',
    subject_value: 'green lentil',
    applies_to_condition: null,
    applies_to_life_stage: null,
    direction: 'supports',
    effect_summary: 'A cautious effect summary.',
    study_design: 'controlled_trial',
    species: 'dog',
    sample_size: null,
    funding_independent: null,
    is_preprint: false,
    evidence_grade: 'B',
    evidence_scope: 'canine_direct',
    missing_grading_inputs: ['sample_size', 'funding_independent'],
    grading_inputs_complete: false,
    corroborating_claim_ids: [],
    status: 'active',
    reviewed_by: 'reviewer-1',
    reviewed_at: '2026-07-29T11:57:30.393Z',
    review_note: null,
    created_at: '2026-07-29T00:00:00.000Z',
    updated_at: '2026-07-29T11:57:30.393Z',
    ...overrides,
  };
}

function document(overrides: Partial<ResearchDocument> = {}): ResearchDocument {
  return {
    id: 'document-1',
    topic: 'general',
    title: 'Green lentil and taurine in dogs',
    doi: '10.1093/jas/skab315',
    source_url: 'https://pubmed.ncbi.nlm.nih.gov/34747447/',
    retrieved_at: '2026-07-28T00:00:00.000Z',
    review_status: 'pending',
    retracted: false,
    superseded_by: null,
    open_access: false,
    abstract_only: true,
    ...overrides,
  };
}

function chunk(overrides: Partial<ResearchChunk> = {}): ResearchChunk {
  return {
    id: 'chunk-1',
    document_id: 'document-1',
    content: `Background. ${QUOTE}. Conclusion.`,
    chunk_index: 0,
    ...overrides,
  };
}

function food(overrides: Partial<FoodFull> = {}): FoodFull {
  return {
    id: 'food-1',
    brand: 'Acana',
    name: 'Senior Dog',
    food_type: 'kibble',
    price_per_kg: null,
    calories_per_kg: null,
    source_url: null,
    source_domain: null,
    last_verified_at: null,
    nutrients: {
      protein_pct: null,
      fat_pct: null,
      fibre_pct: null,
      moisture_pct: null,
      ash_pct: null,
      phosphorus_pct: null,
      sodium_pct: null,
      calcium_pct: null,
      est_digestible_carbohydrate_pct: null,
      carbohydrate_band: null,
    },
    ingredients: [
      {
        name: 'Whole green lentils',
        category: 'protein_plant',
        position: 1,
        inclusion_pct: null,
        note: null,
        sub_ingredients: [],
      },
    ],
    additives: [],
    ingredient_count: 1,
    ...overrides,
  };
}

function conditions(names: string[]): DogHealthCondition[] {
  return names.map((condition, index) => ({
    id: `condition-${index}`,
    dog_id: 'dog-1',
    condition,
    source: 'vet_diagnosed',
    created_at: '2026-07-29T00:00:00.000Z',
  }));
}

test('active matching ingredient claim appears with canonical whole/singular green-lentil matching', () => {
  const item = buildEligibleActiveClaims([claim()], [document()], [chunk()])[0];
  assert.ok(item);
  assert.equal(matchClaimSubject('ingredient', 'green lentil', food()).matches, true);
  assert.equal(toResearchEvidence(item).claim_id, 'claim-active');
});

test('active matching nutrient claim appears for an exact declared additive', () => {
  const withTaurine = food({
    ingredients: [],
    additives: [
      {
        name: 'Taurine',
        category: 'additive_nutritional',
        printed_category: 'Nutritional additives',
        sequence: 1,
        note: '1,000 mg/kg',
      },
    ],
  });
  assert.deepEqual(matchClaimSubject('nutrient', 'taurine', withTaurine), {
    supported: true,
    matches: true,
    reason: 'nutrient_recorded',
  });
});

test('nutrient columns are allowlisted and arbitrary subject values are unsupported', () => {
  const withProtein = food({
    nutrients: { ...food().nutrients, protein_pct: 31 },
  });
  assert.equal(matchClaimSubject('nutrient', 'protein', withProtein).matches, true);
  assert.equal(matchClaimSubject('nutrient', '__proto__', withProtein).supported, false);
  assert.equal(matchClaimSubject('nutrient', 'constructor', withProtein).supported, false);
});

test('queued, rejected and unreviewed claims never become eligible', () => {
  const candidates = [
    claim({ id: 'queued', status: 'queued_for_review' }),
    claim({ id: 'rejected', status: 'rejected' }),
    claim({ id: 'unreviewed', reviewed_by: null, reviewed_at: null }),
  ];
  assert.deepEqual(buildEligibleActiveClaims(candidates, [document()], [chunk()]), []);
});

test('a claim with no human reviewer but a deterministic auto-activation rule is still eligible', () => {
  const autoActivated = claim({
    id: 'auto-activated',
    reviewed_by: null,
    reviewed_at: null,
    auto_activated_by_rule: 'deterministic_grade_ab_v1',
  });
  const eligible = buildEligibleActiveClaims([autoActivated], [document()], [chunk()]);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].claim.id, 'auto-activated');
});

test('a claim with neither a human reviewer nor an auto-activation rule is never eligible', () => {
  const neither = claim({
    id: 'neither',
    reviewed_by: null,
    reviewed_at: null,
    auto_activated_by_rule: null,
  });
  assert.deepEqual(buildEligibleActiveClaims([neither], [document()], [chunk()]), []);
});

test('retracted and superseded source documents never become eligible', () => {
  assert.deepEqual(
    buildEligibleActiveClaims([claim()], [document({ retracted: true })], [chunk()]),
    []
  );
  assert.deepEqual(
    buildEligibleActiveClaims(
      [claim()],
      [document({ superseded_by: 'replacement-document' })],
      [chunk()]
    ),
    []
  );
});

test('missing document/chunk and a non-literal supporting quote suppress a claim', () => {
  assert.deepEqual(buildEligibleActiveClaims([claim()], [], [chunk()]), []);
  assert.deepEqual(buildEligibleActiveClaims([claim()], [document()], []), []);
  assert.deepEqual(
    buildEligibleActiveClaims(
      [claim({ supporting_quote: 'paraphrase not in the source' })],
      [document()],
      [chunk()]
    ),
    []
  );
});

test('condition and life-stage mismatches suppress otherwise eligible claims', () => {
  assert.equal(
    claimMatchesDog(
      claim({ applies_to_condition: 'chronic kidney disease' }),
      { life_stage: 'adult' },
      conditions(['pancreatitis'])
    ),
    false
  );
  assert.equal(
    claimMatchesDog(
      claim({ applies_to_condition: 'chronic-kidney_disease' }),
      { life_stage: 'adult' },
      conditions(['Chronic kidney disease'])
    ),
    true
  );
  assert.equal(
    claimMatchesDog(
      claim({ applies_to_life_stage: 'growth' }),
      { life_stage: 'adult' },
      []
    ),
    false
  );
  assert.equal(
    claimMatchesDog(
      claim({ applies_to_life_stage: 'growth' }),
      { life_stage: 'puppy' },
      []
    ),
    true
  );
});

test('neutral evidence without a dog-specific condition is not shown for an ingredient match alone', () => {
  assert.equal(
    claimMatchesDog(
      claim({
        direction: 'neutral',
        applies_to_condition: null,
        applies_to_life_stage: 'all_life_stages',
      }),
      { life_stage: 'adult' },
      []
    ),
    false
  );
});

test('neutral evidence can answer an explicitly reviewed clinical context', () => {
  assert.equal(
    claimMatchesDog(
      claim({
        direction: 'neutral',
        applies_to_condition: 'taurine deficiency',
      }),
      { life_stage: 'adult' },
      conditions(['Taurine Deficiency'])
    ),
    true
  );
});

function applicability(
  overrides: Partial<ResearchClusterApplicability> = {}
): ResearchClusterApplicability {
  return {
    id: 'context-1',
    cluster_id: 'cluster-1',
    context_type: 'document_finding',
    context_key: 'Dysbiosis Pattern Score',
    context_value: 'high',
    match_operator: 'exact',
    required: true,
    created_at: '2026-07-29T00:00:00.000Z',
    ...overrides,
  };
}

function cluster(
  overrides: Partial<ResearchEvidenceCluster> = {}
): ResearchEvidenceCluster {
  return {
    id: 'cluster-1',
    cluster_identity: 'a'.repeat(64),
    label: 'green lentil — Dysbiosis Pattern Score',
    subject_type: 'ingredient',
    subject_value: 'green lentil',
    outcome_type: 'biome_marker',
    outcome_value: 'Dysbiosis Pattern Score',
    direction: 'supports',
    cautious_summary: 'The study found green lentil was associated with the measured marker.',
    status: 'active',
    reviewed_by: 'reviewer-1',
    reviewed_at: '2026-07-29T12:00:00.000Z',
    review_note: null,
    created_at: '2026-07-29T11:00:00.000Z',
    updated_at: '2026-07-29T12:00:00.000Z',
    ...overrides,
  };
}

function clusteredSource(
  overrides: {
    cluster?: Partial<ResearchEvidenceCluster>;
    contexts?: ResearchClusterApplicability[];
    findingStatus?: 'accepted' | 'needs_review';
    sourceDocument?: Partial<ResearchDocument>;
  } = {}
): ActiveClaimDataSource {
  return {
    loadActiveClaims: async () => [claim()],
    loadDocuments: async () => [document(overrides.sourceDocument)],
    loadChunks: async () => [chunk()],
    loadDogConditions: async () => [],
    loadClusterMembers: async () => [
      { cluster_id: 'cluster-1', claim_id: 'claim-active' },
    ],
    loadClusters: async () => [cluster(overrides.cluster)],
    loadApplicability: async () => overrides.contexts ?? [applicability()],
    loadDogFindings: async () => [
      {
        id: 'finding-1',
        document_id: 'dog-document-1',
        dog_id: 'dog-1',
        owner_id: 'owner-1',
        finding_type: 'microbiome_marker',
        marker_name: 'Dysbiosis Pattern Score',
        value: 'high',
        unit: null,
        reference_range: null,
        interpretation_flag: null,
        source_kind: 'parsed_report',
        review_status: overrides.findingStatus ?? 'accepted',
        verbatim_source_text: 'Dysbiosis Pattern Score: high',
        created_at: '2026-07-29T00:00:00.000Z',
      },
    ],
    loadDogRestrictions: async () => [],
    loadDogOutcomeMetrics: async () => [],
  };
}

test('accepted report findings can satisfy exact structured applicability', () => {
  const result = clusterMatchesDogContext(
    [applicability()],
    {
      dog: { life_stage: 'adult' },
      conditions: [],
      restrictions: [],
      outcomeMetrics: [],
      findings: [
        {
          marker_name: 'Dysbiosis Pattern Score',
          value: 'high',
          interpretation_flag: null,
          review_status: 'accepted',
        },
      ],
    }
  );
  assert.equal(result.matches, true);
  assert.deepEqual(result.matched, [
    'document finding: Dysbiosis Pattern Score = high',
  ]);
});

test('uncertain report findings are never used as dog context', () => {
  assert.equal(
    clusterMatchesDogContext(
      [applicability()],
      {
        dog: { life_stage: 'adult' },
        conditions: [],
        restrictions: [],
        outcomeMetrics: [],
        findings: [
          {
            marker_name: 'Dysbiosis Pattern Score',
            value: 'high',
            interpretation_flag: null,
            review_status: 'needs_review',
          },
        ],
      }
    ).matches,
    false
  );
});

test('every required cluster context must match the dog', () => {
  assert.equal(
    clusterMatchesDogContext(
      [
        applicability({ context_type: 'life_stage', context_key: 'adult', context_value: null }),
        applicability({
          id: 'context-2',
          context_type: 'health_condition',
          context_key: 'IBD',
          context_value: null,
        }),
      ],
      {
        dog: { life_stage: 'adult' },
        conditions: [],
        restrictions: [],
        outcomeMetrics: [],
        findings: [],
      }
    ).matches,
    false
  );
});

test('a clustered proposition with no reviewed dog context is not runtime evidence', () => {
  assert.equal(
    clusterMatchesDogContext([], {
      dog: { life_stage: 'adult' },
      conditions: [],
      restrictions: [],
      outcomeMetrics: [],
      findings: [],
    }).matches,
    false
  );
});

test('an active reviewed cluster plus an accepted dog finding reaches the food response', async () => {
  const result = await createActiveClaimEvidenceRetriever(clusteredSource())(
    { id: 'dog-1', life_stage: 'adult' },
    [food()]
  );
  const evidence = result.evidenceByFoodId.get('food-1');
  assert.equal(evidence?.length, 1);
  assert.equal(evidence?.[0].cluster_id, 'cluster-1');
  assert.deepEqual(evidence?.[0].matched_dog_context, [
    'document finding: Dysbiosis Pattern Score = high',
  ]);
});

test('queued and rejected clusters cannot appear even when their member claim is active', async () => {
  for (const status of ['queued_for_review', 'rejected'] as const) {
    const result = await createActiveClaimEvidenceRetriever(
      clusteredSource({ cluster: { status } })
    )(
      { id: 'dog-1', life_stage: 'adult' },
      [food()]
    );
    assert.deepEqual(result.evidenceByFoodId.get('food-1'), [], status);
  }
});

test('an active claim in an inactive or unreviewed cluster cannot appear', async () => {
  const inactive = await createActiveClaimEvidenceRetriever(
    clusteredSource({
      cluster: {
        status: 'active',
        reviewed_by: null,
        reviewed_at: null,
      },
    })
  )(
    { id: 'dog-1', life_stage: 'adult' },
    [food()]
  );
  assert.deepEqual(inactive.evidenceByFoodId.get('food-1'), []);
});

test('an active cluster with no human reviewer but a deterministic auto-activation rule reaches the food response', async () => {
  const result = await createActiveClaimEvidenceRetriever(
    clusteredSource({
      cluster: {
        status: 'active',
        reviewed_by: null,
        reviewed_at: null,
        auto_activated_by_rule: 'deterministic_grade_ab_v1',
      },
    })
  )(
    { id: 'dog-1', life_stage: 'adult' },
    [food()]
  );
  const evidence = result.evidenceByFoodId.get('food-1');
  assert.equal(evidence?.length, 1);
  assert.equal(evidence?.[0].cluster_id, 'cluster-1');
});

test('a no-context cluster is suppressed by the integrated retrieval path', async () => {
  const result = await createActiveClaimEvidenceRetriever(
    clusteredSource({ contexts: [] })
  )(
    { id: 'dog-1', life_stage: 'adult' },
    [food()]
  );
  assert.deepEqual(result.evidenceByFoodId.get('food-1'), []);
});

test('an uncertain dog finding is suppressed by the integrated retrieval path', async () => {
  const result = await createActiveClaimEvidenceRetriever(
    clusteredSource({ findingStatus: 'needs_review' })
  )(
    { id: 'dog-1', life_stage: 'adult' },
    [food()]
  );
  assert.deepEqual(result.evidenceByFoodId.get('food-1'), []);
});

test('unrelated partial ingredient names do not match', () => {
  for (const name of ['lentils', 'red lentils', 'lentil fibre', 'green lentil fibre']) {
    assert.equal(
      matchClaimSubject(
        'ingredient',
        'green lentil',
        food({ ingredients: [{ ...food().ingredients[0], name }] })
      ).matches,
      false,
      name
    );
  }
});

test('ingredient classes use only the existing explicit taxonomy', () => {
  assert.equal(
    matchClaimSubject('ingredient_class', 'Plant protein', food()).matches,
    true
  );
  assert.equal(
    matchClaimSubject('ingredient_class', 'legume family', food()).supported,
    false
  );
});

test('processing methods match only recorded food types and biome markers stay unsupported', () => {
  assert.equal(matchClaimSubject('processing_method', 'kibble', food()).matches, true);
  assert.equal(matchClaimSubject('processing_method', 'extruded', food()).supported, false);
  assert.equal(matchClaimSubject('biome_marker', 'Firmicutes', food()).supported, false);
});

test('incomplete grading metadata, abstract-only access, exact quote and source link reach evidence', () => {
  const item = buildEligibleActiveClaims([claim()], [document()], [chunk()])[0];
  const evidence = toResearchEvidence(item);
  assert.equal(evidence.grading_inputs_complete, false);
  assert.equal(evidence.access_type, 'abstract_only');
  assert.equal(evidence.supporting_quote, QUOTE);
  assert.equal(evidence.source_url, 'https://pubmed.ncbi.nlm.nih.gov/34747447/');
  assert.equal(evidence.evidence_grade, 'B');
});

test('open-access full text status is preserved', () => {
  const item = buildEligibleActiveClaims(
    [claim()],
    [document({ abstract_only: false, open_access: true })],
    [chunk()]
  )[0];
  assert.equal(toResearchEvidence(item).access_type, 'open_access_full_text');
});

test('private uploaded full text, exact quote, title and source reach the integrated response', async () => {
  const result = await createActiveClaimEvidenceRetriever(
    clusteredSource({
      sourceDocument: {
        access_type: 'uploaded_full_text_private',
        abstract_only: false,
        open_access: false,
      },
    })
  )(
    { id: 'dog-1', life_stage: 'adult' },
    [food()]
  );
  const evidence = result.evidenceByFoodId.get('food-1')?.[0];
  assert.equal(evidence?.access_type, 'uploaded_full_text_private');
  assert.equal(evidence?.supporting_quote, QUOTE);
  assert.equal(evidence?.title, 'Green lentil and taurine in dogs');
  assert.equal(evidence?.source_url, 'https://pubmed.ncbi.nlm.nih.gov/34747447/');
});

test('neutral evidence and every other direction have zero Gate 4 ranking effect', () => {
  assert.deepEqual(researchRankingResult(['neutral']), {
    score: 0,
    summary: 'Reviewed research evidence is shown separately and does not affect ranking.',
  });
  assert.equal(
    researchRankingResult(['supports', 'cautions_against', 'insufficient_evidence']).score,
    0
  );
  assert.deepEqual(researchRankingResult(), {
    score: 0,
    summary: 'No matching active reviewed research evidence was found; research does not affect ranking.',
  });
});

test('retrieval query count is fixed rather than N+1 per candidate food', async () => {
  const calls = {
    claims: 0,
    documents: 0,
    chunks: 0,
    conditions: 0,
    findings: 0,
    restrictions: 0,
    outcomes: 0,
    members: 0,
    clusters: 0,
    applicability: 0,
  };
  const source: ActiveClaimDataSource = {
    loadActiveClaims: async () => {
      calls.claims += 1;
      return [claim()];
    },
    loadDocuments: async () => {
      calls.documents += 1;
      return [document()];
    },
    loadChunks: async () => {
      calls.chunks += 1;
      return [chunk()];
    },
    loadDogConditions: async () => {
      calls.conditions += 1;
      return [];
    },
    loadDogFindings: async () => {
      calls.findings += 1;
      return [];
    },
    loadDogRestrictions: async () => {
      calls.restrictions += 1;
      return [];
    },
    loadDogOutcomeMetrics: async () => {
      calls.outcomes += 1;
      return [];
    },
    loadClusterMembers: async () => {
      calls.members += 1;
      return [];
    },
    loadClusters: async () => {
      calls.clusters += 1;
      return [];
    },
    loadApplicability: async () => {
      calls.applicability += 1;
      return [];
    },
  };
  const retrieve = createActiveClaimEvidenceRetriever(source);
  const foods = Array.from({ length: 100 }, (_, index) =>
    food({ id: `food-${index}` })
  );
  const result = await retrieve({ id: 'dog-1', life_stage: 'adult' }, foods);

  assert.deepEqual(calls, {
    claims: 1,
    documents: 1,
    chunks: 1,
    conditions: 1,
    findings: 1,
    restrictions: 1,
    outcomes: 1,
    members: 1,
    clusters: 1,
    applicability: 1,
  });
  assert.equal(result.evidenceByFoodId.size, 100);
  assert.equal(result.evidenceByFoodId.get('food-99')?.length, 1);
});

test('inactive rows remain excluded even if a data source returns them defensively', async () => {
  const source: ActiveClaimDataSource = {
    loadActiveClaims: async () => [
      claim({ id: 'active' }),
      claim({ id: 'queued', status: 'queued_for_review' }),
      claim({ id: 'rejected', status: 'rejected' }),
    ],
    loadDocuments: async () => [document()],
    loadChunks: async () => [chunk()],
    loadDogConditions: async () => [],
  };
  const result = await createActiveClaimEvidenceRetriever(source)(
    { id: 'dog-1', life_stage: 'adult' },
    [food()]
  );
  assert.deepEqual(
    result.evidenceByFoodId.get('food-1')?.map((item) => item.claim_id),
    ['active']
  );
});

test('recommendation request path has no Gateway, embedding, RAG or research queue dependency', () => {
  const route = readFileSync(
    new URL('../../app/api/recommendations/route.ts', import.meta.url),
    'utf8'
  );
  const retrieval = readFileSync(
    new URL('../activeClaimRetrieval.ts', import.meta.url),
    'utf8'
  );
  for (const forbidden of [
    'ragRetrieval',
    'retrieveResearchFor',
    'researchScoreCache',
    'getResearchScores',
    'NOT_YET_SCORED_RESULT',
    'generateEmbedding',
    'embed(',
    'generateText',
    'streamText',
  ]) {
    assert.equal(route.includes(forbidden), false, forbidden);
  }
  assert.equal(route.includes('retrieveActiveClaimEvidence'), true);
  assert.equal(route.includes('researchRankingResult'), true);
  for (const forbidden of [
    "from 'ai'",
    'gateway(',
    'generateObject(',
    'generateText(',
    'embedResearchTexts(',
    'researchBrainDrafting',
    'researchBrainPipeline',
  ]) {
    assert.equal(retrieval.includes(forbidden), false, forbidden);
  }
});
