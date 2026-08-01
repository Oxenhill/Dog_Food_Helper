import { createHash } from 'node:crypto';
import { generateObject, gateway } from 'ai';
import { z } from 'zod';
import { embedResearchTexts, RESEARCH_BRAIN_EMBEDDING_MODEL } from './researchBrainPipeline';
import { NUTRIENT_MATCH_RULES } from './activeClaimRetrieval';
import { INGREDIENT_CATEGORIES } from './ingredientCategories';
import {
  researchClusterIdentity,
  validateResearchDecisionOutcome,
} from './researchEvidenceReview';
import { supabaseAdmin } from './supabase';
import type {
  ResearchClaimDirection,
  ResearchClaimSubjectType,
  ResearchDocument,
} from './types';
import {
  requireResearchModelRoute,
  type ResearchStageControlPlaneSnapshot,
} from './researchModelRouting';

export const RESEARCH_BRAIN_DRAFT_MODEL = 'anthropic/claude-sonnet-5' as const;
export const MAX_DRAFT_CHUNKS_PER_DOCUMENT = 8;
export const MAX_DRAFT_CLAIMS_PER_DOCUMENT = 12;
export const RESEARCH_BRAIN_DRAFT_SCHEMA_VERSION = 'research_draft_claim_v2' as const;

const ContextSchema = z.object({
  context_type: z.enum([
    'health_condition',
    'document_finding',
    'life_stage',
    'restriction',
    'outcome_metric',
  ]),
  context_key: z.string().min(1),
  context_value: z.string().min(1).nullable(),
});

const DraftClaimSchema = z.object({
  chunk_id: z.string().uuid(),
  supporting_quote: z.string().min(30),
  subject_type: z.enum([
    'ingredient',
    'nutrient',
    'ingredient_class',
    'processing_method',
    'biome_marker',
  ]),
  subject_value: z.string().min(1),
  outcome_type: z.enum([
    'condition',
    'biome_marker',
    'clinical_marker',
    'outcome_metric',
    'general_health',
  ]),
  outcome_value: z.string().min(1),
  subject_role: z.enum([
    'tested_food_exposure',
    'incidental_food_descriptor',
  ]),
  outcome_scope: z.enum([
    'dog_clinical_response',
    'dog_biological_response',
    'dog_digestibility_or_nutrient_status',
    'dog_behavior_or_performance',
    'food_product_or_manufacturing',
    'other',
  ]),
  direction: z.enum([
    'supports',
    'cautions_against',
    'neutral',
    'insufficient_evidence',
  ]),
  effect_summary: z.string().min(1),
  applicable_contexts: z.array(ContextSchema).max(8),
});

const DraftResponseSchema = z.object({
  claims: z.array(DraftClaimSchema).max(MAX_DRAFT_CLAIMS_PER_DOCUMENT),
});

type DraftClaim = z.infer<typeof DraftClaimSchema>;

const SUPPORTED_INGREDIENT_CLASSES = new Set(
  INGREDIENT_CATEGORIES.flatMap((category) => [
    normalize(category.value),
    normalize(category.label),
  ])
);
const SUPPORTED_PROCESSING_METHODS = new Set([
  'raw',
  'kibble',
  'cold pressed',
  'cooked',
  'wet',
]);
const SUPPORTED_DOCUMENT_FINDINGS = new Set(
  [
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
  ].map(normalize)
);

export const RESEARCH_BRAIN_DRAFT_SYSTEM_PROMPT = `You extract structured canine-nutrition evidence from supplied research chunks.
Return only claims literally supported by one chunk. supporting_quote must be an exact, contiguous
substring of that chunk. Every effect_summary must be one cautious sentence using language such as
"may", "was associated with", "the study found", "did not find", or "found no significant".
Never give feeding instructions, treatment advice, or veterinary advice. Never write proves, always,
never, guarantees, cures, prevents, completely safe, or appropriate for use.

The subject is the food exposure/intervention that can be matched to a food. Return a claim only when
that subject was actually tested as an intervention, exposure, or predictor; set subject_role to
tested_food_exposure. An ingredient merely listed in a sampled product is an incidental_food_descriptor
and must not become a claim. The outcome must be a response measured in dogs: clinical health,
canine biological samples or microbiome, digestibility or nutrient status, behaviour, or performance.
Classify that honestly in outcome_scope. Food-product assays and audits are not dog outcomes.

Never return food contamination, pathogen prevalence in product samples, antimicrobial resistance of
food isolates, manufacturing quality, recalls, label accuracy, undeclared-ingredient audits, or
ingredient/product composition variability. Those may matter to a manufacturer or regulator, but
they cannot tell Bowl how an individual dog responds to eating a candidate food. A study may still
support a claim about infection or another clinical outcome when that outcome was measured directly
in dogs and the food exposure itself was tested.

A neutral result is still a result, not positive additive evidence. applicable_contexts are dog-profile
facts required for this result to be useful (diagnosed condition, exact report finding, life stage,
restriction, or logged outcome).
Add a context only when the source explicitly supports that restriction. Do not invent an individual
dog recommendation. If a claim has no specific profile requirement, return an empty context array.

Food-matchable subjects are deliberately strict:
- nutrient must be ONE of protein, crude protein, fat, crude fat, fibre, fiber, crude fibre,
  crude fiber, moisture, ash, crude ash, phosphorus, sodium, calcium, taurine, or l-carnitine;
- ingredient_class must be ONE of the supplied repository categories, never a combined phrase;
- processing_method must be raw, kibble, cold pressed, cooked, or wet; never use "other";
- ingredient must be one specific named ingredient, never a comma/and/or list;
- biome_marker is not directly food-matchable, so do not use it as a subject. Put a biome marker
  in outcome or in a document_finding context instead.

For document_finding context_key use only a canonical report field: Firmicutes, Proteobacteria,
Fusobacteria, Bacteroidales, Clostridia, Prevotella, Diversity, Species Richness,
Dysbiosis Pattern Score, or Microbiome Classification. A general phrase such as gut disease is a
health_condition, not a document_finding.`;

export const RESEARCH_BRAIN_DRAFT_USER_PROMPT_TEMPLATE = [
  'Source title: {{title}}',
  'PMID: {{pmid}}',
  'Evidence scope: {{evidence_scope}}',
  '',
  '{{chunks}}',
].join('\n');

export const RESEARCH_BRAIN_DRAFT_PROMPT_SHA256 = createHash('sha256')
  .update(
    JSON.stringify({
      system: RESEARCH_BRAIN_DRAFT_SYSTEM_PROMPT,
      user_template: RESEARCH_BRAIN_DRAFT_USER_PROMPT_TEMPLATE,
      structured_output_schema_version: RESEARCH_BRAIN_DRAFT_SCHEMA_VERSION,
    }),
    'utf8'
  )
  .digest('hex');

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function sentenceCount(value: string): number {
  return value.match(/[.!?](?:["')\]]*)?(?=\s|$)/g)?.length ?? 0;
}

function validateDraft(
  claim: DraftClaim,
  chunks: Map<string, string>
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const content = chunks.get(claim.chunk_id);
  if (!content) reasons.push('unknown_chunk_id');
  else if (!content.includes(claim.supporting_quote)) reasons.push('quote_not_literal');
  if (claim.subject_value !== claim.subject_value.trim()) reasons.push('subject_whitespace');
  if (claim.outcome_value !== claim.outcome_value.trim()) reasons.push('outcome_whitespace');
  if (claim.subject_role !== 'tested_food_exposure') {
    reasons.push('subject_not_tested_food_exposure');
  }
  if (
    ![
      'dog_clinical_response',
      'dog_biological_response',
      'dog_digestibility_or_nutrient_status',
      'dog_behavior_or_performance',
    ].includes(claim.outcome_scope)
  ) {
    reasons.push('outcome_not_measured_as_dog_response');
  }
  if (validateResearchDecisionOutcome(claim.outcome_value).length > 0) {
    reasons.push('outcome_outside_individual_food_selection_scope');
  }
  if (
    claim.effect_summary !== claim.effect_summary.trim() ||
    sentenceCount(claim.effect_summary) !== 1
  ) {
    reasons.push('summary_not_one_sentence');
  }
  if (
    !/\b(may|might|was associated with|were associated with|the study found|the study reported|the analysis found|the review found|suggests?|did not find|found no significant)\b/i.test(
      claim.effect_summary
    )
  ) {
    reasons.push('summary_not_cautious');
  }
  if (
    /\b(should|must|recommend(?:ed|ation)?|consult|veterinar(?:y|ian)|feed this|do not feed|treat(?:ment)?|proves?|always|never|guarantees?|cures?|prevents?|completely safe|appropriate for use)\b/i.test(
      claim.effect_summary
    )
  ) {
    reasons.push('summary_contains_advice_or_certainty');
  }
  const normalizedSubject = normalize(claim.subject_value);
  if (claim.subject_type === 'biome_marker') {
    reasons.push('biome_marker_not_food_matchable');
  } else if (
    claim.subject_type === 'nutrient' &&
    !Object.prototype.hasOwnProperty.call(NUTRIENT_MATCH_RULES, normalizedSubject)
  ) {
    reasons.push('unsupported_or_combined_nutrient');
  } else if (
    claim.subject_type === 'ingredient_class' &&
    !SUPPORTED_INGREDIENT_CLASSES.has(normalizedSubject)
  ) {
    reasons.push('unsupported_or_combined_ingredient_class');
  } else if (
    claim.subject_type === 'processing_method' &&
    !SUPPORTED_PROCESSING_METHODS.has(normalizedSubject)
  ) {
    reasons.push('unsupported_processing_method');
  } else if (
    claim.subject_type === 'ingredient' &&
    /,|\band\b|\bor\b/i.test(claim.subject_value)
  ) {
    reasons.push('combined_ingredient_subject');
  }
  for (const context of claim.applicable_contexts) {
    if (
      context.context_type === 'document_finding' &&
      !SUPPORTED_DOCUMENT_FINDINGS.has(normalize(context.context_key))
    ) {
      reasons.push('unsupported_document_finding_context');
    }
    if (
      context.context_type === 'life_stage' &&
      !['growth', 'puppy', 'adult', 'senior'].includes(normalize(context.context_key))
    ) {
      reasons.push('unsupported_life_stage_context');
    }
  }
  return { valid: reasons.length === 0, reasons };
}

function claimIdentity(documentId: string, claim: DraftClaim): string {
  return hash(
    JSON.stringify({
      document_id: documentId,
      chunk_id: claim.chunk_id,
      supporting_quote: claim.supporting_quote,
      proposition: [
        claim.subject_type,
        claim.subject_value,
        claim.outcome_type,
        claim.outcome_value,
        claim.direction,
        claim.effect_summary,
      ].map(normalize),
    })
  );
}

function promptForDocument(
  document: Pick<ResearchDocument, 'title' | 'pmid' | 'evidence_scope'>,
  chunks: Array<{ id: string; content: string; chunk_index: number }>
): string {
  const renderedChunks = chunks
    .flatMap((chunk) => [
      `--- CHUNK ${chunk.chunk_index} | id=${chunk.id} ---`,
      chunk.content,
      '',
    ])
    .join('\n');
  return RESEARCH_BRAIN_DRAFT_USER_PROMPT_TEMPLATE
    .replace('{{title}}', () => document.title ?? 'Untitled')
    .replace('{{pmid}}', () => document.pmid ?? 'not supplied')
    .replace('{{evidence_scope}}', () => document.evidence_scope ?? 'not supplied')
    .replace('{{chunks}}', () => renderedChunks);
}

function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return value as number[];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.every((item) => typeof item === 'number')
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

async function semanticallySelectChunks(
  document: Pick<ResearchDocument, 'title' | 'topic' | 'discovery_topic'>,
  chunks: Array<{ id: string; content: string; chunk_index: number }>,
  embeddingModel: string,
): Promise<{
  selected: Array<{ id: string; content: string; chunk_index: number }>;
  inputTokens: number;
  estimatedCostUsd: number;
}> {
  const ids = chunks.map((chunk) => chunk.id);
  const { data: existing, error } = await supabaseAdmin
    .from('research_semantic_embeddings')
    .select('entity_id, embedding')
    .eq('entity_type', 'research_chunk')
    .eq('embedding_model', embeddingModel)
    .in('entity_id', ids);
  if (error) throw error;
  const vectors = new Map<string, number[]>();
  for (const row of existing ?? []) {
    const parsed = parseVector(row.embedding);
    if (parsed?.length === 1024) vectors.set(row.entity_id, parsed);
  }
  const missing = chunks.filter((chunk) => !vectors.has(chunk.id));
  const query = [
    'Direct canine nutrition evidence',
    document.discovery_topic ?? document.topic,
    document.title ?? '',
    'food exposure intervention measured outcome dog profile applicability',
  ].join(' | ');
  const embedded = await embedResearchTexts(
    [...missing.map((chunk) => chunk.content), query],
    embeddingModel
  );
  for (let index = 0; index < missing.length; index++) {
    vectors.set(missing[index].id, embedded.vectors[index]);
  }
  if (missing.length > 0) {
    const rows = missing.map((chunk, index) => ({
      entity_type: 'research_chunk',
      entity_id: chunk.id,
      content_sha256: hash(chunk.content),
      embedding_model: embeddingModel,
      embedding_dimensions: 1024,
      embedding: embedded.vectors[index],
    }));
    for (let offset = 0; offset < rows.length; offset += 50) {
      const { error: insertError } = await supabaseAdmin
        .from('research_semantic_embeddings')
        .upsert(rows.slice(offset, offset + 50), {
          onConflict: 'entity_type,entity_id,content_sha256,embedding_model',
          ignoreDuplicates: true,
        });
      if (insertError) throw insertError;
    }
  }
  const queryVector = embedded.vectors[embedded.vectors.length - 1];
  return {
    selected: chunks
      .map((chunk) => ({
        chunk,
        similarity: cosine(vectors.get(chunk.id)!, queryVector),
      }))
      .sort(
        (left, right) =>
          right.similarity - left.similarity ||
          left.chunk.chunk_index - right.chunk.chunk_index
      )
      .slice(0, MAX_DRAFT_CHUNKS_PER_DOCUMENT)
      .map((row) => row.chunk),
    inputTokens: embedded.inputTokens,
    estimatedCostUsd: embedded.estimatedCostUsd,
  };
}

export interface DraftDocumentResult {
  drafted: number;
  rejected: Array<{ chunk_id: string; reasons: string[] }>;
  queuedClaimIds: string[];
  clusterIds: string[];
  usage: { inputTokens: number; outputTokens: number };
  embedding: { inputTokens: number; estimatedCostUsd: number };
}

export async function draftDocumentIntoKnowledge(
  documentId: string,
  jobId: string,
  controlPlane?: ResearchStageControlPlaneSnapshot,
): Promise<DraftDocumentResult> {
  const draftModel = controlPlane
    ? requireResearchModelRoute(
        controlPlane,
        'draft_generation',
        'language_model'
      ).model_identifier
    : RESEARCH_BRAIN_DRAFT_MODEL;
  const embeddingModel = controlPlane
    ? requireResearchModelRoute(
        controlPlane,
        'semantic_embedding',
        'embedding_model'
      ).model_identifier
    : RESEARCH_BRAIN_EMBEDDING_MODEL;
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error('Vercel AI Gateway is not configured');
  }
  const [{ data: document, error: documentError }, { data: chunkRows, error: chunkError }] =
    await Promise.all([
      supabaseAdmin.from('research_documents').select('*').eq('id', documentId).maybeSingle(),
      supabaseAdmin
        .from('research_chunks')
        .select('id, content, chunk_index')
        .eq('document_id', documentId)
        .order('chunk_index', { ascending: true })
        .limit(120),
    ]);
  if (documentError || !document) throw documentError ?? new Error('Document not found');
  if (chunkError) throw chunkError;
  const allChunks = chunkRows ?? [];
  if (allChunks.length === 0) throw new Error('Document has no chunks');
  if (document.retracted || document.superseded_by) {
    throw new Error('Retracted or superseded research cannot be drafted');
  }
  if (document.evidence_scope !== 'canine_direct') {
    throw new Error('Only direct canine evidence can draft recommendation knowledge');
  }

  const semanticSelection = await semanticallySelectChunks(
    document as ResearchDocument,
    allChunks,
    embeddingModel
  );
  const chunks = semanticSelection.selected;
  const generated = await generateObject({
    model: gateway(draftModel),
    schema: DraftResponseSchema,
    system: RESEARCH_BRAIN_DRAFT_SYSTEM_PROMPT,
    prompt: promptForDocument(document as ResearchDocument, chunks),
    maxOutputTokens: 3200,
    maxRetries: 0,
    temperature: 0,
    providerOptions: {
      anthropic: { effort: 'low', structuredOutputMode: 'outputFormat' },
      gateway: { tags: ['research-brain-in-app'] },
    },
  });

  const chunkContent = new Map(chunks.map((chunk) => [chunk.id, chunk.content]));
  const rejected: Array<{ chunk_id: string; reasons: string[] }> = [];
  const validClaims = generated.object.claims.filter((claim) => {
    const validation = validateDraft(claim, chunkContent);
    if (!validation.valid) {
      rejected.push({ chunk_id: claim.chunk_id, reasons: validation.reasons });
    }
    return validation.valid;
  });

  const propositionTexts = validClaims.map((claim) =>
    [
      claim.subject_type,
      claim.subject_value,
      claim.outcome_type,
      claim.outcome_value,
      claim.direction,
      claim.effect_summary,
    ].join(' | ')
  );
  const embedding =
    propositionTexts.length > 0
      ? await embedResearchTexts(propositionTexts, embeddingModel)
      : { vectors: [], inputTokens: 0, estimatedCostUsd: 0 };

  const queuedClaimIds: string[] = [];
  const clusterIds = new Set<string>();
  for (let index = 0; index < validClaims.length; index++) {
    const claim = validClaims[index];
    const identity = claimIdentity(documentId, claim);
    const conditionContext = claim.applicable_contexts.find(
      (context) => context.context_type === 'health_condition'
    );
    const lifeStageContext = claim.applicable_contexts.find(
      (context) => context.context_type === 'life_stage'
    );
    const { data: existingClaim, error: existingClaimError } = await supabaseAdmin
      .from('research_claims')
      .select('id, status')
      .eq('claim_identity', identity)
      .maybeSingle();
    if (existingClaimError) throw existingClaimError;
    let insertedClaim = existingClaim;
    if (!insertedClaim) {
      const { data, error: claimError } = await supabaseAdmin
        .from('research_claims')
        .insert({
          claim_identity: identity,
          document_id: documentId,
          chunk_id: claim.chunk_id,
          supporting_quote: claim.supporting_quote,
          subject_type: claim.subject_type as ResearchClaimSubjectType,
          subject_value: claim.subject_value,
          applies_to_condition: conditionContext?.context_key ?? null,
          applies_to_life_stage: lifeStageContext?.context_key ?? null,
          direction: claim.direction as ResearchClaimDirection,
          effect_summary: claim.effect_summary,
          evidence_scope: document.evidence_scope,
          status: 'queued_for_review',
        })
        .select('id, status')
        .single();
      if (claimError || !data) {
        throw claimError ?? new Error('Could not queue drafted claim');
      }
      insertedClaim = data;
    }
    queuedClaimIds.push(insertedClaim.id);

    const cIdentity = researchClusterIdentity(claim);
    const { data: existingCluster, error: existingClusterError } = await supabaseAdmin
      .from('research_evidence_clusters')
      .select('id, status')
      .eq('cluster_identity', cIdentity)
      .maybeSingle();
    if (existingClusterError) throw existingClusterError;
    let cluster = existingCluster;
    let clusterWasCreated = false;
    if (!cluster) {
      const { data, error } = await supabaseAdmin
        .from('research_evidence_clusters')
        .insert({
          cluster_identity: cIdentity,
          label: `${claim.subject_value} — ${claim.outcome_value}`,
          subject_type: claim.subject_type,
          subject_value: claim.subject_value,
          outcome_type: claim.outcome_type,
          outcome_value: claim.outcome_value,
          direction: claim.direction,
          cautious_summary: claim.effect_summary,
          status: 'queued_for_review',
          created_by_job_id: jobId,
        })
        .select('id, status')
        .single();
      if (error || !data) throw error ?? new Error('Could not create evidence cluster');
      cluster = data;
      clusterWasCreated = true;
    }
    clusterIds.add(cluster.id);

    const { error: memberError } = await supabaseAdmin
      .from('research_evidence_cluster_members')
      .upsert(
        {
          cluster_id: cluster.id,
          claim_id: insertedClaim.id,
          semantic_similarity: 1,
          relationship: 'same_proposition',
          independently_reviewed: false,
          added_by_job_id: jobId,
        },
        { onConflict: 'cluster_id,claim_id' }
      );
    if (memberError) throw memberError;

    if (clusterWasCreated && claim.applicable_contexts.length > 0) {
      const { error: contextError } = await supabaseAdmin
        .from('research_cluster_applicability')
        .insert(
          claim.applicable_contexts.map((context) => ({
            cluster_id: cluster!.id,
            context_type: context.context_type,
            context_key: context.context_key,
            context_value: context.context_value,
            match_operator: 'exact',
            required: true,
          }))
        );
      if (contextError) throw contextError;
    }

    const { error: claimEmbeddingError } = await supabaseAdmin
      .from('research_semantic_embeddings')
      .upsert(
        {
          entity_type: 'research_claim',
          entity_id: insertedClaim.id,
          content_sha256: hash(propositionTexts[index]),
          embedding_model: embeddingModel,
          embedding_dimensions: 1024,
          embedding: embedding.vectors[index],
        },
        {
          onConflict: 'entity_type,entity_id,content_sha256,embedding_model',
          ignoreDuplicates: true,
        }
      );
    if (claimEmbeddingError) throw claimEmbeddingError;
  }

  return {
    drafted: validClaims.length,
    rejected,
    queuedClaimIds,
    clusterIds: [...clusterIds],
    usage: {
      inputTokens: generated.usage.inputTokens ?? 0,
      outputTokens: generated.usage.outputTokens ?? 0,
    },
    embedding: {
      inputTokens: embedding.inputTokens + semanticSelection.inputTokens,
      estimatedCostUsd: Number(
        (embedding.estimatedCostUsd + semanticSelection.estimatedCostUsd).toFixed(6)
      ),
    },
  };
}
