export type SimulationAnalyticsBatch = {
  id: string;
  mode_id: string;
  schema_version: number;
  evaluator_type: string;
  report_scope: "public" | "private" | "all";
  status: "running" | "completed" | "failed";
  report_count: number;
  field_count: number;
  profile_count: number;
  total_evaluations: number;
  created_at: string;
  completed_at: string | null;
};

export type SimulationAnalyticsRun = {
  id: string;
  simulation_batch_id: string;
  profile_id: string;
  profile_version: number;
  profile_label: string;
  correct_fields: number;
  total_fields: number;
  score: number | string;
  valid_json_count: number;
  invalid_json_count: number;
  missing_field_count: number;
  invalid_value_count: number;
  completed_report_count: number;
  created_at: string;
};

const weakProfileIds = new Set(["blank", "nonsense", "vague"]);
const strongProfileIds = new Set(["basic_all_fields", "strong_all_fields"]);

export function buildSimulationAnalytics(
  batches: readonly SimulationAnalyticsBatch[],
  runs: readonly SimulationAnalyticsRun[],
) {
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const completedBatches = batches.filter((batch) => batch.status === "completed");
  const completedBatchIds = new Set(completedBatches.map((batch) => batch.id));
  const safeRuns = runs.filter((run) =>
    completedBatchIds.has(run.simulation_batch_id),
  );
  const validJsonCount = sum(safeRuns, (run) => run.valid_json_count);
  const invalidJsonCount = sum(safeRuns, (run) => run.invalid_json_count);
  const weakScores = safeRuns
    .filter((run) => weakProfileIds.has(run.profile_id))
    .map(scoreOf);
  const strongScores = safeRuns
    .filter((run) => strongProfileIds.has(run.profile_id))
    .map(scoreOf);
  const weakAverageScore = average(weakScores);
  const strongAverageScore = average(strongScores);

  return {
    ok: true as const,
    deterministic: true as const,
    simulationOnly: true as const,
    summary: {
      batchCount: batches.length,
      completedBatchCount: completedBatches.length,
      profileRunCount: safeRuns.length,
      averageScore: average(safeRuns.map(scoreOf)),
      jsonValidityRate: percentage(validJsonCount, validJsonCount + invalidJsonCount),
      missingFieldCount: sum(safeRuns, (run) => run.missing_field_count),
      invalidValueCount: sum(safeRuns, (run) => run.invalid_value_count),
      weakAverageScore,
      strongAverageScore,
      weakStrongSeparation:
        weakAverageScore === null || strongAverageScore === null
          ? null
          : round(strongAverageScore - weakAverageScore),
    },
    strategyGroups: {
      weakProfileIds: [...weakProfileIds],
      strongProfileIds: [...strongProfileIds],
      excludedProfileIds: ["partial_first_field"],
    },
    averagesByProfile: groupRuns(
      safeRuns,
      (run) => `${run.profile_id}:${run.profile_version}`,
      (run) => ({
        profileId: run.profile_id,
        profileVersion: run.profile_version,
        profileLabel: run.profile_label,
      }),
    ).sort((left, right) => right.averageScore - left.averageScore),
    averagesByMode: groupRuns(
      safeRuns,
      (run) => {
        const batch = batchById.get(run.simulation_batch_id)!;
        return `${batch.mode_id}:${batch.schema_version}`;
      },
      (run) => {
        const batch = batchById.get(run.simulation_batch_id)!;
        return { modeId: batch.mode_id, schemaVersion: batch.schema_version };
      },
    ).sort((left, right) => right.averageScore - left.averageScore),
    averagesByReportScope: groupRuns(
      safeRuns,
      (run) => batchById.get(run.simulation_batch_id)!.report_scope,
      (run) => ({
        reportScope: batchById.get(run.simulation_batch_id)!.report_scope,
      }),
    ).sort((left, right) => right.averageScore - left.averageScore),
    batchesOverTime: [...batches]
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .map((batch) => {
        const batchRuns = safeRuns.filter(
          (run) => run.simulation_batch_id === batch.id,
        );
        return {
          batchId: batch.id,
          modeId: batch.mode_id,
          schemaVersion: batch.schema_version,
          reportScope: batch.report_scope,
          status: batch.status,
          createdAt: batch.created_at,
          completedAt: batch.completed_at,
          totalEvaluations: batch.total_evaluations,
          averageScore: average(batchRuns.map(scoreOf)),
        };
      }),
    batchRankings: [...batches]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((batch) => ({
        batchId: batch.id,
        createdAt: batch.created_at,
        modeId: batch.mode_id,
        schemaVersion: batch.schema_version,
        reportScope: batch.report_scope,
        rankings: rankRuns(
          safeRuns.filter((run) => run.simulation_batch_id === batch.id),
        ),
      })),
  };
}

export function buildSimulationBatchComparison(
  leftBatch: SimulationAnalyticsBatch,
  leftRuns: readonly SimulationAnalyticsRun[],
  rightBatch: SimulationAnalyticsBatch,
  rightRuns: readonly SimulationAnalyticsRun[],
) {
  const left = summarizeBatch(leftBatch, leftRuns);
  const right = summarizeBatch(rightBatch, rightRuns);
  const leftByProfile = new Map(
    leftRuns.map((run) => [profileKey(run), run]),
  );
  const rightByProfile = new Map(
    rightRuns.map((run) => [profileKey(run), run]),
  );
  const profileKeys = [...new Set([...leftByProfile.keys(), ...rightByProfile.keys()])];

  return {
    ok: true as const,
    deterministic: true as const,
    simulationOnly: true as const,
    left,
    right,
    deltas: {
      averageScore: nullableDelta(right.averageScore, left.averageScore),
      totalEvaluations: right.totalEvaluations - left.totalEvaluations,
      missingFieldCount: right.missingFieldCount - left.missingFieldCount,
      invalidValueCount: right.invalidValueCount - left.invalidValueCount,
      jsonValidityRate: nullableDelta(right.jsonValidityRate, left.jsonValidityRate),
    },
    profiles: profileKeys
      .map((key) => {
        const leftRun = leftByProfile.get(key);
        const rightRun = rightByProfile.get(key);
        const leftScore = leftRun ? scoreOf(leftRun) : null;
        const rightScore = rightRun ? scoreOf(rightRun) : null;
        return {
          profileId: leftRun?.profile_id ?? rightRun!.profile_id,
          profileVersion: leftRun?.profile_version ?? rightRun!.profile_version,
          profileLabel: leftRun?.profile_label ?? rightRun!.profile_label,
          leftScore,
          rightScore,
          scoreDelta: nullableDelta(rightScore, leftScore),
          leftMissingFieldCount: leftRun?.missing_field_count ?? null,
          rightMissingFieldCount: rightRun?.missing_field_count ?? null,
          leftInvalidValueCount: leftRun?.invalid_value_count ?? null,
          rightInvalidValueCount: rightRun?.invalid_value_count ?? null,
        };
      })
      .sort((leftProfile, rightProfile) =>
        leftProfile.profileLabel.localeCompare(rightProfile.profileLabel),
      ),
  };
}

function summarizeBatch(
  batch: SimulationAnalyticsBatch,
  runs: readonly SimulationAnalyticsRun[],
) {
  const validJsonCount = sum(runs, (run) => run.valid_json_count);
  const invalidJsonCount = sum(runs, (run) => run.invalid_json_count);
  return {
    batchId: batch.id,
    modeId: batch.mode_id,
    schemaVersion: batch.schema_version,
    reportScope: batch.report_scope,
    createdAt: batch.created_at,
    completedAt: batch.completed_at,
    status: batch.status,
    reportCount: batch.report_count,
    fieldCount: batch.field_count,
    profileCount: batch.profile_count,
    totalEvaluations: batch.total_evaluations,
    averageScore: average(runs.map(scoreOf)),
    jsonValidityRate: percentage(validJsonCount, validJsonCount + invalidJsonCount),
    missingFieldCount: sum(runs, (run) => run.missing_field_count),
    invalidValueCount: sum(runs, (run) => run.invalid_value_count),
  };
}

function rankRuns(runs: readonly SimulationAnalyticsRun[]) {
  return [...runs]
    .sort(
      (left, right) =>
        scoreOf(right) - scoreOf(left) ||
        left.missing_field_count - right.missing_field_count ||
        left.invalid_value_count - right.invalid_value_count ||
        left.profile_label.localeCompare(right.profile_label),
    )
    .map((run, index) => ({
      rank: index + 1,
      profileId: run.profile_id,
      profileVersion: run.profile_version,
      profileLabel: run.profile_label,
      score: scoreOf(run),
      correctFields: run.correct_fields,
      totalFields: run.total_fields,
      missingFieldCount: run.missing_field_count,
      invalidValueCount: run.invalid_value_count,
    }));
}

function groupRuns<T extends Record<string, unknown>>(
  runs: readonly SimulationAnalyticsRun[],
  getKey: (run: SimulationAnalyticsRun) => string,
  getIdentity: (run: SimulationAnalyticsRun) => T,
) {
  const groups = new Map<
    string,
    { identity: T; scores: number[]; batchIds: Set<string> }
  >();

  for (const run of runs) {
    const key = getKey(run);
    const group = groups.get(key) ?? {
      identity: getIdentity(run),
      scores: [],
      batchIds: new Set<string>(),
    };
    group.scores.push(scoreOf(run));
    group.batchIds.add(run.simulation_batch_id);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group.identity,
    batchCount: group.batchIds.size,
    profileRunCount: group.scores.length,
    averageScore: average(group.scores) ?? 0,
  }));
}

function profileKey(run: SimulationAnalyticsRun) {
  return `${run.profile_id}:${run.profile_version}`;
}

function scoreOf(run: SimulationAnalyticsRun) {
  const score = Number(run.score);
  return Number.isFinite(score) ? score : 0;
}

function sum<T>(values: readonly T[], getValue: (value: T) => number) {
  return values.reduce((total, value) => total + getValue(value), 0);
}

function average(values: readonly number[]) {
  return values.length === 0
    ? null
    : round(values.reduce((total, value) => total + value, 0) / values.length);
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? null : round((numerator / denominator) * 100);
}

function nullableDelta(right: number | null, left: number | null) {
  return right === null || left === null ? null : round(right - left);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
