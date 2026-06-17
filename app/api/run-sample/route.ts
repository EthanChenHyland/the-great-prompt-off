import { getSampleReports } from "@/app/lib/challenge-data";
import {
  evaluateSampleReports,
  summarizeReportResults,
} from "@/app/lib/mock-evaluation";
import {
  extractReportWithOpenRouter,
  getOpenRouterModel,
  hasOpenRouterApiKey,
  shouldUseRealLlm,
} from "@/app/lib/openrouter";
import { scoreModelOutput } from "@/app/lib/scoring";
import type {
  AnswerKey,
  FindingKey,
  FindingValue,
  ScoringResult,
} from "@/app/lib/types";
import { createHash } from "node:crypto";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isPromptRequest(body)) {
    return Response.json({ error: "Expected prompt string." }, { status: 400 });
  }

  const prompt = body.prompt;
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    return Response.json(
      { error: "Enter a prompt before running the sample test." },
      { status: 400 },
    );
  }

  const debug = getPromptDebug(prompt);

  if (process.env.NODE_ENV === "development") {
    console.log("[run-sample] prompt debug", debug);
  }

  const reports = await getSampleReports();

  if (shouldUseRealLlm()) {
    if (!hasOpenRouterApiKey()) {
      return Response.json(
        {
          error: "OPENROUTER_API_KEY is required when USE_REAL_LLM=true.",
          mode: "real_llm",
          model: getOpenRouterModel(),
          debug,
        },
        { status: 500 },
      );
    }

    const results = await Promise.all(
      reports.map(async (report) => {
        try {
          const modelOutput = await extractReportWithOpenRouter({
            prompt,
            reportText: report.text,
          });
          const score = scoreModelOutput(modelOutput, report.answer_key);

          return {
            reportId: report.id,
            prediction: predictionFromScore(score.per_field),
            score,
            modelOutput,
            error: validationMessage(score),
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "OpenRouter sample report evaluation failed.";
          const score = scoreModelOutput("", report.answer_key);

          return {
            reportId: report.id,
            prediction: {},
            score,
            modelOutput: "",
            error: message,
          };
        }
      }),
    );

    return Response.json({
      mode: "real_llm",
      model: getOpenRouterModel(),
      debug,
      results,
      summary: summarizeReportResults(results),
    });
  }

  const results = evaluateSampleReports(reports, prompt);

  return Response.json({
    mode: "mock",
    model: null,
    debug,
    results,
    summary: summarizeReportResults(results),
  });
}

function getPromptDebug(prompt: string) {
  return {
    promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 12),
    promptLength: prompt.length,
    promptPreview:
      prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt,
  };
}

function validationMessage(score: ScoringResult) {
  if (!score.valid_json) {
    return "Model output was not valid JSON.";
  }

  const problems: string[] = [];

  if (score.missing_fields.length > 0) {
    problems.push(`Missing fields: ${score.missing_fields.join(", ")}`);
  }

  if (score.invalid_fields.length > 0) {
    problems.push(
      `Invalid fields: ${score.invalid_fields
        .map((field) => field.field)
        .join(", ")}`,
    );
  }

  return problems.length > 0 ? problems.join(". ") : null;
}

function isPromptRequest(value: unknown): value is { prompt: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "prompt" in value &&
    typeof value.prompt === "string"
  );
}

function predictionFromScore(
  perField: Array<{
    field: FindingKey;
    actual: FindingValue | null;
  }>,
): Partial<AnswerKey> {
  return Object.fromEntries(
    perField
      .filter((field) => field.actual !== null)
      .map((field) => [field.field, field.actual]),
  ) as Partial<AnswerKey>;
}
