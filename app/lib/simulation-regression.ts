import {
  buildSimulationBatchComparison,
  type SimulationAnalyticsBatch,
  type SimulationAnalyticsRun,
} from "./simulation-analytics";

export const simulationRegressionThresholds = {
  scoreChangePoints: 5,
  warnOnJsonValidityDecrease: true,
  warnOnMissingFieldIncrease: true,
  warnOnInvalidValueIncrease: true,
} as const;

export function buildSimulationRegression(
  referenceBatch: SimulationAnalyticsBatch,
  referenceRuns: readonly SimulationAnalyticsRun[],
  candidateBatch: SimulationAnalyticsBatch,
  candidateRuns: readonly SimulationAnalyticsRun[],
) {
  const comparison = buildSimulationBatchComparison(
    referenceBatch,
    referenceRuns,
    candidateBatch,
    candidateRuns,
  );
  const configurationMatches =
    referenceBatch.mode_id === candidateBatch.mode_id &&
    referenceBatch.schema_version === candidateBatch.schema_version &&
    referenceBatch.report_scope === candidateBatch.report_scope &&
    profileSet(referenceRuns) === profileSet(candidateRuns);
  const warnings: Array<{
    code: string;
    message: string;
    profileId?: string;
  }> = [];

  if (!configurationMatches) {
    warnings.push({
      code: "configuration_mismatch",
      message:
        "This batch does not use the same mode, schema, report scope, and profile set as the reference.",
    });
  }
  if (
    comparison.deltas.averageScore !== null &&
    Math.abs(comparison.deltas.averageScore) >
      simulationRegressionThresholds.scoreChangePoints
  ) {
    warnings.push({
      code: "average_score_change",
      message: `Average score changed by ${formatPoints(comparison.deltas.averageScore)} from the reference.`,
    });
  }
  if (
    comparison.deltas.jsonValidityRate !== null &&
    comparison.deltas.jsonValidityRate < 0
  ) {
    warnings.push({
      code: "json_validity_decreased",
      message: `JSON validity decreased by ${formatPoints(Math.abs(comparison.deltas.jsonValidityRate))}.`,
    });
  }
  if (comparison.deltas.missingFieldCount > 0) {
    warnings.push({
      code: "missing_fields_increased",
      message: `Missing fields increased by ${comparison.deltas.missingFieldCount}.`,
    });
  }
  if (comparison.deltas.invalidValueCount > 0) {
    warnings.push({
      code: "invalid_values_increased",
      message: `Invalid values increased by ${comparison.deltas.invalidValueCount}.`,
    });
  }

  for (const profile of comparison.profiles) {
    if (
      profile.scoreDelta !== null &&
      Math.abs(profile.scoreDelta) >
        simulationRegressionThresholds.scoreChangePoints
    ) {
      warnings.push({
        code: "profile_score_change",
        profileId: profile.profileId,
        message: `${profile.profileLabel} score changed by ${formatPoints(profile.scoreDelta)}.`,
      });
    }
  }

  return {
    candidate: comparison.right,
    configurationMatches,
    deltas: comparison.deltas,
    profiles: comparison.profiles.map((profile) => ({
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      profileLabel: profile.profileLabel,
      referenceScore: profile.leftScore,
      candidateScore: profile.rightScore,
      scoreDelta: profile.scoreDelta,
      referenceMissingFieldCount: profile.leftMissingFieldCount,
      candidateMissingFieldCount: profile.rightMissingFieldCount,
      referenceInvalidValueCount: profile.leftInvalidValueCount,
      candidateInvalidValueCount: profile.rightInvalidValueCount,
    })),
    warnings,
  };
}

function profileSet(runs: readonly SimulationAnalyticsRun[]) {
  return runs
    .map((run) => `${run.profile_id}:${run.profile_version}`)
    .sort()
    .join("|");
}

function formatPoints(value: number) {
  return `${Math.round(value * 100) / 100} percentage points`;
}
