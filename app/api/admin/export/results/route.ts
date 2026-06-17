import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { getAdminDashboardData, toCsv } from "@/app/lib/supabase/admin-dashboard";

export async function GET() {
  try {
    await requireAdminSession();
    const data = await getAdminDashboardData();
    const csv = toCsv([
      [
        "participant_code",
        "test_attempts_used",
        "latest_test_score",
        "best_test_score",
        "final_score",
        "final_submitted_at",
        "final_model_name",
      ],
      ...data.participants.map((participant) => [
        participant.participantCode,
        String(participant.testAttemptsUsed),
        scoreCell(participant.latestTestScore),
        scoreCell(participant.bestTestScore),
        scoreCell(participant.finalScore),
        participant.finalSubmittedAt || "",
        participant.finalModelName || "",
      ]),
    ]);

    return new Response(csv, {
      headers: {
        "Content-Disposition": 'attachment; filename="workshop-results.csv"',
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

function scoreCell(score: number | null) {
  return score === null ? "" : String(Math.round(score));
}
