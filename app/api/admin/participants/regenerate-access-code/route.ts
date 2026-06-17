import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { regenerateParticipantAccessCode } from "@/app/lib/supabase/admin-dashboard";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as {
      participantCode?: unknown;
      confirmation?: unknown;
    } | null;
    const participantCode =
      typeof body?.participantCode === "string" ? body.participantCode.trim() : "";

    if (!participantCode || body?.confirmation !== participantCode) {
      return Response.json(
        { error: "Confirm by typing the participant code." },
        { status: 400 },
      );
    }

    const accessCode = await regenerateParticipantAccessCode(participantCode);

    return Response.json({ ok: true, accessCode });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Regenerate failed." },
      { status: 401 },
    );
  }
}
