import {
  EvidenceGrade,
  ResearchEvidenceScope,
  ResearchSourceName,
  ResearchSpecies,
  ResearchStudyDesign,
} from './types';
import { ResearchDiscoveryTopic, legacyResearchTopic } from './researchTopics';

export interface ResearchGradeInput {
  study_design: ResearchStudyDesign | null;
  species: ResearchSpecies | null;
  sample_size: number | null;
  funding_independent: boolean | null;
  is_preprint: boolean | null;
}

/** Exact TypeScript mirror of compute_research_evidence_grade() in Postgres. */
export function computeEvidenceGrade(input: ResearchGradeInput): EvidenceGrade {
  if (input.species && input.species !== 'dog') return 'E';
  if (input.is_preprint === true) return 'D';
  if (
    input.species === 'dog'
    && (input.study_design === 'systematic_review' || input.study_design === 'meta_analysis')
  ) {
    return 'A';
  }
  if (
    input.species === 'dog'
    && (input.study_design === 'rct' || input.study_design === 'controlled_trial')
  ) {
    if (input.funding_independent === false) return 'C';
    if (input.sample_size !== null && input.sample_size < 20) return 'C';
    return 'B';
  }
  if (
    input.species === 'dog'
    && (input.study_design === 'cohort' || input.study_design === 'case_control')
  ) {
    if (input.sample_size !== null && input.sample_size < 20) return 'D';
    return 'C';
  }
  return 'D';
}

export function missingGradingInputs(
  input: ResearchGradeInput,
  evidenceScope: ResearchEvidenceScope = 'canine_direct',
): string[] {
  const missing: string[] = [];
  if (input.study_design === null) missing.push('study_design');
  if (evidenceScope === 'canine_direct' && input.species === null) {
    missing.push('species');
  }
  if (input.is_preprint === null) missing.push('is_preprint');
  if (
    input.study_design === 'rct'
    || input.study_design === 'controlled_trial'
  ) {
    if (input.sample_size === null) missing.push('sample_size');
    if (input.funding_independent === null) missing.push('funding_independent');
  } else if (
    input.study_design === 'cohort'
    || input.study_design === 'case_control'
  ) {
    if (input.sample_size === null) missing.push('sample_size');
  }
  return missing;
}

export interface PubMedRecord {
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
  authors: string[];
}

/** Minimal Europe PMC core shape retained for the retraction-watch lookup. */
export interface EuropePmcResult {
  pmid?: string;
  pmcid?: string;
  isOpenAccess?: string;
  inPMC?: string;
  license?: string;
  isRetracted?: string | boolean;
  pubTypeList?: { pubType?: string[] };
}

export interface ResearchCandidate {
  topic: ReturnType<typeof legacyResearchTopic>;
  topic_group: ResearchDiscoveryTopic['group'];
  discovery_topic: string;
  discovery_topic_label: string;
  query: string;
  source_name: ResearchSourceName;
  source_id: string;
  source_url: string;
  full_text_url: string | null;
  title: string;
  doi: string | null;
  pmid: string;
  pmcid: string | null;
  journal: string | null;
  publication_year: number | null;
  study_design: ResearchStudyDesign | null;
  species: ResearchSpecies | null;
  species_terms: string[];
  sample_size: number | null;
  funding_declaration: string | null;
  competing_interests_declaration: string | null;
  funding_independent: boolean | null;
  is_preprint: boolean;
  open_access: boolean;
  abstract_only: boolean;
  license: string | null;
  retracted: boolean;
  retraction_checked_at: string;
  evidence_grade: EvidenceGrade;
  evidence_scope: ResearchEvidenceScope;
  grading_inputs_complete: boolean;
  missing_grading_inputs: string[];
  grading_input_sources: Record<string, string>;
  abstract_text: string | null;
  publication_types: string[];
  mesh_headings: string[];
  authors: string[];
  source_metadata: Record<string, unknown>;
  duplicate_of?: string | null;
  title_similarity?: number | null;
}

const INDUSTRY_PATTERNS = [
  /\bnestl[eé]\b/i,
  /\bpurina\b/i,
  /\bmars\b/i,
  /\bwaltham\b/i,
  /\broyal canin\b/i,
  /\bhill'?s\b/i,
  /\bcolgate[- ]palmolive\b/i,
  /\bgeneral mills\b/i,
  /\bblue buffalo\b/i,
  /\bpetcare\b/i,
  /\bpet food\b/i,
  /\bevidensia\b/i,
  /\bantech\b/i,
  /\bidexx\b/i,
];

const INDEPENDENT_FUNDER_PATTERNS = [
  /\bnational institutes? of health\b/i,
  /\bNIH\b/,
  /\bwellcome\b/i,
  /\bUKRI\b/,
  /\bmedical research council\b/i,
  /\bbiotechnology and biological sciences research council\b/i,
  /\beuropean (commission|union|research council)\b/i,
  /\bhorizon 20\d\d\b/i,
  /\bnational science foundation\b/i,
  /\bkennel club charitable trust\b/i,
  /\bresearch council\b/i,
  /\bgovernment\b/i,
  /\bministry\b/i,
  /\buniversity\b/i,
  /\bfoundation\b/i,
];

const NO_EXTERNAL_FUNDING_PATTERNS = [
  /\bno (?:external|specific) funding\b/i,
  /\breceived no (?:external|specific) (?:funding|grant)\b/i,
  /\bnot externally funded\b/i,
  /\bno financial support\b/i,
];

const NO_COMPETING_INTEREST_PATTERNS = [
  /\bno competing interests?\b/i,
  /\bdeclare(?:s|d)? no competing interests?\b/i,
  /\bno conflicts? of interest\b/i,
  /\bdeclare(?:s|d)? no conflicts? of interest\b/i,
  /\bnothing to disclose\b/i,
];

/** Deterministic text rules over the stored verbatim JATS statements. */
export function classifyFundingIndependence(
  fundingStatement: string | null,
  competingInterestsStatement: string | null,
): boolean | null {
  const funding = fundingStatement?.trim() || '';
  const competing = competingInterestsStatement?.trim() || '';
  const combined = `${funding}\n${competing}`;

  if (INDUSTRY_PATTERNS.some((pattern) => pattern.test(combined))) return false;
  if (!funding) return null;

  const noConflictVerified =
    competing.length > 0
    && NO_COMPETING_INTEREST_PATTERNS.some((pattern) => pattern.test(competing));
  if (!noConflictVerified) return null;

  if (NO_EXTERNAL_FUNDING_PATTERNS.some((pattern) => pattern.test(funding))) return true;
  if (INDEPENDENT_FUNDER_PATTERNS.some((pattern) => pattern.test(funding))) return true;
  return null;
}

export function studyDesignFromPubMed(
  publicationTypes: string[],
  meshHeadings: string[],
): ResearchStudyDesign | null {
  const publicationValues = publicationTypes.map((value) => value.toLowerCase());
  const meshValues = meshHeadings.map((value) => value.toLowerCase());
  const publicationHas = (needle: string) =>
    publicationValues.some((value) => value === needle || value.includes(needle));
  const meshHas = (needle: string) =>
    meshValues.some((value) => value === needle || value.includes(needle));

  if (publicationHas('meta-analysis')) return 'meta_analysis';
  if (publicationHas('systematic review')) return 'systematic_review';
  if (publicationHas('randomized controlled trial')) return 'rct';
  if (publicationHas('controlled clinical trial')) return 'controlled_trial';
  if (publicationHas('comparative study')) return 'comparative_study';
  if (publicationHas('clinical trial')) return 'clinical_trial';
  if (publicationHas('case reports')) return 'case_series';
  if (publicationHas('practice guideline') || publicationHas('guideline')) return 'guideline';
  if (meshHas('case-control studies') || meshHas('case control')) return 'case_control';
  if (meshHas('cohort studies') || meshHas('cohort')) return 'cohort';
  if (meshHas('cross-sectional studies') || meshHas('cross-sectional')) {
    return 'cross_sectional';
  }
  if (meshHas('in vitro techniques') || meshHas('in vitro')) return 'in_vitro';
  if (publicationHas('review')) return 'narrative_review';
  if (publicationTypes.length > 0) return 'other';
  return null;
}

export function speciesFromPubMedMesh(
  meshHeadings: string[],
): { species: ResearchSpecies | null; terms: string[] } {
  const values = meshHeadings.map((value) => value.toLowerCase());
  const terms: string[] = [];
  if (values.some((value) => value === 'dogs' || value === 'dog diseases')) terms.push('Dogs');
  if (values.some((value) => value === 'cats' || value === 'cat diseases')) terms.push('Cats');
  if (values.some((value) => value === 'humans')) terms.push('Humans');
  if (values.some((value) => ['mice', 'rats', 'rodentia'].includes(value))) terms.push('Rodents');

  if (terms.includes('Dogs')) return { species: 'dog', terms };
  if (terms.includes('Cats')) return { species: 'cat', terms };
  if (terms.includes('Humans')) return { species: 'human', terms };
  if (terms.includes('Rodents')) return { species: 'rodent', terms };
  return { species: null, terms };
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

function textFromXml(value: string | undefined): string | null {
  if (!value) return null;
  const text = decodeXml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function elementBodies(xml: string, tag: string): string[] {
  const expression = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...xml.matchAll(expression)].map((match) => match[1]);
}

function firstElementText(xml: string, tag: string): string | null {
  return textFromXml(elementBodies(xml, tag)[0]);
}

function elementTextList(xml: string, tag: string): string[] {
  return elementBodies(xml, tag)
    .map((body) => textFromXml(body))
    .filter((value): value is string => Boolean(value));
}

function articleId(article: string, idType: string): string | null {
  const expression = new RegExp(
    `<ArticleId\\b[^>]*IdType=["']${idType}["'][^>]*>([\\s\\S]*?)<\\/ArticleId>`,
    'i',
  );
  return textFromXml(article.match(expression)?.[1])?.trim() || null;
}

/**
 * Normalized "surname initials" strings (or a collective/group name) from a
 * PubMed <AuthorList>. Used only as a study-family matching signal, never as
 * a display byline -- ordering and exact form are not preserved.
 */
function authorSurnames(article: string): string[] {
  const authorListBody = elementBodies(article, 'AuthorList')[0];
  if (!authorListBody) return [];
  const authors = elementBodies(authorListBody, 'Author');
  const names: string[] = [];
  for (const author of authors) {
    const lastName = firstElementText(author, 'LastName');
    if (lastName) {
      const initials = firstElementText(author, 'Initials');
      names.push(`${lastName.toLowerCase()} ${initials?.toLowerCase() ?? ''}`.trim());
      continue;
    }
    const collectiveName = firstElementText(author, 'CollectiveName');
    if (collectiveName) names.push(collectiveName.toLowerCase().trim());
  }
  return [...new Set(names)];
}

function publicationYear(article: string): number | null {
  const journalIssue = article.match(/<JournalIssue\b[\s\S]*?<\/JournalIssue>/i)?.[0] ?? '';
  const year = firstElementText(journalIssue, 'Year');
  if (year && /^\d{4}$/.test(year)) return Number(year);
  const medlineDate = firstElementText(journalIssue, 'MedlineDate');
  const match = medlineDate?.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

/** Parse structured NLM PubMed XML. No model or free-text design inference. */
export function parsePubMedXml(xml: string): Map<string, PubMedRecord> {
  const records = new Map<string, PubMedRecord>();
  const articles = xml.match(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/gi) ?? [];

  for (const article of articles) {
    const pmid = firstElementText(article, 'PMID');
    const title = firstElementText(article, 'ArticleTitle');
    if (!pmid || !title) continue;

    const abstractParts = elementBodies(article, 'AbstractText')
      .map((body) => textFromXml(body))
      .filter((value): value is string => Boolean(value));
    const publicationTypes = elementTextList(article, 'PublicationType');
    const meshHeadings = elementTextList(article, 'DescriptorName');
    const keywords = elementTextList(article, 'Keyword');

    records.set(pmid, {
      pmid,
      title,
      abstract_text: abstractParts.length ? abstractParts.join(' ') : null,
      journal: firstElementText(article, 'Title'),
      publication_year: publicationYear(article),
      doi: articleId(article, 'doi')?.toLowerCase() ?? null,
      pmcid: articleId(article, 'pmc'),
      publication_types: [...new Set(publicationTypes)],
      mesh_headings: [...new Set(meshHeadings)],
      keywords: [...new Set(keywords)],
      authors: authorSurnames(article),
    });
  }

  return records;
}

export interface JatsFundingMetadata {
  funding_declaration: string | null;
  competing_interests_declaration: string | null;
}

/** Extract verbatim text content from the JATS funding and COI structures. */
export function extractJatsFundingMetadata(xml: string): JatsFundingMetadata {
  const fundingStatements = elementBodies(xml, 'funding-group')
    .map((body) => textFromXml(body))
    .filter((value): value is string => Boolean(value));

  const competingStatements: string[] = [];
  const fnElements = xml.match(/<fn\b[^>]*>[\s\S]*?<\/fn>/gi) ?? [];
  for (const element of fnElements) {
    const openingTag = element.match(/^<fn\b[^>]*>/i)?.[0] ?? '';
    const text = textFromXml(element);
    if (!text) continue;
    if (
      /fn-type=["'](?:COI|conflict)["']/i.test(openingTag)
      || /\b(competing interests?|conflicts? of interest|declaration of interests?)\b/i.test(text)
    ) {
      competingStatements.push(text);
    }
  }
  for (const tag of ['conflict', 'conflict-of-interest']) {
    competingStatements.push(...elementTextList(xml, tag));
  }
  const coiSections =
    xml.match(
      /<sec\b[^>]*sec-type=["'](?:COI-statement|conflict-of-interest|competing-interests?)["'][^>]*>[\s\S]*?<\/sec>/gi,
    ) ?? [];
  for (const section of coiSections) {
    const text = textFromXml(section);
    if (text) competingStatements.push(text);
  }

  return {
    funding_declaration: fundingStatements.length
      ? [...new Set(fundingStatements)].join('\n')
      : null,
    competing_interests_declaration: competingStatements.length
      ? [...new Set(competingStatements)].join('\n')
      : null,
  };
}

function withComputedGrading(
  candidate: Omit<
    ResearchCandidate,
    'evidence_grade' | 'missing_grading_inputs' | 'grading_inputs_complete'
  >,
): ResearchCandidate {
  const input: ResearchGradeInput = {
    study_design: candidate.study_design,
    species: candidate.species,
    sample_size: candidate.sample_size,
    funding_independent: candidate.funding_independent,
    is_preprint: candidate.is_preprint,
  };
  const missing = missingGradingInputs(input, candidate.evidence_scope);
  return {
    ...candidate,
    evidence_grade: computeEvidenceGrade(input),
    missing_grading_inputs: missing,
    grading_inputs_complete: missing.length === 0,
  };
}

export function mapPubMedRecord(
  record: PubMedRecord,
  discoveryTopic: ResearchDiscoveryTopic,
  query: string,
  checkedAt = new Date().toISOString(),
): ResearchCandidate {
  const studyDesign = studyDesignFromPubMed(
    record.publication_types,
    record.mesh_headings,
  );
  const speciesResult = speciesFromPubMedMesh(record.mesh_headings);
  const isPreprint = record.publication_types.some((value) =>
    value.toLowerCase().includes('preprint'));
  return withComputedGrading({
    topic: legacyResearchTopic(discoveryTopic.group),
    topic_group: discoveryTopic.group,
    discovery_topic: discoveryTopic.key,
    discovery_topic_label: discoveryTopic.label,
    query,
    source_name: 'pubmed',
    source_id: `MED:${record.pmid}`,
    source_url: `https://pubmed.ncbi.nlm.nih.gov/${record.pmid}/`,
    full_text_url: null,
    title: record.title,
    doi: record.doi,
    pmid: record.pmid,
    pmcid: record.pmcid,
    journal: record.journal,
    publication_year: record.publication_year,
    study_design: studyDesign,
    species: speciesResult.species,
    species_terms: speciesResult.terms,
    sample_size: null,
    funding_declaration: null,
    competing_interests_declaration: null,
    funding_independent: null,
    is_preprint: isPreprint,
    open_access: false,
    abstract_only: true,
    license: null,
    retracted: record.publication_types.some(
      (value) => value.toLowerCase() === 'retracted publication',
    ),
    retraction_checked_at: checkedAt,
    evidence_scope: discoveryTopic.evidenceScope,
    grading_input_sources: {
      study_design: 'PubMed PublicationTypeList and MeSH headings',
      species: 'PubMed MeSH DescriptorName',
      sample_size: 'Unavailable as structured PubMed/Europe PMC metadata',
      funding_independent: record.pmcid
        ? 'Pending Europe PMC open-access resolution'
        : 'Unavailable: no PMCID in PubMed metadata',
      is_preprint: 'PubMed PublicationTypeList',
    },
    abstract_text: record.abstract_text,
    publication_types: record.publication_types,
    mesh_headings: record.mesh_headings,
    authors: record.authors,
    source_metadata: {
      pubmed: record,
    },
    duplicate_of: null,
    title_similarity: null,
  });
}

export function applyJatsFundingMetadata(
  candidate: ResearchCandidate,
  jats: JatsFundingMetadata,
  endpoint: string,
): ResearchCandidate {
  const fundingIndependent = classifyFundingIndependence(
    jats.funding_declaration,
    jats.competing_interests_declaration,
  );
  return withComputedGrading({
    ...candidate,
    funding_declaration: jats.funding_declaration,
    competing_interests_declaration: jats.competing_interests_declaration,
    funding_independent: fundingIndependent,
    grading_input_sources: {
      ...candidate.grading_input_sources,
      funding_independent:
        'Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration',
    },
    source_metadata: {
      ...candidate.source_metadata,
      europe_pmc_full_text_xml: {
        endpoint,
        funding_declaration: jats.funding_declaration,
        competing_interests_declaration: jats.competing_interests_declaration,
      },
    },
  });
}
