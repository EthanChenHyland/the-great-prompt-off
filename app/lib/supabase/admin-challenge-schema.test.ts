import { describe, expect, it, vi } from "vitest";
import {
  answerKeyFields,
  answerKeyValues,
  makeAnswerKey,
  makeReport,
} from "./admin-challenge-schema.test-fixtures";
import {
  ANSWER_KEY_FIELDS_ERROR,
  ANSWER_KEY_VALUE_ERROR,
  CHALLENGE_MODE_ERROR,
  CLINICAL_READINESS_ERROR,
  MISSING_SCHEMA_VALUES_ERROR,
  STAGING_PROVENANCE_ERROR,
  UNSUPPORTED_PROVENANCE_ERROR,
  createChallengeSchemaMetadata,
  createChallengeModesReadiness,
  createAnswerKeyImportWritePlan,
  executeAnswerKeyImportWrite,
  getChallengeModeForValidation,
  getActivatableChallengeMode,
  parseAnswerKeyImportMetadata,
  prepareAnswerKeyImportPayload,
  validateAnswerKeyImportPayload,
  validateAnswerKeyProvenanceForActivation,
  validateTargetAnswerKeyCoverage,
  validateTargetAnswerKeys,
  validateTargetAnswerKeysForActivation,
} from "./admin-challenge-schema";

describe("admin challenge schema validation", () => {
  it("generates an exact output schema for the only activatable mode", () => {
    const mode = getActivatableChallengeMode("knee_mri_6_basic", 1);
    const metadata = createChallengeSchemaMetadata(mode);

    expect(metadata.outputSchema.required).toEqual(answerKeyFields);
    expect(metadata.outputSchema.additionalProperties).toBe(false);
    expect(Object.keys(metadata.outputSchema.properties)).toEqual(answerKeyFields);
    expect(Object.values(metadata.outputSchema.properties).map((field) => field.enum)).toEqual(
      answerKeyFields.map(() => answerKeyValues),
    );
  });

  it("rejects dormant modes from the activation route", () => {
    expect(() => getActivatableChallengeMode("knee_mri_12_basic", 1)).toThrow(
      CHALLENGE_MODE_ERROR,
    );
    expect(() => getActivatableChallengeMode("shoulder_mri_basic", 1)).toThrow(
      CHALLENGE_MODE_ERROR,
    );
  });

  it("rejects a schema version that does not match the registry", () => {
    expect(() => getActivatableChallengeMode("knee_mri_6_basic", 2)).toThrow(
      "That schema version is not supported for the selected challenge mode.",
    );
  });

  it("validates exact answer fields and allowed values", () => {
    const mode = getActivatableChallengeMode("knee_mri_6_basic", 1);
    const reports = [makeReport("report-1")];

    expect(() => validateTargetAnswerKeys(reports, [makeAnswerKey("report-1")], mode)).not.toThrow();
    expect(() =>
      validateTargetAnswerKeys(reports, [makeAnswerKey("report-1", { extra: "absent" })], mode),
    ).toThrow(ANSWER_KEY_FIELDS_ERROR);
    expect(() =>
      validateTargetAnswerKeys(reports, [makeAnswerKey("report-1", { acl_tear: "yes" })], mode),
    ).toThrow(ANSWER_KEY_VALUE_ERROR);
  });

  it("allows legacy fallback only for the current six-field mode", () => {
    const mode = getActivatableChallengeMode("knee_mri_6_basic", 1);
    const reports = [makeReport("report-1")];
    const legacy = makeAnswerKey("report-1");
    legacy.answer_values = null;

    expect(() => validateTargetAnswerKeys(reports, [legacy], mode)).not.toThrow();
    expect(() =>
      validateTargetAnswerKeys(reports, [legacy], {
        ...mode,
        id: "future_mode",
        fields: [],
      }),
    ).toThrow(MISSING_SCHEMA_VALUES_ERROR);
  });

  it("accepts legacy provenance for six-field activation compatibility", () => {
    const mode = getActivatableChallengeMode("knee_mri_6_basic", 1);
    const reports = [makeReport("report-1")];
    const answerKeys = [{
      ...makeAnswerKey("report-1"),
      mode_id: mode.id,
      schema_version: mode.version,
      provenance: "legacy",
    }];

    expect(
      validateAnswerKeyProvenanceForActivation(reports, answerKeys, mode),
    ).toMatchObject({
      ok: true,
      compatibleCount: 1,
      requiredCount: 1,
    });
    expect(() =>
      validateTargetAnswerKeysForActivation(reports, answerKeys, mode)
    ).not.toThrow();
  });

  it("rejects structurally valid staging-only future-mode keys", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const reports = [makeReport("report-12")];
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const answerKeys = [{
      ...makeAnswerKey("report-12"),
      mode_id: mode.id,
      schema_version: mode.version,
      provenance: "staging_demo",
      answer_values: answerValues,
    }];

    expect(validateTargetAnswerKeyCoverage(reports, answerKeys, mode).ok).toBe(true);
    expect(() =>
      validateTargetAnswerKeysForActivation(reports, answerKeys, mode)
    ).toThrow(STAGING_PROVENANCE_ERROR);
  });

  it.each([undefined, "unknown", "imported"])(
    "rejects future-mode provenance %s",
    (provenance) => {
      const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
      const reports = [makeReport("report-12")];
      const answerValues = Object.fromEntries(
        mode.fields.map((field) => [field.key, "not_reported"]),
      );
      const answerKey = {
        ...makeAnswerKey("report-12"),
        mode_id: mode.id,
        schema_version: mode.version,
        provenance,
        answer_values: answerValues,
      };

      expect(() =>
        validateTargetAnswerKeysForActivation(reports, [answerKey], mode)
      ).toThrow(UNSUPPORTED_PROVENANCE_ERROR);
    },
  );

  it("accepts full clinician-adjudicated future coverage before allowlist checks", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const reports = [makeReport("report-12")];
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const answerKeys = [{
      ...makeAnswerKey("report-12"),
      mode_id: mode.id,
      schema_version: mode.version,
      provenance: "clinician_adjudicated",
      answer_values: answerValues,
    }];
    const result = validateAnswerKeyProvenanceForActivation(
      reports,
      answerKeys,
      mode,
    );

    expect(result).toMatchObject({
      ok: true,
      compatibleCount: 1,
      requiredCount: 1,
      error: null,
    });
    expect(() =>
      validateTargetAnswerKeysForActivation(reports, answerKeys, mode)
    ).not.toThrow();
    expect(() => getActivatableChallengeMode(mode.id, mode.version)).toThrow(
      CHALLENGE_MODE_ERROR,
    );
  });

  it("returns only safe aggregate provenance activation diagnostics", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const report = makeReport("report-12");
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const result = validateAnswerKeyProvenanceForActivation(
      [report],
      [{
        ...makeAnswerKey(report.id),
        provenance: "legacy",
        answer_values: answerValues,
      }],
      mode,
    );
    const serialized = JSON.stringify(result);

    expect(result.error).toBe(CLINICAL_READINESS_ERROR);
    expect(serialized).not.toContain("answer_values");
    expect(serialized).not.toContain("report_text");
    expect(serialized).not.toContain("adjudicated_by");
    expect(serialized).not.toContain("import_batch_id");
  });

  it("validates a complete dormant twelve-field answer key without activating it", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const result = validateTargetAnswerKeyCoverage(
      [makeReport("report-12")],
      [{
        ...makeAnswerKey("report-12"),
        answer_values: answerValues,
      }],
      mode,
    );

    expect(result.ok).toBe(true);
    expect(result.reportCounts).toEqual({ public: 1, private: 0 });
    expect(result).not.toHaveProperty("answerValues");
  });

  it("reports missing, extra, and invalid twelve-field values safely", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const complete = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const missing = { ...complete };
    delete missing.bakers_cyst;
    const extra = { ...complete, unexpected: "absent" };
    const invalid = { ...complete, acl_tear: "yes" };

    expect(validateTargetAnswerKeyCoverage(
      [makeReport("missing")],
      [{ ...makeAnswerKey("missing"), answer_values: missing }],
      mode,
    ).issues[0].type).toBe("invalid_fields");
    expect(validateTargetAnswerKeyCoverage(
      [makeReport("extra")],
      [{ ...makeAnswerKey("extra"), answer_values: extra }],
      mode,
    ).issues[0].type).toBe("invalid_fields");
    expect(validateTargetAnswerKeyCoverage(
      [makeReport("invalid")],
      [{ ...makeAnswerKey("invalid"), answer_values: invalid }],
      mode,
    ).issues[0].type).toBe("invalid_values");
  });

  it("does not treat six-field legacy columns as a twelve-field answer key", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const legacy = makeAnswerKey("legacy");
    legacy.answer_values = null;
    const result = validateTargetAnswerKeyCoverage([makeReport("legacy")], [legacy], mode);

    expect(result.ok).toBe(false);
    expect(result.issues[0].type).toBe("missing_schema_values");
  });

  it("reports active and dormant mode readiness with versioned coverage", () => {
    const reports = [
      { ...makeReport("public-report"), split: "public" as const },
      { ...makeReport("private-report"), split: "private" as const },
    ];
    const knee12Mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const knee12Values = Object.fromEntries(
      knee12Mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const answerKeys = [
      {
        ...makeAnswerKey("public-report"),
        mode_id: "knee_mri_6_basic",
        schema_version: 1,
      },
      {
        ...makeAnswerKey("private-report"),
        mode_id: "knee_mri_6_basic",
        schema_version: 1,
      },
      {
        ...makeAnswerKey("public-report"),
        mode_id: "knee_mri_12_basic",
        schema_version: 1,
        provenance: "staging_demo",
        answer_values: knee12Values,
      },
      {
        ...makeAnswerKey("private-report"),
        mode_id: "knee_mri_12_basic",
        schema_version: 2,
        answer_values: knee12Values,
      },
    ];

    const readiness = createChallengeModesReadiness(
      reports,
      answerKeys,
      "knee_mri_6_basic",
      1,
    );
    const active = readiness.find((mode) => mode.modeId === "knee_mri_6_basic");
    const knee12 = readiness.find((mode) => mode.modeId === "knee_mri_12_basic");
    const shoulder = readiness.find((mode) => mode.modeId === "shoulder_mri_basic");

    expect(readiness).toHaveLength(3);
    expect(active).toMatchObject({
      activationStatus: "active",
      publicReportCount: 1,
      privateReportCount: 1,
      answerKeyCoverageCount: 2,
      missingAnswerKeyCount: 0,
      validationPasses: true,
      statusMessage: "Active mode",
    });
    expect(knee12).toMatchObject({
      activationStatus: "dormant",
      answerKeyCoverageCount: 1,
      missingAnswerKeyCount: 1,
      validationPasses: false,
      statusMessage: "Missing answer keys",
    });
    expect(knee12?.provenanceNotice).toContain("not clinically adjudicated");
    expect(shoulder).toMatchObject({
      activationStatus: "dormant",
      answerKeyCoverageCount: 0,
      missingAnswerKeyCount: 2,
      validationPasses: false,
    });
  });

  it("keeps validated dormant readiness aggregate-only and unselectable", () => {
    const report = makeReport("report-12");
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const readiness = createChallengeModesReadiness(
      [report],
      [{
        ...makeAnswerKey(report.id),
        mode_id: mode.id,
        schema_version: mode.version,
        provenance: "clinician_adjudicated",
        answer_values: answerValues,
      }],
      "knee_mri_6_basic",
      1,
    ).find((candidate) => candidate.modeId === mode.id);
    const serialized = JSON.stringify(readiness);

    expect(readiness).toMatchObject({
      activationStatus: "dormant",
      answerKeyCoverageCount: 1,
      missingAnswerKeyCount: 0,
      validationPasses: true,
      statusMessage: "Dormant / not allowlisted",
      clinicallyReady: true,
    });
    expect(serialized).not.toContain("answer_values");
    expect(serialized).not.toContain("report_text");
    expect(() => getActivatableChallengeMode(mode.id, mode.version)).toThrow(
      CHALLENGE_MODE_ERROR,
    );
  });

  it("keeps complete staging-only twelve-field coverage out of clinical readiness", () => {
    const report = makeReport("report-12");
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const readiness = createChallengeModesReadiness(
      [report],
      [{
        ...makeAnswerKey(report.id),
        mode_id: mode.id,
        schema_version: mode.version,
        provenance: "staging_demo",
        answer_values: answerValues,
      }],
      "knee_mri_6_basic",
      1,
    ).find((candidate) => candidate.modeId === mode.id);

    expect(readiness).toMatchObject({
      validationPasses: true,
      clinicallyReady: false,
      statusMessage: "Structurally valid / staging data only",
      provenanceCounts: {
        legacy: 0,
        staging_demo: 1,
        clinician_adjudicated: 0,
        imported: 0,
        unknown: 0,
      },
    });
    expect(JSON.stringify(readiness)).not.toContain("answer_values");
    expect(JSON.stringify(readiness)).not.toContain("report_text");
  });

  it("does not treat an empty report set as activation-ready", () => {
    const readiness = createChallengeModesReadiness(
      [],
      [],
      "knee_mri_6_basic",
      1,
    );

    expect(readiness.every((mode) => !mode.validationPasses)).toBe(true);
    expect(readiness.find((mode) => mode.modeId === "knee_mri_6_basic")).toMatchObject({
      statusMessage: "Validation failed",
      publicReportCount: 0,
      privateReportCount: 0,
    });
  });

  it("validates twelve-field import entries without returning their values", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const result = validateAnswerKeyImportPayload(
      {
        mode_id: mode.id,
        schema_version: mode.version,
        items: [{ report_id_or_filename: "report_001.txt", answer_values: answerValues }],
      },
      [{ ...makeReport("import-1"), filename: "report_001.txt" }],
      mode,
    );

    expect(result.ok).toBe(true);
    expect(result.validItemCount).toBe(1);
    expect(result).not.toHaveProperty("answer_values");
  });

  it("prepares a separate versioned twelve-field row without legacy columns", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const preparation = prepareAnswerKeyImportPayload(
      {
        modeId: mode.id,
        schemaVersion: mode.version,
        write: true,
        items: [{ report_id_or_filename: "external-001", answer_values: answerValues }],
      },
      [{ ...makeReport("report-001"), external_id: "external-001" }],
      mode,
    );

    expect(preparation.validation.ok).toBe(true);
    expect(preparation.rows).toEqual([{
      report_id: "report-001",
      mode_id: "knee_mri_12_basic",
      schema_version: 1,
      answer_values: answerValues,
      provenance: "unknown",
      import_batch_id: "unbatched",
      adjudicated_by: null,
      adjudicated_at: null,
      notes: null,
    }]);
    expect(Object.keys(preparation.rows[0])).toEqual([
      "report_id",
      "mode_id",
      "schema_version",
      "answer_values",
      "provenance",
      "import_batch_id",
      "adjudicated_by",
      "adjudicated_at",
      "notes",
    ]);
    expect(preparation.validation).not.toHaveProperty("answer_values");
  });

  it("attaches validated provenance metadata without returning identity in aggregates", () => {
    const metadata = parseAnswerKeyImportMetadata(
      {
        provenance: "clinician_adjudicated",
        importBatchId: "review-batch-1",
        adjudicatedBy: "Clinical review team",
        adjudicatedAt: "2026-08-20T12:00:00Z",
      },
      "generated-batch",
      "2026-08-20T13:00:00Z",
    );
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const preparation = prepareAnswerKeyImportPayload(
      { items: [{ report_id_or_filename: "report-001", answer_values: answerValues }] },
      [makeReport("report-001")],
      mode,
      metadata,
    );

    expect(preparation.rows[0]).toMatchObject({
      provenance: "clinician_adjudicated",
      import_batch_id: "review-batch-1",
      adjudicated_by: "Clinical review team",
      adjudicated_at: "2026-08-20T12:00:00.000Z",
    });
    expect(JSON.stringify(preparation.validation)).not.toContain("Clinical review team");
  });

  it("plans inserts without overwriting another mode's rows", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const rows = prepareAnswerKeyImportPayload(
      {
        items: [{ report_id_or_filename: "report-001", answer_values: answerValues }],
      },
      [makeReport("report-001")],
      mode,
    ).rows;

    const plan = createAnswerKeyImportWritePlan(rows, new Set(), false);

    expect(plan).toEqual({
      blocked: false,
      insertedCount: 1,
      updatedCount: 0,
      skippedCount: 0,
    });
    expect(rows[0].mode_id).not.toBe("knee_mri_6_basic");
  });

  it("rejects existing twelve-field rows unless overwrite is explicit", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const rows = prepareAnswerKeyImportPayload(
      {
        items: [{ report_id_or_filename: "report-001", answer_values: answerValues }],
      },
      [makeReport("report-001")],
      mode,
    ).rows;

    expect(createAnswerKeyImportWritePlan(rows, new Set(["report-001"]), false)).toEqual({
      blocked: true,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 1,
    });
    expect(createAnswerKeyImportWritePlan(rows, new Set(["report-001"]), true)).toEqual({
      blocked: false,
      insertedCount: 0,
      updatedCount: 1,
      skippedCount: 0,
    });
  });

  it("writes only through the requested insert or overwrite operation", async () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const answerValues = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const rows = prepareAnswerKeyImportPayload(
      {
        items: [{ report_id_or_filename: "report-001", answer_values: answerValues }],
      },
      [makeReport("report-001")],
      mode,
    ).rows;
    const insert = vi.fn(async () => undefined);
    const upsert = vi.fn(async () => undefined);

    await executeAnswerKeyImportWrite(rows, new Set(), false, { insert, upsert });
    expect(insert).toHaveBeenCalledWith(rows);
    expect(upsert).not.toHaveBeenCalled();

    insert.mockClear();
    await executeAnswerKeyImportWrite(rows, new Set(["report-001"]), true, {
      insert,
      upsert,
    });
    expect(insert).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(rows);

    upsert.mockClear();
    await executeAnswerKeyImportWrite(rows, new Set(["report-001"]), false, {
      insert,
      upsert,
    });
    expect(insert).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects unknown, duplicate, missing, extra, and invalid import entries", () => {
    const mode = getChallengeModeForValidation("knee_mri_12_basic", 1);
    const complete = Object.fromEntries(
      mode.fields.map((field) => [field.key, "not_reported"]),
    );
    const missing = { ...complete };
    delete missing.bakers_cyst;

    const result = validateAnswerKeyImportPayload(
      {
        items: [
          { report_id_or_filename: "unknown", answer_values: complete },
          { report_id_or_filename: "known", answer_values: missing },
          { report_id_or_filename: "known", answer_values: { ...complete, extra: "absent" } },
          { report_id_or_filename: "extra", answer_values: { ...complete, extra: "absent" } },
          { report_id_or_filename: "invalid", answer_values: { ...complete, acl_tear: "yes" } },
        ],
      },
      [makeReport("known"), makeReport("extra"), makeReport("invalid"), makeReport("not-in-import")],
      mode,
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.type)).toEqual(
      expect.arrayContaining([
        "unknown_report",
        "duplicate_report",
        "invalid_fields",
        "invalid_values",
        "missing_report_entry",
      ]),
    );
    expect(result).not.toHaveProperty("answer_values");
  });
});
