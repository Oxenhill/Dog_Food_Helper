export interface ResearchMissionReadModel {
  mission: Record<string, unknown>;
  stages: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

function stringValue(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function numberValue(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  return typeof value === 'number' ? value : Number(value) || 0;
}

export function assembleResearchMissionReadModels(
  missions: Array<Record<string, unknown>>,
  stages: Array<Record<string, unknown>>,
  events: Array<Record<string, unknown>>
): ResearchMissionReadModel[] {
  const stagesByMission = new Map<string, Array<Record<string, unknown>>>();
  const eventsByMission = new Map<string, Array<Record<string, unknown>>>();

  for (const stage of stages) {
    const missionId = stringValue(stage, 'mission_id');
    if (!missionId) continue;
    const rows = stagesByMission.get(missionId) ?? [];
    rows.push(stage);
    stagesByMission.set(missionId, rows);
  }
  for (const event of events) {
    const missionId = stringValue(event, 'mission_id');
    if (!missionId) continue;
    const rows = eventsByMission.get(missionId) ?? [];
    rows.push(event);
    eventsByMission.set(missionId, rows);
  }

  return missions.map((mission) => {
    const missionId = stringValue(mission, 'id');
    return {
      mission,
      stages: (stagesByMission.get(missionId) ?? []).sort(
        (left, right) =>
          numberValue(left, 'attempt_number') - numberValue(right, 'attempt_number') ||
          stringValue(left, 'created_at').localeCompare(stringValue(right, 'created_at'))
      ),
      events: (eventsByMission.get(missionId) ?? []).sort(
        (left, right) =>
          numberValue(left, 'sequence_number') - numberValue(right, 'sequence_number')
      ),
    };
  });
}
