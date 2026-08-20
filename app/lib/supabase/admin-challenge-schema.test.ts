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
  getActivatableChallengeMode,
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
});
