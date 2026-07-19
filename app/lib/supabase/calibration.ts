import "server-only";

import {
  extractReportWithOpenRouter,
  getOpenRouterConcurrency,
  getOpenRouterModel,
  hasOpenRouterApiKey,
  resolveOpenRouterModel,
  shouldUseRealLlm,
} from "@/app/lib/openrouter";
import { scoreModelOutput } from "@/app/lib/scoring";
import { countCorrectFields } from "@/app/lib/mock-evaluation";
import type { AnswerKeyItem, ScoringResult } from "@/app/lib/types";
import {
  getActiveChallenge,
  getSupabaseAnswerKeysForSplit,
} from "./submission-workflow";
import { createSupabaseAdminClient } from "./admin";

export const calibrationBaselines = [
  { id: "blank", label: "Blank prompt", prompt: "" },
  { id: "nonsense", label: "Nonsense prompt", prompt: "asdf qwer banana" },
  {
    id: "generic",
    label: "Generic prompt",
    prompt: "Extract the requested findings from the report.",
  },
  {
    id: "basic-clinical",
    label: "Basic clinical prompt",
    prompt:
      "Read the knee MRI report and determine whether each requested finding is present, absent, uncertain, or not reported.",
  },
] as const;

type CalibrationReport = AnswerKeyItem & {
  supabaseReportId?: string;
  text: string;
};

export type CalibrationResult = {
  model: string;
  modelSource: "challenge_override" | "environment_fallback";
  environmentModel: string;
  challengeModel: string | null;
  reportCount: number;
  baselines: Array<{
    id: string;
    label: string;
    score: number;
    correctFields: number;
    totalFields: number;
    reportScores: number[];
  }>;
};

export async function runBaselineCalibration(): Promise<CalibrationResult> {
  if (!shouldUseRealLlm()) {
    throw new Error("USE_REAL_LLM must be true to run baseline calibration.");
  }

  if (!hasOpenRouterApiKey()) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const supabase = createSupabaseAdminClient();
  const challenge = await getActiveChallenge(supabase);
  const reports = (await getSupabaseAnswerKeysForSplit(
    supabase,
    challenge.id,
    "public",
  )) as CalibrationReport[];
  const model = resolveOpenRouterModel(challenge.evaluation_model);

  const baselines = [];

  for (const baseline of calibrationBaselines) {
    const evaluated = await mapWithConcurrency(
      reports,
      getOpenRouterConcurrency(),
      async (report) => {
        const modelOutput = await extractReportWithOpenRouter({
          prompt: baseline.prompt,
          reportText: report.text,
          model,
        });
        return scoreModelOutput(modelOutput, report.answer_key);
      },
    );

    baselines.push(summarizeBaseline(baseline.id, baseline.label, evaluated));
  }

  return {
    model,
    modelSource: challenge.evaluation_model
      ? "challenge_override"
      : "environment_fallback",
    environmentModel: getOpenRouterModel(),
    challengeModel: challenge.evaluation_model,
    reportCount: reports.length,
    baselines,
  };
}

function summarizeBaseline(
  id: string,
  label: string,
  scores: ScoringResult[],
) {
  const totalFields = scores.reduce(
    (total, score) => total + score.per_field.length,
    0,
  );
  const correctFields = scores.reduce(
    (total, score) => total + countCorrectFields(score),
    0,
  );

  return {
    id,
    label,
    score: totalFields === 0 ? 0 : (correctFields / totalFields) * 100,
    correctFields,
    totalFields,
    reportScores: scores.map((score) => countCorrectFields(score)),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}
