import { DiscoveryRunResult, uniqueCandidates } from './researchDiscovery';
import { RESEARCH_DISCOVERY_TOPICS } from './researchTopics';

// Re-verified 2026-07-29 against the Vercel AI Gateway model catalog.
// openai/text-embedding-3-small is $0.02 / 1M input tokens with zero Gateway
// markup.
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_GATEWAY_USD_PER_MILLION_TOKENS = 0.02;
export const DEFAULT_DOCUMENT_CAP = 30;
export const DEFAULT_ESTIMATED_OA_FULL_TEXT_CHARS = 40_000;

export interface ResearchCostEstimate {
  document_cap: number;
  candidate_documents_considered: number;
  estimated_abstract_only_documents: number;
  estimated_open_access_documents: number;
  estimated_document_tokens: number;
  estimated_centroid_tokens: number;
  estimated_embedding_tokens: number;
  embedding_model: string;
  embedding_gateway_usd_per_million_tokens: number;
  estimated_embedding_cost_usd: number;
  drafting_cost_usd: null;
  drafting_cost_note: string;
}
function estimatedTokensFromChars(characters: number): number {
  // Deliberately conservative, transparent approximation for English prose.
  return Math.ceil(characters / 4);
}

export function estimateResearchCosts(
  run: DiscoveryRunResult,
  documentCap = DEFAULT_DOCUMENT_CAP,
  estimatedOaFullTextChars = DEFAULT_ESTIMATED_OA_FULL_TEXT_CHARS,
): ResearchCostEstimate {
  const selected = uniqueCandidates(run).slice(0, documentCap);
  const documentChars = selected.reduce((total, candidate) => {
    if (candidate.open_access) return total + estimatedOaFullTextChars;
    return total + (candidate.abstract_text?.length ?? 0);
  }, 0);
  const centroidChars = RESEARCH_DISCOVERY_TOPICS.reduce(
    (total, topic) => total + topic.label.length + topic.terms.join(' ').length,
    0,
  );
  const documentTokens = estimatedTokensFromChars(documentChars);
  const centroidTokens = estimatedTokensFromChars(centroidChars);
  const embeddingTokens = documentTokens + centroidTokens;
  const embeddingCost =
    (embeddingTokens / 1_000_000) * EMBEDDING_GATEWAY_USD_PER_MILLION_TOKENS;

  return {
    document_cap: documentCap,
    candidate_documents_considered: selected.length,
    estimated_abstract_only_documents: selected.filter((candidate) => candidate.abstract_only).length,
    estimated_open_access_documents: selected.filter((candidate) => candidate.open_access).length,
    estimated_document_tokens: documentTokens,
    estimated_centroid_tokens: centroidTokens,
    estimated_embedding_tokens: embeddingTokens,
    embedding_model: EMBEDDING_MODEL,
    embedding_gateway_usd_per_million_tokens: EMBEDDING_GATEWAY_USD_PER_MILLION_TOKENS,
    estimated_embedding_cost_usd: Number(embeddingCost.toFixed(6)),
    drafting_cost_usd: null,
    drafting_cost_note:
      'Not incurred or estimated yet: Gate 3 drafting model and the relevance threshold are deliberately unset until Gate 1/2 evidence is reviewed.',
  };
}
