import type { ExtractedPdfPage, ExtractedPdfText } from './pdfText';

export type DogDocumentProcessingStatus = 'extracted' | 'partial';

export interface DogDocumentFindingDraft {
  finding_type: 'biome_marker' | 'classification';
  source_kind: 'text_label' | 'prose' | 'chart';
  review_status: 'accepted' | 'needs_review';
  marker_name: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  interpretation_flag: 'high' | 'low' | 'normal' | 'reactive' | 'unclear' | null;
  verbatim_source_text: string;
}

export interface DiscardedFinding {
  field: string;
  reason: string;
}

export interface Biome4PetsParseResult {
  parser: 'biome4pets-v1';
  lab_name: string;
  processing_status: DogDocumentProcessingStatus;
  findings: DogDocumentFindingDraft[];
  unavailable_fields: string[];
  discarded_findings: DiscardedFinding[];
  taxonomy_suggestions: TaxonomySuggestion[];
  unmatched_taxa: string[];
  chart_attribution_checks: ChartAttributionCheck[];
  source_agreement_assertions: SourceAgreementAssertion[];
}

export interface TaxonomySuggestion {
  raw_name: string;
  suggested_name: string;
  rank: 'phylum' | 'genus';
  edit_distance: number;
  auto_accepted: false;
}

export interface ChartAttributionCheck {
  marker: string;
  legend_text_extractable: boolean;
  data_label_count: number;
  candidate_value: string | null;
}

export interface SourceAgreementAssertion {
  marker: string;
  prose_value: string | null;
  chart_value: string | null;
  status: 'pass' | 'mismatch' | 'not_applicable';
}

const LAB_NAME = 'Biome4Pets Ltd';
const PERCENT = '%';
const CANONICAL_TAXA = [
  { name: 'Bacteroidetes', rank: 'phylum' },
  { name: 'Fusobacteria', rank: 'phylum' },
  { name: 'Firmicutes', rank: 'phylum' },
  { name: 'Proteobacteria', rank: 'phylum' },
  { name: 'Prevotella', rank: 'genus' },
] as const;

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactMatchSource(match: RegExpMatchArray): string {
  return match[0];
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1].toLocaleLowerCase() === right[rightIndex - 1].toLocaleLowerCase()
          ? 0
          : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function canonicalSuggestion(
  rawName: string,
  rank: TaxonomySuggestion['rank']
): TaxonomySuggestion | null {
  const candidates = CANONICAL_TAXA.filter((taxon) => taxon.rank === rank);
  if (candidates.some((taxon) => taxon.name === rawName)) return null;

  const ranked = candidates
    .map((taxon) => ({
      taxon,
      distance: levenshteinDistance(rawName, taxon.name),
    }))
    .sort((left, right) => left.distance - right.distance);
  const best = ranked[0];
  if (!best || best.distance > 2) return null;

  return {
    raw_name: rawName,
    suggested_name: best.taxon.name,
    rank,
    edit_distance: best.distance,
    auto_accepted: false,
  };
}

/**
 * Non-negotiable write gate. It is deliberately case-sensitive and never
 * normalises, repairs, fuzzy-matches, or substitutes a value.
 */
export function assertLiteralFinding(
  documentText: string,
  finding: DogDocumentFindingDraft
): string | null {
  if (!documentText.includes(finding.verbatim_source_text)) {
    return 'verbatim_source_text is not a literal substring of extracted_text';
  }

  const evidenceFields: Array<[string, string | null]> = [
    ['marker_name', finding.marker_name],
    ['value', finding.value],
    ['unit', finding.unit],
    ['reference_range', finding.reference_range],
    ['interpretation_flag', finding.interpretation_flag],
  ];

  for (const [field, value] of evidenceFields) {
    if (value !== null && !finding.verbatim_source_text.includes(value)) {
      return `${field} is not a literal substring of verbatim_source_text`;
    }
  }

  return null;
}

function addFinding(
  documentText: string,
  findings: DogDocumentFindingDraft[],
  discarded: DiscardedFinding[],
  field: string,
  finding: DogDocumentFindingDraft
): void {
  const failure = assertLiteralFinding(documentText, finding);
  if (failure) {
    discarded.push({ field, reason: failure });
    return;
  }
  findings.push(finding);
}

function pageContaining(pages: ExtractedPdfPage[], literal: string): ExtractedPdfPage | null {
  return pages.find((page) => page.text.includes(literal)) ?? null;
}

function lastLabelledPercentage(
  pageText: string,
  label: string
): { marker: string; value: string; source: string } | null {
  const pattern = new RegExp(`(${regexEscape(label)})\\s*\\n(\\d+(?:\\.\\d+)?)%`, 'g');
  const matches = [...pageText.matchAll(pattern)];
  const match = matches.at(-1);
  if (!match) return null;
  return { marker: match[1], value: match[2], source: exactMatchSource(match) };
}

function directLabelledPercentage(
  documentText: string,
  label: string
): { marker: string; value: string; unit: '%'; source: string } | null {
  const pattern = new RegExp(`(${regexEscape(label)}):\\s*(\\d+(?:\\.\\d+)?)%`);
  const match = documentText.match(pattern);
  if (!match) return null;
  return { marker: match[1], value: match[2], unit: PERCENT, source: exactMatchSource(match) };
}

interface ChartCandidate {
  marker: string;
  value: string | null;
  unit: '%' | null;
  referenceRange: string | null;
  source: string;
  legendTextExtractable: boolean;
  dataLabelCount: number;
}

function profiledChartCandidate(
  pages: ExtractedPdfPage[],
  marker: string
): ChartCandidate | null {
  const page =
    pages.find(
      (candidate) =>
        (candidate.text.includes(`${marker}\n0\n`) ||
          candidate.text.includes(`${marker} %\n0\n`))
    ) ?? null;
  if (!page) return null;

  const pattern = new RegExp(
    `(${regexEscape(marker)})( %)?\\n((?:\\d+(?:\\.\\d+)?(?:\\s+|$))+)Biome4Pets Ltd`
  );
  const match = page.text.match(pattern);
  if (!match) return null;

  const numberMatches = [...match[3].matchAll(/\d+(?:\.\d+)?/g)];
  const numbers = numberMatches.map((numberMatch) => Number(numberMatch[0]));
  if (numbers.length < 3 || numbers[0] !== 0) return null;

  const axisStep = numbers[1] - numbers[0];
  if (!(axisStep > 0)) return null;

  let axisTickCount = 2;
  while (
    axisTickCount < numbers.length &&
    numbers[axisTickCount] === numbers[axisTickCount - 1] + axisStep
  ) {
    axisTickCount += 1;
  }

  // The profiled legend has four named series in this exact order:
  // target, high, low, Your Pet. The axis is discarded before this check.
  const dataLabels = numberMatches.slice(axisTickCount);

  const legendMatch = page.text.match(
    /(Target[^\n]*\nHigh Levels[^\n]*\nLow Levels[^\n]*\nYour Pet)/i
  );
  const legendTextExtractable = Boolean(legendMatch);
  const referenceRange = legendMatch && dataLabels.length === 4
    ? legendMatch[1].split('\n').slice(0, 3).join('\n')
    : null;

  return {
    marker: match[1],
    value: dataLabels.length === 4 ? dataLabels[3][0] : null,
    unit: match[2]?.includes('%') ? '%' : null,
    referenceRange,
    source: legendTextExtractable ? page.text : exactMatchSource(match),
    legendTextExtractable,
    dataLabelCount: dataLabels.length,
  };
}

function proseMeasurement(
  documentText: string,
  marker: 'Bacteroidales' | 'Clostridia'
): {
  marker: string;
  value: string;
  unit: '%';
  referenceRange: string | null;
  source: string;
} | null {
  const patterns =
    marker === 'Bacteroidales'
      ? [/(Bacteroidales) are mildly elevated at (\d+(?:\.\d+)?)%[^.]*\./]
      : [
          /Beneficial (Clostridia) are reduced to (\d+(?:\.\d+)?)%, below the (expected healthy level of\s*approximately \d+(?:\.\d+)?%)\./,
          /reduction in (Clostridia) \(~(\d+(?:\.\d+)?)%\)/,
        ];

  for (const pattern of patterns) {
    const match = documentText.match(pattern);
    if (!match) continue;
    return {
      marker: match[1],
      value: match[2],
      unit: PERCENT,
      referenceRange: match[3] ?? null,
      source: exactMatchSource(match),
    };
  }
  return null;
}

function overviewFinding(
  page: ExtractedPdfPage | null,
  marker: string,
  valuePattern: RegExp,
  referencePattern: RegExp | null
): DogDocumentFindingDraft | null {
  if (!page) return null;

  const valueMatch = page.text.match(valuePattern);
  if (!valueMatch) return null;
  const referenceMatch = referencePattern ? page.text.match(referencePattern) : null;

  const markerIndex = page.text.indexOf(marker);
  const valueIndex = valueMatch.index ?? -1;
  const referenceIndex = referenceMatch?.index ?? -1;
  if (markerIndex < 0 || valueIndex < 0) return null;

  const start = Math.min(markerIndex, valueIndex);
  const evidenceEndCandidates = [
    valueIndex + valueMatch[0].length,
    referenceIndex >= 0 && referenceMatch
      ? referenceIndex + referenceMatch[0].length
      : -1,
  ];
  const end = Math.max(...evidenceEndCandidates);
  const source = page.text.slice(start, end);

  return {
    finding_type: 'biome_marker',
    source_kind: 'text_label',
    review_status: 'accepted',
    marker_name: marker,
    value: valueMatch[1],
    unit: null,
    reference_range: referenceMatch?.[0] ?? null,
    interpretation_flag: null,
    verbatim_source_text: source,
  };
}

export function isBiome4PetsDocument(documentText: string): boolean {
  return documentText.includes(LAB_NAME) && documentText.includes('Petbiome Microbiome');
}

/**
 * Biome4Pets v1 parser.
 *
 * It reads the lab's dedicated measurement sections and explicitly-labelled
 * prose. Chart values are accepted only when the series legend itself is in
 * the extracted text layer. Every candidate crosses assertLiteralFinding
 * before it is returned.
 *
 * Dry-run only in sequence step 2: this module has no database dependency.
 */
export function parseBiome4Pets(extracted: ExtractedPdfText): Biome4PetsParseResult {
  if (!isBiome4PetsDocument(extracted.text)) {
    throw new Error('Document is not a supported Biome4Pets report');
  }

  const findings: DogDocumentFindingDraft[] = [];
  const discarded: DiscardedFinding[] = [];
  const unavailable = new Set<string>();
  const taxonomySuggestions: TaxonomySuggestion[] = [];
  const unmatchedTaxa = new Set<string>();
  const chartAttributionChecks: ChartAttributionCheck[] = [];
  const sourceAgreementAssertions: SourceAgreementAssertion[] = [];

  const comparisonPage = pageContaining(extracted.pages, 'Your Dog vs Healthy\nMicrobiome');
  const comparisonLabels = ['Bacteriodetes', 'Fusobacteria', 'Firmicutes', 'Proteobacteria'];

  for (const label of comparisonLabels) {
    const parsed = comparisonPage
      ? lastLabelledPercentage(comparisonPage.text, label)
      : null;
    if (!parsed) {
      unavailable.add(label);
      continue;
    }
    const suggestion = canonicalSuggestion(parsed.marker, 'phylum');
    addFinding(extracted.text, findings, discarded, label, {
      finding_type: 'biome_marker',
      source_kind: 'text_label',
      review_status: suggestion ? 'needs_review' : 'accepted',
      marker_name: parsed.marker,
      value: parsed.value,
      unit: PERCENT,
      reference_range: null,
      interpretation_flag: null,
      verbatim_source_text: parsed.source,
    });

    if (suggestion) {
      taxonomySuggestions.push(suggestion);
    } else if (!CANONICAL_TAXA.some((taxon) => taxon.name === parsed.marker)) {
      unmatchedTaxa.add(parsed.marker);
    }
  }

  const chartFields = ['Bacteroidales', 'Clostridia'];

  for (const marker of chartFields) {
    const prose = proseMeasurement(
      extracted.text,
      marker as 'Bacteroidales' | 'Clostridia'
    );
    const direct = directLabelledPercentage(extracted.text, marker);
    const chart = profiledChartCandidate(extracted.pages, marker);
    chartAttributionChecks.push({
      marker,
      legend_text_extractable: chart?.legendTextExtractable ?? false,
      data_label_count: chart?.dataLabelCount ?? 0,
      candidate_value: chart?.value ?? null,
    });

    const agreementStatus: SourceAgreementAssertion['status'] =
      prose && chart?.value
        ? prose.value === chart.value
          ? 'pass'
          : 'mismatch'
        : 'not_applicable';
    sourceAgreementAssertions.push({
      marker,
      prose_value: prose?.value ?? null,
      chart_value: chart?.value ?? null,
      status: agreementStatus,
    });

    const attributedChart =
      chart?.legendTextExtractable && chart.value ? chart : null;
    const directChartMismatch =
      direct && chart?.value ? direct.value !== chart.value : false;
    const parsed = prose ?? direct ?? attributedChart;
    if (!parsed) {
      unavailable.add(marker);
      continue;
    }
    addFinding(extracted.text, findings, discarded, marker, {
      finding_type: 'biome_marker',
      source_kind: prose ? 'prose' : direct ? 'text_label' : 'chart',
      review_status:
        agreementStatus === 'mismatch' || directChartMismatch
          ? 'needs_review'
          : 'accepted',
      marker_name: parsed.marker,
      value: parsed.value,
      unit: parsed.unit,
      reference_range: 'referenceRange' in parsed ? parsed.referenceRange : null,
      interpretation_flag: null,
      verbatim_source_text: parsed.source,
    });
  }

  const directPrevotella = directLabelledPercentage(extracted.text, 'Prevotella');
  const chartPrevotella = profiledChartCandidate(extracted.pages, 'Prevotella');
  chartAttributionChecks.push({
    marker: 'Prevotella',
    legend_text_extractable: chartPrevotella?.legendTextExtractable ?? false,
    data_label_count: chartPrevotella?.dataLabelCount ?? 0,
    candidate_value: chartPrevotella?.value ?? null,
  });
  const attributedChartPrevotella =
    chartPrevotella?.legendTextExtractable && chartPrevotella.value
      ? chartPrevotella
      : null;
  const prevotella = directPrevotella ?? attributedChartPrevotella;
  if (
    directPrevotella &&
    chartPrevotella?.value &&
    directPrevotella.value !== chartPrevotella.value
  ) {
    discarded.push({
      field: 'Prevotella',
      reason: `direct value ${directPrevotella.value} disagrees with profiled chart value ${chartPrevotella.value}`,
    });
  }
  if (prevotella) {
    addFinding(extracted.text, findings, discarded, 'Prevotella', {
      finding_type: 'biome_marker',
      source_kind: directPrevotella ? 'text_label' : 'chart',
      review_status: 'accepted',
      marker_name: prevotella.marker,
      value: prevotella.value,
      unit: PERCENT,
      reference_range:
        'referenceRange' in prevotella ? prevotella.referenceRange : null,
      interpretation_flag: null,
      verbatim_source_text: prevotella.source,
    });
    const suggestion = canonicalSuggestion(prevotella.marker, 'genus');
    if (suggestion) {
      taxonomySuggestions.push(suggestion);
    } else if (!CANONICAL_TAXA.some((taxon) => taxon.name === prevotella.marker)) {
      unmatchedTaxa.add(prevotella.marker);
    }
  } else {
    unavailable.add('Prevotella');
  }

  const overviewPage = pageContaining(extracted.pages, 'Your Dog’s Diversity Score');
  const diversity = overviewFinding(
    overviewPage,
    'Diversity',
    /Your Dog’s Diversity Score\s*\n(\d+(?:\.\d+)?)/,
    /Low \(<1\.9\)[^\n]*High \(>2\.5\)/
  );
  if (diversity) {
    addFinding(extracted.text, findings, discarded, 'Diversity', diversity);
  } else {
    unavailable.add('Diversity');
  }

  const richness = overviewFinding(
    overviewPage,
    'Species Richness',
    /Your Dog’s Species Number\s*\n(\d+)/,
    /Low \(<400\)[^\n]*Healthy \(>650\)/
  );
  if (richness) {
    addFinding(extracted.text, findings, discarded, 'Species Richness', richness);
  } else {
    unavailable.add('Species Richness');
  }

  const dysbiosisPatterns = [
    /(Dysbiosis Pattern Score):\s*(\d+(?:\.\d+)?)/,
    /(Dysbiosis pattern score) \((\d+(?:\.\d+)?)\)/,
  ];
  const dysbiosisMatch = dysbiosisPatterns
    .map((pattern) => extracted.text.match(pattern))
    .find((match): match is RegExpMatchArray => Boolean(match));
  if (dysbiosisMatch) {
    addFinding(extracted.text, findings, discarded, 'Dysbiosis Pattern Score', {
      finding_type: 'biome_marker',
      source_kind: 'text_label',
      review_status: 'accepted',
      marker_name: dysbiosisMatch[1],
      value: dysbiosisMatch[2],
      unit: null,
      reference_range: null,
      interpretation_flag: null,
      verbatim_source_text: exactMatchSource(dysbiosisMatch),
    });
  } else {
    unavailable.add('Dysbiosis Pattern Score');
  }

  const classificationMatch = extracted.text.match(
    /((Imbalanced|Balanced) \(Level \d+\))/
  );
  if (classificationMatch) {
    addFinding(extracted.text, findings, discarded, 'Microbiome classification', {
      finding_type: 'classification',
      source_kind: 'prose',
      review_status: 'accepted',
      marker_name: classificationMatch[2],
      value: classificationMatch[1],
      unit: null,
      reference_range: null,
      interpretation_flag: null,
      verbatim_source_text: exactMatchSource(classificationMatch),
    });
  } else {
    unavailable.add('Microbiome classification');
  }

  for (const row of discarded) unavailable.add(row.field);

  return {
    parser: 'biome4pets-v1',
    lab_name: LAB_NAME,
    processing_status:
      unavailable.size === 0 &&
      discarded.length === 0 &&
      taxonomySuggestions.length === 0 &&
      unmatchedTaxa.size === 0 &&
      !findings.some((finding) => finding.review_status === 'needs_review')
        ? 'extracted'
        : 'partial',
    findings,
    unavailable_fields: [...unavailable],
    discarded_findings: discarded,
    taxonomy_suggestions: taxonomySuggestions,
    unmatched_taxa: [...unmatchedTaxa],
    chart_attribution_checks: chartAttributionChecks,
    source_agreement_assertions: sourceAgreementAssertions,
  };
}
