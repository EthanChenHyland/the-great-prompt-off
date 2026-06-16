import { getSampleReports } from "@/app/lib/challenge-data";
import {
  evaluateSampleReports,
  summarizeReportResults,
} from "@/app/lib/mock-evaluation";

export async function POST(request: Request) {
  const body = await request.json();

  if (!isPromptRequest(body)) {
    return Response.json({ error: "Expected prompt string." }, { status: 400 });
  }

  const reports = await getSampleReports();
  const results = evaluateSampleReports(reports, body.prompt);

  return Response.json({
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
