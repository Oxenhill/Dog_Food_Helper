import { EuropePmcResult } from './researchEvidence';

const EUROPE_PMC_SEARCH_URL =
  'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const CROSSREF_WORKS_URL = 'https://api.crossref.org/works';

export interface RetractionCheck {
  doi: string;
  retracted: boolean;
  checked_at: string;
  europe_pmc: {
    checked: boolean;
    retracted: boolean;
    publication_types: string[];
    error: string | null;
  };
  crossref: {
    checked: boolean;
    retracted: boolean;
    retraction_dois: string[];
    error: string | null;
  };
}

function normalizeDoi(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\/doi\.org\//, '');
}

export async function checkResearchRetraction(
  doiValue: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RetractionCheck> {
  const doi = normalizeDoi(doiValue);
  const checkedAt = new Date().toISOString();
  const result: RetractionCheck = {
    doi,
    retracted: false,
    checked_at: checkedAt,
    europe_pmc: {
      checked: false,
      retracted: false,
      publication_types: [],
      error: null,
    },
    crossref: {
      checked: false,
      retracted: false,
      retraction_dois: [],
      error: null,
    },
  };

  try {
    const params = new URLSearchParams({
      query: `DOI:"${doi.replace(/"/g, '')}"`,
      format: 'json',
      resultType: 'core',
      pageSize: '5',
    });
    const response = await fetchImpl(`${EUROPE_PMC_SEARCH_URL}?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'BowlResearchLayer/1.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as {
      resultList?: { result?: EuropePmcResult[] };
    };
    const records = body.resultList?.result ?? [];
    const publicationTypes = records.flatMap((record) => record.pubTypeList?.pubType ?? []);
    result.europe_pmc.checked = true;
    result.europe_pmc.publication_types = [...new Set(publicationTypes)];
    result.europe_pmc.retracted = records.some(
      (record) =>
        record.isRetracted === true
        || record.isRetracted === 'Y'
        || (record.pubTypeList?.pubType ?? []).some(
          (value) => value.toLowerCase() === 'retracted publication',
        ),
    );
  } catch (error) {
    result.europe_pmc.error =
      error instanceof Error ? error.message : 'Europe PMC retraction check failed';
  }

  try {
    // Crossref's Retraction Watch records expose the original DOI in each
    // retraction notice's `update-to` relation. The `updates` filter performs
    // the reverse lookup from original work to notices.
    const params = new URLSearchParams({
      filter: `update-type:retraction,updates:${doi}`,
      rows: '20',
      select: 'DOI,update-to,title',
    });
    const response = await fetchImpl(`${CROSSREF_WORKS_URL}?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BowlResearchLayer/1.0 (mailto:admin@dog-smart.co.uk)',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as {
      message?: { items?: Array<{ DOI?: string; 'update-to'?: Array<{ DOI?: string; type?: string }> }> };
    };
    const notices = (body.message?.items ?? []).filter((item) =>
      (item['update-to'] ?? []).some(
        (update) =>
          update.type?.toLowerCase() === 'retraction'
          && normalizeDoi(update.DOI ?? '') === doi,
      ),
    );
    result.crossref.checked = true;
    result.crossref.retraction_dois = notices
      .map((notice) => notice.DOI)
      .filter((value): value is string => Boolean(value));
    result.crossref.retracted = notices.length > 0;
  } catch (error) {
    result.crossref.error =
      error instanceof Error ? error.message : 'Crossref retraction check failed';
  }

  result.retracted = result.europe_pmc.retracted || result.crossref.retracted;
  return result;
}
