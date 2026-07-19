import { findingKeys } from "./challenge-constants";
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
  prediction: Partial<AnswerKey>;
  score: ScoringResult;
  modelOutput?: string;
  error?: string | null;
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
  const scores = evaluateAnswerKeyReports(answerKeys, prompt).map(
    (result) => result.score,
  );
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

export function evaluateAnswerKeyReports(
  answerKeys: AnswerKeyItem[],
  prompt: string,
): MockReportResult[] {
  return answerKeys.map((item) => {
    const prediction = createMockPrediction(prompt, item.answer_key);

    return {
      reportId: item.id,
      prediction,
      score: scoreModelOutput(JSON.stringify(prediction), item.answer_key),
      modelOutput: JSON.stringify(prediction),
      error: null,
    };
  });
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
  const mentionedFindings = findingKeys.filter((key) =>
    findingTerms[key].some((term) => lower.includes(term)),
  ).length;

  // Mock mode treats the platform-controlled output contract as satisfied.
  // Its lightweight quality approximation should respond to the participant's
  // clinical strategy, not to formatting instructions that are no longer editable.
  if (mentionedFindings === findingKeys.length) {
    return "strong";
  }

  if (mentionedFindings >= 4) {
    return "medium";
  }

  return "weak";
}

const findingTerms: Record<FindingKey, string[]> = {
  acl_tear: ["acl", "anterior cruciate"],
  mcl_injury: ["mcl", "medial collateral"],
  meniscus_tear: ["meniscus", "meniscal"],
  fracture: ["fracture", "bone break"],
  osteoarthritis: ["osteoarthritis", "degenerative", "narrowing", "spurring"],
  effusion: ["effusion", "fluid collection"],
};

function fallbackValue(key: FindingKey, correct: FindingValue): FindingValue {
  if (key === "effusion" && correct === "present") {
    return "uncertain";
  }

  if (correct === "present") {
    return "absent";
  }

  return correct;
}
