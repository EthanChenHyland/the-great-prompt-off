import { findingKeys, valueOptions } from "./challenge-constants";
import { scoreModelOutput } from "./scoring";
import type {
  AnswerKey,
  AnswerKeyItem,
  FindingKey,
  FindingValue,
  SampleReport,
  ScoreSummary,
  ScoringResult,
} from "./types";

export type MockReportResult = {
  reportId: string;
  prediction: AnswerKey;
  score: ScoringResult;
};

export function evaluateSampleReports(
  reports: SampleReport[],
  prompt: string,
): MockReportResult[] {
  return reports.map((report) => {
    const prediction = createMockPrediction(prompt, report.answer_key);

    return {
      reportId: report.id,
      prediction,
      score: scoreModelOutput(JSON.stringify(prediction), report.answer_key),
    };
  });
}

export function evaluateAnswerKeySet(
  answerKeys: AnswerKeyItem[],
  prompt: string,
): ScoreSummary {
  const scores = answerKeys.map((item) => {
    const prediction = createMockPrediction(prompt, item.answer_key);

    return scoreModelOutput(JSON.stringify(prediction), item.answer_key);
  });
  const correct = scores.reduce(
    (sum, score) => sum + countCorrectFields(score),
    0,
  );
  const total = scores.length * findingKeys.length;

  return {
    correct,
    total,
    accuracy: total === 0 ? 0 : (correct / total) * 100,
  };
}

export function summarizeReportResults(results: MockReportResult[]): ScoreSummary {
  const correct = results.reduce(
    (sum, result) => sum + countCorrectFields(result.score),
    0,
  );
  const total = results.length * findingKeys.length;

  return {
    correct,
    total,
    accuracy: total === 0 ? 0 : (correct / total) * 100,
  };
}

export function countCorrectFields(score: ScoringResult) {
  return score.per_field.filter((field) => field.correct).length;
}

function createMockPrediction(prompt: string, answerKey: AnswerKey): AnswerKey {
  const quality = promptQuality(prompt);

  return findingKeys.reduce((prediction, key, index) => {
    if (quality === "strong") {
      prediction[key] = answerKey[key];
      return prediction;
    }

    if (quality === "medium" && index !== 4) {
      prediction[key] = answerKey[key];
      return prediction;
    }

    prediction[key] = fallbackValue(key, answerKey[key]);
    return prediction;
  }, {} as AnswerKey);
}

function promptQuality(prompt: string) {
  const lower = prompt.toLowerCase();
  const mentionsAllFields = findingKeys.every((key) => lower.includes(key));
  const asksForJson = lower.includes("json");
  const constrainsValues = valueOptions.every((value) => lower.includes(value));

  if (mentionsAllFields && asksForJson && constrainsValues) {
    return "strong";
  }

  if (asksForJson && (mentionsAllFields || constrainsValues)) {
    return "medium";
  }

  return "weak";
}

function fallbackValue(key: FindingKey, correct: FindingValue): FindingValue {
  if (key === "effusion" && correct === "present") {
    return "uncertain";
  }

  if (correct === "present") {
    return "absent";
  }

  return correct;
}
