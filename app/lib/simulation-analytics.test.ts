import { describe, expect, it } from "vitest";

import {
  buildSimulationAnalytics,
  buildSimulationBatchComparison,
  type SimulationAnalyticsBatch,
  type SimulationAnalyticsRun,
} from "./simulation-analytics";

const batches: SimulationAnalyticsBatch[] = [
  makeBatch("batch-left", "public", "2026-01-01T10:00:00.000Z", 10),
  makeBatch("batch-right", "private", "2026-01-02T10:00:00.000Z", 12),
];

const runs: SimulationAnalyticsRun[] = [
  makeRun("left-vague", "batch-left", "vague", "Vague", 20, 4, 0),
  makeRun("left-strong", "batch-left", "strong_all_fields", "Strong", 80, 1, 1),
  makeRun("right-vague", "batch-right", "vague", "Vague", 40, 2, 0),
  makeRun("right-strong", "batch-right", "strong_all_fields", "Strong", 100, 0, 0),
];

describe("simulation-only analytics", () => {
  it("calculates profile, mode, scope, diagnostics, and separation aggregates", () => {
    const analytics = buildSimulationAnalytics(batches, runs);

    expect(analytics.summary).toMatchObject({
      batchCount: 2,
      completedBatchCount: 2,
      profileRunCount: 4,
      averageScore: 60,
      jsonValidityRate: 90,
      missingFieldCount: 7,
      invalidValueCount: 1,
      weakAverageScore: 30,
      strongAverageScore: 90,
      weakStrongSeparation: 60,
    });
    expect(analytics.averagesByProfile).toEqual([
      expect.objectContaining({ profileId: "strong_all_fields", averageScore: 90 }),
      expect.objectContaining({ profileId: "vague", averageScore: 30 }),
    ]);
    expect(analytics.averagesByMode).toEqual([
      expect.objectContaining({ modeId: "knee_mri_6_basic", averageScore: 60 }),
    ]);
    expect(analytics.averagesByReportScope).toEqual([
      expect.objectContaining({ reportScope: "private", averageScore: 70 }),
      expect.objectContaining({ reportScope: "public", averageScore: 50 }),
    ]);
    expect(analytics.batchRankings[0].rankings[0]).toMatchObject({
      profileId: "strong_all_fields",
      rank: 1,
      score: 100,
    });
  });

  it("compares two batches and calculates right-minus-left deltas", () => {
    const comparison = buildSimulationBatchComparison(
      batches[0],
      runs.filter((run) => run.simulation_batch_id === "batch-left"),
      batches[1],
      runs.filter((run) => run.simulation_batch_id === "batch-right"),
    );

    expect(comparison.left.averageScore).toBe(50);
    expect(comparison.right.averageScore).toBe(70);
    expect(comparison.deltas).toMatchObject({
      averageScore: 20,
      totalEvaluations: 2,
      missingFieldCount: -3,
      invalidValueCount: -1,
      jsonValidityRate: 20,
    });
    expect(comparison.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileId: "vague",
          leftScore: 20,
          rightScore: 40,
          scoreDelta: 20,
        }),
        expect.objectContaining({
          profileId: "strong_all_fields",
          leftScore: 80,
          rightScore: 100,
          scoreDelta: 20,
        }),
      ]),
    );
  });

  it("returns safe aggregate shapes without source content", () => {
    const serialized = JSON.stringify(buildSimulationAnalytics(batches, runs));

    expect(serialized).not.toContain("answer_values");
    expect(serialized).not.toContain("report_text");
    expect(serialized).not.toContain("strategy_snapshot");
    expect(serialized).not.toContain("raw_model_output");
  });
});

function makeBatch(
  id: string,
  reportScope: "public" | "private" | "all",
  createdAt: string,
  totalEvaluations: number,
): SimulationAnalyticsBatch {
  return {
    id,
    mode_id: "knee_mri_6_basic",
    schema_version: 1,
    evaluator_type: "deterministic_mock",
    report_scope: reportScope,
    status: "completed",
    report_count: 5,
    field_count: 6,
    profile_count: 2,
    total_evaluations: totalEvaluations,
    created_at: createdAt,
    completed_at: createdAt,
  };
}

function makeRun(
  id: string,
  batchId: string,
  profileId: string,
  profileLabel: string,
  score: number,
  missingFieldCount: number,
  invalidValueCount: number,
): SimulationAnalyticsRun {
  return {
    id,
    simulation_batch_id: batchId,
    profile_id: profileId,
    profile_version: 1,
    profile_label: profileLabel,
    correct_fields: score,
    total_fields: 100,
    score,
    valid_json_count: score === 20 || score === 80 ? 4 : 5,
    invalid_json_count: score === 20 || score === 80 ? 1 : 0,
    missing_field_count: missingFieldCount,
    invalid_value_count: invalidValueCount,
    completed_report_count: 5,
    created_at: "2026-01-01T10:00:00.000Z",
  };
}
