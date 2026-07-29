import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateObject, gateway } from 'ai';
import {
  assertGate3DraftingInputs,
  buildGate3DraftingPrompt,
  GATE_3_MAX_CLAIMS,
  GATE_3_MAX_OUTPUT_TOKENS,
  GATE_3_MODEL,
  GATE_3_SYSTEM_INSTRUCTION,
  Gate3DraftResponseSchema,
  gate3DraftIdentity,
  gate3ModeledInputCharacters,
  normalizeGate3Proposition,
  sha256,
  validateGate3Claim,
  type Gate3Claim,
  type Gate3DraftingInput,
} from '../src/lib/researchGate3';

const MANIFEST_PATH = resolve(
  'docs/research-gate3-proposed-drafting-manifest-2026-07-29.json',
);
const AMENDMENT_PATH = resolve(
  'docs/research-gate3-drafting-amendment-2026-07-29.json',
);
const GATE_2_PLAN_PATH = resolve('.research-gate2/plan.json');
const RUN_DIRECTORY = resolve('.research-gate3');
const EXPANDED_INPUT_PATH = resolve(RUN_DIRECTORY, 'run-1-approved-inputs.json');
const RAW_RESULTS_PATH = resolve(RUN_DIRECTORY, 'run-1-raw-results.json');
const VALIDATED_RESULTS_PATH = resolve(RUN_DIRECTORY, 'run-1-validated-results.json');
const APPROVED_MANIFEST_SHA256 =
  'c72731c69f6df31aed10387b005df72990009cf956483d20e7a4227c42fc9c1e';
const APPROVED_AMENDMENT_SHA256 =
  'b229293aa1ee0ff7c7334b546c8df130e411f1f385927de12e9f328876e1a65c';
const BASE_INPUT_USD = 0.000002;
const BASE_OUTPUT_USD = 0.00001;
const REGIONAL_INPUT_USD = 0.0000022;
const REGIONAL_OUTPUT_USD = 0.000011;
const ORIGINAL_APPROVAL_COST_CEILING_USD = 0.05;
const APPROVAL_COST_CEILING_USD = 0.06;

interface ProposalInput {
  slot: string;
  group: string;
  topic_key: string;
  document_id: string;
  pmid: string;
  title: string;
  chunk_id: string;
  chunk_index: number;
  access_type: 'open_access_full_text' | 'abstract_only';
  chunk_sha256: string;
  chunk_characters: number;
  evidence_scope: string;
  evidence_grade: string;
  grading_inputs_complete: boolean;
  missing_grading_inputs: string[];
  funding_independent: boolean | null;
  funding_declaration_present: boolean;
}

interface ProposalManifest {
  status: 'proposed_not_approved';
  gateway: {
    model: string;
    approval_cost_ceiling_usd: number;
    system_instruction_sha256: string;
    output_schema_sha256: string;
  };
  selection_policy: {
    gateway_requests: number;
    maximum_claims: number;
  };
  selected_inputs: ProposalInput[];
}

interface Gate2Plan {
  selected_documents: Array<{
    manifest: {
      pmid: string;
      title: string;
    };
    chunks: string[];
  }>;
}

interface RawCallResult {
  call_index: number;
  slot: string;
  pmid: string;
  document_id: string;
  chunk_id: string;
  started_at: string;
  completed_at: string;
  modeled_input_characters: number;
  object: { claim: Gate3Claim | null } | null;
  finish_reason: string;
  generation_error?: {
    name: string;
    message: string;
  };
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    reasoning_tokens: number | null;
    cache_read_tokens: number | null;
    cache_write_tokens: number | null;
  };
  response: {
    id: string | null;
    model_id: string | null;
    timestamp: string | null;
  };
  gateway_generation: {
    total_cost: number;
    upstream_inference_cost: number;
    usage_cost: number;
    model: string;
    provider_name: string;
    is_byok: boolean;
  } | null;
  provider_metadata?: unknown;
  warnings?: unknown;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function existingRawResults(): Promise<{
  status: string;
  approved_manifest_sha256: string;
  model: string;
  calls: RawCallResult[];
} | null> {
  try {
    return JSON.parse(await readFile(RAW_RESULTS_PATH, 'utf8')) as {
      status: string;
      approved_manifest_sha256: string;
      model: string;
      calls: RawCallResult[];
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function approvedInputs(): Promise<{
  manifest: ProposalManifest;
  inputs: Gate3DraftingInput[];
}> {
  const manifestRaw = await readFile(MANIFEST_PATH);
  const manifestHash = createHash('sha256').update(manifestRaw).digest('hex');
  if (manifestHash !== APPROVED_MANIFEST_SHA256) {
    throw new Error(
      `Approved manifest changed: expected ${APPROVED_MANIFEST_SHA256}, got ${manifestHash}`,
    );
  }
  const manifest = JSON.parse(manifestRaw.toString('utf8')) as ProposalManifest;
  if (manifest.status !== 'proposed_not_approved') {
    throw new Error(`Unexpected proposal status: ${manifest.status}`);
  }
  if (manifest.gateway.model !== GATE_3_MODEL) {
    throw new Error(`Approved model changed: ${manifest.gateway.model}`);
  }
  if (
    manifest.gateway.approval_cost_ceiling_usd
    !== ORIGINAL_APPROVAL_COST_CEILING_USD
  ) {
    throw new Error('Original approved cost ceiling changed');
  }
  if (manifest.selection_policy.gateway_requests !== 8) {
    throw new Error('Approved Gateway call count changed');
  }
  if (manifest.selection_policy.maximum_claims !== GATE_3_MAX_CLAIMS) {
    throw new Error('Approved claim cap changed');
  }

  const plan = JSON.parse(await readFile(GATE_2_PLAN_PATH, 'utf8')) as Gate2Plan;
  const inputs = manifest.selected_inputs.map((selected): Gate3DraftingInput => {
    const document = plan.selected_documents.find(
      (candidate) => candidate.manifest.pmid === selected.pmid,
    );
    if (!document || document.manifest.title !== selected.title) {
      throw new Error(`Gate 2 document mismatch: PMID ${selected.pmid}`);
    }
    const content = document.chunks[selected.chunk_index];
    if (typeof content !== 'string') {
      throw new Error(`Gate 2 chunk missing: PMID ${selected.pmid}`);
    }
    return {
      slot: selected.slot,
      group: selected.group,
      topic_key: selected.topic_key,
      document_id: selected.document_id,
      pmid: selected.pmid,
      title: selected.title,
      chunk_id: selected.chunk_id,
      chunk_index: selected.chunk_index,
      access_type: selected.access_type,
      chunk_sha256: selected.chunk_sha256,
      chunk_characters: selected.chunk_characters,
      content,
    };
  });
  assertGate3DraftingInputs(inputs);
  return { manifest, inputs };
}

async function assertApprovedAmendment(): Promise<void> {
  const amendmentRaw = await readFile(AMENDMENT_PATH);
  const amendmentHash = sha256(amendmentRaw);
  if (amendmentHash !== APPROVED_AMENDMENT_SHA256) {
    throw new Error(
      `Approved amendment changed: expected ${APPROVED_AMENDMENT_SHA256}, got ${amendmentHash}`,
    );
  }
  const amendment = JSON.parse(amendmentRaw.toString('utf8')) as {
    status: string;
    parent_manifest_sha256: string;
    remaining_requests: {
      count: number;
      retries: number;
      maximum_output_tokens_per_request: number;
    };
    revised_cost: {
      requested_total_run_ceiling_usd: number;
    };
  };
  if (
    amendment.status !== 'proposed_not_approved'
    || amendment.parent_manifest_sha256 !== APPROVED_MANIFEST_SHA256
    || amendment.remaining_requests.count !== 6
    || amendment.remaining_requests.retries !== 0
    || amendment.remaining_requests.maximum_output_tokens_per_request
      !== GATE_3_MAX_OUTPUT_TOKENS
    || amendment.revised_cost.requested_total_run_ceiling_usd
      !== APPROVAL_COST_CEILING_USD
  ) {
    throw new Error('Approved amendment contents changed');
  }
}

async function prepare(): Promise<void> {
  const { manifest, inputs } = await approvedInputs();
  await mkdir(RUN_DIRECTORY, { recursive: true });
  await writeJsonAtomically(EXPANDED_INPUT_PATH, {
    schema_version: 'research-gate3-approved-inputs.v1',
    approved_manifest_sha256: APPROVED_MANIFEST_SHA256,
    model: GATE_3_MODEL,
    calls: inputs.map((input, index) => ({
      call_index: index + 1,
      ...manifest.selected_inputs[index],
      modeled_input_characters: gate3ModeledInputCharacters(input),
      content: input.content,
    })),
  });
  process.stdout.write(
    [
      `Prepared ${inputs.length} approved inputs`,
      `Manifest sha256: ${APPROVED_MANIFEST_SHA256}`,
      `Model: ${GATE_3_MODEL} through Vercel AI Gateway`,
      `Maximum approved cost: $${APPROVAL_COST_CEILING_USD.toFixed(2)}`,
      `Output: ${EXPANDED_INPUT_PATH}`,
      '',
    ].join('\n'),
  );
}

async function generationCost(responseId: string | undefined): Promise<RawCallResult['gateway_generation']> {
  if (!responseId?.startsWith('gen_')) return null;
  try {
    const generation = await gateway.getGenerationInfo({ id: responseId });
    return {
      total_cost: generation.totalCost,
      upstream_inference_cost: generation.upstreamInferenceCost,
      usage_cost: generation.usage,
      model: generation.model,
      provider_name: generation.providerName,
      is_byok: generation.isByok,
    };
  } catch {
    return null;
  }
}

function estimatedActualCost(
  results: RawCallResult[],
  inputRate: number,
  outputRate: number,
): number {
  return results.reduce(
    (total, result) =>
      total
      + (result.usage.input_tokens ?? 0) * inputRate
      + (result.usage.output_tokens ?? 0) * outputRate,
    0,
  );
}

function errorProperty<T>(error: unknown, property: string): T | undefined {
  if (typeof error !== 'object' || error === null || !(property in error)) return undefined;
  return (error as Record<string, unknown>)[property] as T;
}

async function execute(): Promise<void> {
  if (option('approval-sha') !== APPROVED_MANIFEST_SHA256) {
    throw new Error('Execution requires the exact approved manifest SHA');
  }
  if (option('amendment-sha') !== APPROVED_AMENDMENT_SHA256) {
    throw new Error('Execution requires the exact approved amendment SHA');
  }
  await assertApprovedAmendment();
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error('Vercel AI Gateway authentication is unavailable');
  }
  const { manifest, inputs } = await approvedInputs();
  await mkdir(RUN_DIRECTORY, { recursive: true });

  const saved = await existingRawResults();
  if (
    saved
    && (
      saved.approved_manifest_sha256 !== APPROVED_MANIFEST_SHA256
      || saved.model !== GATE_3_MODEL
    )
  ) {
    throw new Error('Saved raw results do not match the approved Gate 3 run');
  }
  const results: RawCallResult[] = saved?.calls ?? [];
  if (results.length > inputs.length) {
    throw new Error('Saved raw results exceed the approved call count');
  }
  for (const [index, result] of results.entries()) {
    const input = inputs[index];
    if (result.pmid !== input.pmid || result.chunk_id !== input.chunk_id) {
      throw new Error(`Saved call ${index + 1} does not match the approved input`);
    }
  }

  for (let index = results.length; index < inputs.length; index += 1) {
    const input = inputs[index];
    const spentRegional = estimatedActualCost(
      results,
      REGIONAL_INPUT_USD,
      REGIONAL_OUTPUT_USD,
    );
    const conservativeNextInputTokens =
      Math.ceil(gate3ModeledInputCharacters(input) / 4) + 900;
    const conservativeNextCost =
      conservativeNextInputTokens * REGIONAL_INPUT_USD
      + GATE_3_MAX_OUTPUT_TOKENS * REGIONAL_OUTPUT_USD;
    if (spentRegional + conservativeNextCost > APPROVAL_COST_CEILING_USD) {
      throw new Error(
        `Next request would risk the amended $${APPROVAL_COST_CEILING_USD.toFixed(2)} ceiling`,
      );
    }
    const startedAt = new Date().toISOString();
    let raw: RawCallResult;
    try {
      const result = await generateObject({
        model: gateway(GATE_3_MODEL),
        schema: Gate3DraftResponseSchema,
        system: GATE_3_SYSTEM_INSTRUCTION,
        prompt: buildGate3DraftingPrompt(input),
        maxOutputTokens: GATE_3_MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        temperature: 0,
        providerOptions: {
          anthropic: {
            effort: 'low',
            structuredOutputMode: 'outputFormat',
          },
          gateway: {
            tags: ['research-gate3-run1'],
          },
        },
      });
      const completedAt = new Date().toISOString();
      const responseId = result.response.id;
      raw = {
        call_index: index + 1,
        slot: input.slot,
        pmid: input.pmid,
        document_id: input.document_id,
        chunk_id: input.chunk_id,
        started_at: startedAt,
        completed_at: completedAt,
        modeled_input_characters: gate3ModeledInputCharacters(input),
        object: result.object,
        finish_reason: result.finishReason,
        usage: {
          input_tokens: result.usage.inputTokens ?? null,
          output_tokens: result.usage.outputTokens ?? null,
          total_tokens: result.usage.totalTokens ?? null,
          reasoning_tokens: result.usage.outputTokenDetails.reasoningTokens ?? null,
          cache_read_tokens: result.usage.inputTokenDetails.cacheReadTokens ?? null,
          cache_write_tokens: result.usage.inputTokenDetails.cacheWriteTokens ?? null,
        },
        response: {
          id: responseId ?? null,
          model_id: result.response.modelId ?? null,
          timestamp: result.response.timestamp?.toISOString() ?? null,
        },
        gateway_generation: await generationCost(responseId),
        provider_metadata: result.providerMetadata,
        warnings: result.warnings,
      };
    } catch (error) {
      const usage = errorProperty<{
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        inputTokenDetails?: {
          cacheReadTokens?: number;
          cacheWriteTokens?: number;
        };
        outputTokenDetails?: {
          reasoningTokens?: number;
        };
      }>(error, 'usage');
      const response = errorProperty<{
        id?: string;
        modelId?: string;
        timestamp?: Date;
        body?: {
          providerMetadata?: unknown;
          warnings?: unknown;
        };
      }>(error, 'response');
      const finishReason = errorProperty<string>(error, 'finishReason') ?? 'error';
      const responseId = response?.id;
      raw = {
        call_index: index + 1,
        slot: input.slot,
        pmid: input.pmid,
        document_id: input.document_id,
        chunk_id: input.chunk_id,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        modeled_input_characters: gate3ModeledInputCharacters(input),
        object: null,
        finish_reason: finishReason,
        generation_error: {
          name: error instanceof Error ? error.name : 'UnknownGenerationError',
          message: error instanceof Error ? error.message : String(error),
        },
        usage: {
          input_tokens: usage?.inputTokens ?? null,
          output_tokens: usage?.outputTokens ?? null,
          total_tokens: usage?.totalTokens ?? null,
          reasoning_tokens: usage?.outputTokenDetails?.reasoningTokens ?? null,
          cache_read_tokens: usage?.inputTokenDetails?.cacheReadTokens ?? null,
          cache_write_tokens: usage?.inputTokenDetails?.cacheWriteTokens ?? null,
        },
        response: {
          id: responseId ?? null,
          model_id: response?.modelId ?? null,
          timestamp: response?.timestamp?.toISOString() ?? null,
        },
        gateway_generation: await generationCost(responseId),
        provider_metadata: response?.body?.providerMetadata,
        warnings: response?.body?.warnings,
      };
    }
    results.push(raw);

    const pricedCost = results.reduce(
      (total, item) => total + (item.gateway_generation?.total_cost ?? 0),
      0,
    );
    const conservativeCost = estimatedActualCost(
      results,
      REGIONAL_INPUT_USD,
      REGIONAL_OUTPUT_USD,
    );
    if (Math.max(pricedCost, conservativeCost) > APPROVAL_COST_CEILING_USD) {
      await writeJsonAtomically(RAW_RESULTS_PATH, {
        status: 'stopped_cost_ceiling',
        approved_manifest_sha256: APPROVED_MANIFEST_SHA256,
        approved_amendment_sha256: APPROVED_AMENDMENT_SHA256,
        model: GATE_3_MODEL,
        calls: results,
      });
      throw new Error('Approved Gate 3 cost ceiling exceeded');
    }

    await writeJsonAtomically(RAW_RESULTS_PATH, {
      status: index + 1 === inputs.length ? 'completed' : 'in_progress',
      approved_manifest_sha256: APPROVED_MANIFEST_SHA256,
      approved_amendment_sha256: APPROVED_AMENDMENT_SHA256,
      model: GATE_3_MODEL,
      calls: results,
    });
    process.stdout.write(
      `Call ${index + 1}/${inputs.length}: PMID ${input.pmid}, `
      + `${
        raw.generation_error
          ? `discarded (${raw.generation_error.name})`
          : raw.object?.claim
            ? 'claim proposed'
            : 'null'
      }\n`,
    );
    if (raw.generation_error) {
      throw new Error(
        `Stopped after call ${index + 1}; no further spend after generation failure`,
      );
    }
  }

  const accepted: Array<Record<string, unknown>> = [];
  const discarded: Array<Record<string, unknown>> = [];
  const seenWithinDocument = new Map<string, Set<string>>();
  for (const [index, result] of results.entries()) {
    const input = inputs[index];
    const source = manifest.selected_inputs[index];
    const claim = result.object?.claim ?? null;
    if (!claim) {
      discarded.push({
        ...source,
        call_index: result.call_index,
        proposal: null,
        rejection_reasons: result.generation_error
          ? [
              `model_generation_failed:${result.generation_error.name}:${result.finish_reason}`,
            ]
          : ['model_returned_null'],
      });
      continue;
    }

    const validation = validateGate3Claim(claim, input);
    const quoteKey = `quote:${claim.supporting_quote}`;
    const propositionKey = `proposition:${normalizeGate3Proposition(claim)}`;
    const seen = seenWithinDocument.get(input.document_id) ?? new Set<string>();
    if (seen.has(quoteKey)) validation.rejection_reasons.push('duplicate_quote_within_document');
    if (seen.has(propositionKey)) {
      validation.rejection_reasons.push('duplicate_normalized_proposition_within_document');
    }
    seen.add(quoteKey);
    seen.add(propositionKey);
    seenWithinDocument.set(input.document_id, seen);
    validation.valid = validation.rejection_reasons.length === 0;

    const proposal = {
      ...source,
      call_index: result.call_index,
      claim_identity: gate3DraftIdentity(claim, input),
      claim,
      validation,
    };
    if (validation.valid) accepted.push(proposal);
    else {
      discarded.push({
        ...proposal,
        rejection_reasons: validation.rejection_reasons,
      });
    }
  }

  const gatewayReportedCost = results.reduce(
    (total, result) => total + (result.gateway_generation?.total_cost ?? 0),
    0,
  );
  const usage = {
    input_tokens: results.reduce(
      (total, result) => total + (result.usage.input_tokens ?? 0),
      0,
    ),
    output_tokens: results.reduce(
      (total, result) => total + (result.usage.output_tokens ?? 0),
      0,
    ),
    total_tokens: results.reduce(
      (total, result) => total + (result.usage.total_tokens ?? 0),
      0,
    ),
    reasoning_tokens: results.reduce(
      (total, result) => total + (result.usage.reasoning_tokens ?? 0),
      0,
    ),
  };
  const validated = {
    schema_version: 'research-gate3-validated-results.v1',
    status: 'awaiting_owner_claim_approval',
    approved_manifest_sha256: APPROVED_MANIFEST_SHA256,
    approved_amendment_sha256: APPROVED_AMENDMENT_SHA256,
    model: GATE_3_MODEL,
    completed_at: new Date().toISOString(),
    calls: results.length,
    usage,
    cost: {
      gateway_reported_usd:
        results.every((result) => result.gateway_generation !== null)
          ? gatewayReportedCost
          : null,
      calculated_base_usd: estimatedActualCost(
        results,
        BASE_INPUT_USD,
        BASE_OUTPUT_USD,
      ),
      calculated_regional_usd: estimatedActualCost(
        results,
        REGIONAL_INPUT_USD,
        REGIONAL_OUTPUT_USD,
      ),
      approved_ceiling_usd: APPROVAL_COST_CEILING_USD,
    },
    accepted,
    discarded,
  };
  await writeJsonAtomically(VALIDATED_RESULTS_PATH, validated);
  process.stdout.write(
    [
      `Accepted: ${accepted.length}`,
      `Discarded/null: ${discarded.length}`,
      `Input tokens: ${usage.input_tokens}`,
      `Output tokens: ${usage.output_tokens}`,
      `Gateway-reported cost: ${
        validated.cost.gateway_reported_usd === null
          ? 'unavailable'
          : `$${validated.cost.gateway_reported_usd.toFixed(6)}`
      }`,
      `Validated output: ${VALIDATED_RESULTS_PATH}`,
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  if (hasFlag('prepare')) {
    await prepare();
  } else if (hasFlag('execute')) {
    await execute();
  } else {
    throw new Error(
      'Use --prepare or --execute --approval-sha=<manifest sha256> --amendment-sha=<amendment sha256>',
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
