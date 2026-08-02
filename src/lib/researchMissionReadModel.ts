type Row = Record<string, unknown>;

export interface ResearchUsageAggregate {
  calls: {
    total: number;
    started: number;
    succeeded: number;
    failed: number;
  };
  actual_provider_reported: {
    calls_with_usage: number;
    completed_calls_without_usage: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    reasoning_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_usd: number;
    calls_with_cost: number;
  };
  estimates_not_actual: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
  };
  measured_timing: {
    calls_with_client_duration: number;
    client_duration_ms: number;
    calls_with_provider_duration: number;
    provider_duration_ms: number;
  };
}

export interface ResearchMissionReadModel {
  mission: Row;
  budget_policy: Row | null;
  usage: ResearchUsageAggregate;
  stages: Array<{
    stage: Row;
    model_configuration: Row | null;
    model_routes: Row[];
    budget_cap: Row | null;
    provider_calls: Row[];
    usage: ResearchUsageAggregate;
  }>;
  events: Row[];
}

export interface ResearchMissionReadModelDetails {
  providerCalls?: Row[];
  modelConfigurations?: Row[];
  modelRoutes?: Row[];
  budgetPolicies?: Row[];
  stageCaps?: Row[];
  estimateRates?: Row[];
}

function stringValue(row: Row, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function numberValue(row: Row, key: string): number {
  const value = row[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowsBy(rows: Row[], key: string): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const value = stringValue(row, key);
    if (!value) continue;
    const group = grouped.get(value) ?? [];
    group.push(row);
    grouped.set(value, group);
  }
  return grouped;
}

function rowMap(rows: Row[]): Map<string, Row> {
  return new Map(
    rows
      .filter((row) => stringValue(row, 'id'))
      .map((row) => [stringValue(row, 'id'), row])
  );
}

export function aggregateResearchProviderCalls(calls: Row[]): ResearchUsageAggregate {
  const completed = calls.filter((call) => ['succeeded', 'failed'].includes(
    stringValue(call, 'status')
  ));
  const reported = completed.filter(
    (call) => stringValue(call, 'actual_usage_source') === 'provider_reported'
  );
  const callsWithCost = completed.filter(
    (call) => optionalNumber(call, 'actual_cost_usd') !== null
  );
  const clientTimed = completed.filter(
    (call) => optionalNumber(call, 'client_duration_ms') !== null
  );
  const providerTimed = completed.filter(
    (call) => optionalNumber(call, 'provider_duration_ms') !== null
  );
  const sum = (rows: Row[], key: string) => rows.reduce(
    (total, row) => total + (optionalNumber(row, key) ?? 0),
    0
  );

  return {
    calls: {
      total: calls.length,
      started: calls.filter((call) => stringValue(call, 'status') === 'started').length,
      succeeded: calls.filter((call) => stringValue(call, 'status') === 'succeeded').length,
      failed: calls.filter((call) => stringValue(call, 'status') === 'failed').length,
    },
    actual_provider_reported: {
      calls_with_usage: reported.length,
      completed_calls_without_usage: completed.length - reported.length,
      input_tokens: sum(reported, 'actual_input_tokens'),
      output_tokens: sum(reported, 'actual_output_tokens'),
      total_tokens: sum(reported, 'actual_total_tokens'),
      reasoning_tokens: sum(reported, 'actual_reasoning_tokens'),
      cache_read_tokens: sum(reported, 'actual_cache_read_tokens'),
      cache_write_tokens: sum(reported, 'actual_cache_write_tokens'),
      cost_usd: Number(sum(callsWithCost, 'actual_cost_usd').toFixed(6)),
      calls_with_cost: callsWithCost.length,
    },
    estimates_not_actual: {
      input_tokens: sum(calls, 'estimated_input_tokens'),
      output_tokens: sum(calls, 'estimated_output_tokens'),
      total_tokens: sum(calls, 'estimated_total_tokens'),
      cost_usd: Number(sum(calls, 'estimated_cost_usd').toFixed(6)),
    },
    measured_timing: {
      calls_with_client_duration: clientTimed.length,
      client_duration_ms: sum(clientTimed, 'client_duration_ms'),
      calls_with_provider_duration: providerTimed.length,
      provider_duration_ms: sum(providerTimed, 'provider_duration_ms'),
    },
  };
}

export function assembleResearchMissionReadModels(
  missions: Row[],
  stages: Row[],
  events: Row[],
  details: ResearchMissionReadModelDetails = {}
): ResearchMissionReadModel[] {
  const providerCalls = details.providerCalls ?? [];
  const modelConfigurations = details.modelConfigurations ?? [];
  const modelRoutes = details.modelRoutes ?? [];
  const budgetPolicies = details.budgetPolicies ?? [];
  const stageCaps = details.stageCaps ?? [];
  const estimateRates = details.estimateRates ?? [];

  const stagesByMission = rowsBy(stages, 'mission_id');
  const eventsByMission = rowsBy(events, 'mission_id');
  const callsByMission = rowsBy(providerCalls, 'mission_id');
  const callsByStage = rowsBy(providerCalls, 'mission_stage_id');
  const routesByConfiguration = rowsBy(modelRoutes, 'stage_configuration_version_id');
  const configurationById = rowMap(modelConfigurations);
  const routeById = rowMap(modelRoutes);
  const budgetPolicyById = rowMap(budgetPolicies);
  const estimateRateById = rowMap(estimateRates);
  const stageCapByPolicyAndStage = new Map(
    stageCaps.map((cap) => [
      `${stringValue(cap, 'budget_policy_version_id')}:${stringValue(cap, 'stage_key')}`,
      cap,
    ])
  );

  function enrichCall(call: Row): Row {
    return {
      ...call,
      model_route: routeById.get(stringValue(call, 'model_route_id')) ?? null,
      estimate_rate_version:
        estimateRateById.get(stringValue(call, 'estimate_rate_version_id')) ?? null,
    };
  }

  return missions.map((mission) => {
    const missionId = stringValue(mission, 'id');
    const missionCalls = (callsByMission.get(missionId) ?? []).sort(
      (left, right) =>
        stringValue(left, 'started_at').localeCompare(stringValue(right, 'started_at'))
        || stringValue(left, 'id').localeCompare(stringValue(right, 'id'))
    );
    const missionStages = (stagesByMission.get(missionId) ?? []).sort(
      (left, right) =>
        stringValue(left, 'stage_key').localeCompare(stringValue(right, 'stage_key'))
        || numberValue(left, 'attempt_number') - numberValue(right, 'attempt_number')
        || stringValue(left, 'created_at').localeCompare(stringValue(right, 'created_at'))
    );
    return {
      mission,
      budget_policy:
        budgetPolicyById.get(stringValue(mission, 'budget_policy_version_id')) ?? null,
      usage: aggregateResearchProviderCalls(missionCalls),
      stages: missionStages.map((stage) => {
        const configurationId = stringValue(
          stage,
          'model_stage_configuration_version_id'
        );
        const stageCalls = callsByStage.get(stringValue(stage, 'id')) ?? [];
        return {
          stage,
          model_configuration: configurationById.get(configurationId) ?? null,
          model_routes: routesByConfiguration.get(configurationId) ?? [],
          budget_cap: stageCapByPolicyAndStage.get(
            `${stringValue(stage, 'budget_policy_version_id')}:${stringValue(stage, 'stage_key')}`
          ) ?? null,
          provider_calls: stageCalls.map(enrichCall),
          usage: aggregateResearchProviderCalls(stageCalls),
        };
      }),
      events: (eventsByMission.get(missionId) ?? []).sort(
        (left, right) =>
          numberValue(left, 'sequence_number') - numberValue(right, 'sequence_number')
      ),
    };
  });
}
