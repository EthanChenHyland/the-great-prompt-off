import {
  fallbackStatus,
  getSupabaseSubmissionStatus,
  ParticipantValidationError,
} from "@/app/lib/supabase/submission-workflow";
import { verifyParticipantSessionToken } from "@/app/lib/supabase/participant-session-token";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const participantCode = url.searchParams.get("participantCode")?.trim();
  const participantToken = url.searchParams.get("participantToken")?.trim();

  if (!participantCode || !participantToken) {
    return Response.json(
      { error: "participantCode and participantToken query parameters are required." },
      { status: 400 },
    );
  }

  const verifiedSession = verifyParticipantSessionToken(participantToken);

  if (verifiedSession?.participantCode !== participantCode.trim().toUpperCase()) {
    return Response.json(
      { error: "Participant session is invalid. Return home and enter your access code." },
      { status: 401 },
    );
  }

  try {
    return Response.json(await getSupabaseSubmissionStatus(verifiedSession.participantCode));
  } catch (error) {
    if (error instanceof ParticipantValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : String(error);

    return Response.json(fallbackStatus(message));
  }
}
