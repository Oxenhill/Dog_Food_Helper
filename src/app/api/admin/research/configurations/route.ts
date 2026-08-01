import { NextRequest, NextResponse } from 'next/server';
import { assembleResearchConfigurationReadModel } from '@/lib/researchConfigurationReadModel';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const results = await Promise.all([
    supabaseAdmin
      .from('research_model_configuration_sets')
      .select('*')
      .order('configuration_key')
      .order('version', { ascending: false }),
    supabaseAdmin
      .from('research_model_stage_configuration_versions')
      .select('*')
      .order('stage_key')
      .order('version', { ascending: false }),
    supabaseAdmin.from('research_model_stage_routes').select('*').order('route_key'),
    supabaseAdmin
      .from('research_discovery_question_policy_versions')
      .select('*')
      .order('policy_key')
      .order('version', { ascending: false }),
    supabaseAdmin
      .from('research_evidence_admissibility_policy_versions')
      .select('*')
      .order('policy_key')
      .order('version', { ascending: false }),
    supabaseAdmin
      .from('research_literature_registry_versions')
      .select('*')
      .order('registry_key')
      .order('version', { ascending: false }),
    supabaseAdmin.from('research_literature_sources').select('*').order('source_key'),
    supabaseAdmin
      .from('research_literature_source_versions')
      .select('*')
      .order('version', { ascending: false }),
    supabaseAdmin
      .from('research_literature_source_policy_versions')
      .select('*')
      .order('version', { ascending: false }),
    supabaseAdmin
      .from('research_literature_source_routes')
      .select('*')
      .order('operation_key')
      .order('route_priority'),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json(
    assembleResearchConfigurationReadModel({
      modelSets: results[0].data ?? [],
      stageConfigurations: results[1].data ?? [],
      modelRoutes: results[2].data ?? [],
      discoveryQuestionPolicies: results[3].data ?? [],
      evidenceAdmissibilityPolicies: results[4].data ?? [],
      registries: results[5].data ?? [],
      sources: results[6].data ?? [],
      sourceVersions: results[7].data ?? [],
      sourcePolicies: results[8].data ?? [],
      sourceRoutes: results[9].data ?? [],
    }),
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
