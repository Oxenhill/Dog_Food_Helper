import { supabaseAdmin } from './supabase';
import { titleSimilarity } from './researchDiscovery';
import {
  classifyFundingIndependence,
  speciesFromPubMedMesh,
  studyDesignFromPubMed,
} from './researchEvidence';
import {
  maximumChunkSimilarity,
  rankRelevanceRows,
  RankedRelevanceRow,
} from './researchGate2';
import { legacyResearchTopic } from './researchTopics';
import { ResearchEvidenceScope, ResearchTopicGroup } from './types';

interface PlanDocument {
  custom_id: string;
  manifest: {
    source_id: string;
    pmid: string;
    pmcid: string | null;
    doi: string | null;
    source_url: string;
    evidence_scope: ResearchEvidenceScope;
    is_preprint: boolean;
    topic_memberships: Array<{
      key: string;
      group: ResearchTopicGroup;
      label: string;
      query: string;
    }>;
  };
  pubmed: {
    pmid: string;
    title: string;
    abstract_text: string | null;
    journal: string | null;
    publication_year: number | null;
    doi: string | null;
    pmcid: string | null;
    publication_types: string[];
    mesh_headings: string[];
    keywords: string[];
  };
  content_source: 'europe_pmc_jats' | 'pubmed_abstract';
  content_endpoint: string;
  content_retrieved_at: string;
  source_payload_sha256: string;
  source_access_note: string | null;
  license: string | null;
  funding_declaration: string | null;
  competing_interests_declaration: string | null;
  plain_text_sha256: string;
  chunks: string[];
}

export interface Gate2DatabasePlan {
  source_report: string;
  source_report_sha256: string;
  embedding_model: string;
  embedding_dimensions: 1536;
  selected_documents: PlanDocument[];
  centroids: Array<{
    topic_key: string;
    topic_group: ResearchTopicGroup;
    centroid_text: string;
    centroid_version: string;
  }>;
}

export interface Gate2EmbeddingResults {
  results: Record<string, number[][]>;
}

export interface Gate2CommitReport {
  dry_run: boolean;
  inserted: Array<{ pmid: string; document_id: string; chunk_count: number }>;
  updated: Array<{ pmid: string; document_id: string; chunk_count: number }>;
  skipped: Array<{ pmid: string; document_id: string; reason: string }>;
  deduplicated: Array<{ pmid: string; document_id: string; reason: string }>;
  relevance_rows: number;
  drafting_eligible_pairs: number;
  rankings: RankedRelevanceRow[];
}

function assertEmbeddings(plan: Gate2DatabasePlan, embeddings: Gate2EmbeddingResults): void {
  if (plan.selected_documents.length > 30) {
    throw new Error('Gate 2 hard cap exceeded');
  }
  for (const document of plan.selected_documents) {
    const vectors = embeddings.results[document.custom_id];
    if (!vectors || vectors.length !== document.chunks.length) {
      throw new Error(`Embedding/chunk mismatch for PMID ${document.manifest.pmid}`);
    }
    if (vectors.some((vector) => vector.length !== 1536)) {
      throw new Error(`Non-1536 embedding for PMID ${document.manifest.pmid}`);
    }
  }
  if (embeddings.results.centroids?.length !== plan.centroids.length) {
    throw new Error('Centroid embedding count mismatch');
  }
  if (embeddings.results.centroids.some((vector) => vector.length !== 1536)) {
    throw new Error('Non-1536 centroid embedding');
  }
}

async function insertChunkRows(
  documentId: string,
  chunks: string[],
  embeddings: number[][],
): Promise<void> {
  const rows = chunks.map((content, chunk_index) => ({
    document_id: documentId,
    content,
    chunk_index,
    embedding: embeddings[chunk_index],
  }));
  for (let offset = 0; offset < rows.length; offset += 20) {
    const { error } = await supabaseAdmin
      .from('research_chunks')
      .insert(rows.slice(offset, offset + 20));
    if (error) throw error;
  }
}

function documentRow(plan: Gate2DatabasePlan, document: PlanDocument) {
  const primaryTopic = document.manifest.topic_memberships[0];
  if (!primaryTopic) throw new Error(`PMID ${document.manifest.pmid} has no topic`);
  const species = speciesFromPubMedMesh(document.pubmed.mesh_headings);
  if (
    document.manifest.evidence_scope === 'canine_direct'
    && (!document.pubmed.mesh_headings.includes('Dogs') || species.species !== 'dog')
  ) {
    throw new Error(`PMID ${document.manifest.pmid} lost structured Dogs MeSH`);
  }
  const studyDesign = studyDesignFromPubMed(
    document.pubmed.publication_types,
    document.pubmed.mesh_headings,
  );
  const fundingIndependent = classifyFundingIndependence(
    document.funding_declaration,
    document.competing_interests_declaration,
  );
  const isPreprint = document.pubmed.publication_types.some((value) =>
    value.toLowerCase().includes('preprint'));
  const retracted = document.pubmed.publication_types.some(
    (value) => value.toLowerCase() === 'retracted publication',
  );
  if (retracted) throw new Error(`PMID ${document.manifest.pmid} is now retracted`);

  return {
    topic: legacyResearchTopic(primaryTopic.group),
    topic_group: primaryTopic.group,
    discovery_topic: primaryTopic.key,
    source_name: 'pubmed',
    source_id: document.manifest.source_id,
    source_url: document.manifest.source_url,
    title: document.pubmed.title,
    doi: document.pubmed.doi?.toLowerCase() ?? null,
    pmid: document.pubmed.pmid,
    pmcid: document.manifest.pmcid,
    journal: document.pubmed.journal,
    publication_year: document.pubmed.publication_year,
    study_design: studyDesign,
    species: species.species,
    sample_size: null,
    funding_declaration: document.funding_declaration,
    competing_interests_declaration: document.competing_interests_declaration,
    funding_independent: fundingIndependent,
    is_preprint: isPreprint,
    open_access: document.content_source === 'europe_pmc_jats',
    abstract_only: document.content_source === 'pubmed_abstract',
    license: document.license,
    retracted: false,
    retraction_checked_at: document.content_retrieved_at,
    retrieved_at: document.content_retrieved_at,
    review_status: 'pending',
    evidence_scope: document.manifest.evidence_scope,
    grading_input_sources: {
      study_design: 'PubMed PublicationTypeList and MeSH headings',
      species: 'PubMed MeSH DescriptorName',
      sample_size: 'Deliberately null: no model extraction and no standardized structured source value',
      funding_independent:
        'Deterministic rules over stored Europe PMC JATS funding and competing-interest declarations',
      is_preprint: 'PubMed PublicationTypeList',
    },
    source_metadata: {
      gate: 2,
      gate1_report: plan.source_report,
      gate1_report_sha256: plan.source_report_sha256,
      gate1_topic_memberships: document.manifest.topic_memberships,
      pubmed: document.pubmed,
      embedded_content_source: {
        kind: document.content_source,
        endpoint: document.content_endpoint,
        retrieved_at: document.content_retrieved_at,
        sha256: document.source_payload_sha256,
        access_note: document.source_access_note,
      },
      reduced_plain_text_sha256: document.plain_text_sha256,
      chunking: {
        chunk_count: document.chunks.length,
        embedding_model: plan.embedding_model,
        embedding_dimensions: plan.embedding_dimensions,
      },
    },
  };
}

export async function commitGate2Plan(
  plan: Gate2DatabasePlan,
  embeddings: Gate2EmbeddingResults,
  dryRun = false,
): Promise<Gate2CommitReport> {
  assertEmbeddings(plan, embeddings);
  const { count: claimCount, error: claimError } = await supabaseAdmin
    .from('research_claims')
    .select('*', { count: 'exact', head: true });
  if (claimError) throw claimError;
  if ((claimCount ?? 0) !== 0) {
    throw new Error('Gate 2 refuses to run after claims exist');
  }

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('research_documents')
    .select('id,source_id,doi,title,review_status,source_metadata');
  if (existingError) throw existingError;
  const existing = existingRows ?? [];
  const report: Gate2CommitReport = {
    dry_run: dryRun,
    inserted: [],
    updated: [],
    skipped: [],
    deduplicated: [],
    relevance_rows: 0,
    drafting_eligible_pairs: 0,
    rankings: [],
  };
  const documentIds = new Map<string, string>();

  for (const document of plan.selected_documents) {
    const row = documentRow(plan, document);
    const exact = existing.find(
      (candidate) =>
        candidate.source_id === row.source_id
        || (row.doi && candidate.doi?.toLowerCase() === row.doi),
    );
    const titleDuplicate = exact
      ? null
      : existing
        .map((candidate) => ({
          candidate,
          similarity: titleSimilarity(row.title, candidate.title ?? ''),
        }))
        .filter((candidate) => candidate.similarity >= 0.92)
        .sort((left, right) => right.similarity - left.similarity)[0];

    if (titleDuplicate) {
      documentIds.set(document.custom_id, titleDuplicate.candidate.id);
      report.deduplicated.push({
        pmid: document.manifest.pmid,
        document_id: titleDuplicate.candidate.id,
        reason: `title_similarity_${titleDuplicate.similarity.toFixed(4)}`,
      });
      continue;
    }

    if (exact) {
      documentIds.set(document.custom_id, exact.id);
      const metadata = exact.source_metadata as {
        reduced_plain_text_sha256?: string;
        chunking?: { chunk_count?: number; embedding_model?: string };
      } | null;
      if (
        metadata?.reduced_plain_text_sha256 === document.plain_text_sha256
        && metadata.chunking?.chunk_count === document.chunks.length
        && metadata.chunking?.embedding_model === plan.embedding_model
      ) {
        report.skipped.push({
          pmid: document.manifest.pmid,
          document_id: exact.id,
          reason: 'exact_manifest_content_and_embedding_model',
        });
        continue;
      }
      if (exact.review_status !== 'pending') {
        throw new Error(`Refusing to replace reviewed PMID ${document.manifest.pmid}`);
      }
      const { count, error } = await supabaseAdmin
        .from('research_claims')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', exact.id);
      if (error) throw error;
      if ((count ?? 0) !== 0) {
        throw new Error(`Refusing to replace claimed PMID ${document.manifest.pmid}`);
      }
      if (!dryRun) {
        const { error: updateError } = await supabaseAdmin
          .from('research_documents')
          .update(row)
          .eq('id', exact.id);
        if (updateError) throw updateError;
        const { error: deleteError } = await supabaseAdmin
          .from('research_chunks')
          .delete()
          .eq('document_id', exact.id);
        if (deleteError) throw deleteError;
        await insertChunkRows(
          exact.id,
          document.chunks,
          embeddings.results[document.custom_id],
        );
      }
      report.updated.push({
        pmid: document.manifest.pmid,
        document_id: exact.id,
        chunk_count: document.chunks.length,
      });
      continue;
    }

    if (dryRun) {
      const dryId = `dry-run:${document.manifest.pmid}`;
      documentIds.set(document.custom_id, dryId);
      report.inserted.push({
        pmid: document.manifest.pmid,
        document_id: dryId,
        chunk_count: document.chunks.length,
      });
      continue;
    }
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('research_documents')
      .insert(row)
      .select('id')
      .single();
    if (insertError || !inserted) {
      throw insertError ?? new Error(`Failed to insert PMID ${document.manifest.pmid}`);
    }
    await insertChunkRows(
      inserted.id,
      document.chunks,
      embeddings.results[document.custom_id],
    );
    existing.push({ ...row, id: inserted.id });
    documentIds.set(document.custom_id, inserted.id);
    report.inserted.push({
      pmid: document.manifest.pmid,
      document_id: inserted.id,
      chunk_count: document.chunks.length,
    });
  }

  if (dryRun) return report;

  const centroidEmbeddings = embeddings.results.centroids;
  const centroidRows = plan.centroids.map((centroid, index) => ({
    topic_key: centroid.topic_key,
    topic_group: centroid.topic_group,
    centroid_text: centroid.centroid_text,
    centroid_version: centroid.centroid_version,
    embedding_model: plan.embedding_model,
    embedding: centroidEmbeddings[index],
    updated_at: new Date().toISOString(),
  }));
  const { error: centroidError } = await supabaseAdmin
    .from('research_topic_centroids')
    .upsert(centroidRows, { onConflict: 'topic_key' });
  if (centroidError) throw centroidError;

  const relevanceRows: Array<{
    document_id: string;
    topic_key: string;
    topic_group: ResearchTopicGroup;
    similarity: number;
  }> = [];
  for (const document of plan.selected_documents) {
    const documentId = documentIds.get(document.custom_id);
    if (!documentId || documentId.startsWith('dry-run:')) continue;
    const groupAllowed = (group: ResearchTopicGroup) =>
      document.manifest.evidence_scope === 'veterinary_methodology'
        ? group === 'G'
        : group !== 'G';
    for (let index = 0; index < plan.centroids.length; index++) {
      const centroid = plan.centroids[index];
      if (!groupAllowed(centroid.topic_group)) continue;
      relevanceRows.push({
        document_id: documentId,
        topic_key: centroid.topic_key,
        topic_group: centroid.topic_group,
        similarity: maximumChunkSimilarity(
          embeddings.results[document.custom_id],
          centroidEmbeddings[index],
        ),
      });
    }
  }
  for (let offset = 0; offset < relevanceRows.length; offset += 500) {
    const rows = relevanceRows.slice(offset, offset + 500).map((row) => {
      const centroid = plan.centroids.find(
        (candidate) => candidate.topic_key === row.topic_key,
      )!;
      return {
        document_id: row.document_id,
        topic_key: row.topic_key,
        similarity: row.similarity,
        centroid_version: centroid.centroid_version,
        embedding_model: plan.embedding_model,
        evaluated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabaseAdmin
      .from('research_document_relevance')
      .upsert(rows, { onConflict: 'document_id,topic_key' });
    if (error) throw error;
  }
  report.rankings = rankRelevanceRows(relevanceRows);
  report.relevance_rows = relevanceRows.length;
  report.drafting_eligible_pairs = report.rankings.filter(
    (row) => row.drafting_eligible,
  ).length;
  return report;
}
