import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { discoverResearchCandidates } from '@/lib/researchDiscovery';
import { estimateResearchCosts } from '@/lib/researchCost';

export const maxDuration = 300;

/**
 * Gate 1 only: source metadata is fetched and returned, with no database writes
 * and no embedding/model calls. There is intentionally no commit mode here.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body uses conservative defaults.
  }

  const candidatesPerTopic =
    typeof body.candidates_per_topic === 'number' ? body.candidates_per_topic : 2;
  const topicKeys = Array.isArray(body.topic_keys)
    ? body.topic_keys.filter((value): value is string => typeof value === 'string')
    : undefined;
  const documentCap =
    typeof body.document_cap === 'number' ? Math.max(1, Math.floor(body.document_cap)) : 30;

  const run = await discoverResearchCandidates({
    candidatesPerTopic,
    topicKeys,
    concurrency: 3,
  });
  const costEstimate = estimateResearchCosts(run, documentCap);

  return NextResponse.json({
    gate: 1,
    write_performed: false,
    model_calls_performed: false,
    run,
    cost_estimate_for_gate_2: costEstimate,
  });
}
