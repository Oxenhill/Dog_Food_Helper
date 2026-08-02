type Row = Record<string, unknown>;

function rowsBy<T extends Row>(rows: T[], key: string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== 'string') continue;
    const group = grouped.get(value) ?? [];
    group.push(row);
    grouped.set(value, group);
  }
  return grouped;
}

export function assembleResearchConfigurationReadModel(input: {
  modelSets: Row[];
  stageConfigurations: Row[];
  modelRoutes: Row[];
  discoveryQuestionPolicies: Row[];
  evidenceAdmissibilityPolicies: Row[];
  registries: Row[];
  sources: Row[];
  sourceVersions: Row[];
  sourcePolicies: Row[];
  sourceRoutes: Row[];
  budgetPolicies?: Row[];
  stageCaps?: Row[];
  estimateRates?: Row[];
}) {
  const routesByStage = rowsBy(input.modelRoutes, 'stage_configuration_version_id');
  const stagesBySet = rowsBy(input.stageConfigurations, 'configuration_set_id');
  const sourceById = new Map(
    input.sources
      .filter((source) => typeof source.id === 'string')
      .map((source) => [source.id as string, source])
  );
  const policiesBySourceVersion = rowsBy(input.sourcePolicies, 'source_version_id');
  const sourceVersionsByRegistry = rowsBy(input.sourceVersions, 'registry_version_id');
  const sourceRoutesByRegistry = rowsBy(input.sourceRoutes, 'registry_version_id');
  const stageCapsByPolicy = rowsBy(input.stageCaps ?? [], 'budget_policy_version_id');

  return {
    model_configuration_sets: input.modelSets.map((modelSet) => ({
      ...modelSet,
      stages: (stagesBySet.get(String(modelSet.id)) ?? []).map((stage) => ({
        ...stage,
        routes: routesByStage.get(String(stage.id)) ?? [],
      })),
    })),
    discovery_question_policy_versions: input.discoveryQuestionPolicies,
    evidence_admissibility_policy_versions: input.evidenceAdmissibilityPolicies,
    budget_policy_versions: (input.budgetPolicies ?? []).map((policy) => ({
      ...policy,
      stage_caps: stageCapsByPolicy.get(String(policy.id)) ?? [],
    })),
    usage_estimate_rate_versions: input.estimateRates ?? [],
    literature_registry_versions: input.registries.map((registry) => ({
      ...registry,
      sources: (sourceVersionsByRegistry.get(String(registry.id)) ?? []).map(
        (sourceVersion) => ({
          source_identity: sourceById.get(String(sourceVersion.source_id)) ?? null,
          version_snapshot: sourceVersion,
          policy_versions: policiesBySourceVersion.get(String(sourceVersion.id)) ?? [],
        })
      ),
      routes: sourceRoutesByRegistry.get(String(registry.id)) ?? [],
    })),
  };
}
