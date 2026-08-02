import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assembleResearchMissionReadModels } from '@/lib/researchMissionReadModel';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MissionIdSchema = z.string().uuid();
const DETAIL_EVENT_PAGE_SIZE = 500;

type Row = Record<string, unknown>;

function stringIds(rows: Row[], key: string): string[] {
  return [...new Set(rows
    .map((row) => row[key])
    .filter((value): value is string => typeof value === 'string'))];
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const requestedMissionId = request.nextUrl.searchParams.get('mission_id');
  if (requestedMissionId && !MissionIdSchema.safeParse(requestedMissionId).success) {
    return NextResponse.json({ error: 'mission_id must be a UUID' }, { status: 400 });
  }
  const requestedAfterSequence = request.nextUrl.searchParams.get('after_sequence');
  const afterSequence = requestedAfterSequence === null
    ? null
    : Number(requestedAfterSequence);
  if (
    afterSequence !== null
    && (!requestedMissionId || !Number.isSafeInteger(afterSequence) || afterSequence < 0)
  ) {
    return NextResponse.json(
      { error: 'after_sequence requires mission_id and must be a non-negative integer' },
      { status: 400 }
    );
  }

  let missionQuery = supabaseAdmin
    .from('research_missions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(requestedMissionId ? 1 : 25);
  if (requestedMissionId) missionQuery = missionQuery.eq('id', requestedMissionId);

  const { data: missions, error: missionError } = await missionQuery;
  if (missionError) {
    return NextResponse.json({ error: missionError.message }, { status: 500 });
  }
  const missionRows = (missions ?? []) as Row[];
  const missionIds = stringIds(missionRows, 'id');
  if (missionIds.length === 0) {
    return NextResponse.json(
      {
        missions: [],
        polling: requestedMissionId
          ? {
              mission_id: requestedMissionId,
              requested_after_sequence: afterSequence,
              last_sequence: afterSequence ?? 0,
              has_more: false,
            }
          : null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  let eventQuery = supabaseAdmin
    .from('research_mission_events')
    .select('*')
    .in('mission_id', missionIds)
    .order('sequence_number', { ascending: true })
    .limit(requestedMissionId ? DETAIL_EVENT_PAGE_SIZE + 1 : 1000);
  if (afterSequence !== null) eventQuery = eventQuery.gt('sequence_number', afterSequence);

  const [stageResult, eventResult] = await Promise.all([
    supabaseAdmin
      .from('research_mission_stages')
      .select('*')
      .in('mission_id', missionIds)
      .order('created_at', { ascending: true }),
    eventQuery,
  ]);
  if (stageResult.error) {
    return NextResponse.json({ error: stageResult.error.message }, { status: 500 });
  }
  if (eventResult.error) {
    return NextResponse.json({ error: eventResult.error.message }, { status: 500 });
  }

  const stageRows = (stageResult.data ?? []) as Row[];
  const rawEventRows = (eventResult.data ?? []) as Row[];
  const hasMore = Boolean(requestedMissionId && rawEventRows.length > DETAIL_EVENT_PAGE_SIZE);
  const eventRows = requestedMissionId
    ? rawEventRows.slice(0, DETAIL_EVENT_PAGE_SIZE)
    : rawEventRows;

  let providerCalls: Row[] = [];
  let modelConfigurations: Row[] = [];
  let modelRoutes: Row[] = [];
  let budgetPolicies: Row[] = [];
  let stageCaps: Row[] = [];
  let estimateRates: Row[] = [];

  // The list response is intentionally light. A mission_id request is the
  // complete persisted detail/read model used by reconnecting polling clients.
  if (requestedMissionId) {
    const configurationIds = stringIds(stageRows, 'model_stage_configuration_version_id');
    const budgetPolicyIds = stringIds(missionRows, 'budget_policy_version_id');
    const [callResult, configurationResult, routeResult, policyResult, capResult] =
      await Promise.all([
        supabaseAdmin
          .from('research_provider_calls')
          .select('*')
          .eq('mission_id', requestedMissionId)
          .order('started_at', { ascending: true })
          .limit(1000),
        configurationIds.length > 0
          ? supabaseAdmin
              .from('research_model_stage_configuration_versions')
              .select('*')
              .in('id', configurationIds)
          : Promise.resolve({ data: [], error: null }),
        configurationIds.length > 0
          ? supabaseAdmin
              .from('research_model_stage_routes')
              .select('*')
              .in('stage_configuration_version_id', configurationIds)
              .order('route_key')
          : Promise.resolve({ data: [], error: null }),
        budgetPolicyIds.length > 0
          ? supabaseAdmin
              .from('research_budget_policy_versions')
              .select('*')
              .in('id', budgetPolicyIds)
          : Promise.resolve({ data: [], error: null }),
        budgetPolicyIds.length > 0
          ? supabaseAdmin
              .from('research_budget_stage_cap_versions')
              .select('*')
              .in('budget_policy_version_id', budgetPolicyIds)
              .order('stage_key')
          : Promise.resolve({ data: [], error: null }),
      ]);
    const failed = [callResult, configurationResult, routeResult, policyResult, capResult]
      .find((result) => result.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }
    providerCalls = (callResult.data ?? []) as Row[];
    modelConfigurations = (configurationResult.data ?? []) as Row[];
    modelRoutes = (routeResult.data ?? []) as Row[];
    budgetPolicies = (policyResult.data ?? []) as Row[];
    stageCaps = (capResult.data ?? []) as Row[];

    const estimateRateIds = stringIds(providerCalls, 'estimate_rate_version_id');
    if (estimateRateIds.length > 0) {
      const rateResult = await supabaseAdmin
        .from('research_usage_estimate_rate_versions')
        .select('*')
        .in('id', estimateRateIds);
      if (rateResult.error) {
        return NextResponse.json({ error: rateResult.error.message }, { status: 500 });
      }
      estimateRates = (rateResult.data ?? []) as Row[];
    }
  }

  const lastSequence = eventRows.reduce(
    (latest, event) => Math.max(latest, Number(event.sequence_number) || 0),
    afterSequence ?? 0
  );

  return NextResponse.json(
    {
      missions: assembleResearchMissionReadModels(
        missionRows,
        stageRows,
        eventRows,
        {
          providerCalls,
          modelConfigurations,
          modelRoutes,
          budgetPolicies,
          stageCaps,
          estimateRates,
        }
      ),
      detail_complete: Boolean(requestedMissionId),
      polling: requestedMissionId
        ? {
            mission_id: requestedMissionId,
            requested_after_sequence: afterSequence,
            last_sequence: lastSequence,
            has_more: hasMore,
          }
        : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
