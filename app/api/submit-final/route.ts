import { getAnswerKeyItems } from "@/app/lib/challenge-data";
import { evaluateAnswerKeySet } from "@/app/lib/mock-evaluation";

export async function POST(request: Request) {
  const body = await request.json();

  if (!isPromptRequest(body)) {
    return Response.json({ error: "Expected prompt string." }, { status: 400 });
  }

  const answerKeys = getAnswerKeyItems().filter((item) => item.split === "private");
  const summary = evaluateAnswerKeySet(answerKeys, body.prompt);

  return Response.json({
    kind: "final",
    score: summary.accuracy,
    correctFields: summary.correct,
    totalFields: summary.total,
    reportCount: answerKeys.length,
    summary,
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
