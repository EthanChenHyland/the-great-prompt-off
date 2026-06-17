import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { getAdminDashboardData, toCsv } from "@/app/lib/supabase/admin-dashboard";

export async function GET() {
  try {
    await requireAdminSession();
    const data = await getAdminDashboardData();
    const csv = toCsv([
      ["participant_code", "display_name", "access_code"],
      ...data.participants.map((participant) => [
        participant.participantCode,
        participant.displayName || "",
        participant.accessCode,
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
