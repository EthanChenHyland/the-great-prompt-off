import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseAnswerKeyImportMetadata,
} from "./admin-challenge-schema";

describe("answer-key provenance", () => {
  it("defaults preparation imports to staging/demo with a generated batch", () => {
    const metadata = parseAnswerKeyImportMetadata(
      {},
      "generated-batch-1",
      "2026-08-20T12:00:00Z",
    );

    expect(metadata).toEqual({
      provenance: "staging_demo",
      import_batch_id: "generated-batch-1",
      adjudicated_by: null,
      adjudicated_at: null,
      notes: "Staging/demo import; not clinically adjudicated.",
    });
  });

  it("validates clinician-adjudicated metadata", () => {
    expect(parseAnswerKeyImportMetadata(
      {
        provenance: "clinician_adjudicated",
        adjudicated_by: "Clinical review team",
      },
      "clinical-batch",
      "2026-08-20T12:00:00Z",
    )).toMatchObject({
      provenance: "clinician_adjudicated",
      import_batch_id: "clinical-batch",
      adjudicated_by: "Clinical review team",
      adjudicated_at: "2026-08-20T12:00:00.000Z",
    });
  });

  it("rejects invalid or reserved provenance", () => {
    expect(() => parseAnswerKeyImportMetadata(
      { provenance: "trusted_somehow" },
      "batch",
      "2026-08-20T12:00:00Z",
    )).toThrow("provenance is not supported");
    expect(() => parseAnswerKeyImportMetadata(
      { provenance: "legacy" },
      "batch",
      "2026-08-20T12:00:00Z",
    )).toThrow("reserved");
  });

  it("backfills existing six-field rows as legacy in the additive migration", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase", "answer-key-provenance.sql"),
      "utf8",
    );

    expect(sql).toContain("set provenance = 'legacy'");
    expect(sql).toContain("mode_id = 'knee_mri_6_basic'");
    expect(sql).toContain("schema_version = 1");
    expect(sql).toContain("clinician_adjudicated");
    expect(sql).toContain("staging_demo");
  });
});
