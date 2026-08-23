import type { SimulationReportScope } from "./simulation-runner";

export type SimulationRunSelection = {
  modeId: string;
  schemaVersion: number;
  reportScope: SimulationReportScope;
  profileIds: string[];
};

export function buildSimulationRunPayload(selection: SimulationRunSelection) {
  return {
    modeId: selection.modeId,
    schemaVersion: selection.schemaVersion,
    reportScope: selection.reportScope,
    profileIds: [...selection.profileIds],
  };
}

export function getSimulationEvaluationEstimate(
  reportCount: number,
  profileCount: number,
) {
  return Math.max(0, reportCount) * Math.max(0, profileCount);
}

