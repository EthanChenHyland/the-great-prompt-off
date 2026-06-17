import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { getAdminDashboardData, toCsv } from "@/app/lib/supabase/admin-dashboard";

export async function GET() {
  try {
    await requireAdminSession();
    const data = await getAdminDashboardData();
    const csv = toCsv([
      ["participant_code", "display_name", "email", "access_code", "is_active"],
      ...data.participants.map((participant) => [
        participant.participantCode,
        participant.displayName || "",
        participant.email || "",
        participant.accessCode,
        participant.isActive ? "true" : "false",
      ]),
    ]);

    return new Response(csv, {
      headers: {
        "Content-Disposition": 'attachment; filename="participant-access-codes.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Admin export failed." },
      { status: 401 },
    );
  }
}
