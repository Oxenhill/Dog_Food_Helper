import { supabaseAdmin } from './supabase';
import { ResearchTopic, ReviewStatus } from './types';

/**
 * Embedding pipeline (Phase 4)
 *
 * ---------------------------------------------------------------------------
 * DEVIATION LOGGED (per CLAUDE.md's "stop and log, don't guess" rule) — see
 * BUILD_PROGRESS.md for the full note. Summary: the Phase 4 prompt says
 * "Call Claude Haiku to embed each chunk into a 1536-dimensional vector".
 * Anthropic does not expose an embeddings endpoint for any Claude model
 * (Haiku included) — Claude models are text-generation models, not embedding
 * models, and Anthropic's own docs point users to a third-party embeddings
 * provider (Voyage AI) for this. There is no way to literally satisfy "Claude
 * Haiku generates the embedding vector" as written, so rather than silently
 * inventing a different, unflagged approach, this is called out explicitly:
 *
 * generateEmbedding() below tries, in order:
 *   1. OpenAI `text-embedding-3-small` if OPENAI_API_KEY is set — chosen as
 *      the default real-provider fallback because it natively returns
 *      1536-dim vectors (exact match for the `research_chunks.embedding
 *      vector(1536)` column, zero dimension-mismatch risk).
 *   2. Voyage AI `voyage-3-large` if VOYAGE_API_KEY is set instead (Anthropic's
 *      recommended embeddings partner).
 *   3. A local deterministic pseudo-embedding (hash-seeded, unit-normalized)
 *      if neither key is present, purely so the pipeline and schema can be
 *      exercised end-to-end (chunking, storage, retrieval plumbing) without
 *      an external key. This fallback is NOT semantically meaningful —
 *      similarity search results using it are effectively arbitrary. It logs
 *      a warning every time it's used and must not be relied on in
 *      production. Needs owner decision: which real embedding provider to
 *      use (OpenAI vs Voyage vs other) before Phase 4 is production-ready.
 *
 * Whatever provider is used, the returned vector is normalized to exactly
 * 1536 dimensions (padded/truncated) before being written, so the DB column
 * never rejects a write regardless of provider's native output size.
 * ---------------------------------------------------------------------------
 */

const EMBEDDING_DIM = 1536;

function normalizeToDimension(vec: number[], dim: number): number[] {
  if (vec.length === dim) return vec;
  if (vec.length > dim) return vec.slice(0, dim);
  return [...vec, ...new Array(dim - vec.length).fill(0)];
}

async function embedWithOpenAI(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings request failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.data[0].embedding as number[];
}

async function embedWithVoyage(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'voyage-3-large',
      input: [text],
      input_type: 'document',
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings request failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.data[0].embedding as number[];
}

/** Deterministic, dependency-free pseudo-embedding — dev/test fallback only.
 * NOT semantically meaningful. See module-level deviation note above. */
function localPseudoEmbedding(text: string): number[] {
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  }
  const vec = new Array(EMBEDDING_DIM);
  let state = seed || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    // xorshift32 PRNG — fast, deterministic, no external dependency
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    vec[i] = (state / 0xffffffff) * 2 - 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

let warnedLocalFallback = false;

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text.trim();
  let raw: number[];

  if (process.env.OPENAI_API_KEY) {
    raw = await embedWithOpenAI(cleaned);
  } else if (process.env.VOYAGE_API_KEY) {
    raw = await embedWithVoyage(cleaned);
  } else {
    if (!warnedLocalFallback) {
      console.warn(
        '[embeddingPipeline] No OPENAI_API_KEY or VOYAGE_API_KEY set — using a local ' +
          'deterministic pseudo-embedding. This is NOT semantically meaningful and RAG ' +
          'retrieval results will be arbitrary. Set OPENAI_API_KEY (recommended, native ' +
          '1536-dim) or VOYAGE_API_KEY before relying on this in anything but local dev. ' +
          'See src/lib/embeddingPipeline.ts header comment / BUILD_PROGRESS.md.'
      );
      warnedLocalFallback = true;
    }
    raw = localPseudoEmbedding(cleaned);
  }

  return normalizeToDimension(raw, EMBEDDING_DIM);
}

/**
 * Chunk a plain-text document into roughly `maxChars`-sized pieces, splitting
 * on paragraph boundaries first and falling back to sentence boundaries for
 * any paragraph that's still too long. Good enough for Phase 4's seeded
 * plain-text sample docs; a real URL-fetch ingestion path (HTML → text
 * extraction) is out of scope here per the phase prompt ("for Phase 4, seed
 * sample docs as plain text").
 */
export function chunkText(text: string, maxChars = 800): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      // Split the oversized paragraph on sentence boundaries.
      flush();
      const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [paragraph];
      let sentenceChunk = '';
      for (const sentence of sentences) {
        if ((sentenceChunk + sentence).length > maxChars) {
          if (sentenceChunk.trim()) chunks.push(sentenceChunk.trim());
          sentenceChunk = sentence;
        } else {
          sentenceChunk += sentence;
        }
      }
      if (sentenceChunk.trim()) chunks.push(sentenceChunk.trim());
      continue;
    }

    if ((current + '\n\n' + paragraph).length > maxChars) {
      flush();
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  flush();

  return chunks.length ? chunks : [text.trim()];
}

export interface IngestResearchDocumentInput {
  topic: ResearchTopic;
  title: string;
  source_url?: string | null;
  text: string;
  /** Defaults to 'pending' — matches architecture doc §7's "never auto-merge
   * unreviewed content" principle applied to research: ingestion alone never
   * makes a document live for retrieval. An explicit review step (or, for
   * Phase 4 seeding, an explicit review_status: 'approved' override) does. */
  review_status?: ReviewStatus;
  /** If set, the document being replaced gets its `superseded_by` pointed at
   * the newly-ingested document — makes the freshness/versioning fields
   * functional rather than schema placeholders, per the phase prompt. */
  supersedes_document_id?: string | null;
}

export interface IngestResearchDocumentResult {
  document_id: string;
  chunk_count: number;
}

/**
 * Ingest a research document: chunk it, embed each chunk, write
 * research_documents + research_chunks. For Phase 4, `text` is supplied
 * directly (seeded sample docs) rather than fetched from `source_url` — URL
 * fetching/HTML extraction is a natural Phase 6-era extension of this same
 * function (discoverNewFoods-adjacent), not built here.
 */
export async function ingestResearchDocument(
  input: IngestResearchDocumentInput
): Promise<IngestResearchDocumentResult> {
  const { data: doc, error: docError } = await supabaseAdmin
    .from('research_documents')
    .insert({
      topic: input.topic,
      title: input.title,
      source_url: input.source_url ?? null,
      retrieved_at: new Date().toISOString(),
      review_status: input.review_status ?? 'pending',
    })
    .select()
    .single();

  if (docError || !doc) throw docError ?? new Error('Failed to insert research_documents row');

  const chunks = chunkText(input.text);
  const rows = [];
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);
    rows.push({
      document_id: doc.id,
      content: chunks[i],
      embedding,
      chunk_index: i,
    });
  }

  const { error: chunkError } = await supabaseAdmin.from('research_chunks').insert(rows);
  if (chunkError) throw chunkError;

  if (input.supersedes_document_id) {
    const { error: supersedeError } = await supabaseAdmin
      .from('research_documents')
      .update({ superseded_by: doc.id })
      .eq('id', input.supersedes_document_id);
    if (supersedeError) throw supersedeError;
  }

  return { document_id: doc.id, chunk_count: rows.length };
}
