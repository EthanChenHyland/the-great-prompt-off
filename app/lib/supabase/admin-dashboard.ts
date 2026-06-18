import "server-only";

import { randomBytes } from "node:crypto";
import { isEventPhase, type EventPhase } from "@/app/lib/event-phase";
import {
  isLeaderboardVisibility,
  type LeaderboardVisibility,
} from "@/app/lib/leaderboard-visibility";
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
    eventPhase: EventPhase;
    leaderboardVisibility: LeaderboardVisibility;
  };
  health: {
    supabaseConnected: boolean;
    useRealLlm: boolean;
    openRouterModel: string;
    reportCounts: {
      public: number;
      private: number;
    };
    participantCount: number;
    testSubmissionsCount: number;
    finalSubmissionsCount: number;
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

type ReportCountRow = {
  split: "sample" | "public" | "private";
};

type ChallengeControlRow = {
  id: string;
  event_phase: EventPhase;
  leaderboard_visibility: LeaderboardVisibility;
};

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = createSupabaseAdminClient();
  const [
    challengeResult,
    participantsResult,
    submissionsResult,
    runsResult,
    reportsResult,
  ] =
    await Promise.all([
    supabase
      .from("challenges")
      .select("id, event_phase, leaderboard_visibility")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single<ChallengeControlRow>(),
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
    supabase.from("reports").select("split").returns<ReportCountRow[]>(),
  ]);

  if (challengeResult.error) {
    throw new Error(`Failed to load active challenge: ${challengeResult.error.message}`);
  }

  if (participantsResult.error) {
    throw new Error(`Failed to load participants: ${participantsResult.error.message}`);
  }

  if (submissionsResult.error) {
    throw new Error(`Failed to load submissions: ${submissionsResult.error.message}`);
  }

  if (runsResult.error) {
    throw new Error(`Failed to load prompt runs: ${runsResult.error.message}`);
  }

  if (reportsResult.error) {
    throw new Error(`Failed to load report counts: ${reportsResult.error.message}`);
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
  const reportCounts = reportsResult.data.reduce(
    (counts, report) => ({
      ...counts,
      [report.split]: (counts[report.split] || 0) + 1,
    }),
    { sample: 0, public: 0, private: 0 } as Record<ReportCountRow["split"], number>,
  );

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
      eventPhase: challengeResult.data.event_phase,
      leaderboardVisibility: challengeResult.data.leaderboard_visibility,
    },
    health: {
      supabaseConnected: true,
      useRealLlm: process.env.USE_REAL_LLM === "true",
      openRouterModel:
        process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001",
      reportCounts: {
        public: reportCounts.public,
        private: reportCounts.private,
      },
      participantCount: participants.length,
      testSubmissionsCount,
      finalSubmissionsCount,
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

export async function updateActiveChallengePhase(phase: EventPhase) {
  if (!isEventPhase(phase)) {
    throw new Error("Invalid event phase.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("challenges")
    .update({ event_phase: phase })
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to update event phase: ${error.message}`);
  }
}

export async function updateActiveChallengeLeaderboardVisibility(
  visibility: LeaderboardVisibility,
) {
  if (!isLeaderboardVisibility(visibility)) {
    throw new Error("Invalid leaderboard visibility.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("challenges")
    .update({ leaderboard_visibility: visibility })
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to update leaderboard visibility: ${error.message}`);
  }
}

export async function resetWorkshopRunData() {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("admin_reset_workshop_run_data");

  if (error) {
    throw new Error(`Failed to reset workshop run data: ${adminRpcError(error.message)}`);
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
  const { error } = await supabase.rpc("admin_clear_participant_run_data", {
    target_participant_code: participantCode,
  });

  if (error) {
    throw new Error(`Failed to clear participant run data: ${adminRpcError(error.message)}`);
  }
}

function adminRpcError(message: string) {
  if (
    message.toLowerCase().includes("admin_reset_workshop_run_data") ||
    message.toLowerCase().includes("admin_clear_participant_run_data") ||
    message.toLowerCase().includes("function") ||
    message.toLowerCase().includes("where clause")
  ) {
    return `${message}. Run the latest supabase/admin-atomic-clears.sql in this Supabase project.`;
  }

  return message;
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

export async function updateParticipantIdentity({
  displayName,
  email,
  participantCode,
}: {
  displayName: string | null;
  email: string | null;
  participantCode: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("participants")
    .update({
      display_name: displayName,
      email,
    })
    .eq("participant_code", participantCode);

  if (error) {
    throw new Error(`Failed to update participant identity: ${error.message}`);
  }
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
