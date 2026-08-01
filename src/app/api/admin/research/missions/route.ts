import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assembleResearchMissionReadModels } from '@/lib/researchMissionReadModel';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MissionIdSchema = z.string().uuid();

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
    afterSequence !== null &&
    (!requestedMissionId || !Number.isSafeInteger(afterSequence) || afterSequence < 0)
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
  const missionRows = (missions ?? []) as Array<Record<string, unknown>>;
  const missionIds = missionRows
    .map((mission) => mission.id)
    .filter((id): id is string => typeof id === 'string');

  if (missionIds.length === 0) {
    return NextResponse.json(
      { missions: [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  let eventQuery = supabaseAdmin
    .from('research_mission_events')
    .select('*')
    .in('mission_id', missionIds)
    .order('sequence_number', { ascending: true })
    .limit(requestedMissionId ? 500 : 1000);
  if (afterSequence !== null) {
    eventQuery = eventQuery.gt('sequence_number', afterSequence);
  }

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

  return NextResponse.json(
    {
      missions: assembleResearchMissionReadModels(
        missionRows,
        (stageResult.data ?? []) as Array<Record<string, unknown>>,
        (eventResult.data ?? []) as Array<Record<string, unknown>>
      ),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
