import {
  extractJatsFundingMetadata,
  parsePubMedXml,
  PubMedRecord,
} from './researchEvidence';
import { Gate1ManifestCandidate } from './researchGate2';
import {
  LOCAL_LITERATURE_REGISTRY_V1,
  ResearchLiteratureSourceError,
  createLiteratureRateGate,
  literatureEndpoint,
  resolveLiteratureSourceRoute,
  type LiteratureRegistrySnapshot,
  type LiteratureSourceRoute,
} from './researchLiteratureSources';

const EUTILS_TOOL = 'BowlResearchLayerGate2';
const EUTILS_EMAIL = 'admin@dog-smart.co.uk';

export interface PreparedSourceDocument {
  manifest: Gate1ManifestCandidate;
  pubmed: PubMedRecord;
  content_source: 'europe_pmc_jats' | 'pubmed_abstract';
  content_endpoint: string;
  content_retrieved_at: string;
  source_payload_sha256: string;
  source_access_note: string | null;
  plain_text: string;
  license: string | null;
  funding_declaration: string | null;
  competing_interests_declaration: string | null;
}

class SourceHttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`${url} returned HTTP ${status}`);
  }
}

async function fetchOk(
  url: string,
  accept: string,
  fetchImpl: typeof fetch,
  attempts = 5,
): Promise<Response> {
  let lastError: unknown;
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: accept,
          'User-Agent': `${EUTILS_TOOL}/1.0 (mailto:${EUTILS_EMAIL})`,
        },
      });
      if (response.ok) return response;
      lastStatus = response.status;
      if (response.status < 500 && response.status !== 429) {
        throw new SourceHttpError(response.status, url);
      }
      lastError = new Error(`${url} returned HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after'));
      await new Promise((resolve) =>
        setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 1000),
      );
    } catch (error) {
      if (error instanceof SourceHttpError) throw error;
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  if (lastStatus === 429) {
    throw new ResearchLiteratureSourceError(
      'rate_limited',
      `${url} remained rate limited after ${attempts} attempts`
    );
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function xmlText(value: string): string {
  return decodeXml(
    value
      .replace(/<xref\b[^>]*>[\s\S]*?<\/xref>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function elementBody(xml: string, tag: string): string | null {
  return xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? null;
}

/** Reduced, deterministic JATS text. Raw XML never enters an embedding/model call. */
export function extractJatsArticleText(xml: string): string {
  const articleTitle = elementBody(xml, 'article-title');
  const abstract = elementBody(xml, 'abstract');
  const body = elementBody(xml, 'body');
  const source = [abstract, body].filter(Boolean).join('\n');
  const paragraphs = [
    ...(articleTitle ? [xmlText(articleTitle)] : []),
    ...[
      ...source.matchAll(/<(?:title|p)\b[^>]*>([\s\S]*?)<\/(?:title|p)>/gi),
    ]
    .map((match) => xmlText(match[1]))
    .filter(Boolean),
  ];
  const deduplicated = paragraphs.filter(
    (paragraph, index) => paragraph !== paragraphs[index - 1],
  );
  const text = deduplicated.join('\n\n').trim();
  if (!text) throw new Error('Europe PMC JATS contained no extractable article text');
  return text;
}

export function extractJatsLicense(xml: string): string | null {
  const licenseTag = xml.match(/<license\b([^>]*)>/i);
  const licenseType = licenseTag?.[1].match(/license-type=["']([^"']+)["']/i)?.[1];
  const licenseText = elementBody(xml, 'license-p');
  return licenseType?.trim() || (licenseText ? xmlText(licenseText) : null);
}

function normalizeDoi(value: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}

export function identifierDiff(
  manifest: Gate1ManifestCandidate,
  pubmed: PubMedRecord,
): string[] {
  const diffs: string[] = [];
  if (pubmed.pmid !== manifest.pmid) {
    diffs.push(`PMID report=${manifest.pmid} current=${pubmed.pmid}`);
  }
  if (normalizeDoi(pubmed.doi) !== normalizeDoi(manifest.doi)) {
    diffs.push(`DOI report=${manifest.doi ?? 'null'} current=${pubmed.doi ?? 'null'}`);
  }
  if (
    (pubmed.pmcid?.toUpperCase() ?? null) !== (manifest.pmcid?.toUpperCase() ?? null)
  ) {
    diffs.push(
      `PMCID report=${manifest.pmcid ?? 'null'} current=${pubmed.pmcid ?? 'null'}`,
    );
  }
  return diffs;
}

async function fetchPubMedRecords(
  pmids: string[],
  fetchImpl: typeof fetch,
  route: LiteratureSourceRoute,
  beforeRequest: () => Promise<void>,
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
    await beforeRequest();
    const response = await fetchOk(
      `${literatureEndpoint(route)}?${params}`,
      'application/xml',
      fetchImpl,
    );
    for (const [pmid, record] of parsePubMedXml(await response.text())) {
      records.set(pmid, record);
    }
  }
  return records;
}

export async function prepareSelectedSources(
  selected: Gate1ManifestCandidate[],
  fetchImpl: typeof fetch = fetch,
  registry: LiteratureRegistrySnapshot = LOCAL_LITERATURE_REGISTRY_V1,
): Promise<PreparedSourceDocument[]> {
  const pubmedRoute = resolveLiteratureSourceRoute(registry, 'citation_fetch');
  const abstractRoute = resolveLiteratureSourceRoute(registry, 'abstract_content');
  const beforePubmedRequest = createLiteratureRateGate(
    fetchImpl === fetch ? pubmedRoute.policy.minimum_interval_ms : 0
  );
  let beforeFullTextRequest: (() => Promise<void>) | null = null;
  const records = await fetchPubMedRecords(
    selected.map((candidate) => candidate.pmid),
    fetchImpl,
    pubmedRoute,
    beforePubmedRequest,
  );
  const prepared: PreparedSourceDocument[] = [];
  for (const candidate of selected) {
    const pubmed = records.get(candidate.pmid);
    if (!pubmed) throw new Error(`PubMed did not return manifest PMID ${candidate.pmid}`);
    const diffs = identifierDiff(candidate, pubmed);
    if (diffs.length > 0) {
      throw new Error(
        `Identifier drift for PMID ${candidate.pmid}; no substitution allowed: ${diffs.join('; ')}`,
      );
    }
    const retrievedAt = new Date().toISOString();
    const { createHash } = await import('node:crypto');
    if (!candidate.open_access || !candidate.pmcid) {
      if (!candidate.abstract_only || !pubmed.abstract_text) {
        throw new Error(
          `Selected document ${candidate.pmid} has neither immutable OA XML nor a PubMed abstract`,
        );
      }
      const plainText = `${pubmed.title}\n\n${pubmed.abstract_text}`.trim();
      prepared.push({
        manifest: candidate,
        pubmed,
        content_source: 'pubmed_abstract',
        content_endpoint: `${literatureEndpoint(abstractRoute)}?db=pubmed&id=${candidate.pmid}&retmode=xml`,
        content_retrieved_at: retrievedAt,
        source_payload_sha256: createHash('sha256')
          .update(plainText, 'utf8')
          .digest('hex'),
        source_access_note: null,
        plain_text: plainText,
        license: null,
        funding_declaration: null,
        competing_interests_declaration: null,
      });
      continue;
    }
    const fullTextDecision = resolveLiteratureSourceRoute(
      registry,
      'open_access_full_text',
      { openAccess: candidate.open_access, inPmc: Boolean(candidate.pmcid) }
    );
    beforeFullTextRequest ??= createLiteratureRateGate(
      fetchImpl === fetch ? fullTextDecision.policy.minimum_interval_ms : 0
    );
    const endpoint = literatureEndpoint(fullTextDecision, { pmcid: candidate.pmcid });
    let response: Response;
    try {
      await beforeFullTextRequest();
      response = await fetchOk(endpoint, 'application/xml', fetchImpl);
    } catch (error) {
      if (!(error instanceof SourceHttpError) || error.status !== 404 || !pubmed.abstract_text) {
        throw error;
      }
      const plainText = `${pubmed.title}\n\n${pubmed.abstract_text}`.trim();
      prepared.push({
        manifest: candidate,
        pubmed,
        content_source: 'pubmed_abstract',
        content_endpoint: `${literatureEndpoint(abstractRoute)}?db=pubmed&id=${candidate.pmid}&retmode=xml`,
        content_retrieved_at: retrievedAt,
        source_payload_sha256: createHash('sha256')
          .update(plainText, 'utf8')
          .digest('hex'),
        source_access_note:
          `Gate 1 marked OA with ${candidate.pmcid}, but Europe PMC fullTextXML returned HTTP 404; PubMed abstract used and OA-only declarations left null.`,
        plain_text: plainText,
        license: null,
        funding_declaration: null,
        competing_interests_declaration: null,
      });
      continue;
    }
    const xml = await response.text();
    const metadata = extractJatsFundingMetadata(xml);
    prepared.push({
      manifest: candidate,
      pubmed,
      content_source: 'europe_pmc_jats',
      content_endpoint: endpoint,
      content_retrieved_at: retrievedAt,
      source_payload_sha256: createHash('sha256').update(xml, 'utf8').digest('hex'),
      source_access_note: null,
      plain_text: extractJatsArticleText(xml),
      license: extractJatsLicense(xml),
      funding_declaration: metadata.funding_declaration,
      competing_interests_declaration: metadata.competing_interests_declaration,
    });
  }
  return prepared;
}
