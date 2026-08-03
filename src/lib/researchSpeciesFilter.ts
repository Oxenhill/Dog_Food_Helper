/**
 * PDF uploads have no PubMed MeSH metadata to check species against (the
 * document-level gate `evaluateResearchEvidenceAdmissibility` uses for the
 * URL/PMID import path) -- all we have is extracted plain text. A brochure
 * or multi-species guide can legitimately contain both dog and cat sections
 * in one file, so the useful unit to filter is the chunk, not the whole
 * document: reject only the passages that are about cats and never dogs,
 * keep everything else (dog-only, and mixed passages that genuinely compare
 * the two -- those still carry real dog-relevant information).
 *
 * Deterministic keyword match, not a model call: cheap, auditable, and
 * consistent with how the rest of this pipeline treats species as a
 * structured fact rather than something inferred.
 */

const DOG_TERM_PATTERN = /\b(dogs?|canine[s]?|pupp(?:y|ies))\b/i;
const CAT_TERM_PATTERN = /\b(cats?|feline[s]?|kittens?)\b/i;

export type ChunkSpeciesClassification = 'dog_relevant' | 'cat_only';

export function classifyChunkSpecies(chunkContent: string): ChunkSpeciesClassification {
  const hasCatTerm = CAT_TERM_PATTERN.test(chunkContent);
  const hasDogTerm = DOG_TERM_PATTERN.test(chunkContent);
  return hasCatTerm && !hasDogTerm ? 'cat_only' : 'dog_relevant';
}

export interface SpeciesChunkFilterResult {
  keptChunks: string[];
  discardedChunks: Array<{ index: number; content: string }>;
}

/**
 * Splits chunks into dog-relevant (kept, in original order) and cat-only
 * (discarded). Does not touch chunks that mention neither species term --
 * generic nutrition/company content is kept, since it isn't species-specific
 * evidence that needs discarding.
 */
export function filterCatOnlyChunks(chunks: string[]): SpeciesChunkFilterResult {
  const keptChunks: string[] = [];
  const discardedChunks: Array<{ index: number; content: string }> = [];
  chunks.forEach((content, index) => {
    if (classifyChunkSpecies(content) === 'cat_only') {
      discardedChunks.push({ index, content });
    } else {
      keptChunks.push(content);
    }
  });
  return { keptChunks, discardedChunks };
}
