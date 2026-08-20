import { describe, expect, it } from "vitest";
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
  getChallengeModeForValidation,
  getActivatableChallengeMode,
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
});
