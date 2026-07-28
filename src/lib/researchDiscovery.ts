import {
  ResearchCandidate,
  PubMedRecord,
  EuropePmcResult,
  applyJatsFundingMetadata,
  extractJatsFundingMetadata,
  mapPubMedRecord,
  parsePubMedXml,
} from './researchEvidence';
import {
  RESEARCH_DISCOVERY_TOPICS,
  ResearchDiscoveryTopic,
} from './researchTopics';

const PUBMED_SEARCH_URL =
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_FETCH_URL =
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const EUROPE_PMC_FULL_TEXT_ROOT =
  'https://www.ebi.ac.uk/europepmc/webservices/rest';
const EUROPE_PMC_SEARCH_URL = `${EUROPE_PMC_FULL_TEXT_ROOT}/search`;
const EUTILS_TOOL = 'BowlResearchLayer';
const EUTILS_EMAIL = 'admin@dog-smart.co.uk';

interface PubMedSearchResponse {
  esearchresult?: {
    idlist?: string[];
    errorlist?: { phrasesnotfound?: string[] };
  };
}

export interface TopicDiscoveryResult {
  topic: ResearchDiscoveryTopic;
  query: string;
  candidates: ResearchCandidate[];
  error: string | null;
}

export interface DiscoveryRunResult {
  generated_at: string;
  candidates_per_topic: number;
  topic_count: number;
  results: TopicDiscoveryResult[];
  unique_candidate_count: number;
  duplicate_candidate_count: number;
  grade_counts: Record<string, number>;
  access_counts: { open_access_full_text: number; abstract_only: number };
  completeness_counts: { complete: number; incomplete: number };
  missing_input_counts: Record<string, number>;
  jats_enrichment: {
    cap: number;
    attempted: number;
    succeeded: number;
    failed: number;
  };
}

export interface DiscoveryOptions {
  candidatesPerTopic?: number;
  topicKeys?: string[];
  fromYear?: number;
  toYear?: number;
  concurrency?: number;
  fullTextDocumentCap?: number;
  fetchImpl?: typeof fetch;
}

function escapePubMedPhrase(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildPubMedQuery(
  topic: ResearchDiscoveryTopic,
  fromYear = topic.fromYear ?? 2010,
  toYear = new Date().getUTCFullYear(),
): string {
  const speciesClause = topic.evidenceScope === 'veterinary_methodology'
    ? '("Dogs"[Mesh] OR "Veterinary Medicine"[Mesh])'
    : '"Dogs"[Mesh]';
  const titleAbstractTerms = topic.terms
    .map((term) => `"${escapePubMedPhrase(term)}"[Title/Abstract]`)
  const primaryMeshTerms = (topic.primaryMeshTerms ?? [])
    .map((term) => `"${escapePubMedPhrase(term)}"[Mesh]`);
  const terms = [...titleAbstractTerms, ...primaryMeshTerms].join(' OR ');
  const context = topic.contextTerms?.length
    ? ` AND (${[
        ...topic.contextTerms.map(
          (term) => `"${escapePubMedPhrase(term)}"[Title/Abstract]`,
        ),
        ...(topic.contextMeshTerms ?? [])
          .map((term) => `"${escapePubMedPhrase(term)}"[Mesh]`),
      ].join(' OR ')})`
    : '';
  const meshRequirements = (topic.requiredMeshGroups ?? [])
    .map((group) => ` AND (${group
      .map((term) => `"${escapePubMedPhrase(term)}"[Mesh]`)
      .join(' OR ')})`)
    .join('');
  const meshExclusions = topic.excludedMeshTerms?.length
    ? ` NOT (${topic.excludedMeshTerms
      .map((term) => `"${escapePubMedPhrase(term)}"[Mesh]`)
      .join(' OR ')})`
    : '';
  const caseReportFilter = topic.includeCaseReports
    ? ''
    : ' NOT "Case Reports"[Publication Type]';

  return [
    speciesClause,
    `(${terms})${context}${meshRequirements}${meshExclusions}`,
    'hasabstract',
    `("${fromYear}/01/01"[Date - Publication] : "${toYear}/12/31"[Date - Publication])`,
  ].join(' AND ') + caseReportFilter;
}

async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  accept: string,
  attempts = 5,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let retryAfterHeader: string | null = null;
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: accept,
          'User-Agent': `${EUTILS_TOOL}/1.0 (mailto:${EUTILS_EMAIL})`,
        },
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
      retryAfterHeader = response.headers.get('retry-after');
    } catch (error) {
      lastError = error;
    }
    const retryAfterSeconds = Number.parseInt(
      retryAfterHeader ?? '',
      10,
    );
    const backoffMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : 1000 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
  throw lastError instanceof Error ? lastError : new Error('Source request failed');
}

function createRateGate(minimumIntervalMs: number) {
  let nextAllowedAt = 0;
  return async () => {
    const now = Date.now();
    const waitMs = Math.max(0, nextAllowedAt - now);
    nextAllowedAt = Math.max(now, nextAllowedAt) + minimumIntervalMs;
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  };
}

async function searchPubMedTopic(
  topic: ResearchDiscoveryTopic,
  candidatesPerTopic: number,
  fromYear: number | undefined,
  toYear: number | undefined,
  fetchImpl: typeof fetch,
  beforeNcbiRequest: () => Promise<void>,
): Promise<{ topic: ResearchDiscoveryTopic; query: string; pmids: string[]; error: string | null }> {
  const query = buildPubMedQuery(
    topic,
    fromYear ?? topic.fromYear ?? 2010,
    toYear ?? new Date().getUTCFullYear(),
  );
  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmode: 'json',
    retmax: String(candidatesPerTopic),
    sort: 'relevance',
    tool: EUTILS_TOOL,
    email: EUTILS_EMAIL,
  });

  try {
    await beforeNcbiRequest();
    const response = await fetchWithRetry(
      `${PUBMED_SEARCH_URL}?${params}`,
      fetchImpl,
      'application/json',
    );
    if (!response.ok) {
      return { topic, query, pmids: [], error: `PubMed returned HTTP ${response.status}` };
    }
    const body = (await response.json()) as PubMedSearchResponse;
    const phrasesNotFound = body.esearchresult?.errorlist?.phrasesnotfound ?? [];
    if (phrasesNotFound.length > 0) {
      return {
        topic,
        query,
        pmids: body.esearchresult?.idlist ?? [],
        error: `PubMed did not recognize: ${phrasesNotFound.join(', ')}`,
      };
    }
    return {
      topic,
      query,
      pmids: body.esearchresult?.idlist ?? [],
      error: null,
    };
  } catch (error) {
    return {
      topic,
      query,
      pmids: [],
      error: error instanceof Error ? error.message : 'PubMed request failed',
    };
  }
}

async function fetchPubMedRecords(
  pmids: string[],
  fetchImpl: typeof fetch,
  beforeNcbiRequest: () => Promise<void>,
): Promise<Map<string, PubMedRecord>> {
  const records = new Map<string, PubMedRecord>();
  for (let offset = 0; offset < pmids.length; offset += 150) {
    const batch = pmids.slice(offset, offset + 150);
    const params = new URLSearchParams({
      db: 'pubmed',
      id: batch.join(','),
      retmode: 'xml',
      tool: EUTILS_TOOL,
      email: EUTILS_EMAIL,
    });
    await beforeNcbiRequest();
    const response = await fetchWithRetry(
      `${PUBMED_FETCH_URL}?${params}`,
      fetchImpl,
      'application/xml',
    );
    if (!response.ok) continue;
    const parsed = parsePubMedXml(await response.text());
    for (const [pmid, record] of parsed) records.set(pmid, record);
  }
  return records;
}

async function resolveEuropePmcMetadata(
  pmids: string[],
  fetchImpl: typeof fetch,
): Promise<Map<string, EuropePmcResult>> {
  const records = new Map<string, EuropePmcResult>();
  for (let offset = 0; offset < pmids.length; offset += 40) {
    const batch = pmids.slice(offset, offset + 40);
    const query = `(${batch.map((pmid) => `EXT_ID:${pmid}`).join(' OR ')}) AND SRC:MED`;
    const params = new URLSearchParams({
      query,
      format: 'json',
      resultType: 'core',
      pageSize: String(batch.length),
    });
    const response = await fetchWithRetry(
      `${EUROPE_PMC_SEARCH_URL}?${params}`,
      fetchImpl,
      'application/json',
    );
    if (!response.ok) continue;
    const body = (await response.json()) as {
      resultList?: { result?: EuropePmcResult[] };
    };
    for (const record of body.resultList?.result ?? []) {
      if (record.pmid) records.set(record.pmid, record);
    }
  }
  return records;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      output[index] = await mapper(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return output;
}

interface JatsFetchResult {
  pmcid: string;
  endpoint: string;
  metadata: ReturnType<typeof extractJatsFundingMetadata> | null;
  error: string | null;
}

async function fetchJatsFunding(
  pmcid: string,
  fetchImpl: typeof fetch,
): Promise<JatsFetchResult> {
  const endpoint = `${EUROPE_PMC_FULL_TEXT_ROOT}/${encodeURIComponent(pmcid)}/fullTextXML`;
  try {
    const response = await fetchWithRetry(endpoint, fetchImpl, 'application/xml');
    if (!response.ok) {
      return {
        pmcid,
        endpoint,
        metadata: null,
        error: `Europe PMC fullTextXML returned HTTP ${response.status}`,
      };
    }
    return {
      pmcid,
      endpoint,
      metadata: extractJatsFundingMetadata(await response.text()),
      error: null,
    };
  } catch (error) {
    return {
      pmcid,
      endpoint,
      metadata: null,
      error: error instanceof Error ? error.message : 'Europe PMC fullTextXML failed',
    };
  }
}

function normalizedTitle(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function titleSimilarity(left: string, right: string): number {
  const a = normalizedTitle(left);
  const b = normalizedTitle(right);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const pairs = (value: string) => {
    const counts = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index++) {
      const pair = value.slice(index, index + 2);
      counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
    return counts;
  };
  const leftPairs = pairs(a);
  const rightPairs = pairs(b);
  let overlap = 0;
  for (const [pair, count] of leftPairs) {
    overlap += Math.min(count, rightPairs.get(pair) ?? 0);
  }
  const leftCount = [...leftPairs.values()].reduce((sum, count) => sum + count, 0);
  const rightCount = [...rightPairs.values()].reduce((sum, count) => sum + count, 0);
  return (2 * overlap) / (leftCount + rightCount);
}

function annotateDuplicates(results: TopicDiscoveryResult[]): void {
  const unique: ResearchCandidate[] = [];
  const doiOwners = new Map<string, ResearchCandidate>();
  for (const result of results) {
    for (const candidate of result.candidates) {
      if (candidate.doi && doiOwners.has(candidate.doi)) {
        candidate.duplicate_of = doiOwners.get(candidate.doi)!.source_id;
        candidate.title_similarity = 1;
        continue;
      }

      let closest: ResearchCandidate | null = null;
      let closestScore = 0;
      for (const existing of unique) {
        const score = titleSimilarity(candidate.title, existing.title);
        if (score > closestScore) {
          closest = existing;
          closestScore = score;
        }
      }
      if (closest && closestScore >= 0.92) {
        candidate.duplicate_of = closest.source_id;
        candidate.title_similarity = Number(closestScore.toFixed(4));
        continue;
      }

      unique.push(candidate);
      if (candidate.doi) doiOwners.set(candidate.doi, candidate);
    }
  }
}

export async function discoverResearchCandidates(
  options: DiscoveryOptions = {},
): Promise<DiscoveryRunResult> {
  const candidatesPerTopic = Math.max(1, Math.min(options.candidatesPerTopic ?? 2, 10));
  const fullTextDocumentCap = Math.max(0, Math.min(options.fullTextDocumentCap ?? 30, 30));
  const topicKeySet = options.topicKeys ? new Set(options.topicKeys) : null;
  const topics = RESEARCH_DISCOVERY_TOPICS.filter(
    (topic) => !topicKeySet || topicKeySet.has(topic.key),
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const checkedAt = new Date().toISOString();
  // NCBI permits at most three requests/second without a key. Stay well below
  // that ceiling because retries and other project processes may share the IP.
  const beforeNcbiRequest = createRateGate(options.fetchImpl ? 0 : 500);

  // PubMed is intentionally primary. Direct-evidence queries are led by
  // Dogs[Mesh]; the four explicit mechanism streams use non-canine MeSH terms
  // and exclude Dogs[Mesh]. ESearch ranks before Europe PMC lookup.
  const searches = [];
  for (const topic of topics) {
    searches.push(await searchPubMedTopic(
      topic,
      candidatesPerTopic,
      options.fromYear,
      options.toYear,
      fetchImpl,
      beforeNcbiRequest,
    ));
  }

  const allPmids = [...new Set(searches.flatMap((result) => result.pmids))];
  const pubMedRecords = await fetchPubMedRecords(allPmids, fetchImpl, beforeNcbiRequest);
  const europePmcRecords = await resolveEuropePmcMetadata(allPmids, fetchImpl);
  let results: TopicDiscoveryResult[] = searches.map((search) => ({
    topic: search.topic,
    query: search.query,
    error: search.error,
    candidates: search.pmids
      .map((pmid) => pubMedRecords.get(pmid))
      .filter((record): record is NonNullable<typeof record> => Boolean(record))
      .map((record) => {
        const candidate = mapPubMedRecord(record, search.topic, search.query, checkedAt);
        const europePmc = europePmcRecords.get(record.pmid);
        const openAccess =
          europePmc?.isOpenAccess === 'Y'
          && europePmc?.inPMC === 'Y'
          && Boolean(europePmc.pmcid);
        return {
          ...candidate,
          pmcid: europePmc?.pmcid ?? candidate.pmcid,
          full_text_url: openAccess
            ? `https://europepmc.org/articles/${europePmc!.pmcid}`
            : null,
          open_access: openAccess,
          abstract_only: !openAccess,
          license: europePmc?.license?.trim() || null,
          retracted:
            candidate.retracted
            || europePmc?.isRetracted === true
            || europePmc?.isRetracted === 'Y',
          grading_input_sources: {
            ...candidate.grading_input_sources,
            funding_independent: openAccess
              ? 'Pending Europe PMC fullTextXML JATS enrichment'
              : 'Unavailable: Europe PMC does not expose OA fullTextXML',
          },
          source_metadata: {
            ...candidate.source_metadata,
            europe_pmc: europePmc ?? null,
          },
        };
      }),
  }));

  const uniquePmcids = [
    ...new Set(
      results
        .flatMap((result) => result.candidates)
        .filter((candidate) => candidate.open_access)
        .map((candidate) => candidate.pmcid)
        .filter((pmcid): pmcid is string => Boolean(pmcid)),
    ),
  ];
  const selectedPmcids = uniquePmcids.slice(0, fullTextDocumentCap);
  const jatsResults = await mapWithConcurrency(
    selectedPmcids,
    Math.max(1, Math.min(options.concurrency ?? 3, 3)),
    (pmcid) => fetchJatsFunding(pmcid, fetchImpl),
  );
  const jatsByPmcid = new Map(jatsResults.map((result) => [result.pmcid, result]));
  const selectedSet = new Set(selectedPmcids);

  results = results.map((result) => ({
    ...result,
    candidates: result.candidates.map((candidate) => {
      if (!candidate.pmcid) return candidate;
      const jats = jatsByPmcid.get(candidate.pmcid);
      if (jats?.metadata) {
        return applyJatsFundingMetadata(candidate, jats.metadata, jats.endpoint);
      }
      const fullTextFetchFailed = selectedSet.has(candidate.pmcid) && Boolean(jats?.error);
      return {
        ...candidate,
        full_text_url: fullTextFetchFailed ? null : candidate.full_text_url,
        open_access: fullTextFetchFailed ? false : candidate.open_access,
        abstract_only: fullTextFetchFailed ? true : candidate.abstract_only,
        grading_input_sources: {
          ...candidate.grading_input_sources,
          funding_independent: selectedSet.has(candidate.pmcid)
            ? `Europe PMC fullTextXML unavailable: ${jats?.error ?? 'unknown error'}`
            : `Not fetched: Gate 1 OA enrichment cap of ${fullTextDocumentCap} reached`,
        },
        source_metadata: {
          ...candidate.source_metadata,
          europe_pmc_full_text_xml: jats
            ? { endpoint: jats.endpoint, error: jats.error }
            : null,
        },
      };
    }),
  }));

  annotateDuplicates(results);
  const all = results.flatMap((result) => result.candidates);
  const unique = all.filter((candidate) => !candidate.duplicate_of);
  const gradeCounts = Object.fromEntries(
    ['A', 'B', 'C', 'D', 'E'].map((grade) => [
      grade,
      unique.filter((candidate) => candidate.evidence_grade === grade).length,
    ]),
  );
  const missingInputCounts: Record<string, number> = {};
  for (const candidate of unique) {
    for (const field of candidate.missing_grading_inputs) {
      missingInputCounts[field] = (missingInputCounts[field] ?? 0) + 1;
    }
  }

  return {
    generated_at: checkedAt,
    candidates_per_topic: candidatesPerTopic,
    topic_count: topics.length,
    results,
    unique_candidate_count: unique.length,
    duplicate_candidate_count: all.length - unique.length,
    grade_counts: gradeCounts,
    access_counts: {
      open_access_full_text: unique.filter((candidate) => candidate.open_access).length,
      abstract_only: unique.filter((candidate) => candidate.abstract_only).length,
    },
    completeness_counts: {
      complete: unique.filter((candidate) => candidate.grading_inputs_complete).length,
      incomplete: unique.filter((candidate) => !candidate.grading_inputs_complete).length,
    },
    missing_input_counts: missingInputCounts,
    jats_enrichment: {
      cap: fullTextDocumentCap,
      attempted: selectedPmcids.length,
      succeeded: jatsResults.filter((result) => result.metadata !== null).length,
      failed: jatsResults.filter((result) => result.metadata === null).length,
    },
  };
}

export function uniqueCandidates(run: DiscoveryRunResult): ResearchCandidate[] {
  return run.results
    .flatMap((result) => result.candidates)
    .filter((candidate) => !candidate.duplicate_of);
}
