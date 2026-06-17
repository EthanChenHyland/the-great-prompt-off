import {
  validateParticipantAccessCode,
  validateParticipantSession,
} from "@/app/lib/supabase/participant-validation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessCode = url.searchParams.get("accessCode") ?? "";
  const participantCode = url.searchParams.get("participantCode") ?? "";
  const participantToken = url.searchParams.get("participantToken") ?? "";

  if (participantCode && participantToken) {
    return Response.json(
      await validateParticipantSession(participantCode, participantToken),
    );
  }

  return Response.json(await validateParticipantAccessCode(accessCode));
}
