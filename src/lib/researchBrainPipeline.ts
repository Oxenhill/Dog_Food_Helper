import { createHash } from 'node:crypto';
import { embedMany } from 'ai';
import { chunkText } from './embeddingPipeline';
import type { ResearchCandidate } from './researchEvidence';
import type { Gate1ManifestCandidate } from './researchGate2';
import { prepareSelectedSources } from './researchGate2Sources';
import { evaluateResearchEvidenceAdmissibility } from './researchEvidenceAdmissibility';
import {
  LOCAL_LITERATURE_REGISTRY_V1,
  type LiteratureRegistrySnapshot,
} from './researchLiteratureSources';
import {
  requireResearchModelRoute,
  type ResearchStageControlPlaneSnapshot,
} from './researchModelRouting';
import {
  createResearchProviderEstimate,
  executeTrackedResearchProviderCall,
} from './researchProviderTelemetry';
import { detectAndLinkStudyFamily, StudyFamilyMatch } from './researchStudyFamily';
import { supabaseAdmin } from './supabase';
import type { EvidenceGrade, ResearchTopic } from './types';

export const RESEARCH_BRAIN_EMBEDDING_MODEL = 'voyage/voyage-4' as const;
export const RESEARCH_BRAIN_EMBEDDING_DIMENSIONS = 1024;
export const RESEARCH_BRAIN_CHUNK_CHARACTERS = 1800;

export interface ResearchEmbeddingRun {
  vectors: number[][];
  providerReportedInputTokens: number | null;
  estimatedInputTokens: number;
  estimatedCostUsd: number;
}

export interface ResearchIngestionResult {
  documentId: string;
  chunkCount: number;
  duplicate: boolean;
  embedding: Omit<ResearchEmbeddingRun, 'vectors'>;
  studyFamilyMatch: StudyFamilyMatch | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertGatewayConfigured(): void {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      'Vercel AI Gateway is not configured. Research processing was not started.'
    );
  }
}

/**
 * Gateway-only semantic embedding. No direct Voyage credential is read and no
 * local pseudo-vector fallback exists for the research brain.
 */
export async function embedResearchTexts(
  texts: string[],
  modelIdentifier: string,
  telemetry: {
    jobId: string;
    controlPlane: ResearchStageControlPlaneSnapshot;
    callKeyPrefix: string;
  }
): Promise<ResearchEmbeddingRun> {
  assertGatewayConfigured();
  const vectors: number[][] = [];
  let providerReportedInputTokens = 0;
  let providerUsageComplete = true;
  let estimatedInputTokens = 0;
  let estimatedCostUsd = 0;

  for (let offset = 0; offset < texts.length; offset += 64) {
    const values = texts.slice(offset, offset + 64);
    const estimate = await createResearchProviderEstimate({
      provider: 'vercel_ai_gateway',
      modelIdentifier,
      inputText: values,
    });
    const batchNumber = Math.floor(offset / 64) + 1;
    const result = await executeTrackedResearchProviderCall({
      jobId: telemetry.jobId,
      controlPlane: telemetry.controlPlane,
      routeKey: 'semantic_embedding',
      executionKind: 'embedding_model',
      callKey: `${telemetry.callKeyPrefix}.batch_${batchNumber}`,
      estimate,
      execute: () => embedMany({ model: modelIdentifier, values, maxRetries: 0 }),
      readUsage: (response) => {
        const tokens = response?.usage?.tokens;
        return Number.isSafeInteger(tokens) && tokens >= 0
          ? { inputTokens: tokens, outputTokens: 0, totalTokens: tokens }
          : null;
      },
      readResponse: (response) => {
        const headers = response.responses
          ?.map((entry) => entry?.headers)
          .find((entry): entry is Record<string, string> => Boolean(entry));
        return {
          requestId:
            headers?.['x-vercel-ai-gateway-generation-id']
            ?? headers?.['x-vercel-ai-generation-id']
            ?? null,
        };
      },
    });
    if (
      result.embeddings.length !== values.length ||
      result.embeddings.some(
        (embedding) => embedding.length !== RESEARCH_BRAIN_EMBEDDING_DIMENSIONS
      )
    ) {
      throw new Error(
        `Voyage returned an unexpected embedding shape; expected ${RESEARCH_BRAIN_EMBEDDING_DIMENSIONS} dimensions.`
      );
    }
    vectors.push(...result.embeddings);
    const reportedTokens = result?.usage?.tokens;
    if (Number.isSafeInteger(reportedTokens) && reportedTokens >= 0) {
      providerReportedInputTokens += reportedTokens;
    } else {
      providerUsageComplete = false;
    }
    estimatedInputTokens += estimate.inputTokens;
    estimatedCostUsd += estimate.costUsd;
  }

  return {
    vectors,
    providerReportedInputTokens: providerUsageComplete
      ? providerReportedInputTokens
      : null,
    estimatedInputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  };
}

function toManifestCandidate(candidate: ResearchCandidate): Gate1ManifestCandidate {
  return {
    source_id: candidate.source_id,
    title: candidate.title,
    doi: candidate.doi,
    pmid: candidate.pmid,
    pmcid: candidate.pmcid,
    journal: candidate.journal,
    publication_year: candidate.publication_year,
    source_url: candidate.source_url,
    full_text_url: candidate.full_text_url,
    open_access: candidate.open_access,
    abstract_only: candidate.abstract_only,
    evidence_grade: candidate.evidence_grade,
    evidence_scope: candidate.evidence_scope,
    study_design: candidate.study_design,
    species: candidate.species,
    species_terms: candidate.species_terms,
    mesh_headings: candidate.mesh_headings,
    sample_size: candidate.sample_size,
    funding_declaration: candidate.funding_declaration,
    competing_interests_declaration: candidate.competing_interests_declaration,
    funding_independent: candidate.funding_independent,
    is_preprint: candidate.is_preprint,
    retracted: candidate.retracted,
    grading_inputs_complete: candidate.grading_inputs_complete,
    missing_grading_inputs: candidate.missing_grading_inputs,
    topic_memberships: [
      {
        key: candidate.discovery_topic,
        group: candidate.topic_group,
        label: candidate.discovery_topic_label,
        query: candidate.query,
      },
    ],
  };
}

async function existingDocument(
  sourceId: string | null,
  doi: string | null
): Promise<{ id: string } | null> {
  if (sourceId) {
    const { data, error } = await supabaseAdmin
      .from('research_documents')
      .select('id')
      .eq('source_name', 'pubmed')
      .eq('source_id', sourceId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (doi) {
    const { data, error } = await supabaseAdmin
      .from('research_documents')
      .select('id')
      .ilike('doi', doi)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

async function storeDocumentWithVoyage(input: {
  jobId: string;
  topic: ResearchTopic;
  documentRow: Record<string, unknown>;
  text: string;
  embeddingModel: string;
  controlPlane: ResearchStageControlPlaneSnapshot;
  callKeyPrefix: string;
}): Promise<ResearchIngestionResult> {
  const chunks = chunkText(input.text, RESEARCH_BRAIN_CHUNK_CHARACTERS);
  const embedding = await embedResearchTexts(chunks, input.embeddingModel, {
    jobId: input.jobId,
    controlPlane: input.controlPlane,
    callKeyPrefix: input.callKeyPrefix,
  });

  const { data: document, error: documentError } = await supabaseAdmin
    .from('research_documents')
    .insert({
      ...input.documentRow,
      topic: input.topic,
      review_status: 'pending',
      ingestion_job_id: input.jobId,
      retrieved_at: new Date().toISOString(),
    })
    .select('id, title, authors, publication_year, is_preprint, abstract_only, evidence_grade')
    .single();
  if (documentError || !document) {
    throw documentError ?? new Error('Could not store the research document');
  }

  const studyFamilyMatch = await detectAndLinkStudyFamily(document.id, {
    title: (document.title as string | null) ?? '',
    authors: (document.authors as string[] | null) ?? [],
    publication_year: document.publication_year as number | null,
    is_preprint: Boolean(document.is_preprint),
    abstract_only: Boolean(document.abstract_only),
    evidence_grade: (document.evidence_grade as EvidenceGrade | null) ?? null,
  });

  const { data: chunkRows, error: chunkError } = await supabaseAdmin
    .from('research_chunks')
    .insert(
      chunks.map((content, chunk_index) => ({
        document_id: document.id,
        content,
        chunk_index,
        embedding: null,
      }))
    )
    .select('id, content');
  if (chunkError || !chunkRows || chunkRows.length !== chunks.length) {
    throw chunkError ?? new Error('Could not store all research chunks');
  }

  const semanticRows = chunkRows.map((chunk, index) => ({
    entity_type: 'research_chunk',
    entity_id: chunk.id,
    content_sha256: sha256(chunk.content),
    embedding_model: input.embeddingModel,
    embedding_dimensions: RESEARCH_BRAIN_EMBEDDING_DIMENSIONS,
    embedding: embedding.vectors[index],
  }));
  for (let offset = 0; offset < semanticRows.length; offset += 50) {
    const { error } = await supabaseAdmin
      .from('research_semantic_embeddings')
      .insert(semanticRows.slice(offset, offset + 50));
    if (error) throw error;
  }

  return {
    documentId: document.id,
    chunkCount: chunks.length,
    duplicate: false,
    embedding: {
      providerReportedInputTokens: embedding.providerReportedInputTokens,
      estimatedInputTokens: embedding.estimatedInputTokens,
      estimatedCostUsd: embedding.estimatedCostUsd,
    },
    studyFamilyMatch,
  };
}

export async function ingestDiscoveryCandidate(input: {
  jobId: string;
  candidateId: string;
  candidate: ResearchCandidate;
  controlPlane?: ResearchStageControlPlaneSnapshot;
  literatureRegistry?: LiteratureRegistrySnapshot;
}): Promise<ResearchIngestionResult> {
  if (!input.controlPlane) {
    throw new Error('Pinned research control-plane configuration is required');
  }
  const admissibility = evaluateResearchEvidenceAdmissibility({
    evidenceScope: input.candidate.evidence_scope,
    species: input.candidate.species,
    meshHeadings: input.candidate.mesh_headings,
    retracted: input.candidate.retracted,
  });
  if (!admissibility.admissible) {
    throw new Error(admissibility.code);
  }
  const embeddingModel = requireResearchModelRoute(
    input.controlPlane,
    'semantic_embedding',
    'embedding_model'
  ).model_identifier;
  const duplicate = await existingDocument(
    input.candidate.source_id,
    input.candidate.doi
  );
  if (duplicate) {
    await supabaseAdmin
      .from('research_discovery_candidates')
      .update({ selected: true, imported_document_id: duplicate.id })
      .eq('id', input.candidateId);
    return {
      documentId: duplicate.id,
      chunkCount: 0,
      duplicate: true,
      embedding: {
        providerReportedInputTokens: null,
        estimatedInputTokens: 0,
        estimatedCostUsd: 0,
      },
      studyFamilyMatch: null,
    };
  }

  const [source] = await prepareSelectedSources(
    [toManifestCandidate(input.candidate)],
    fetch,
    input.literatureRegistry ?? LOCAL_LITERATURE_REGISTRY_V1
  );
  const result = await storeDocumentWithVoyage({
    jobId: input.jobId,
    topic: input.candidate.topic,
    text: source.plain_text,
    embeddingModel,
    controlPlane: input.controlPlane,
    callKeyPrefix: 'document_embedding',
    documentRow: {
      topic_group: input.candidate.topic_group,
      discovery_topic: input.candidate.discovery_topic,
      source_name: 'pubmed',
      source_id: input.candidate.source_id,
      source_url: input.candidate.source_url,
      title: input.candidate.title,
      doi: input.candidate.doi?.toLowerCase() ?? null,
      pmid: input.candidate.pmid,
      pmcid: input.candidate.pmcid,
      journal: input.candidate.journal,
      publication_year: input.candidate.publication_year,
      authors: input.candidate.authors,
      study_design: input.candidate.study_design,
      species: input.candidate.species,
      sample_size: input.candidate.sample_size,
      funding_declaration: source.funding_declaration,
      competing_interests_declaration: source.competing_interests_declaration,
      funding_independent: input.candidate.funding_independent,
      grading_input_sources: input.candidate.grading_input_sources,
      is_preprint: input.candidate.is_preprint,
      open_access: source.content_source === 'europe_pmc_jats',
      abstract_only: source.content_source === 'pubmed_abstract',
      access_type:
        source.content_source === 'europe_pmc_jats'
          ? 'open_access_full_text'
          : 'abstract_only',
      license: source.license,
      retracted: false,
      retraction_checked_at: source.content_retrieved_at,
      evidence_scope: input.candidate.evidence_scope,
      source_metadata: {
        ...input.candidate.source_metadata,
        in_app_ingestion: {
          job_id: input.jobId,
          content_source: source.content_source,
          content_endpoint: source.content_endpoint,
          source_payload_sha256: source.source_payload_sha256,
          plain_text_sha256: sha256(source.plain_text),
          embedding_model: embeddingModel,
          embedding_dimensions: RESEARCH_BRAIN_EMBEDDING_DIMENSIONS,
        },
      },
    },
  });
  await supabaseAdmin
    .from('research_discovery_candidates')
    .update({ selected: true, imported_document_id: result.documentId })
    .eq('id', input.candidateId);
  return result;
}

export async function ingestUploadedResearchPdf(input: {
  jobId: string;
  topic: ResearchTopic;
  title: string;
  sourceUrl: string | null;
  originalFilename: string;
  text: string;
  controlPlane?: ResearchStageControlPlaneSnapshot;
}): Promise<ResearchIngestionResult> {
  if (!input.controlPlane) {
    throw new Error('Pinned research control-plane configuration is required');
  }
  const embeddingModel = requireResearchModelRoute(
    input.controlPlane,
    'semantic_embedding',
    'embedding_model'
  ).model_identifier;
  return storeDocumentWithVoyage({
    jobId: input.jobId,
    topic: input.topic,
    text: input.text,
    embeddingModel,
    controlPlane: input.controlPlane,
    callKeyPrefix: 'document_embedding',
    documentRow: {
      title: input.title,
      source_url: input.sourceUrl,
      abstract_only: false,
      open_access: false,
      access_type: 'uploaded_full_text_private',
      evidence_scope: 'canine_direct',
      source_metadata: {
        in_app_upload: {
          original_filename: input.originalFilename,
          plain_text_sha256: sha256(input.text),
          embedding_model: embeddingModel,
          embedding_dimensions: RESEARCH_BRAIN_EMBEDDING_DIMENSIONS,
        },
      },
    },
  });
}
