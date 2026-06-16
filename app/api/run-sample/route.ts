import { getSampleReports } from "@/app/lib/challenge-data";
import {
  evaluateSampleReports,
  summarizeReportResults,
} from "@/app/lib/mock-evaluation";
import {
  extractReportWithOpenRouter,
  getOpenRouterModel,
  shouldUseRealLlm,
} from "@/app/lib/openrouter";
import { scoreModelOutput } from "@/app/lib/scoring";
import type { AnswerKey, FindingKey, FindingValue } from "@/app/lib/types";

export async function POST(request: Request) {
  const body = await request.json();

  if (!isPromptRequest(body)) {
    return Response.json({ error: "Expected prompt string." }, { status: 400 });
  }

  const reports = await getSampleReports();

  if (shouldUseRealLlm()) {
    try {
      const results = await Promise.all(
        reports.map(async (report) => {
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
            error: score.valid_json
              ? null
              : "Model returned invalid JSON or a non-object response.",
          };
        }),
      );

      return Response.json({
        mode: "real_llm",
        model: getOpenRouterModel(),
        results,
        summary: summarizeReportResults(results),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "OpenRouter sample run failed.";

      return Response.json(
        {
          error: message,
          mode: "real_llm",
          model: getOpenRouterModel(),
        },
        { status: 502 },
      );
    }
  }

  const results = evaluateSampleReports(reports, body.prompt);

  return Response.json({
    mode: "mock",
    model: null,
    results,
    summary: summarizeReportResults(results),
  });
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
