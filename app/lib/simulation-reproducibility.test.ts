import { describe, expect, it } from "vitest";

import type { SimulationAnalyticsRun } from "./simulation-analytics";
import {
  buildSimulationCsv,
  buildSimulationReproducibilitySummary,
  hashSchemaSnapshot,
  simulationCsvHeaders,
  type SimulationBatchWithSchema,
} from "./simulation-reproducibility";

const batch: SimulationBatchWithSchema = {
  id: "00000000-0000-4000-8000-000000000001",
  mode_id: "knee_mri_6_basic",
  schema_version: 1,
  schema_snapshot: {
    version: 1,
    id: "knee_mri_6_basic",
    fields: [{ allowedValues: ["present", "absent"], key: "acl_tear" }],
  },
  evaluator_type: "deterministic_mock",
  report_scope: "public",
  status: "completed",
  report_count: 5,
  field_count: 6,
  profile_count: 1,
  total_evaluations: 5,
  created_at: "2026-01-01T10:00:00.000Z",
  completed_at: "2026-01-01T10:01:00.000Z",
};

const run: SimulationAnalyticsRun = {
  id: "run-1",
  simulation_batch_id: batch.id,
  profile_id: "strong_all_fields",
  profile_version: 1,
  profile_label: '=HYPERLINK("unsafe")',
  correct_fields: 28,
  total_fields: 30,
  score: 93.33,
  valid_json_count: 4,
  invalid_json_count: 1,
  missing_field_count: 2,
  invalid_value_count: 1,
  completed_report_count: 5,
  created_at: "2026-01-01T10:01:00.000Z",
};

describe("simulation CSV and reproducibility", () => {
  it("exports only the approved aggregate CSV columns", () => {
    const csv = buildSimulationCsv([batch], [run]);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      simulationCsvHeaders.map((header) => `"${header}"`).join(","),
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"93.33"');
    expect(lines[1]).toContain('"80"');
    expect(lines[1]).toContain('"\'=HYPERLINK(""unsafe"")"');
    expect(csv).not.toContain("answer_values");
    expect(csv).not.toContain("report_text");
    expect(csv).not.toContain("strategy_snapshot");
    expect(csv).not.toContain("raw_model_output");
  });

  it("creates a safe reproducibility summary without the schema snapshot", () => {
    const summary = buildSimulationReproducibilitySummary(batch, [run]);

    expect(summary).toMatchObject({
      batchId: batch.id,
      modeId: "knee_mri_6_basic",
      schemaVersion: 1,
      evaluatorType: "deterministic_mock",
      reportScope: "public",
      reportCount: 5,
      fieldCount: 6,
      totalEvaluations: 5,
      deterministic: true,
      synthetic: true,
      profiles: [
        expect.objectContaining({
          profileId: "strong_all_fields",
          profileVersion: 1,
        }),
      ],
    });
    expect(summary.schemaSnapshotHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(summary)).not.toContain("schema_snapshot");
    expect(JSON.stringify(summary)).not.toContain("allowedValues");
  });

  it("hashes equivalent schema objects consistently regardless of key order", () => {
    expect(hashSchemaSnapshot({ b: 2, a: { d: 4, c: 3 } })).toBe(
      hashSchemaSnapshot({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});
