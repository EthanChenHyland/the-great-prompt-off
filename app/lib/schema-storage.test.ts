import { describe, expect, it } from "vitest";
import {
  buildAnswerKeyStoragePayload,
  buildScoredValues,
  createSchemaSnapshot,
  createRunSchemaMetadata,
  defaultChallengeMode,
  validateAnswerValues,
} from "./schema-storage";

const answerValues = {
  acl_tear: "absent",
  mcl_injury: "present",
  meniscus_tear: "not_reported",
  fracture: "absent",
  osteoarthritis: "uncertain",
  effusion: "present",
};

describe("JSONB schema storage compatibility helpers", () => {
  it("prefers and validates a complete JSON answer object", () => {
    expect(validateAnswerValues(answerValues, defaultChallengeMode)).toEqual(
      answerValues,
    );
  });

  it("rejects mismatched keys and values", () => {
    expect(() =>
      validateAnswerValues(
        { ...answerValues, extra: "absent" },
        defaultChallengeMode,
      ),
    ).toThrow();

    expect(() =>
      validateAnswerValues(
        { ...answerValues, acl_tear: "intact" },
        defaultChallengeMode,
      ),
    ).toThrow();
  });

  it("builds synchronized JSONB and legacy six-field values", () => {
    expect(buildAnswerKeyStoragePayload(answerValues)).toEqual({
      answer_values: answerValues,
      ...answerValues,
    });
  });

  it("creates an immutable-shaped schema snapshot", () => {
    const snapshot = createSchemaSnapshot(defaultChallengeMode);

    expect(snapshot.id).toBe("knee_mri_6_basic");
    expect(snapshot.version).toBe(1);
    expect(snapshot.fields).toHaveLength(6);
    expect(snapshot.fields[0]).toMatchObject({
      key: "acl_tear",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
    });
  });

  it("creates run metadata and stores only accepted scored values", () => {
    const metadata = createRunSchemaMetadata(defaultChallengeMode);
    expect(metadata.mode_id).toBe("knee_mri_6_basic");
    expect(metadata.schema_version).toBe(1);
    expect(metadata.schema_snapshot).toEqual(createSchemaSnapshot(defaultChallengeMode));

    expect(
      buildScoredValues([
        { field: "acl_tear", actual: "absent" },
        { field: "mcl_injury", actual: null },
      ]),
    ).toEqual({ acl_tear: "absent" });
  });
});
