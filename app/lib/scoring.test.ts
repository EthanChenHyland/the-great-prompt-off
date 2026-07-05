import { describe, expect, it } from "vitest";

import { scoreModelOutput } from "./scoring";
import type { AnswerKey, FindingKey } from "./types";

const answerKey: AnswerKey = {
  acl_tear: "absent",
  mcl_injury: "absent",
  meniscus_tear: "present",
  fracture: "absent",
  osteoarthritis: "uncertain",
  effusion: "present",
};

const strictOutput: AnswerKey = {
  acl_tear: "absent",
  mcl_injury: "absent",
  meniscus_tear: "present",
  fracture: "absent",
  osteoarthritis: "uncertain",
  effusion: "present",
};

function fieldResult(output: unknown, field: FindingKey) {
  const result = scoreModelOutput(output, answerKey);
  const fieldScore = result.per_field.find((item) => item.field === field);

  if (!fieldScore) {
    throw new Error(`Missing field score for ${field}`);
  }

  return { fieldScore, result };
}

describe("scoreModelOutput", () => {
  it("accepts exact controlled values", () => {
    const result = scoreModelOutput(strictOutput, answerKey);

    expect(result.valid_json).toBe(true);
    expect(result.invalid_fields).toEqual([]);
    expect(result.missing_fields).toEqual([]);
    expect(result.field_accuracy).toBe(100);
    expect(result.overall_score).toBe(100);
  });

  it("normalizes exact labels by case and surrounding whitespace only", () => {
    const result = scoreModelOutput(
      {
        acl_tear: "ABSENT",
        mcl_injury: " Present ",
        meniscus_tear: "present",
        fracture: " absent ",
        osteoarthritis: " uncertain ",
        effusion: "PRESENT",
      },
      answerKey,
    );

    expect(result.per_field.map((item) => [item.field, item.actual])).toEqual([
      ["acl_tear", "absent"],
      ["mcl_injury", "present"],
      ["meniscus_tear", "present"],
      ["fracture", "absent"],
      ["osteoarthritis", "uncertain"],
      ["effusion", "present"],
    ]);
    expect(result.invalid_fields).toEqual([]);
    expect(result.diagnostics.value_normalization_used).toBe(true);
  });

  it.each([
    ["acl_tear", "intact"],
    ["meniscus_tear", "partial tear"],
    ["fracture", "no fracture"],
    ["effusion", "trace"],
    ["mcl_injury", "yes"],
    ["mcl_injury", "no"],
  ] as Array<[FindingKey, string]>)(
    "marks clinical phrase %s=%s as invalid with no credit",
    (field, value) => {
      const { fieldScore, result } = fieldResult(
        {
          ...strictOutput,
          [field]: value,
        },
        field,
      );

      expect(fieldScore.actual).toBeNull();
      expect(fieldScore.correct).toBe(false);
      expect(fieldScore.invalid).toBe(true);
      expect(result.invalid_fields).toContainEqual({ field, value });
    },
  );

  it("recovers JSON from markdown code fences", () => {
    const result = scoreModelOutput(
      `Here is the output:\n\n\`\`\`json\n${JSON.stringify(strictOutput)}\n\`\`\``,
      answerKey,
    );

    expect(result.valid_json).toBe(true);
    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.recovered_json_used).toBe(true);
  });

  it("recovers JSON embedded in surrounding prose", () => {
    const result = scoreModelOutput(
      `The answer is ${JSON.stringify(strictOutput)} for this report.`,
      answerKey,
    );

    expect(result.valid_json).toBe(true);
    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.recovered_json_used).toBe(true);
  });

  it("recovers a single-object array", () => {
    const result = scoreModelOutput(JSON.stringify([strictOutput]), answerKey);

    expect(result.valid_json).toBe(true);
    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.recovered_json_used).toBe(true);
  });

  it("recovers a nested single-report object", () => {
    const result = scoreModelOutput({ report_1: strictOutput }, answerKey);

    expect(result.valid_json).toBe(true);
    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.nested_object_used).toBe(true);
    expect(result.diagnostics.ignored_outer_key).toBe("report_1");
  });

  it("recovers field-name aliases but still requires strict values", () => {
    const result = scoreModelOutput(
      {
        ACL_intact_or_torn: "absent",
        MCL_intact_or_torn: "intact",
        meniscal_tear_partial_or_full_thickness: "present",
        bone_fracture: "absent",
        degenerative_narrowing_or_spurring_osteoarthritis: "uncertain",
        knee_joint_effusion: "present",
      },
      answerKey,
    );
    const mcl = result.per_field.find((item) => item.field === "mcl_injury");

    expect(result.diagnostics.key_normalization_used).toBe(true);
    expect(mcl?.actual).toBeNull();
    expect(mcl?.invalid).toBe(true);
    expect(result.invalid_fields).toContainEqual({
      field: "mcl_injury",
      value: "intact",
    });
  });

  it("ignores and reports extra fields", () => {
    const result = scoreModelOutput(
      {
        ...strictOutput,
        confidence: "high",
      },
      answerKey,
    );

    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.ignored_extra_fields).toEqual(["confidence"]);
  });

  it("reports missing fields", () => {
    const result = scoreModelOutput(
      {
        acl_tear: "absent",
        mcl_injury: "absent",
      },
      answerKey,
    );

    expect(result.missing_fields).toEqual([
      "meniscus_tear",
      "fracture",
      "osteoarthritis",
      "effusion",
    ]);
  });

  it("reports invalid fields", () => {
    const result = scoreModelOutput(
      {
        ...strictOutput,
        fracture: "no fracture",
        effusion: "trace",
      },
      answerKey,
    );

    expect(result.invalid_fields).toEqual([
      { field: "fracture", value: "no fracture" },
      { field: "effusion", value: "trace" },
    ]);
  });
});
