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

export async function POST(request: Request) {
  const body = await request.json();

  if (!isPromptRequest(body)) {
    return Response.json({ error: "Expected prompt string." }, { status: 400 });
  }

  const reports = await getSampleReports();

  if (shouldUseRealLlm()) {
    if (!hasOpenRouterApiKey()) {
      return Response.json(
        {
          error: "OPENROUTER_API_KEY is required when USE_REAL_LLM=true.",
          mode: "real_llm",
          model: getOpenRouterModel(),
        },
        { status: 500 },
      );
    }

    const results = await Promise.all(
      reports.map(async (report) => {
        try {
          const modelOutput = await extractReportWithOpenRouter({
            prompt: body.prompt,
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
      results,
      summary: summarizeReportResults(results),
    });
  }

  const results = evaluateSampleReports(reports, body.prompt);

  return Response.json({
    mode: "mock",
    model: null,
    results,
    summary: summarizeReportResults(results),
  });
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
