import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveDietPeriod,
  listDietPeriods,
  loadDietExposureAudit,
  replaceDogDiet,
  sameDietComponents,
  validateDietComponents,
} from '@/lib/dietPeriods';
import { requireUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

async function ownedDog(dogId: string, ownerId: string) {
  const { data, error } = await supabaseAdmin
    .from('dogs')
    .select('id')
    .eq('id', dogId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const dogId = request.nextUrl.searchParams.get('dog_id');
    if (!dogId) return NextResponse.json({ error: 'dog_id is required' }, { status: 400 });
    if (!(await ownedDog(dogId, user.id))) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const [periods, exposure] = await Promise.all([
      listDietPeriods(dogId),
      loadDietExposureAudit(dogId),
    ]);
    const current = periods.find((period) => period.ended_at == null) ?? null;

    return NextResponse.json({
      current_diet: current,
      diet_history: periods,
      in_transition:
        current?.in_transition_until != null &&
        new Date(current.in_transition_until).getTime() > Date.now(),
      exposure,
    });
  } catch (error) {
    console.error('List diet periods error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const dogId = typeof body.dog_id === 'string' ? body.dog_id : '';
    if (!dogId) return NextResponse.json({ error: 'dog_id is required' }, { status: 400 });
    if (!(await ownedDog(dogId, user.id))) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const components = validateDietComponents(body.components);
    const current = await getActiveDietPeriod(dogId);
    if (current && sameDietComponents(current.components, components)) {
      return NextResponse.json({
        diet_period: current,
        previous_diet_period_id: null,
        monitoring_window_id: null,
        changed: false,
      });
    }

    const result = await replaceDogDiet({
      dogId,
      components,
      startedAt: body.started_at,
      transitionDays: current ? body.transition_days : 0,
    });

    return NextResponse.json(
      {
        diet_period: result.period,
        previous_diet_period_id: result.previousPeriodId,
        monitoring_window_id: result.monitoringWindowId,
        changed: true,
      },
      { status: current ? 200 : 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record diet';
    const clientError =
      message.includes('component') ||
      message.includes('diet') ||
      message.includes('days') ||
      message.includes('food');
    console.error('Replace diet period error:', error);
    return NextResponse.json(
      { error: clientError ? message : 'Internal server error' },
      { status: clientError ? 400 : 500 }
    );
  }
}
