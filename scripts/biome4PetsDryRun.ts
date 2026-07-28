import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractPdfText } from '../src/lib/pdfText';
import { parseBiome4Pets } from '../src/lib/biome4PetsParser';

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error('Pass one or more Biome4Pets PDF paths');
  }

  for (const file of files) {
    const bytes = await readFile(file);
    const extracted = await extractPdfText(new Uint8Array(bytes));
    const result = parseBiome4Pets(extracted);

    console.log(`\nBIOME4PETS RUN 1 - NO DATABASE WRITES`);
    console.log(`file: ${path.basename(file)}`);
    console.log(`parser: ${result.parser}`);
    console.log(`lab_name: ${JSON.stringify(result.lab_name)}`);
    console.log(`processing_status: ${result.processing_status}`);

    result.findings.forEach((finding, index) => {
      console.log(`\n[${index + 1}]`);
      console.log(`finding_type: ${finding.finding_type}`);
      console.log(`source_kind: ${finding.source_kind}`);
      console.log(`review_status: ${finding.review_status}`);
      console.log(`marker_name: ${JSON.stringify(finding.marker_name)}`);
      console.log(`value: ${JSON.stringify(finding.value)}`);
      console.log(`unit: ${JSON.stringify(finding.unit)}`);
      console.log(`reference_range: ${JSON.stringify(finding.reference_range)}`);
      console.log(`interpretation_flag: ${JSON.stringify(finding.interpretation_flag)}`);
      console.log(`verbatim_source_text: ${JSON.stringify(finding.verbatim_source_text)}`);
    });

    console.log(`\nunavailable_fields: ${JSON.stringify(result.unavailable_fields)}`);
    console.log(`discarded_findings: ${JSON.stringify(result.discarded_findings)}`);
    console.log(`taxonomy_suggestions: ${JSON.stringify(result.taxonomy_suggestions)}`);
    console.log(`unmatched_taxa: ${JSON.stringify(result.unmatched_taxa)}`);
    console.log(`chart_attribution_checks: ${JSON.stringify(result.chart_attribution_checks)}`);
    console.log(
      `source_agreement_assertions: ${JSON.stringify(result.source_agreement_assertions)}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
