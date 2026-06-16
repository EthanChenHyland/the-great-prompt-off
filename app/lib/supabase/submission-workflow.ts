import "server-only";

import { getAnswerKeyItems } from "@/app/lib/challenge-data";
import { normalizeParticipantCode } from "@/app/lib/participant-codes";
import { evaluateAnswerKeySet } from "@/app/lib/mock-evaluation";
import type { AnswerKeyItem, ReportSplit, ScoreSummary, SubmissionKind } from "@/app/lib/types";
import { createSupabaseAdminClient } from "./admin";

type DataSource = "supabase" | "mock-file-fallback";

type ActiveChallenge = {
  id: string;
  locked_model: string;
  public_submission_limit: number;
  final_submission_limit: number;
};

type Participant = {
  id: string;
  participant_code: string;
};

type SubmissionRow = {
  id: string;
  participant_id: string;
  submission_type: SubmissionKind;
  attempt_number: number;
  score: number;
  correct_fields: number;
  total_fields: number;
  report_count: number;
  submitted_at: string;
};

type ReportRow = {
  id: string;
  external_id: string;
  filename: string | null;
  split: ReportSplit;
};

type AnswerKeyRow = {
  report_id: string;
  acl_tear: "present" | "absent" | "uncertain";
  mcl_injury: "present" | "absent" | "uncertain";
  meniscus_tear: "present" | "absent" | "uncertain";
  fracture: "present" | "absent" | "uncertain";
  osteoarthritis: "present" | "absent" | "uncertain";
  effusion: "present" | "absent" | "uncertain";
};

export type SubmissionStatusResponse = {
  source: DataSource;
  fallbackReason: string | null;
  publicSubmissionLimit: number;
  publicSubmissionsUsed: number;
  remainingPublicSubmissions: number;
  latestPublicScore: number | null;
  finalSubmissionUsed: boolean;
  finalScore: number | null;
};

export type SubmitScoreResponse = SubmissionStatusResponse & {
  kind: SubmissionKind;
  score: number;
  correctFields: number;
  totalFields: number;
  reportCount: number;
  summary: ScoreSummary;
};

export type LeaderboardRow = {
  rank: number;
  participant: string;
  score: number;
  final: boolean;
  submittedAt?: string;
};

export type LeaderboardResponse = {
  source: DataSource;
  fallbackReason: string | null;
  rows: LeaderboardRow[];
};

export function fallbackStatus(reason: string): SubmissionStatusResponse {
  return {
    source: "mock-file-fallback",
    fallbackReason: reason,
    publicSubmissionLimit: 5,
    publicSubmissionsUsed: 0,
    remainingPublicSubmissions: 5,
    latestPublicScore: null,
    finalSubmissionUsed: false,
    finalScore: null,
  };
}

export function fallbackLeaderboard(reason: string): LeaderboardResponse {
  return {
    source: "mock-file-fallback",
    fallbackReason: reason,
    rows: [],
  };
}

export async function getSupabaseSubmissionStatus(
  participantCode: string,
): Promise<SubmissionStatusResponse> {
  const supabase = createSupabaseAdminClient();
  const challenge = await getActiveChallenge(supabase);
  const participant = await getParticipantByCode(
    supabase,
    normalizeParticipantCode(participantCode),
  );

  if (!participant) {
    throw new ParticipantValidationError(
      "Participant code not found. Use a seeded workshop code from P001 through P050.",
    );
  }

  return getSubmissionStatusForParticipant(supabase, challenge, participant.id);
}

export async function submitToSupabase({
  kind,
  participantCode,
  prompt,
}: {
  kind: SubmissionKind;
  participantCode: string;
  prompt: string;
}): Promise<SubmitScoreResponse> {
  const supabase = createSupabaseAdminClient();
  const challenge = await getActiveChallenge(supabase);
  const participant = await getParticipantByCode(
    supabase,
    normalizeParticipantCode(participantCode),
  );

  if (!participant) {
    throw new ParticipantValidationError(
      "Participant code not found. Use a seeded workshop code from P001 through P050.",
    );
  }

  const currentStatus = await getSubmissionStatusForParticipant(
    supabase,
    challenge,
    participant.id,
  );

  if (kind === "public" && currentStatus.remainingPublicSubmissions <= 0) {
    throw new SubmissionLimitError("Public submission limit reached.");
  }

  if (kind === "final" && currentStatus.finalSubmissionUsed) {
    throw new SubmissionLimitError("Final submission has already been used.");
  }

  const split: ReportSplit = kind === "public" ? "public" : "private";
  const answerKeys = await getSupabaseAnswerKeysForSplit(supabase, challenge.id, split);
  const summary = evaluateAnswerKeySet(answerKeys, prompt);
  const now = new Date().toISOString();
  const attemptNumber =
    kind === "public" ? currentStatus.publicSubmissionsUsed + 1 : 1;
  const runType = kind === "public" ? "public_submission" : "final_submission";
  const promptText = prompt.trim() ? prompt : "(blank prompt)";

  const { data: promptRun, error: promptRunError } = await supabase
    .from("prompt_runs")
    .insert({
      challenge_id: challenge.id,
      participant_id: participant.id,
      run_type: runType,
      prompt_text: promptText,
      model: challenge.locked_model,
      total_reports: answerKeys.length,
      correct_fields: summary.correct,
      total_fields: summary.total,
      field_accuracy: summary.accuracy,
      overall_score: summary.accuracy,
      completed_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (promptRunError) {
    throw new Error(`Failed to store prompt run: ${promptRunError.message}`);
  }

  const { error: submissionError } = await supabase.from("submissions").insert({
    challenge_id: challenge.id,
    participant_id: participant.id,
    prompt_run_id: promptRun.id,
    submission_type: kind,
    attempt_number: attemptNumber,
    score: summary.accuracy,
    correct_fields: summary.correct,
    total_fields: summary.total,
    report_count: answerKeys.length,
    submitted_at: now,
  });

  if (submissionError) {
    if (kind === "final") {
      throw new SubmissionLimitError("Final submission has already been used.");
    }

    throw new Error(`Failed to store submission: ${submissionError.message}`);
  }

  const nextStatus = await getSubmissionStatusForParticipant(
    supabase,
    challenge,
    participant.id,
  );

  return {
    ...nextStatus,
    kind,
    score: summary.accuracy,
    correctFields: summary.correct,
    totalFields: summary.total,
    reportCount: answerKeys.length,
    summary,
  };
}

export async function getSupabaseLeaderboard(): Promise<LeaderboardResponse> {
  const supabase = createSupabaseAdminClient();
  const challenge = await getActiveChallenge(supabase);
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("participant_id, score, submitted_at")
    .eq("challenge_id", challenge.id)
    .eq("submission_type", "final")
    .order("score", { ascending: false })
    .order("submitted_at", { ascending: true })
    .limit(25)
    .returns<Array<Pick<SubmissionRow, "participant_id" | "score" | "submitted_at">>>();

  if (submissionsError) {
    throw new Error(`Failed to load leaderboard: ${submissionsError.message}`);
  }

  const participantIds = [...new Set(submissions.map((row) => row.participant_id))];
  const participantCodes = await getParticipantCodes(supabase, participantIds);

  return {
    source: "supabase",
    fallbackReason: null,
    rows: submissions.map((submission, index) => ({
      rank: index + 1,
      participant:
        participantCodes.get(submission.participant_id) || submission.participant_id,
      score: Math.round(submission.score),
      final: true,
      submittedAt: submission.submitted_at,
    })),
  };
}

export function getFallbackSubmissionScore(
  kind: SubmissionKind,
  prompt: string,
): Omit<SubmitScoreResponse, keyof SubmissionStatusResponse> {
  const split = kind === "public" ? "public" : "private";
  const answerKeys = getAnswerKeyItems().filter((item) => item.split === split);
  const summary = evaluateAnswerKeySet(answerKeys, prompt);

  return {
    kind,
    score: summary.accuracy,
    correctFields: summary.correct,
    totalFields: summary.total,
    reportCount: answerKeys.length,
    summary,
  };
}

export class SubmissionLimitError extends Error {}

export class ParticipantValidationError extends Error {}

async function getActiveChallenge(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data, error } = await supabase
    .from("challenges")
    .select("id, locked_model, public_submission_limit, final_submission_limit")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single<ActiveChallenge>();

  if (error) {
    throw new Error(`Supabase active challenge unavailable: ${error.message}`);
  }

  return data;
}

async function getParticipantByCode(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  participantCode: string,
) {
  const { data, error } = await supabase
    .from("participants")
    .select("id, participant_code")
    .eq("participant_code", participantCode)
    .maybeSingle<Participant>();

  if (error) {
    throw new Error(`Failed to load participant: ${error.message}`);
  }

  return data;
}

async function getSubmissionStatusForParticipant(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  challenge: ActiveChallenge,
  participantId: string,
): Promise<SubmissionStatusResponse> {
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, participant_id, submission_type, attempt_number, score, correct_fields, total_fields, report_count, submitted_at",
    )
    .eq("challenge_id", challenge.id)
    .eq("participant_id", participantId)
    .order("submitted_at", { ascending: true })
    .returns<SubmissionRow[]>();

  if (error) {
    throw new Error(`Failed to load submissions: ${error.message}`);
  }

  const publicSubmissions = data.filter(
    (submission) => submission.submission_type === "public",
  );
  const finalSubmission =
    data.find((submission) => submission.submission_type === "final") ?? null;
  const latestPublic = publicSubmissions[publicSubmissions.length - 1] ?? null;
  const remainingPublicSubmissions = Math.max(
    0,
    challenge.public_submission_limit - publicSubmissions.length,
  );

  return {
    source: "supabase",
    fallbackReason: null,
    publicSubmissionLimit: challenge.public_submission_limit,
    publicSubmissionsUsed: publicSubmissions.length,
    remainingPublicSubmissions,
    latestPublicScore: latestPublic?.score ?? null,
    finalSubmissionUsed: Boolean(finalSubmission),
    finalScore: finalSubmission?.score ?? null,
  };
}

async function getSupabaseAnswerKeysForSplit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  challengeId: string,
  split: ReportSplit,
) {
  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select("id, external_id, filename, split")
    .eq("challenge_id", challengeId)
    .eq("split", split)
    .order("external_id", { ascending: true })
    .returns<ReportRow[]>();

  if (reportsError) {
    throw new Error(`Failed to load ${split} reports: ${reportsError.message}`);
  }

  if (reports.length === 0) {
    throw new Error(`No ${split} reports are seeded.`);
  }

  const reportIds = reports.map((report) => report.id);
  const { data: answerKeys, error: answerKeysError } = await supabase
    .from("answer_keys")
    .select(
      "report_id, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion",
    )
    .in("report_id", reportIds)
    .returns<AnswerKeyRow[]>();

  if (answerKeysError) {
    throw new Error(`Failed to load ${split} answer keys: ${answerKeysError.message}`);
  }

  const answerKeyByReportId = new Map(
    answerKeys.map((answerKey) => [answerKey.report_id, answerKey]),
  );

  return reports.map((report) => {
    const answerKey = answerKeyByReportId.get(report.id);

    if (!answerKey) {
      throw new Error(`Missing answer key for ${report.external_id}.`);
    }

    return {
      id: report.external_id,
      filename: report.filename || report.external_id,
      split: report.split,
      answer_key: {
        acl_tear: answerKey.acl_tear,
        mcl_injury: answerKey.mcl_injury,
        meniscus_tear: answerKey.meniscus_tear,
        fracture: answerKey.fracture,
        osteoarthritis: answerKey.osteoarthritis,
        effusion: answerKey.effusion,
      },
    } satisfies AnswerKeyItem;
  });
}

async function getParticipantCodes(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  participantIds: string[],
) {
  if (participantIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("participants")
    .select("id, participant_code")
    .in("id", participantIds)
    .returns<Array<{ id: string; participant_code: string }>>();

  if (error) {
    throw new Error(`Failed to load participant codes: ${error.message}`);
  }

  return new Map(data.map((participant) => [participant.id, participant.participant_code]));
}
