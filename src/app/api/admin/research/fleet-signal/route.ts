import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import {
  computeFleetSignalReport,
  FLEET_CONFIDENCE_THRESHOLDS,
} from '@/lib/fleetIngredientSignal';

/**
 * Admin-only. Fleet-wide ingredient signal vs. literature comparison — the
 * "probe". Surface-only: reads real data, writes nothing, never touches
 * researchScoringPolicy.ts's constants or any claim.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const rows = await computeFleetSignalReport();
    return NextResponse.json(
      {
        rows,
        fleet_confidence_thresholds: FLEET_CONFIDENCE_THRESHOLDS,
        generated_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not compute the fleet signal report' },
      { status: 500 }
    );
  }
}
