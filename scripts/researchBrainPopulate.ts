import {
  draftDocumentIntoKnowledge,
  RESEARCH_BRAIN_DRAFT_MODEL,
} from '../src/lib/researchBrainDrafting';
import { RESEARCH_BRAIN_EMBEDDING_MODEL } from '../src/lib/researchBrainPipeline';
import { supabaseAdmin } from '../src/lib/supabase';

const DEFAULT_TOPICS = [
  'diet-microbiome',
  'dysbiosis-index',
  'chronic-enteropathy',
  'deficiency-markers',
  'diabetes-fibre',
  'large-bowel-diarrhoea',
  'osteoarthritis',
  'urolithiasis',
  'cafrs',
  'novel-protein-diets',
  'protein-cross-reactivity',
  'grain-free-dcm',
  'processing-nutrient-availability',
  'raw-diets',
];

function option(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const topics = (option('topics')?.split(',') ?? DEFAULT_TOPICS)
    .map((value) => value.trim())
    .filter(Boolean);
  const cap = Math.max(1, Math.min(Number(option('cap') ?? 14), 30));
  const { data: admin, error: adminError } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('is_admin', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (adminError || !admin) throw adminError ?? new Error('No admin profile exists');

  const { data: documents, error: documentError } = await supabaseAdmin
    .from('research_documents')
    .select('id, title, discovery_topic, retracted, superseded_by')
    .in('discovery_topic', topics)
    .eq('retracted', false)
    .is('superseded_by', null);
  if (documentError) throw documentError;
  const selected = (documents ?? [])
    .sort(
      (left, right) =>
        topics.indexOf(left.discovery_topic) - topics.indexOf(right.discovery_topic)
    )
    .slice(0, cap);

  for (const document of selected) {
    const { data: documentClaims, error: documentClaimError } = await supabaseAdmin
      .from('research_claims')
      .select('id')
      .eq('document_id', document.id);
    if (documentClaimError) throw documentClaimError;
    const claimIds = (documentClaims ?? []).map((claim) => claim.id);
    const { data: memberships, error: membershipError } =
      claimIds.length === 0
        ? { data: [], error: null }
        : await supabaseAdmin
            .from('research_evidence_cluster_members')
            .select('claim_id')
            .in('claim_id', claimIds)
            .limit(1);
    if (membershipError) throw membershipError;
    if (memberships.length > 0) {
      process.stdout.write(`SKIP ${document.discovery_topic}: already clustered\n`);
      continue;
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('research_ingestion_jobs')
      .insert({
        job_type: 'draft_claims',
        status: 'running',
        requested_by: admin.id,
        input: {
          document_id: document.id,
          source: 'bounded_initial_population',
        },
        gateway_model: `${RESEARCH_BRAIN_DRAFT_MODEL} + ${RESEARCH_BRAIN_EMBEDDING_MODEL}`,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (jobError || !job) throw jobError ?? new Error('Could not create processing job');

    try {
      const result = await draftDocumentIntoKnowledge(document.id, job.id);
      const completedAt = new Date().toISOString();
      await supabaseAdmin
        .from('research_ingestion_jobs')
        .update({
          status: 'succeeded',
          result_summary: result,
          gateway_input_tokens: result.usage.inputTokens + result.embedding.inputTokens,
          gateway_output_tokens: result.usage.outputTokens,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq('id', job.id);
      process.stdout.write(
        `OK ${document.discovery_topic}: ${result.drafted} claims, ${result.clusterIds.length} clusters\n`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String(error.message)
            : JSON.stringify(error);
      const completedAt = new Date().toISOString();
      await supabaseAdmin
        .from('research_ingestion_jobs')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq('id', job.id);
      process.stdout.write(`FAIL ${document.discovery_topic}: ${message}\n`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
