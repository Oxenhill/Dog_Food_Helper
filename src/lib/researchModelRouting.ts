import { supabaseAdmin } from './supabase';

export type ResearchModelExecutionKind =
  | 'deterministic'
  | 'embedding_model'
  | 'language_model'
  | 'human_review';

export interface ResearchModelRoute {
  id: string;
  route_key: string;
  execution_kind: ResearchModelExecutionKind;
  provider: string;
  model_identifier: string;
  parameters: Record<string, unknown>;
}

export interface ResearchStageControlPlaneSnapshot {
  stage_id: string;
  stage_key: string;
  model_stage_configuration_version_id: string;
  discovery_question_policy_version_id: string;
  literature_registry_version_id: string;
  evidence_admissibility_policy_version_id: string;
  model_configuration: {
    id: string;
    configuration_set_id: string;
    version: number;
    prompt_template_sha256: string | null;
    structured_output_schema_version: string | null;
    parameters: Record<string, unknown>;
    fallback_policy: 'fail_closed' | 'no_fallback';
  };
  model_routes: ResearchModelRoute[];
}

function requireObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Resolve only from the immutable version IDs already pinned to the attempt.
 * No environment variable or "latest" lookup can change a running or retried
 * stage's historical routing meaning.
 */
export async function loadResearchStageControlPlane(
  stageId: string
): Promise<ResearchStageControlPlaneSnapshot> {
  const { data: stage, error: stageError } = await supabaseAdmin
    .from('research_mission_stages')
    .select(
      'id, stage_key, model_stage_configuration_version_id, discovery_question_policy_version_id, literature_registry_version_id, evidence_admissibility_policy_version_id'
    )
    .eq('id', stageId)
    .maybeSingle();
  if (stageError || !stage) {
    throw stageError ?? new Error('Research mission stage configuration was not found');
  }

  const [configurationResult, routesResult] = await Promise.all([
    supabaseAdmin
      .from('research_model_stage_configuration_versions')
      .select('*')
      .eq('id', stage.model_stage_configuration_version_id)
      .maybeSingle(),
    supabaseAdmin
      .from('research_model_stage_routes')
      .select('*')
      .eq('stage_configuration_version_id', stage.model_stage_configuration_version_id)
      .order('route_key', { ascending: true }),
  ]);
  if (configurationResult.error || !configurationResult.data) {
    throw configurationResult.error ?? new Error('Pinned model configuration was not found');
  }
  if (routesResult.error) throw routesResult.error;

  const configuration = configurationResult.data;
  return {
    stage_id: stage.id,
    stage_key: stage.stage_key,
    model_stage_configuration_version_id: stage.model_stage_configuration_version_id,
    discovery_question_policy_version_id: stage.discovery_question_policy_version_id,
    literature_registry_version_id: stage.literature_registry_version_id,
    evidence_admissibility_policy_version_id:
      stage.evidence_admissibility_policy_version_id,
    model_configuration: {
      id: configuration.id,
      configuration_set_id: configuration.configuration_set_id,
      version: configuration.version,
      prompt_template_sha256: configuration.prompt_template_sha256,
      structured_output_schema_version:
        configuration.structured_output_schema_version,
      parameters: requireObject(configuration.parameters),
      fallback_policy: configuration.fallback_policy,
    },
    model_routes: (routesResult.data ?? []).map((route) => ({
      id: route.id,
      route_key: route.route_key,
      execution_kind: route.execution_kind as ResearchModelExecutionKind,
      provider: route.provider,
      model_identifier: route.model_identifier,
      parameters: requireObject(route.parameters),
    })),
  };
}

export function requireResearchModelRoute(
  snapshot: ResearchStageControlPlaneSnapshot,
  routeKey: string,
  executionKind: ResearchModelExecutionKind
): ResearchModelRoute {
  const route = snapshot.model_routes.find((candidate) => candidate.route_key === routeKey);
  if (!route || route.execution_kind !== executionKind) {
    throw new Error(
      `Pinned research stage configuration has no ${executionKind} route named ${routeKey}`
    );
  }
  return route;
}
