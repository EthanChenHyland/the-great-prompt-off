import { createHash } from "node:crypto";

import { toCsv } from "./csv";
import type {
  SimulationAnalyticsBatch,
  SimulationAnalyticsRun,
} from "./simulation-analytics";

export type SimulationBatchWithSchema = SimulationAnalyticsBatch & {
  schema_snapshot: unknown;
};

export const simulationCsvHeaders = [
  "batch_id",
  "created_at",
  "completed_at",
  "mode_id",
  "schema_version",
  "evaluator_type",
  "report_scope",
  "report_count",
  "field_count",
  "profile_id",
  "profile_version",
  "profile_label",
  "score",
  "correct_fields",
  "total_fields",
  "valid_json_count",
  "valid_json_rate",
  "missing_field_count",
  "invalid_value_count",
] as const;

export function buildSimulationCsv(
  batches: readonly SimulationBatchWithSchema[],
  runs: readonly SimulationAnalyticsRun[],
) {
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const rows = runs
    .filter((run) => batchById.has(run.simulation_batch_id))
    .sort((left, right) => {
      const leftBatch = batchById.get(left.simulation_batch_id)!;
      const rightBatch = batchById.get(right.simulation_batch_id)!;
      return (
        rightBatch.created_at.localeCompare(leftBatch.created_at) ||
        left.profile_label.localeCompare(right.profile_label)
      );
    })
    .map((run) => {
      const batch = batchById.get(run.simulation_batch_id)!;
      return [
        batch.id,
        batch.created_at,
        batch.completed_at ?? "",
        batch.mode_id,
        batch.schema_version,
        batch.evaluator_type,
        batch.report_scope,
        batch.report_count,
        batch.field_count,
        run.profile_id,
        run.profile_version,
        run.profile_label,
        numberValue(run.score),
        run.correct_fields,
        run.total_fields,
        run.valid_json_count,
        validJsonRate(run),
        run.missing_field_count,
        run.invalid_value_count,
      ];
    });

  return toCsv([simulationCsvHeaders, ...rows]);
}

export function buildSimulationReproducibilitySummary(
  batch: SimulationBatchWithSchema,
  runs: readonly SimulationAnalyticsRun[],
) {
  const profiles = runs
    .map((run) => ({
      profileId: run.profile_id,
      profileVersion: run.profile_version,
      profileLabel: run.profile_label,
    }))
    .sort((left, right) => left.profileLabel.localeCompare(right.profileLabel));

  return {
    batchId: batch.id,
    modeId: batch.mode_id,
    schemaVersion: batch.schema_version,
    schemaSnapshotHash: hashSchemaSnapshot(batch.schema_snapshot),
    evaluatorType: batch.evaluator_type,
    reportScope: batch.report_scope,
    profiles,
    reportCount: batch.report_count,
    fieldCount: batch.field_count,
    totalEvaluations: batch.total_evaluations,
    deterministic: true as const,
    synthetic: true as const,
    disclaimer:
      "Deterministic simulation is synthetic and not a real LLM benchmark.",
  };
}

export function hashSchemaSnapshot(schemaSnapshot: unknown) {
  return `sha256:${createHash("sha256")
    .update(stableStringify(schemaSnapshot))
    .digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function validJsonRate(run: SimulationAnalyticsRun) {
  const total = run.valid_json_count + run.invalid_json_count;
  return total === 0
    ? ""
    : Math.round((run.valid_json_count / total) * 10000) / 100;
}

function numberValue(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
