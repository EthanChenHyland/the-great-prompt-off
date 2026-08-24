import { describe, expect, it } from "vitest";

import type {
  SimulationAnalyticsBatch,
  SimulationAnalyticsRun,
} from "./simulation-analytics";
import { buildSimulationRegression } from "./simulation-regression";

describe("deterministic simulation regression checks", () => {
  it("calculates profile deltas and warns on threshold regressions", () => {
    const result = buildSimulationRegression(
      makeBatch("reference", "public"),
      [makeRun("reference", "basic", 80, 5, 0, 1, 0)],
      makeBatch("candidate", "public"),
      [makeRun("candidate", "basic", 70, 4, 1, 3, 2)],
    );

    expect(result.configurationMatches).toBe(true);
    expect(result.deltas).toMatchObject({
      averageScore: -10,
      jsonValidityRate: -20,
      missingFieldCount: 2,
      invalidValueCount: 2,
    });
    expect(result.profiles[0]).toMatchObject({
      profileId: "basic",
      referenceScore: 80,
      candidateScore: 70,
      scoreDelta: -10,
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "average_score_change",
        "json_validity_decreased",
        "missing_fields_increased",
        "invalid_values_increased",
        "profile_score_change",
      ]),
    );
  });

  it("does not warn when a score changes by exactly five points", () => {
    const result = buildSimulationRegression(
      makeBatch("reference", "public"),
      [makeRun("reference", "basic", 80, 5, 0, 0, 0)],
      makeBatch("candidate", "public"),
      [makeRun("candidate", "basic", 75, 5, 0, 0, 0)],
    );

    expect(result.warnings).toEqual([]);
  });

  it("warns when the candidate configuration is not comparable", () => {
    const result = buildSimulationRegression(
      makeBatch("reference", "public"),
      [makeRun("reference", "basic", 80, 5, 0, 0, 0)],
      makeBatch("candidate", "private"),
      [makeRun("candidate", "basic", 80, 5, 0, 0, 0)],
    );

    expect(result.configurationMatches).toBe(false);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "configuration_mismatch" }),
    ]);
  });

  it("returns aggregate-only output without source or private result fields", () => {
    const serialized = JSON.stringify(
      buildSimulationRegression(
        makeBatch("reference", "public"),
        [makeRun("reference", "basic", 80, 5, 0, 0, 0)],
        makeBatch("candidate", "public"),
        [makeRun("candidate", "basic", 85, 5, 0, 0, 0)],
      ),
    );

    expect(serialized).not.toContain("answer_values");
    expect(serialized).not.toContain("report_text");
    expect(serialized).not.toContain("strategy_snapshot");
    expect(serialized).not.toContain("raw_model_output");
  });
});

function makeBatch(
  id: string,
  reportScope: "public" | "private" | "all",
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
    profile_count: 1,
    total_evaluations: 5,
    created_at: "2026-01-01T10:00:00.000Z",
    completed_at: "2026-01-01T10:01:00.000Z",
  };
}

function makeRun(
  batchId: string,
  profileId: string,
  score: number,
  validJsonCount: number,
  invalidJsonCount: number,
  missingFieldCount: number,
  invalidValueCount: number,
): SimulationAnalyticsRun {
  return {
    id: `${batchId}-${profileId}`,
    simulation_batch_id: batchId,
    profile_id: profileId,
    profile_version: 1,
    profile_label: "Basic all-fields strategy",
    correct_fields: score,
    total_fields: 100,
    score,
    valid_json_count: validJsonCount,
    invalid_json_count: invalidJsonCount,
    missing_field_count: missingFieldCount,
    invalid_value_count: invalidValueCount,
    completed_report_count: validJsonCount + invalidJsonCount,
    created_at: "2026-01-01T10:01:00.000Z",
  };
}
