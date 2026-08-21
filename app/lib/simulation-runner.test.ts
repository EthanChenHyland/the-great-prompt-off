import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  activatableChallengeModeIds,
  defaultChallengeMode,
  kneeMri12BasicMode,
} from "./challenge-modes";
import { simulationProfiles } from "./simulation-profiles";
import { runDeterministicSimulation } from "./simulation-runner";

function allPresentAnswerKey(
  mode: typeof defaultChallengeMode | typeof kneeMri12BasicMode,
) {
  return Object.fromEntries(mode.fields.map((field) => [field.key, "present"]));
}

describe("deterministic simulation dry-run", () => {
  it("defines the expected versioned built-in profiles", () => {
    expect(simulationProfiles.map((profile) => profile.id)).toEqual([
      "blank",
      "nonsense",
      "vague",
      "partial_first_field",
      "basic_all_fields",
      "strong_all_fields",
    ]);
    expect(simulationProfiles.every((profile) => profile.version === 1)).toBe(true);
    expect(
      simulationProfiles.every(
        (profile) => profile.description && profile.purpose && profile.buildStrategy,
      ),
    ).toBe(true);
  });

  it("uses a six-field denominator and a deterministic quality ladder", () => {
    const result = runDeterministicSimulation({
      mode: defaultChallengeMode,
      reportScope: "public",
      reports: [{
        id: "public-1",
        split: "public",
        answerKey: allPresentAnswerKey(defaultChallengeMode),
      }],
    });
    const scores = Object.fromEntries(
      result.profiles.map((profile) => [profile.id, profile.score]),
    );

    expect(result.fieldCount).toBe(6);
    expect(result.profiles.every((profile) => profile.totalFields === 6)).toBe(true);
    expect(scores.blank).toBe(0);
    expect(scores.nonsense).toBe(0);
    expect(scores.strong_all_fields).toBe(100);
    expect(scores.basic_all_fields).toBeGreaterThan(scores.vague);
    expect(result.persisted).toBe(false);
    expect(result.deterministic).toBe(true);
  });

  it("supports an explicit dormant twelve-field schema without activating it", () => {
    const result = runDeterministicSimulation({
      mode: kneeMri12BasicMode,
      reportScope: "public",
      reports: [{
        id: "public-12",
        split: "public",
        answerKey: allPresentAnswerKey(kneeMri12BasicMode),
      }],
      profileIds: ["partial_first_field", "strong_all_fields"],
    });

    expect(result.fieldCount).toBe(12);
    expect(result.profiles[0].totalFields).toBe(12);
    expect(result.profiles[1].correctFields).toBe(12);
    expect(activatableChallengeModeIds).toEqual(["knee_mri_6_basic"]);
  });

  it("returns aggregate-safe data without private evaluation material", () => {
    const result = runDeterministicSimulation({
      mode: defaultChallengeMode,
      reportScope: "public",
      reports: [{
        id: "public-1",
        split: "public",
        answerKey: allPresentAnswerKey(defaultChallengeMode),
      }],
      profileIds: ["strong_all_fields"],
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("answerKey");
    expect(serialized).not.toContain("reportText");
    expect(serialized).not.toContain("rawModelOutput");
    expect(serialized).not.toContain("systemPrompt");
  });

  it("has no OpenRouter dependency or event-table mutation path", () => {
    const runner = readFileSync(
      path.join(process.cwd(), "app", "lib", "simulation-runner.ts"),
      "utf8",
    );
    const adminService = readFileSync(
      path.join(process.cwd(), "app", "lib", "supabase", "admin-simulations.ts"),
      "utf8",
    );

    expect(runner).not.toContain("openrouter");
    expect(adminService).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(adminService).not.toContain('.from("participants")');
    expect(adminService).not.toContain('.from("prompt_runs")');
    expect(adminService).not.toContain('.from("prompt_run_items")');
    expect(adminService).not.toContain('.from("submissions")');
  });
});
