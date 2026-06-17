import {
  fallbackStatus,
  getFallbackSubmissionScore,
  ParticipantValidationError,
  SubmissionLimitError,
  submitToSupabase,
} from "@/app/lib/supabase/submission-workflow";
import type { SubmitScoreResponse } from "@/app/lib/supabase/submission-workflow";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isSubmissionRequest(body)) {
    return Response.json(
      { error: "Expected participantCode and prompt strings." },
      { status: 400 },
    );
  }

  try {
    const result = await submitToSupabase({
      kind: "final",
      participantCode: body.participantCode.trim(),
      prompt: body.prompt,
    });

    return Response.json(toFinalClientResponse(result));
  } catch (error) {
    if (error instanceof SubmissionLimitError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof ParticipantValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      toFinalClientResponse({
        ...fallbackStatus(message),
        ...getFallbackSubmissionScore("final", body.prompt),
      }),
    );
  }
}

function toFinalClientResponse(result: SubmitScoreResponse) {
  return {
    source: result.source,
    fallbackReason: result.fallbackReason,
    publicSubmissionLimit: result.publicSubmissionLimit,
    publicSubmissionsUsed: result.publicSubmissionsUsed,
    remainingPublicSubmissions: result.remainingPublicSubmissions,
    latestPublicScore: result.latestPublicScore,
    finalSubmissionUsed: result.finalSubmissionUsed,
    finalScore: result.finalScore,
    kind: result.kind,
    evaluationMode: result.evaluationMode,
    model: result.model,
    score: result.score,
  };
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
