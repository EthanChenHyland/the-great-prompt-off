import "server-only";

import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "./admin";

export type AdminParticipantRow = {
  participantCode: string;
  displayName: string | null;
  email: string | null;
  accessCode: string;
  isActive: boolean;
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
  email: string | null;
  access_code: string | null;
  is_active: boolean;
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
      .select("id, participant_code, display_name, email, access_code, is_active")
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
      email: participant.email,
      accessCode: participant.access_code || "",
      isActive: participant.is_active,
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

export async function regenerateParticipantAccessCode(participantCode: string) {
  const supabase = createSupabaseAdminClient();
  let accessCode = createParticipantAccessCode();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data: existing, error: existingError } = await supabase
      .from("participants")
      .select("id")
      .eq("access_code", accessCode)
      .maybeSingle<{ id: string }>();

    if (existingError) {
      throw new Error(`Failed to check access code uniqueness: ${existingError.message}`);
    }

    if (!existing) {
      break;
    }

    accessCode = createParticipantAccessCode();
  }

  const { error } = await supabase
    .from("participants")
    .update({ access_code: accessCode })
    .eq("participant_code", participantCode);

  if (error) {
    throw new Error(`Failed to regenerate access code: ${error.message}`);
  }

  return accessCode;
}

export async function clearParticipantRunData(participantCode: string) {
  const supabase = createSupabaseAdminClient();
  const participant = await getParticipantByCode(participantCode);

  const { data: runs, error: runsError } = await supabase
    .from("prompt_runs")
    .select("id")
    .eq("participant_id", participant.id)
    .returns<Array<{ id: string }>>();

  if (runsError) {
    throw new Error(`Failed to load participant runs: ${runsError.message}`);
  }

  const runIds = runs.map((run) => run.id);

  if (runIds.length > 0) {
    const { error: runItemsError } = await supabase
      .from("prompt_run_items")
      .delete()
      .in("prompt_run_id", runIds);

    if (runItemsError) {
      throw new Error(`Failed to delete participant run items: ${runItemsError.message}`);
    }
  }

  const { error: submissionsError } = await supabase
    .from("submissions")
    .delete()
    .eq("participant_id", participant.id);

  if (submissionsError) {
    throw new Error(`Failed to delete participant submissions: ${submissionsError.message}`);
  }

  const { error: promptRunsError } = await supabase
    .from("prompt_runs")
    .delete()
    .eq("participant_id", participant.id);

  if (promptRunsError) {
    throw new Error(`Failed to delete participant prompt runs: ${promptRunsError.message}`);
  }
}

export async function setParticipantActive(participantCode: string, isActive: boolean) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("participants")
    .update({ is_active: isActive })
    .eq("participant_code", participantCode);

  if (error) {
    throw new Error(`Failed to update participant status: ${error.message}`);
  }
}

async function getParticipantByCode(participantCode: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("participants")
    .select("id, participant_code")
    .eq("participant_code", participantCode)
    .maybeSingle<{ id: string; participant_code: string }>();

  if (error) {
    throw new Error(`Failed to load participant: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Participant ${participantCode} not found.`);
  }

  return data;
}

function createParticipantAccessCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");

  return `GPO-${code.slice(0, 4)}-${code.slice(4, 8)}`;
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
