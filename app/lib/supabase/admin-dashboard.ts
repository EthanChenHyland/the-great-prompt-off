import "server-only";

import { createSupabaseAdminClient } from "./admin";

export type AdminParticipantRow = {
  participantCode: string;
  displayName: string | null;
  accessCode: string;
  testAttemptsUsed: number;
  finalSubmitted: boolean;
  latestTestScore: number | null;
  bestTestScore: number | null;
  finalScore: number | null;
  finalSubmittedAt: string | null;
  finalModelName: string | null;
};

export type AdminDashboardData = {
  overview: {
    totalParticipants: number;
    participantsWithAccessCodes: number;
    testSubmissionsCount: number;
    finalSubmissionsCount: number;
    participantsCompletedFinal: number;
    latestRunTimestamp: string | null;
  };
  participants: AdminParticipantRow[];
  leaderboard: AdminParticipantRow[];
};

type ParticipantRow = {
  id: string;
  participant_code: string;
  display_name: string | null;
  access_code: string | null;
};

type SubmissionRow = {
  participant_id: string;
  submission_type: "public" | "final";
  score: number;
  submitted_at: string;
  prompt_run_id: string;
};

type PromptRunRow = {
  id: string;
  model: string;
  completed_at: string | null;
  created_at: string;
};

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = createSupabaseAdminClient();
  const [participantsResult, submissionsResult, runsResult] = await Promise.all([
    supabase
      .from("participants")
      .select("id, participant_code, display_name, access_code")
      .order("participant_code", { ascending: true })
      .returns<ParticipantRow[]>(),
    supabase
      .from("submissions")
      .select("participant_id, submission_type, score, submitted_at, prompt_run_id")
      .order("submitted_at", { ascending: true })
      .returns<SubmissionRow[]>(),
    supabase
      .from("prompt_runs")
      .select("id, model, completed_at, created_at")
      .order("created_at", { ascending: false })
      .returns<PromptRunRow[]>(),
  ]);

  if (participantsResult.error) {
    throw new Error(`Failed to load participants: ${participantsResult.error.message}`);
  }

  if (submissionsResult.error) {
    throw new Error(`Failed to load submissions: ${submissionsResult.error.message}`);
  }

  if (runsResult.error) {
    throw new Error(`Failed to load prompt runs: ${runsResult.error.message}`);
  }

  const runsById = new Map(runsResult.data.map((run) => [run.id, run]));
  const submissionsByParticipant = new Map<string, SubmissionRow[]>();

  for (const submission of submissionsResult.data) {
    const participantSubmissions =
      submissionsByParticipant.get(submission.participant_id) || [];
    participantSubmissions.push(submission);
    submissionsByParticipant.set(submission.participant_id, participantSubmissions);
  }

  const participants = participantsResult.data.map((participant) => {
    const submissions = submissionsByParticipant.get(participant.id) || [];
    const testSubmissions = submissions.filter(
      (submission) => submission.submission_type === "public",
    );
    const finalSubmission =
      submissions.find((submission) => submission.submission_type === "final") || null;
    const latestTest = testSubmissions[testSubmissions.length - 1] || null;
    const bestTestScore =
      testSubmissions.length > 0
        ? Math.max(...testSubmissions.map((submission) => submission.score))
        : null;
    const finalRun = finalSubmission
      ? runsById.get(finalSubmission.prompt_run_id) || null
      : null;

    return {
      participantCode: participant.participant_code,
      displayName: participant.display_name,
      accessCode: participant.access_code || "",
      testAttemptsUsed: testSubmissions.length,
      finalSubmitted: Boolean(finalSubmission),
      latestTestScore: latestTest?.score ?? null,
      bestTestScore,
      finalScore: finalSubmission?.score ?? null,
      finalSubmittedAt: finalSubmission?.submitted_at ?? null,
      finalModelName: finalRun?.model ?? null,
    };
  });

  const testSubmissionsCount = submissionsResult.data.filter(
    (submission) => submission.submission_type === "public",
  ).length;
  const finalSubmissionsCount = submissionsResult.data.filter(
    (submission) => submission.submission_type === "final",
  ).length;
  const latestRunTimestamp =
    runsResult.data[0]?.completed_at || runsResult.data[0]?.created_at || null;

  return {
    overview: {
      totalParticipants: participants.length,
      participantsWithAccessCodes: participants.filter((participant) =>
        Boolean(participant.accessCode),
      ).length,
      testSubmissionsCount,
      finalSubmissionsCount,
      participantsCompletedFinal: participants.filter(
        (participant) => participant.finalSubmitted,
      ).length,
      latestRunTimestamp,
    },
    participants,
    leaderboard: [...participants].sort((a, b) => {
      const bScore = b.finalScore ?? -1;
      const aScore = a.finalScore ?? -1;

      if (bScore !== aScore) {
        return bScore - aScore;
      }

      return (b.bestTestScore ?? -1) - (a.bestTestScore ?? -1);
    }),
  };
}

export async function resetWorkshopRunData() {
  const supabase = createSupabaseAdminClient();
  const { error: runItemsError } = await supabase
    .from("prompt_run_items")
    .delete()
    .not("id", "is", null);

  if (runItemsError) {
    throw new Error(`Failed to delete prompt run items: ${runItemsError.message}`);
  }

  const { error: submissionsError } = await supabase
    .from("submissions")
    .delete()
    .not("id", "is", null);

  if (submissionsError) {
    throw new Error(`Failed to delete submissions: ${submissionsError.message}`);
  }

  const { error: promptRunsError } = await supabase
    .from("prompt_runs")
    .delete()
    .not("id", "is", null);

  if (promptRunsError) {
    throw new Error(`Failed to delete prompt runs: ${promptRunsError.message}`);
  }
}

export function toCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}
