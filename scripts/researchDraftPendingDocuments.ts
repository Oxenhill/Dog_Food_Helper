import { draftDocumentIntoKnowledge } from '../src/lib/researchBrainDrafting';
import {
  finishResearchMissionJob,
  startResearchMissionJob,
} from '../src/lib/researchMissionLifecycle';
import { isPersistedResearchProviderHalt } from '../src/lib/researchProviderTelemetry';
import { supabaseAdmin } from '../src/lib/supabase';

/**
 * One-off catch-up for documents ingested before claim drafting was wired to
 * run automatically after import (2026-08-03). Mirrors exactly what the
 * "Draft structured evidence" button / auto-draft-on-import path does --
 * same startResearchMissionJob/draftDocumentIntoKnowledge/finishResearchMissionJob
 * sequence, same audit trail -- just looped over every currently-pending
 * document instead of one at a time by hand.
 *
 * Real Sonnet + Voyage spend: one call per document, run with owner
 * authorization. A failure on one document does not stop the run --
 * documents are independent and a bad one shouldn't block the rest --
 * except a persisted provider halt (rate limit/circuit breaker), which
 * stops the whole run since that's a systemic signal, not a per-document one.
 */

function requireAdminId(): string {
  const id = process.env.RESEARCH_BACKLOG_ADMIN_ID;
  if (!id) throw new Error('Set RESEARCH_BACKLOG_ADMIN_ID to the requesting admin user id');
  return id;
}

async function pendingDocumentIds(): Promise<Array<{ id: string; title: string | null }>> {
  const { data: documents, error } = await supabaseAdmin
    .from('research_documents')
    .select('id, title, retracted, superseded_by, duplicate_of_document_id')
    .eq('retracted', false)
    .is('superseded_by', null)
    .is('duplicate_of_document_id', null)
    .order('retrieved_at', { ascending: true });
  if (error) throw error;
  const { data: claimRows, error: claimError } = await supabaseAdmin
    .from('research_claims')
    .select('document_id');
  if (claimError) throw claimError;
  const documentsWithClaims = new Set((claimRows ?? []).map((row) => row.document_id as string));
  return (documents ?? [])
    .filter((document) => !documentsWithClaims.has(document.id))
    .map((document) => ({ id: document.id, title: document.title as string | null }));
}

async function main(): Promise<void> {
  const adminId = requireAdminId();
  const pending = await pendingDocumentIds();
  process.stdout.write(`${pending.length} document(s) pending structured processing\n\n`);

  let drafted = 0;
  let clustersTotal = 0;
  let failed = 0;
  let skipped = 0;

  for (const [index, document] of pending.entries()) {
    const label = document.title ?? document.id;
    process.stdout.write(`[${index + 1}/${pending.length}] ${label} ... `);
    let job;
    try {
      job = await startResearchMissionJob({
        missionType: 'claim_drafting',
        objective: `Draft source-backed claims from document ${document.id} (backlog catch-up)`,
        stageKey: 'claim_drafting',
        jobType: 'draft_claims',
        requestedBy: adminId,
        jobInput: { document_id: document.id, source: 'backlog_catch_up_2026-08-03' },
        initialStatus: 'running',
      });
    } catch (error) {
      failed += 1;
      process.stdout.write(
        `could not start job (${error instanceof Error ? error.message : String(error)})\n`
      );
      continue;
    }
    try {
      const result = await draftDocumentIntoKnowledge(document.id, job.id, job.control_plane);
      await finishResearchMissionJob({
        jobId: job.id,
        status: 'succeeded',
        resultSummary: { ...result },
        eventPayload: {
          document_id: document.id,
          drafted_claim_count: result.drafted,
          rejected_draft_count: result.rejected.length,
        },
      });
      drafted += result.drafted;
      clustersTotal += result.clusterIds.length;
      process.stdout.write(
        `drafted ${result.drafted} claim(s) into ${result.clusterIds.length} cluster(s), ${result.rejected.length} rejected\n`
      );
    } catch (error) {
      if (isPersistedResearchProviderHalt(error)) {
        process.stdout.write('provider halt -- stopping run\n');
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      try {
        await finishResearchMissionJob({
          jobId: job.id,
          status: 'failed',
          reasonCode: 'claim_drafting_failed',
          errorMessage: message,
          eventPayload: { document_id: document.id },
        });
      } catch {
        // Preserve the drafting failure as the reported outcome either way.
      }
      if (message === 'Document has no chunks' || message.includes('no chunks')) {
        skipped += 1;
        process.stdout.write(`skipped (${message})\n`);
      } else {
        failed += 1;
        process.stdout.write(`failed (${message})\n`);
      }
    }
  }

  process.stdout.write(
    `\nDone. ${drafted} claim(s) drafted into ${clustersTotal} cluster(s) total. `
    + `${failed} document(s) failed, ${skipped} skipped.\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
