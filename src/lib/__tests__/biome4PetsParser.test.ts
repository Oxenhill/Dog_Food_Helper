import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLiteralFinding,
  parseBiome4Pets,
  type DogDocumentFindingDraft,
} from '../biome4PetsParser';
import type { ExtractedPdfText } from '../pdfText';

function fixture(pageTexts: string[]): ExtractedPdfText {
  return {
    pages: pageTexts.map((text, index) => ({ num: index + 1, text })),
    text: pageTexts.join('\n\n'),
    totalPages: pageTexts.length,
  };
}

const overviewLenny = `Diversity
Your Dog’s Diversity Score
2.9
Species Richness
Your Dog’s Species Number
258
The Dysbiosis Pattern Score
Low (<1.9) \tMedium (1.9–2.5) \tHigh (>2.5)
Low (<400) \tModerate (400–650) \tHealthy (>650)`;

const overviewDexter = overviewLenny.replace('258', '180');

test('Biome4Pets v1 parses the fully evidenced sample shape', () => {
  const extracted = fixture([
    `Petbiome Microbiome
Biome4Pets Ltd
Dysbiosis Pattern Score: 0.6
microbiome is classified as Imbalanced (Level 2)
Bacteroidales: 37%
Clostridia: 20%
Prevotella: 14%`,
    `Bacteriodetes
33.7%
Fusobacteria
22.1%
Firmicutes
18.3%
Proteobacteria
9.6%
Bacteriodetes
37.4%
Fusobacteria
32.3%
Firmicutes
23.2%
Proteobacteria
6.1%
Your Dog vs Healthy
Microbiome`,
    overviewLenny,
  ]);

  const result = parseBiome4Pets(extracted);
  assert.equal(result.processing_status, 'partial');
  assert.deepEqual(result.unavailable_fields, []);
  assert.deepEqual(result.discarded_findings, []);
  assert.deepEqual(result.taxonomy_suggestions, [
    {
      raw_name: 'Bacteriodetes',
      suggested_name: 'Bacteroidetes',
      rank: 'phylum',
      edit_distance: 2,
      auto_accepted: false,
    },
  ]);
  assert.deepEqual(result.unmatched_taxa, []);
  assert.equal(result.findings.length, 11);

  const values = Object.fromEntries(
    result.findings.map((finding) => [finding.marker_name, finding.value])
  );
  assert.equal(values.Bacteriodetes, '37.4');
  assert.equal(values.Fusobacteria, '32.3');
  assert.equal(values.Firmicutes, '23.2');
  assert.equal(values.Proteobacteria, '6.1');
  assert.equal(values.Bacteroidales, '37');
  assert.equal(values.Clostridia, '20');
  assert.equal(values.Prevotella, '14');
  assert.equal(values.Diversity, '2.9');
  assert.equal(values['Species Richness'], '258');
  const classification = result.findings.find(
    (finding) => finding.finding_type === 'classification'
  );
  assert.equal(classification?.marker_name, 'Imbalanced');
  assert.equal(classification?.value, 'Imbalanced (Level 2)');

  for (const finding of result.findings) {
    assert.equal(assertLiteralFinding(extracted.text, finding), null);
  }
});

test('Biome4Pets v1 leaves an unavailable chart-only value null instead of guessing', () => {
  const extracted = fixture([
    `Petbiome Microbiome
Biome4Pets Ltd
Dysbiosis pattern score (1.1)
microbiome is classified as Imbalanced (Level 2)
An additional clinically important finding is the reduction in Clostridia (~18%), which are
critically important for digestive resilience.`,
    `Bacteriodetes
33.7%
Fusobacteria
22.1%
Firmicutes
18.3%
Proteobacteria
9.6%
Firmicutes
40%
Bacteriodetes
37%
Fusobacteria
16%
Proteobacteria
4%
Your Dog vs Healthy
Microbiome`,
    `Bacteroidales %
0
10
20
30
40
20
40
10
37
Biome4Pets Ltd
Charts display average values with error margins (±).
Bacteroidales`,
    `Clostridia
0
10
20
30
40
50
26
45
13
31
Biome4Pets Ltd
Charts display average values with error margins (±).
Clostridia`,
    `Prevotella %
0
5
10
15
20
Biome4Pets Ltd
Prevotella`,
    overviewDexter,
  ]);

  const result = parseBiome4Pets(extracted);
  assert.equal(result.processing_status, 'partial');
  assert.deepEqual(result.unavailable_fields, ['Bacteroidales', 'Prevotella']);
  assert.deepEqual(result.discarded_findings, []);
  assert.equal(result.findings.length, 9);
  assert.equal(
    result.findings.find((finding) => finding.marker_name === 'Bacteroidales'),
    undefined
  );
  assert.equal(
    result.findings.find((finding) => finding.marker_name === 'Clostridia')?.value,
    '18'
  );
  assert.equal(
    result.findings.find((finding) => finding.marker_name === 'Clostridia')
      ?.reference_range,
    null
  );
  assert.equal(
    result.findings.find((finding) => finding.marker_name === 'Clostridia')
      ?.source_kind,
    'prose'
  );
  assert.equal(
    result.findings.find((finding) => finding.marker_name === 'Clostridia')
      ?.review_status,
    'needs_review'
  );
  assert.equal(
    result.findings.find((finding) => finding.marker_name === 'Prevotella'),
    undefined
  );
  assert.deepEqual(result.source_agreement_assertions, [
    {
      marker: 'Bacteroidales',
      prose_value: null,
      chart_value: '37',
      status: 'not_applicable',
    },
    {
      marker: 'Clostridia',
      prose_value: '18',
      chart_value: '31',
      status: 'mismatch',
    },
  ]);
  assert.equal(
    result.chart_attribution_checks.find((check) => check.marker === 'Bacteroidales')
      ?.legend_text_extractable,
    false
  );
  assert.equal(
    result.chart_attribution_checks.find((check) => check.marker === 'Clostridia')
      ?.legend_text_extractable,
    false
  );

  for (const finding of result.findings) {
    assert.equal(assertLiteralFinding(extracted.text, finding), null);
  }
});

test('chart values stay unattributable when the profiled legend signature is absent', () => {
  const extracted = fixture([
    `Petbiome Microbiome
Biome4Pets Ltd
Dysbiosis Pattern Score: 0.6
microbiome is classified as Imbalanced (Level 2)`,
    `Bacteriodetes
37.4%
Fusobacteria
32.3%
Firmicutes
23.2%
Proteobacteria
6.1%
Your Dog vs Healthy
Microbiome`,
    `Bacteroidales %
0
10
20
30
40
20
40
10
37
Biome4Pets Ltd`,
    overviewLenny,
  ]);

  const result = parseBiome4Pets(extracted);
  assert.equal(
    result.findings.find((finding) => finding.marker_name === 'Bacteroidales'),
    undefined
  );
  assert.ok(result.unavailable_fields.includes('Bacteroidales'));
});

test('an extractable chart legend keeps reference values keyed to their series names', () => {
  const extracted = fixture([
    `Petbiome Microbiome
Biome4Pets Ltd
Dysbiosis Pattern Score: 0.6
microbiome is classified as Imbalanced (Level 2)`,
    `Bacteriodetes
37.4%
Fusobacteria
32.3%
Firmicutes
23.2%
Proteobacteria
6.1%
Your Dog vs Healthy
Microbiome`,
    `Bacteroidales %
0
10
20
30
40
20
40
10
37
Biome4Pets Ltd
Target levels approx 20%
High Levels 40%
Low Levels approx 10%
Your Pet
Charts display average values with error margins (Â±).`,
    overviewLenny,
  ]);

  const result = parseBiome4Pets(extracted);
  const bacteroidales = result.findings.find(
    (finding) => finding.marker_name === 'Bacteroidales'
  );

  assert.equal(bacteroidales?.value, '37');
  assert.equal(bacteroidales?.source_kind, 'chart');
  assert.equal(
    bacteroidales?.reference_range,
    'Target levels approx 20%\nHigh Levels 40%\nLow Levels approx 10%'
  );
  assert.notEqual(bacteroidales?.reference_range, '20\n40\n10');
  assert.equal(assertLiteralFinding(extracted.text, bacteroidales!), null);
});

test('matching prose and chart routes pass while the stored value records prose provenance', () => {
  const extracted = fixture([
    `Petbiome Microbiome
Biome4Pets Ltd
Dysbiosis Pattern Score: 0.6
microbiome is classified as Imbalanced (Level 2)
Bacteroidales are mildly elevated at 37%, indicating a modest inflammatory component.
Beneficial Clostridia are reduced to 20%, below the expected healthy level of
approximately 26%.`,
    `Bacteriodetes
37.4%
Fusobacteria
32.3%
Firmicutes
23.2%
Proteobacteria
6.1%
Your Dog vs Healthy
Microbiome`,
    `Bacteroidales %
0
10
20
30
40
20
40
10
37
Biome4Pets Ltd
Charts display average values with error margins (±).`,
    `Clostridia
0
10
20
30
40
50
26
45
13
20
Biome4Pets Ltd
Charts display average values with error margins (±).`,
    `Prevotella: 14%`,
    overviewLenny,
  ]);

  const result = parseBiome4Pets(extracted);
  assert.deepEqual(result.source_agreement_assertions, [
    {
      marker: 'Bacteroidales',
      prose_value: '37',
      chart_value: '37',
      status: 'pass',
    },
    {
      marker: 'Clostridia',
      prose_value: '20',
      chart_value: '20',
      status: 'pass',
    },
  ]);
  const clostridia = result.findings.find(
    (finding) => finding.marker_name === 'Clostridia'
  );
  assert.equal(clostridia?.source_kind, 'prose');
  assert.equal(clostridia?.review_status, 'accepted');
  assert.equal(
    clostridia?.reference_range,
    'expected healthy level of\napproximately 26%'
  );
});

test('literal assertion rejects an inferred unit and does not repair it', () => {
  const finding: DogDocumentFindingDraft = {
    finding_type: 'biome_marker',
    source_kind: 'chart',
    review_status: 'accepted',
    marker_name: 'Clostridia',
    value: '31',
    unit: '%',
    reference_range: null,
    interpretation_flag: null,
    verbatim_source_text: 'Clostridia\n31',
  };

  assert.equal(
    assertLiteralFinding('Clostridia\n31', finding),
    'unit is not a literal substring of verbatim_source_text'
  );
});
