import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { runDiscoveryMission } from '@/lib/researchDiscoveryMission';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const requestedJobId = request.nextUrl.searchParams.get('job_id');
  const jobsQuery = supabaseAdmin
    .from('research_ingestion_jobs')
    .select('*')
    .eq('job_type', 'discovery')
    .order('created_at', { ascending: false })
    .limit(10);
  const { data: jobs, error: jobsError } = requestedJobId
    ? await jobsQuery.eq('id', requestedJobId)
    : await jobsQuery;
  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const jobId = requestedJobId ?? jobs?.[0]?.id;
  const { data: candidates, error: candidateError } = jobId
    ? await supabaseAdmin
        .from('research_discovery_candidates')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (candidateError) {
    return NextResponse.json({ error: candidateError.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [], candidates: candidates ?? [] });
}

/**
 * Run a bounded PubMed/Europe PMC discovery scan and persist its structured
 * candidates for an explicit import decision. Discovery itself has no model
 * or embedding cost.
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

  try {
    const result = await runDiscoveryMission({
      requestedBy: admin.id,
      requestedByActorType: 'owner',
      candidatesPerTopic,
      topicKeys,
      documentCap,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discovery failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
