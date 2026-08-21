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
  MISSING_SCHEMA_VALUES_ERROR,
  createChallengeSchemaMetadata,
  createAnswerKeyImportWritePlan,
  executeAnswerKeyImportWrite,
  getChallengeModeForValidation,
  getActivatableChallengeMode,
  prepareAnswerKeyImportPayload,
  validateAnswerKeyImportPayload,
  validateTargetAnswerKeyCoverage,
  validateTargetAnswerKeys,
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
    }]);
    expect(Object.keys(preparation.rows[0])).toEqual([
      "report_id",
      "mode_id",
      "schema_version",
      "answer_values",
    ]);
    expect(preparation.validation).not.toHaveProperty("answer_values");
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
