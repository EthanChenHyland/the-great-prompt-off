import { validateParticipantCode } from "@/app/lib/supabase/participant-validation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const participantCode = url.searchParams.get("participantCode") ?? "";

  return Response.json(await validateParticipantCode(participantCode));
}
