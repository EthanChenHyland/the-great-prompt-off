import { describe, expect, it } from "vitest";

import {
  evaluationModelOptions,
  isApprovedEvaluationModel,
  resolveChallengeEvaluationModel,
} from "./model-options";

describe("approved evaluation models", () => {
  it("recognizes every approved model", () => {
    for (const option of evaluationModelOptions) {
      expect(isApprovedEvaluationModel(option.id)).toBe(true);
    }
  });

  it("rejects arbitrary model IDs", () => {
    expect(isApprovedEvaluationModel("provider/arbitrary-model")).toBe(false);
    expect(isApprovedEvaluationModel("google/gemini-2.5-flash ")).toBe(false);
    expect(isApprovedEvaluationModel("google/gemma-3-4b-it")).toBe(false);
  });

  it("uses an approved challenge override before the fallback", () => {
    expect(
      resolveChallengeEvaluationModel(
        "google/gemini-2.5-flash-lite",
        "google/gemini-2.0-flash-001",
      ),
    ).toBe("google/gemini-2.5-flash-lite");
  });

  it("uses the fallback for null or unsupported overrides", () => {
    expect(
      resolveChallengeEvaluationModel(null, "google/gemini-2.0-flash-001"),
    ).toBe("google/gemini-2.0-flash-001");
    expect(
      resolveChallengeEvaluationModel(
        "provider/retired-model",
        "google/gemini-2.0-flash-001",
      ),
    ).toBe("google/gemini-2.0-flash-001");
  });
});
