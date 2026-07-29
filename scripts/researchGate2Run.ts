import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { embedMany } from 'ai';
import {
  centroidText,
  centroidVersion,
  GATE_2_GROUP_QUOTAS,
  parseGate1Manifest,
  selectGate2Candidates,
} from '../src/lib/researchGate2';
import { prepareSelectedSources } from '../src/lib/researchGate2Sources';
import { chunkText } from '../src/lib/embeddingPipeline';
import { RESEARCH_DISCOVERY_TOPICS } from '../src/lib/researchTopics';
import {
  EMBEDDING_GATEWAY_USD_PER_MILLION_TOKENS,
  EMBEDDING_MODEL,
} from '../src/lib/researchCost';
import {
  commitGate2Plan,
  Gate2DatabasePlan,
  Gate2EmbeddingResults,
} from '../src/lib/researchGate2Database';

const REPORT_PATH = resolve('docs/research-gate1-2026-07-28.md');
const MANIFEST_PATH = resolve('docs/research-gate1-manifest-2026-07-28.json');
const SELECTION_PATH = resolve('docs/research-gate2-proposed-selection-2026-07-28.json');
const RUN_DIRECTORY = resolve('.research-gate2');
const PLAN_PATH = resolve(RUN_DIRECTORY, 'plan.json');
const BATCH_INPUT_PATH = resolve(RUN_DIRECTORY, 'embedding-input.jsonl');
const BATCH_STATE_PATH = resolve(RUN_DIRECTORY, 'batch-state.json');
const EMBEDDING_RESULTS_PATH = resolve(RUN_DIRECTORY, 'embedding-results.json');
const EMBEDDING_DIMENSIONS = 1536;
const GATEWAY_EMBEDDING_MODEL = `openai/${EMBEDDING_MODEL}` as const;
const CHUNK_MAX_CHARACTERS = 1800;

interface PreparedPlanDocument {
  custom_id: string;
  manifest: Awaited<ReturnType<typeof prepareSelectedSources>>[number]['manifest'];
  pubmed: Awaited<ReturnType<typeof prepareSelectedSources>>[number]['pubmed'];
  content_source: 'europe_pmc_jats' | 'pubmed_abstract';
  content_endpoint: string;
  content_retrieved_at: string;
  source_payload_sha256: string;
  source_access_note: string | null;
  license: string | null;
  funding_declaration: string | null;
  competing_interests_declaration: string | null;
  plain_text_sha256: string;
  chunks: string[];
}

export interface PreparedGate2Plan {
  schema_version: 1;
  created_at: string;
  source_report: string;
  source_report_sha256: string;
  selection_file: string;
  selection_sha256: string;
  document_cap: 30;
  selection_policy: {
    group_quotas: typeof GATE_2_GROUP_QUOTAS;
    priority: 'owner-reviewed frozen identifiers after deterministic eligibility and group quotas';
  };
  embedding_model: typeof EMBEDDING_MODEL;
  embedding_dimensions: 1536;
  chunk_max_characters: number;
  selected_documents: PreparedPlanDocument[];
  centroids: Array<{
    custom_id: 'centroids';
    topic_key: string;
    topic_group: string;
    centroid_text: string;
    centroid_version: string;
  }>;
  estimate: {
    embedding_inputs: number;
    estimated_input_tokens: number;
    gateway_usd_per_million_tokens: number;
    estimated_gateway_cost_usd: number;
  };
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

interface Gate2SelectionProposal {
  status: 'proposed_not_approved' | 'owner_approved';
  source_report_sha256: string;
  group_quotas: typeof GATE_2_GROUP_QUOTAS;
  selected: Array<{
    group: keyof typeof GATE_2_GROUP_QUOTAS;
    pmid: string;
    reason: string;
  }>;
}

async function readSelection(manifestSha256: string): Promise<{
  proposal: Gate2SelectionProposal;
  raw: string;
}> {
  const raw = await readFile(SELECTION_PATH, 'utf8');
  const proposal = JSON.parse(raw) as Gate2SelectionProposal;
  if (proposal.source_report_sha256 !== manifestSha256) {
    throw new Error('Selection proposal does not match the frozen Gate 1 report');
  }
  if (JSON.stringify(proposal.group_quotas) !== JSON.stringify(GATE_2_GROUP_QUOTAS)) {
    throw new Error('Selection proposal group quotas do not match the Gate 2 policy');
  }
  return { proposal, raw };
}

async function manifestOnly(): Promise<void> {
  const report = await readFile(REPORT_PATH, 'utf8');
  const manifest = parseGate1Manifest(report);
  const { proposal } = await readSelection(manifest.source_report_sha256);
  const selected = selectGate2Candidates(manifest, proposal.selected);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write([
    `Manifest: ${manifest.candidate_count} candidates`,
    `Report sha256: ${manifest.source_report_sha256}`,
    `Selected: ${selected.length}`,
    ...selected.map((document, index) =>
      `${String(index + 1).padStart(2, '0')}. ${document.topic_memberships[0].group} | PMID ${document.pmid} | ${document.open_access ? 'OA' : 'ABSTRACT'} | ${document.evidence_grade} | ${document.title}`),
    '',
  ].join('\n'));
}

function embeddingInputLine(customId: string, inputs: string[]): string {
  return JSON.stringify({
    custom_id: customId,
    gateway_model: GATEWAY_EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    inputs,
  });
}

async function prepare(): Promise<void> {
  const report = await readFile(REPORT_PATH, 'utf8');
  const manifest = parseGate1Manifest(report);
  const { proposal, raw: selectionRaw } = await readSelection(
    manifest.source_report_sha256,
  );
  const selected = selectGate2Candidates(manifest, proposal.selected);
  const sources = await prepareSelectedSources(selected);
  const documents: PreparedPlanDocument[] = sources.map((source) => {
    const chunks = chunkText(source.plain_text, CHUNK_MAX_CHARACTERS);
    if (chunks.some((chunk) => chunk.length > CHUNK_MAX_CHARACTERS)) {
      throw new Error(`Chunk limit exceeded for PMID ${source.manifest.pmid}`);
    }
    return {
      custom_id: `document-${source.manifest.pmid}`,
      manifest: source.manifest,
      pubmed: source.pubmed,
      content_source: source.content_source,
      content_endpoint: source.content_endpoint,
      content_retrieved_at: source.content_retrieved_at,
      source_payload_sha256: source.source_payload_sha256,
      source_access_note: source.source_access_note,
      license: source.license,
      funding_declaration: source.funding_declaration,
      competing_interests_declaration: source.competing_interests_declaration,
      plain_text_sha256: hash(source.plain_text),
      chunks,
    };
  });
  const centroids = RESEARCH_DISCOVERY_TOPICS.map((topic) => {
    const text = centroidText(topic);
    return {
      custom_id: 'centroids' as const,
      topic_key: topic.key,
      topic_group: topic.group,
      centroid_text: text,
      centroid_version: centroidVersion(topic.key, text, EMBEDDING_MODEL),
    };
  });
  const inputCharacters =
    documents.flatMap((document) => document.chunks)
      .reduce((total, chunk) => total + chunk.length, 0)
    + centroids.reduce((total, centroid) => total + centroid.centroid_text.length, 0);
  const estimatedTokens = Math.ceil(inputCharacters / 4);
  const estimatedCost =
    estimatedTokens / 1_000_000 * EMBEDDING_GATEWAY_USD_PER_MILLION_TOKENS;
  const plan: PreparedGate2Plan = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    source_report: manifest.source_report,
    source_report_sha256: manifest.source_report_sha256,
    selection_file: 'docs/research-gate2-proposed-selection-2026-07-28.json',
    selection_sha256: hash(selectionRaw),
    document_cap: 30,
    selection_policy: {
      group_quotas: GATE_2_GROUP_QUOTAS,
      priority:
        'owner-reviewed frozen identifiers after deterministic eligibility and group quotas',
    },
    embedding_model: EMBEDDING_MODEL,
    embedding_dimensions: EMBEDDING_DIMENSIONS,
    chunk_max_characters: CHUNK_MAX_CHARACTERS,
    selected_documents: documents,
    centroids,
    estimate: {
      embedding_inputs:
        documents.reduce((total, document) => total + document.chunks.length, 0)
        + centroids.length,
      estimated_input_tokens: estimatedTokens,
      gateway_usd_per_million_tokens: EMBEDDING_GATEWAY_USD_PER_MILLION_TOKENS,
      estimated_gateway_cost_usd: Number(estimatedCost.toFixed(6)),
    },
  };

  await mkdir(RUN_DIRECTORY, { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  const jsonl = [
    ...documents.map((document) =>
      embeddingInputLine(document.custom_id, document.chunks)),
    embeddingInputLine(
      'centroids',
      centroids.map((centroid) => centroid.centroid_text),
    ),
  ].join('\n');
  await writeFile(BATCH_INPUT_PATH, `${jsonl}\n`, 'utf8');

  process.stdout.write([
    'GATE 2 PREPARED — NO DATABASE WRITE OR PAID CALL',
    `Manifest: ${manifest.candidate_count} candidates, sha256 ${manifest.source_report_sha256}`,
    `Selection: ${documents.length} documents`,
    `Embedded content: ${documents.filter((document) => document.content_source === 'europe_pmc_jats').length} Europe PMC JATS, ${documents.filter((document) => document.content_source === 'pubmed_abstract').length} PubMed abstracts`,
    `Embedding inputs: ${plan.estimate.embedding_inputs}`,
    `Estimated tokens: ${plan.estimate.estimated_input_tokens}`,
    `Current Gateway price: $${plan.estimate.gateway_usd_per_million_tokens}/1M tokens`,
    `Estimated paid cost: $${plan.estimate.estimated_gateway_cost_usd.toFixed(6)} USD`,
    '',
    ...documents.map((document, index) =>
      `${String(index + 1).padStart(2, '0')}. ${document.manifest.topic_memberships[0].group} | PMID ${document.manifest.pmid} | ${document.manifest.evidence_grade} | ${document.chunks.length} chunks | ${document.manifest.title}`),
    '',
  ].join('\n'));
}

async function submit(): Promise<void> {
  if (!hasFlag('approve-paid-call')) {
    throw new Error('Refusing paid call without --approve-paid-call');
  }
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      'Vercel AI Gateway auth is required: set AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN',
    );
  }
  const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8')) as PreparedGate2Plan;
  const report = await readFile(REPORT_PATH, 'utf8');
  if (parseGate1Manifest(report).source_report_sha256 !== plan.source_report_sha256) {
    throw new Error('Gate 1 report changed after plan preparation');
  }
  const { proposal, raw: selectionRaw } = await readSelection(
    plan.source_report_sha256,
  );
  if (proposal.status !== 'owner_approved') {
    throw new Error('Selection is not owner-approved');
  }
  if (hash(selectionRaw) !== plan.selection_sha256) {
    throw new Error('Selection changed after plan preparation');
  }

  const groups = [
    ...plan.selected_documents.map((document) => ({
      customId: document.custom_id,
      values: document.chunks,
    })),
    {
      customId: 'centroids',
      values: plan.centroids.map((centroid) => centroid.centroid_text),
    },
  ];
  const values = groups.flatMap((group) => group.values);
  if (values.length !== plan.estimate.embedding_inputs) {
    throw new Error('Prepared embedding-input count changed');
  }

  const startedAt = new Date().toISOString();
  const result = await embedMany({
    model: GATEWAY_EMBEDDING_MODEL,
    values,
    maxParallelCalls: 1,
    maxRetries: 2,
  });
  if (result.embeddings.length !== values.length) {
    throw new Error(
      `Gateway returned ${result.embeddings.length}/${values.length} embeddings`,
    );
  }

  const results: Record<string, number[][]> = {};
  let offset = 0;
  for (const group of groups) {
    const embeddings = result.embeddings.slice(offset, offset + group.values.length);
    offset += group.values.length;
    if (
      embeddings.some(
        (embedding) =>
          embedding.length !== EMBEDDING_DIMENSIONS
          || embedding.some((value) => !Number.isFinite(value)),
      )
    ) {
      throw new Error(`Invalid 1536-dimensional embedding in ${group.customId}`);
    }
    results[group.customId] = embeddings;
  }
  const completedAt = new Date().toISOString();
  const output = {
    provider: 'vercel_ai_gateway',
    gateway_model: GATEWAY_EMBEDDING_MODEL,
    embedding_dimensions: EMBEDDING_DIMENSIONS,
    started_at: startedAt,
    completed_at: completedAt,
    usage: result.usage,
    warnings: result.warnings,
    results,
  };
  await writeFile(
    EMBEDDING_RESULTS_PATH,
    `${JSON.stringify(output)}\n`,
    'utf8',
  );
  await writeFile(
    BATCH_STATE_PATH,
    `${JSON.stringify({
      provider: 'vercel_ai_gateway',
      gateway_model: GATEWAY_EMBEDDING_MODEL,
      status: 'completed',
      started_at: startedAt,
      completed_at: completedAt,
      input_count: values.length,
      usage: result.usage,
      plan_sha256: hash(JSON.stringify(plan)),
    }, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write([
    'VERCEL AI GATEWAY OFFLINE EMBEDDING RUN COMPLETED',
    `Model: ${GATEWAY_EMBEDDING_MODEL}`,
    `Inputs: ${values.length}`,
    `Actual tokens: ${result.usage.tokens}`,
    `Validated groups: ${Object.keys(results).length}`,
    `All embeddings: ${EMBEDDING_DIMENSIONS} dimensions`,
    '',
  ].join('\n'));
}

async function status(): Promise<void> {
  const state = JSON.parse(await readFile(BATCH_STATE_PATH, 'utf8')) as unknown;
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

async function commit(): Promise<void> {
  const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8')) as Gate2DatabasePlan;
  const embeddings = JSON.parse(
    await readFile(EMBEDDING_RESULTS_PATH, 'utf8'),
  ) as Gate2EmbeddingResults;
  const report = await commitGate2Plan(plan, embeddings, hasFlag('dry-run'));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const mode = option('mode') ?? 'prepare';
  if (mode === 'manifest') return manifestOnly();
  if (mode === 'prepare') return prepare();
  if (mode === 'submit') return submit();
  if (mode === 'status') return status();
  if (mode === 'commit') return commit();
  throw new Error(`Unknown --mode=${mode}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
