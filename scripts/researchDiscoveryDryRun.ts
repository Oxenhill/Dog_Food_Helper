import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  discoverResearchCandidates,
  uniqueCandidates,
} from '../src/lib/researchDiscovery';
import { estimateResearchCosts } from '../src/lib/researchCost';

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function yesNo(value: boolean | null): string {
  if (value === null) return 'not supplied';
  return value ? 'yes' : 'no';
}

async function main() {
  const candidatesPerTopic = Number(option('per-topic') ?? 2);
  const documentCap = Number(option('document-cap') ?? 30);
  const uiVerification =
    option('ui-verification')
    ?? 'UNVERIFIED — no authenticated browser session was confirmed for this report.';
  const outputPath = resolve(
    option('output') ?? `docs/research-gate1-${new Date().toISOString().slice(0, 10)}.md`,
  );
  const topicKeys = option('topics')?.split(',').map((value) => value.trim()).filter(Boolean);

  const run = await discoverResearchCandidates({
    candidatesPerTopic,
    topicKeys,
    concurrency: 3,
    fullTextDocumentCap: documentCap,
  });
  const costs = estimateResearchCosts(run, documentCap);
  const sourceErrorCount = run.results.filter((result) => result.error).length;
  const topicsWithCandidates = run.results.filter(
    (result) => result.candidates.length > 0,
  ).length;
  const coverageByGroup = [...new Set(run.results.map((result) => result.topic.group))]
    .map((group) => {
      const groupResults = run.results.filter((result) => result.topic.group === group);
      const populated = groupResults.filter((result) => result.candidates.length > 0).length;
      return `${group} ${populated}/${groupResults.length}`;
    })
    .join(' · ');
  const unique = uniqueCandidates(run);
  const directCandidates = unique.filter(
    (candidate) => candidate.evidence_scope === 'canine_direct',
  );
  const methodologyCandidates = unique.filter(
    (candidate) => candidate.evidence_scope === 'veterinary_methodology',
  );
  const gradeDistribution = (candidates: typeof unique) =>
    ['A', 'B', 'C', 'D', 'E']
      .map((grade) => `${grade} ${candidates.filter((candidate) => candidate.evidence_grade === grade).length}`)
      .join(' · ');

  const lines: string[] = [
    '# Research layer — Gate 1 discovery dry run',
    '',
    `> **Admin UI verification: ${uiVerification}**`,
    '',
    `Generated: ${run.generated_at}`,
    '',
    '- Database writes: **none**',
    '- Embedding calls: **none**',
    '- Claim-drafting calls: **none**',
    `- Topic queries: **${run.topic_count}**`,
    `- Topic coverage: **${topicsWithCandidates} with candidates**, **${run.topic_count - topicsWithCandidates} with none**`,
    `- Coverage by group: ${coverageByGroup}`,
    `- Source errors: **${sourceErrorCount}**`,
    `- Unique candidates: **${run.unique_candidate_count}**`,
    `- Cross-topic duplicates: **${run.duplicate_candidate_count}**`,
    `- Access: **${run.access_counts.open_access_full_text} OA full text**, **${run.access_counts.abstract_only} abstract only**`,
    `- Computed grades: **A ${run.grade_counts.A} · B ${run.grade_counts.B} · C ${run.grade_counts.C} · D ${run.grade_counts.D} · E ${run.grade_counts.E}**`,
    `- Direct canine corpus grades: **${gradeDistribution(directCandidates)}**`,
    `- Veterinary methodology grades: **${gradeDistribution(methodologyCandidates)}**`,
    `- Evidence scopes: **${directCandidates.length} canine direct**, **${methodologyCandidates.length} veterinary methodology**`,
    `- Grading metadata: **${run.completeness_counts.complete} complete**, **${run.completeness_counts.incomplete} incomplete**`,
    `- Missing inputs: ${Object.entries(run.missing_input_counts).map(([field, count]) => `${field} ${count}`).join(' · ') || 'none'}`,
    `- Europe PMC JATS funding enrichment: **${run.jats_enrichment.succeeded}/${run.jats_enrichment.attempted} succeeded** (cap ${run.jats_enrichment.cap}; ${run.jats_enrichment.failed} failed)`,
    '',
    '## Gate 2 embedding estimate (not incurred)',
    '',
    `Hard cap: ${costs.document_cap} documents`,
    '',
    `Estimated embedding input: ${costs.estimated_embedding_tokens.toLocaleString()} tokens`,
    '',
    `Estimated Batch API embedding cost: **$${costs.estimated_embedding_cost_usd.toFixed(6)} USD** using ${costs.embedding_model}`,
    '',
    costs.drafting_cost_note,
    '',
    '## Queries and candidates',
    '',
  ];

  for (const result of run.results) {
    lines.push(`### ${result.topic.group}. ${result.topic.label}`, '', `Query: \`${result.query}\``, '');
    if (result.error) {
      lines.push(`Source error: **${result.error}**`, '');
      continue;
    }
    if (result.candidates.length === 0) {
      lines.push('No candidates returned.', '');
      continue;
    }
    result.candidates.forEach((candidate, index) => {
      lines.push(
        `#### ${index + 1}. ${candidate.title}`,
        '',
        `- Discovery source: [PubMed](${candidate.source_url})`,
        candidate.full_text_url
          ? `- OA full text: [Europe PMC](${candidate.full_text_url})`
          : '- OA full text: not available; abstract-only',
        `- DOI: ${candidate.doi ?? 'not supplied'} · PMID: ${candidate.pmid ?? 'not supplied'} · PMCID: ${candidate.pmcid ?? 'not supplied'}`,
        `- Journal/year: ${candidate.journal ?? 'not supplied'} · ${candidate.publication_year ?? 'not supplied'}`,
        `- Publication types: ${candidate.publication_types.join(', ') || 'not supplied'}`,
        `- MeSH headings: ${candidate.mesh_headings.join(', ') || 'not supplied'}`,
        `- Study design: ${candidate.study_design ?? 'not supplied'}`,
        `- Species: ${candidate.species ?? 'not supplied'} (${candidate.species_terms.join(', ') || 'no structured species term'})`,
        `- Evidence scope: ${candidate.evidence_scope.replace(/_/g, ' ')}`,
        `- Sample size: ${candidate.sample_size ?? 'not supplied by source metadata'}`,
        `- Funding declaration: ${candidate.funding_declaration ?? 'not supplied'}`,
        `- Competing-interests declaration: ${candidate.competing_interests_declaration ?? 'not supplied'}`,
        `- Funding independent: ${yesNo(candidate.funding_independent)}`,
        `- Preprint: ${yesNo(candidate.is_preprint)} · Open-access full text: ${yesNo(candidate.open_access)} · Abstract only: ${yesNo(candidate.abstract_only)}`,
        `- Retracted: ${yesNo(candidate.retracted)} · checked ${candidate.retraction_checked_at}`,
        `- Computed evidence grade: **${candidate.evidence_grade}**`,
        `- Grading inputs complete: **${yesNo(candidate.grading_inputs_complete)}**`,
        `- Missing grading inputs: ${candidate.missing_grading_inputs.join(', ') || 'none'}`,
        '- Grading input provenance:',
        `  - study_design = ${candidate.study_design ?? 'null'} — ${candidate.grading_input_sources.study_design}`,
        `  - species = ${candidate.species ?? 'null'} — ${candidate.grading_input_sources.species}`,
        `  - sample_size = ${candidate.sample_size ?? 'null'} — ${candidate.grading_input_sources.sample_size}`,
        `  - funding_independent = ${candidate.funding_independent ?? 'null'} — ${candidate.grading_input_sources.funding_independent}`,
        `  - is_preprint = ${candidate.is_preprint} — ${candidate.grading_input_sources.is_preprint}`,
      );
      if (candidate.duplicate_of) {
        lines.push(
          `- Deduplication: duplicate of ${candidate.duplicate_of} (title similarity ${candidate.title_similarity})`,
        );
      }
      lines.push('');
    });
  }

  const report = `${lines.join('\n')}\n`;
  await writeFile(outputPath, report, 'utf8');
  process.stdout.write(report);
  process.stderr.write(`\nGate 1 report saved to ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
