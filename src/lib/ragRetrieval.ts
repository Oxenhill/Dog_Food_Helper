import { supabaseAdmin } from './supabase';
import { generateEmbedding } from './embeddingPipeline';
import { Dog, ResearchTopic, ReviewStatus } from './types';

/**
 * RAG retrieval (Phase 4)
 *
 * retrieveResearchFor(dogId, topK):
 *   1. Fetch the dog's health conditions + restrictions
 *   2. Build a search query from that profile (deterministic template, not
 *      an LLM call — the query construction here is simple structured
 *      concatenation, not a reasoning task, so there's no need to spend a
 *      Claude call just to phrase it)
 *   3. Embed the query, vector-similarity search against research_chunks
 *   4. Return top-K chunks + source document info, approved-only
 */

export interface RetrievedResearchChunk {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  similarity: number;
  topic: ResearchTopic;
  source_url: string | null;
  title: string | null;
}

interface MatchRow {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  similarity: number;
  topic: ResearchTopic;
  source_url: string | null;
  title: string | null;
  review_status: ReviewStatus;
}

function buildSearchQuery(
  dog: Dog,
  restrictions: { substance: string; restriction_type: string }[],
  conditions: { condition: string }[]
): string {
  const parts: string[] = [];

  parts.push(
    `Dog nutrition research relevant to a ${dog.life_stage ?? 'unknown-life-stage'} ` +
      `${dog.size_category ?? 'unknown-size'} dog with lifestyle_role=${dog.lifestyle_role}` +
      `${dog.work_type && dog.work_type !== 'none' ? `, work_type=${dog.work_type}` : ''}.`
  );

  if (restrictions.length > 0) {
    parts.push(
      `Restrictions: ${restrictions.map((r) => `${r.restriction_type} — ${r.substance}`).join('; ')}.`
    );
  }

  if (conditions.length > 0) {
    parts.push(`Health conditions: ${conditions.map((c) => c.condition).join('; ')}.`);
  }

  if (restrictions.length === 0 && conditions.length === 0) {
    parts.push('No known restrictions or diagnosed health conditions — general nutrition and gut health research.');
  }

  return parts.join(' ');
}

/**
 * Fetch a dog's health conditions + restrictions, derive a search query, and
 * return the top-K approved research chunks (with source document info) most
 * relevant to that profile. Only documents with review_status='approved' and
 * no superseded_by are ever returned — filtered both in the SQL RPC
 * (supabase/seed_phase4.sql's match_research_chunks) and re-asserted here.
 */
export async function retrieveResearchFor(
  dogId: string,
  topK = 5
): Promise<RetrievedResearchChunk[]> {
  const { data: dog, error: dogError } = await supabaseAdmin
    .from('dogs')
    .select('*')
    .eq('id', dogId)
    .single();

  if (dogError || !dog) throw dogError ?? new Error('Dog not found');

  const [{ data: restrictions, error: restrictionError }, { data: conditions, error: conditionError }] =
    await Promise.all([
      supabaseAdmin.from('dog_restrictions').select('substance, restriction_type').eq('dog_id', dogId),
      supabaseAdmin.from('dog_health_conditions').select('condition').eq('dog_id', dogId),
    ]);

  if (restrictionError) throw restrictionError;
  if (conditionError) throw conditionError;

  const query = buildSearchQuery(dog as Dog, restrictions ?? [], conditions ?? []);

  // Research relevance is an OPTIONAL scoring enhancement, not a hard
  // dependency of producing recommendations. Both external dependencies of
  // this retrieval — the embedding provider (via the AI Gateway) and the
  // match_research_chunks RPC — can legitimately be absent (no Gateway auth
  // configured yet; RAG corpus not seeded). When either is unavailable we
  // degrade to "no research context" and let recommendations proceed with
  // research_relevance contributing an honest 0 (researchScoring returns
  // NO_RESEARCH_RESULT for an empty chunk list, making no LLM call). This
  // must never turn a whole recommendation request into a 500 — a missing
  // optional enhancement is not a failed recommendation. Genuine data errors
  // above (dog/restriction/condition fetch) are still surfaced as throws.
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (err) {
    console.warn(
      '[ragRetrieval] embedding unavailable — proceeding with no research context ' +
        '(research_relevance will contribute 0):',
      err
    );
    return [];
  }

  const { data, error } = await supabaseAdmin.rpc('match_research_chunks', {
    query_embedding: queryEmbedding,
    match_count: topK,
  });

  if (error) {
    console.warn(
      '[ragRetrieval] match_research_chunks RPC failed — proceeding with no research ' +
        'context (research_relevance will contribute 0):',
      error
    );
    return [];
  }

  return ((data ?? []) as MatchRow[])
    // Defense in depth: the RPC already filters review_status='approved' and
    // superseded_by is null; re-asserting here means a future change to the
    // SQL function can't silently leak unreviewed/stale research into
    // recommendations without also being caught at this layer.
    .filter((row) => row.review_status === 'approved')
    .map((row) => ({
      chunk_id: row.chunk_id,
      document_id: row.document_id,
      content: row.content,
      chunk_index: row.chunk_index,
      similarity: row.similarity,
      topic: row.topic,
      source_url: row.source_url,
      title: row.title,
    }));
}
