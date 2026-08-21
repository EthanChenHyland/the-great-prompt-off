import type { ChallengeModeDefinition } from "./challenge-modes";
import {
  getSimulationProfiles,
  type SimulationProfile,
} from "./simulation-profiles";
import { scoreModelOutput } from "./scoring";

export type SimulationReportScope = "public" | "private" | "all";

export type SimulationAnswerKeyReport = {
  id: string;
  split: "public" | "private";
  answerKey: Record<string, string>;
};

export type SimulationDryRunResult = {
  ok: true;
  deterministic: true;
  persisted: false;
  modeId: string;
  schemaVersion: number;
  reportScope: SimulationReportScope;
  reportCount: number;
  fieldCount: number;
  totalEvaluations: number;
  profiles: Array<{
    id: string;
    version: number;
    label: string;
    description: string;
    purpose: string;
    score: number;
    correctFields: number;
    totalFields: number;
    validJsonRate: number;
    missingFieldsCount: number;
    invalidValuesCount: number;
  }>;
  messages: string[];
};

export function runDeterministicSimulation({
  mode,
  reportScope,
  reports,
  profileIds,
}: {
  mode: ChallengeModeDefinition;
  reportScope: SimulationReportScope;
  reports: readonly SimulationAnswerKeyReport[];
  profileIds?: readonly string[];
}): SimulationDryRunResult {
  if (reports.length === 0) {
    throw new Error("No matching reports and answer keys are available for this simulation.");
  }

  const profiles = getSimulationProfiles(profileIds);
  if (profiles.length === 0) {
    throw new Error("Select at least one simulation profile.");
  }

  const profileResults = profiles.map((profile) => {
    // Build the participant strategy snapshot even though Phase 9B does not
    // persist or return it. This keeps profile definitions schema-aware.
    profile.buildStrategy(mode);
    const scores = reports.map((report) => {
      const prediction = createDeterministicPrediction(
        profile,
        report.answerKey,
        mode,
      );
      return scoreModelOutput(JSON.stringify(prediction), report.answerKey, mode);
    });
    const totalFields = scores.reduce(
      (total, score) => total + score.per_field.length,
      0,
    );
    const correctFields = scores.reduce(
      (total, score) =>
        total + score.per_field.filter((field) => field.correct).length,
      0,
    );
    const validJsonCount = scores.filter((score) => score.valid_json).length;

    return {
      id: profile.id,
      version: profile.version,
      label: profile.label,
      description: profile.description,
      purpose: profile.purpose,
      score: totalFields === 0 ? 0 : (correctFields / totalFields) * 100,
      correctFields,
      totalFields,
      validJsonRate: (validJsonCount / scores.length) * 100,
      missingFieldsCount: scores.reduce(
        (total, score) => total + score.missing_fields.length,
        0,
      ),
      invalidValuesCount: scores.reduce(
        (total, score) => total + score.invalid_fields.length,
        0,
      ),
    };
  });

  return {
    ok: true,
    deterministic: true,
    persisted: false,
    modeId: mode.id,
    schemaVersion: mode.version,
    reportScope,
    reportCount: reports.length,
    fieldCount: mode.fields.length,
    totalEvaluations: reports.length * profiles.length,
    profiles: profileResults,
    messages: [
      "Deterministic dry-run only. These results are synthetic and are not a real LLM benchmark.",
      "No participants, attempts, prompt runs, submissions, or leaderboard rows were created.",
    ],
  };
}

function createDeterministicPrediction(
  profile: SimulationProfile,
  answerKey: Record<string, string>,
  mode: ChallengeModeDefinition,
) {
  return Object.fromEntries(
    mode.fields.map((field, index) => {
      const expected = answerKey[field.key];
      let value: string;

      switch (profile.predictionPolicy) {
        case "all_not_reported":
          value = "not_reported";
          break;
        case "first_field_only":
          value = index === 0 ? expected : "not_reported";
          break;
        case "weak_all_fields":
          value = index % 3 === 0 ? expected : differentAllowedValue(field.allowedValues, expected);
          break;
        case "basic_all_fields":
          value = index % 4 === 0 ? differentAllowedValue(field.allowedValues, expected) : expected;
          break;
        case "exact_all_fields":
          value = expected;
          break;
      }

      return [field.key, value];
    }),
  );
}

function differentAllowedValue(
  allowedValues: readonly string[],
  expected: string,
) {
  return allowedValues.find((value) => value !== expected) ?? expected;
}
