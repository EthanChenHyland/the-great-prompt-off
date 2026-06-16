import {
  fallbackStatus,
  getSupabaseSubmissionStatus,
  ParticipantValidationError,
} from "@/app/lib/supabase/submission-workflow";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const participantCode = url.searchParams.get("participantCode")?.trim();

  if (!participantCode) {
    return Response.json(
      { error: "participantCode query parameter is required." },
      { status: 400 },
    );
  }

  try {
    return Response.json(await getSupabaseSubmissionStatus(participantCode));
  } catch (error) {
    if (error instanceof ParticipantValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : String(error);

    return Response.json(fallbackStatus(message));
  }
}
