import {
  fallbackStatus,
  getFallbackSubmissionScore,
  SubmissionLimitError,
  submitToSupabase,
} from "@/app/lib/supabase/submission-workflow";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isSubmissionRequest(body)) {
    return Response.json(
      { error: "Expected participantCode and prompt strings." },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await submitToSupabase({
        kind: "public",
        participantCode: body.participantCode.trim(),
        prompt: body.prompt,
      }),
    );
  } catch (error) {
    if (error instanceof SubmissionLimitError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : String(error);

    return Response.json({
      ...fallbackStatus(message),
      ...getFallbackSubmissionScore("public", body.prompt),
    });
  }
}

function isSubmissionRequest(
  value: unknown,
): value is { participantCode: string; prompt: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "participantCode" in value &&
    "prompt" in value &&
    typeof value.participantCode === "string" &&
    value.participantCode.trim().length > 0 &&
    typeof value.prompt === "string"
  );
}
