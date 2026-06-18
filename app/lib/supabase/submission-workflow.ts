import "server-only";

import { fallbackChallengeConfig } from "@/app/lib/challenge-config";
import { getAnswerKeyItems } from "@/app/lib/challenge-data";
import type { EventPhase } from "@/app/lib/event-phase";
import {
  canShowParticipantLeaderboard,
  type LeaderboardVisibility,
} from "@/app/lib/leaderboard-visibility";
import {
  extractReportWithOpenRouter,
  getOpenRouterConcurrency,
  getOpenRouterModel,
  hasOpenRouterApiKey,
  shouldUseRealLlm,
} from "@/app/lib/openrouter";
import { normalizeParticipantCode } from "@/app/lib/participant-codes";
import {
  countCorrectFields,
  evaluateAnswerKeyReports,
  evaluateAnswerKeySet,
  summarizeReportResults,
} from "@/app/lib/mock-evaluation";
import { scoreModelOutput } from "@/app/lib/scoring";
import type {
  AnswerKey,
  AnswerKeyItem,
  FindingKey,
  FindingValue,
  ReportSplit,
  ScoreSummary,
  ScoringResult,
  SubmissionKind,
} from "@/app/lib/types";
import { createSupabaseAdminClient } from "./admin";

type DataSource = "supabase" | "mock-file-fallback";

type ActiveChallenge = {
  id: string;
  locked_model: string;
  public_submission_limit: number;
  final_submission_limit: number;
  event_phase: EventPhase;
  leaderboard_visibility: LeaderboardVisibility;
};

type Participant = {
  id: string;
  participant_code: string;
  is_active: boolean;
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
  report_text: string;
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

type SupabaseErrorLike = {
  code?: string;
  message: string;
};

export type SubmissionStatusResponse = {
  source: DataSource;
  fallbackReason: string | null;
  publicSubmissionLimit: number;
  extraPublicAttempts: number;
  publicSubmissionsUsed: number;
  remainingPublicSubmissions: number;
  latestPublicScore: number | null;
  finalSubmissionUsed: boolean;
  finalScore: number | null;
};

export type SubmitScoreResponse = SubmissionStatusResponse & {
  kind: SubmissionKind;
  evaluationMode: "mock" | "real_llm";
  model: string | null;
  score: number;
  correctFields: number;
  totalFields: number;
  reportCount: number;
  summary: ScoreSummary;
  feedback?: SafeSubmissionFeedback;
};

export type SafeSubmissionFeedback = {
  kind: SubmissionKind;
  score: number;
  correctFields: number;
  totalFields: number;
  reportCount: number;
  validJsonCount?: number;
  missingFieldsCount?: number;
  invalidValuesCount?: number;
  reportScores?: Array<{
    reportLabel: string;
    correctFields: number;
    totalFields: number;
  }>;
  reportDetails?: Array<{
    reportLabel: string;
    filename: string;
    correctFields: number;
    totalFields: number;
    strictJsonValid: boolean;
    recoveredJsonUsed: boolean;
    nestedObjectUsed: boolean;
    normalizationUsed: boolean;
    keyNormalizationUsed: boolean;
    valueNormalizationUsed: boolean;
    ignoredOuterKey: string | null;
    missingFields: string[];
    invalidFields: Array<{
      field: string;
      value: unknown;
    }>;
    ignoredExtraFields: string[];
    rawModelOutput: string;
  }>;
};

type EvaluatedReport = {
  reportId: string;
  filename?: string;
  supabaseReportId?: string;
  prediction: Partial<AnswerKey>;
  score: ScoringResult;
  modelOutput: string;
  error: string | null;
};

type EvaluationResult = {
  mode: "mock" | "real_llm";
  model: string | null;
  summary: ScoreSummary;
  reportCount: number;
  items: EvaluatedReport[];
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
  visible: boolean;
  rows: LeaderboardRow[];
};

export function fallbackStatus(reason: string): SubmissionStatusResponse {
  return {
    source: "mock-file-fallback",
    fallbackReason: reason,
    publicSubmissionLimit: fallbackChallengeConfig.publicSubmissionLimit,
    extraPublicAttempts: 0,
    publicSubmissionsUsed: 0,
    remainingPublicSubmissions: fallbackChallengeConfig.publicSubmissionLimit,
    latestPublicScore: null,
    finalSubmissionUsed: false,
    finalScore: null,
  };
}

export function fallbackLeaderboard(reason: string): LeaderboardResponse {
  return {
    source: "mock-file-fallback",
    fallbackReason: reason,
    visible: process.env.ALLOW_LOCAL_FALLBACK === "true",
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
      "Participant session is valid, but the participant is not registered.",
    );
  }

  if (!participant.is_active) {
    throw new ParticipantValidationError("This participant is inactive.");
  }

  return getSubmissionStatusForParticipant(
    supabase,
    challenge,
    participant.id,
    participant.participant_code,
  );
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
      "Participant session is valid, but the participant is not registered.",
    );
  }

  if (!participant.is_active) {
    throw new ParticipantValidationError("This participant is inactive.");
  }

  const currentStatus = await getSubmissionStatusForParticipant(
    supabase,
    challenge,
    participant.id,
    participant.participant_code,
  );

  if (kind === "public" && challenge.event_phase !== "practice_open") {
    throw new EventPhaseError("Test Attempts are not open right now.");
  }

  if (kind === "final" && challenge.event_phase !== "final_open") {
    throw new EventPhaseError("Final Submission is not open right now.");
  }

  if (kind === "public" && currentStatus.remainingPublicSubmissions <= 0) {
    throw new SubmissionLimitError("Public submission limit reached.");
  }

  if (kind === "final" && currentStatus.finalSubmissionUsed) {
    throw new SubmissionLimitError("Final submission has already been used.");
  }

  const split: ReportSplit = kind === "public" ? "public" : "private";
  const answerKeys = await getSupabaseAnswerKeysForSplit(supabase, challenge.id, split);
  const evaluation = await evaluateSubmission({
    answerKeys,
    kind,
    prompt,
  });
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
      model:
        evaluation.model ||
        (evaluation.mode === "mock" ? "mock-evaluator" : challenge.locked_model),
      total_reports: evaluation.reportCount,
      correct_fields: evaluation.summary.correct,
      total_fields: evaluation.summary.total,
      field_accuracy: evaluation.summary.accuracy,
      overall_score: evaluation.summary.accuracy,
      completed_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (promptRunError) {
    throw new SubmissionStorageError(
      `Your ${kind === "final" ? "final submission" : "test attempt"} was not counted. Please try again or contact the organizer.`,
      promptRunError.message,
    );
  }

  if (evaluation.items.length > 0) {
    const { error: runItemsError } = await supabase
      .from("prompt_run_items")
      .insert(
        evaluation.items.map((item) => ({
          prompt_run_id: promptRun.id,
          report_id: item.supabaseReportId,
          raw_model_output: item.modelOutput,
          parsed_output: parseJsonObject(item.modelOutput),
          valid_json: item.score.valid_json,
          missing_fields: item.score.missing_fields,
          invalid_fields: item.score.invalid_fields,
          field_accuracy: item.score.field_accuracy,
          overall_score: item.score.overall_score,
          acl_tear: item.prediction.acl_tear ?? null,
          mcl_injury: item.prediction.mcl_injury ?? null,
          meniscus_tear: item.prediction.meniscus_tear ?? null,
          fracture: item.prediction.fracture ?? null,
          osteoarthritis: item.prediction.osteoarthritis ?? null,
          effusion: item.prediction.effusion ?? null,
          error_message: item.error,
        })),
      );

    if (runItemsError) {
      await cleanupPromptRun(supabase, promptRun.id);
      throw new SubmissionStorageError(
        `Your ${kind === "final" ? "final submission" : "test attempt"} was not counted. Please try again or contact the organizer.`,
        runItemsError.message,
      );
    }
  }

  const { error: submissionError } = await supabase.from("submissions").insert({
    challenge_id: challenge.id,
    participant_id: participant.id,
    prompt_run_id: promptRun.id,
    submission_type: kind,
    attempt_number: attemptNumber,
    score: evaluation.summary.accuracy,
    correct_fields: evaluation.summary.correct,
    total_fields: evaluation.summary.total,
    report_count: evaluation.reportCount,
    submitted_at: now,
  });

  if (submissionError) {
    await cleanupPromptRun(supabase, promptRun.id);

    if (kind === "final" && isDuplicateSubmissionError(submissionError)) {
      throw new SubmissionLimitError("Final submission has already been used.");
    }

    throw new SubmissionStorageError(
      `Your ${kind === "final" ? "final submission" : "test attempt"} was not counted. Please try again or contact the organizer.`,
      submissionError.message,
    );
  }

  const nextStatus = await getSubmissionStatusForParticipant(
    supabase,
    challenge,
    participant.id,
    participant.participant_code,
  );

  return {
    ...nextStatus,
    kind,
    evaluationMode: evaluation.mode,
    model: evaluation.model,
    score: evaluation.summary.accuracy,
    correctFields: evaluation.summary.correct,
    totalFields: evaluation.summary.total,
    reportCount: evaluation.reportCount,
    summary: evaluation.summary,
    feedback: createSafeFeedback(kind, evaluation),
  };
}

export async function getSupabaseLeaderboard(): Promise<LeaderboardResponse> {
  const supabase = createSupabaseAdminClient();
  const challenge = await getActiveChallenge(supabase);

  if (
    !canShowParticipantLeaderboard({
      eventPhase: challenge.event_phase,
      visibility: challenge.leaderboard_visibility,
    })
  ) {
    return {
      source: "supabase",
      fallbackReason: null,
      visible: false,
      rows: [],
    };
  }

  if (challenge.event_phase === "not_started") {
    return {
      source: "supabase",
      fallbackReason: null,
      visible: true,
      rows: [],
    };
  }

  const submissionType: SubmissionKind =
    challenge.event_phase === "practice_open" ? "public" : "final";
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("participant_id, score, submitted_at")
    .eq("challenge_id", challenge.id)
    .eq("submission_type", submissionType)
    .order("score", { ascending: false })
    .order("submitted_at", { ascending: true })
    .returns<Array<Pick<SubmissionRow, "participant_id" | "score" | "submitted_at">>>();

  if (submissionsError) {
    throw new Error(`Failed to load leaderboard: ${submissionsError.message}`);
  }

  const leaderboardSubmissions =
    submissionType === "public"
      ? getBestPublicLeaderboardSubmissions(submissions)
      : submissions.slice(0, 25);
  const participantIds = [
    ...new Set(leaderboardSubmissions.map((row) => row.participant_id)),
  ];
  const participantCodes = await getParticipantCodes(supabase, participantIds);

  return {
    source: "supabase",
    fallbackReason: null,
    visible: true,
    rows: leaderboardSubmissions.map((submission, index) => ({
      rank: index + 1,
      participant:
        participantCodes.get(submission.participant_id) || submission.participant_id,
      score: Math.round(submission.score),
      final: submissionType === "final",
      submittedAt: submission.submitted_at,
    })),
  };
}

function getBestPublicLeaderboardSubmissions(
  submissions: Array<Pick<SubmissionRow, "participant_id" | "score" | "submitted_at">>,
) {
  const bestByParticipant = new Map<
    string,
    Pick<SubmissionRow, "participant_id" | "score" | "submitted_at">
  >();

  for (const submission of submissions) {
    const currentBest = bestByParticipant.get(submission.participant_id);

    if (
      !currentBest ||
      submission.score > currentBest.score ||
      (submission.score === currentBest.score &&
        submission.submitted_at < currentBest.submitted_at)
    ) {
      bestByParticipant.set(submission.participant_id, submission);
    }
  }

  return [...bestByParticipant.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.submitted_at.localeCompare(right.submitted_at),
    )
    .slice(0, 25);
}

export function getFallbackSubmissionScore(
  kind: SubmissionKind,
  prompt: string,
): Omit<SubmitScoreResponse, keyof SubmissionStatusResponse> {
  const split = kind === "public" ? "public" : "private";
  const answerKeys = getAnswerKeyItems().filter((item) => item.split === split);
  const items = evaluateAnswerKeyReports(answerKeys, prompt).map((item) => ({
    ...item,
    filename: answerKeys.find((answerKey) => answerKey.id === item.reportId)
      ?.filename,
    modelOutput: item.modelOutput ?? "",
    error: item.error ?? null,
  }));
  const summary =
    kind === "public" || kind === "final"
      ? summarizeReportResults(items)
      : evaluateAnswerKeySet(answerKeys, prompt);
  const evaluation: EvaluationResult = {
    mode: "mock",
    model: null,
    summary,
    reportCount: answerKeys.length,
    items,
  };

  return {
    kind,
    evaluationMode: "mock",
    model: null,
    score: summary.accuracy,
    correctFields: summary.correct,
    totalFields: summary.total,
    reportCount: answerKeys.length,
    summary,
    feedback: createSafeFeedback(kind, evaluation),
  };
}

export class SubmissionLimitError extends Error {}

export class ParticipantValidationError extends Error {}

export class RealLlmEvaluationError extends Error {}

export class EventPhaseError extends Error {}

export class SubmissionStorageError extends Error {
  constructor(message: string, public readonly detail: string) {
    super(message);
  }
}

async function evaluateSubmission({
  answerKeys,
  kind,
  prompt,
}: {
  answerKeys: Array<AnswerKeyItem & { supabaseReportId?: string; text?: string }>;
  kind: SubmissionKind;
  prompt: string;
}): Promise<EvaluationResult> {
  if (shouldUseRealLlm()) {
    return evaluateWithRealLlm(answerKeys, prompt, kind);
  }

  if (kind === "public" || kind === "final") {
    const items = evaluateAnswerKeyReports(answerKeys, prompt).map((item) => ({
      ...item,
      filename: answerKeys.find((answerKey) => answerKey.id === item.reportId)
        ?.filename,
      supabaseReportId: answerKeys.find((answerKey) => answerKey.id === item.reportId)
        ?.supabaseReportId,
      modelOutput: item.modelOutput ?? "",
      error: item.error ?? null,
    }));

    return {
      mode: "mock",
      model: null,
      summary: summarizeReportResults(items),
      reportCount: answerKeys.length,
      items,
    };
  }

  const summary = evaluateAnswerKeySet(answerKeys, prompt);

  return {
    mode: "mock",
    model: null,
    summary,
    reportCount: answerKeys.length,
    items: [],
  };
}

async function evaluateWithRealLlm(
  answerKeys: Array<AnswerKeyItem & { supabaseReportId?: string; text?: string }>,
  prompt: string,
  kind: SubmissionKind,
): Promise<EvaluationResult> {
  if (!hasOpenRouterApiKey()) {
    throw new RealLlmEvaluationError(
      `OPENROUTER_API_KEY is required when USE_REAL_LLM=true. ${submissionLabel(kind)} was not counted.`,
    );
  }

  const model = getOpenRouterModel();
  const concurrency = getOpenRouterConcurrency();

  try {
    // Final submissions can evaluate many private reports. Limit OpenRouter
    // fan-out so one participant submission is less likely to hit rate limits.
    const items = await mapWithConcurrency(
      answerKeys,
      concurrency,
      async (item) => {
        if (!item.text) {
          throw new Error(`Missing report text for ${item.id}.`);
        }

        const modelOutput = await extractReportWithOpenRouter({
          prompt,
          reportText: item.text,
        });
        const score = scoreModelOutput(modelOutput, item.answer_key);

        return {
          reportId: item.id,
          filename: item.filename,
          supabaseReportId: item.supabaseReportId,
          prediction: predictionFromScore(score.per_field),
          score,
          modelOutput,
          error: validationMessage(score),
        };
      },
    );

    return {
      mode: "real_llm",
      model,
      summary: summarizeReportResults(items),
      reportCount: answerKeys.length,
      items,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new RealLlmEvaluationError(
      `Real ${submissionLabel(kind).toLowerCase()} evaluation failed before completion: ${message}. ${submissionLabel(kind)} was not counted.`,
    );
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  const workerCount = Math.min(concurrency, values.length);

  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}

async function getActiveChallenge(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data, error } = await supabase
    .from("challenges")
    .select(
      "id, locked_model, public_submission_limit, final_submission_limit, event_phase, leaderboard_visibility",
    )
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
    .select("id, participant_code, is_active")
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
  participantCode: string,
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
  const extraPublicAttempts = await getExtraPublicAttempts(supabase, participantCode);
  const publicSubmissionLimit =
    challenge.public_submission_limit + extraPublicAttempts;
  const remainingPublicSubmissions = Math.max(
    0,
    publicSubmissionLimit - publicSubmissions.length,
  );

  return {
    source: "supabase",
    fallbackReason: null,
    publicSubmissionLimit,
    extraPublicAttempts,
    publicSubmissionsUsed: publicSubmissions.length,
    remainingPublicSubmissions,
    latestPublicScore: latestPublic?.score ?? null,
    finalSubmissionUsed: Boolean(finalSubmission),
    finalScore: finalSubmission?.score ?? null,
  };
}

async function getExtraPublicAttempts(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  participantCode: string,
) {
  const { data, error } = await supabase
    .from("participant_attempt_overrides")
    .select("extra_public_attempts")
    .eq("participant_code", participantCode)
    .maybeSingle<{ extra_public_attempts: number }>();

  if (error) {
    throw new Error(`Failed to load participant attempt overrides: ${error.message}`);
  }

  return data?.extra_public_attempts ?? 0;
}

async function getSupabaseAnswerKeysForSplit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  challengeId: string,
  split: ReportSplit,
) {
  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select("id, external_id, filename, split, report_text")
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
      supabaseReportId: report.id,
      filename: report.filename || report.external_id,
      split: report.split,
      text: report.report_text,
      answer_key: {
        acl_tear: answerKey.acl_tear,
        mcl_injury: answerKey.mcl_injury,
        meniscus_tear: answerKey.meniscus_tear,
        fracture: answerKey.fracture,
        osteoarthritis: answerKey.osteoarthritis,
        effusion: answerKey.effusion,
      },
    } satisfies AnswerKeyItem & { supabaseReportId: string; text: string };
  });
}

function validationMessage(score: ScoringResult) {
  if (!score.valid_json) {
    return "Model output was not valid JSON.";
  }

  const problems: string[] = [];

  if (score.missing_fields.length > 0) {
    problems.push(`Missing fields: ${score.missing_fields.join(", ")}`);
  }

  if (score.invalid_fields.length > 0) {
    problems.push(
      `Invalid fields: ${score.invalid_fields
        .map((field) => field.field)
        .join(", ")}`,
    );
  }

  return problems.length > 0 ? problems.join(". ") : null;
}

function createSafeFeedback(
  kind: SubmissionKind,
  evaluation: EvaluationResult,
): SafeSubmissionFeedback {
  const feedback: SafeSubmissionFeedback = {
    kind,
    score: evaluation.summary.accuracy,
    correctFields: evaluation.summary.correct,
    totalFields: evaluation.summary.total,
    reportCount: evaluation.reportCount,
  };

  const items = evaluation.items;

  const aggregateFeedback = {
    ...feedback,
    validJsonCount: items.filter((item) => item.score.valid_json).length,
    missingFieldsCount: items.reduce(
      (sum, item) => sum + item.score.missing_fields.length,
      0,
    ),
    invalidValuesCount: items.reduce(
      (sum, item) => sum + item.score.invalid_fields.length,
      0,
    ),
  };

  if (kind !== "public") {
    return aggregateFeedback;
  }

  return {
    ...aggregateFeedback,
    reportScores: items.map((item, index) => ({
      reportLabel: reportLabel(item.reportId, index),
      correctFields: countCorrectFields(item.score),
      totalFields: item.score.per_field.length,
    })),
    reportDetails: items.map((item, index) => ({
      reportLabel: reportLabel(item.reportId, index),
      filename: item.filename || item.reportId,
      correctFields: countCorrectFields(item.score),
      totalFields: item.score.per_field.length,
      strictJsonValid: item.score.diagnostics.strict_json_valid,
      recoveredJsonUsed: item.score.diagnostics.recovered_json_used,
      nestedObjectUsed: item.score.diagnostics.nested_object_used,
      normalizationUsed: item.score.diagnostics.normalization_used,
      keyNormalizationUsed: item.score.diagnostics.key_normalization_used,
      valueNormalizationUsed: item.score.diagnostics.value_normalization_used,
      ignoredOuterKey: item.score.diagnostics.ignored_outer_key,
      missingFields: item.score.missing_fields,
      invalidFields: item.score.invalid_fields,
      ignoredExtraFields: item.score.diagnostics.ignored_extra_fields,
      rawModelOutput: item.modelOutput,
    })),
  };
}

function reportLabel(reportId: string, index: number) {
  const match = reportId.match(/(\d{3})$/);
  return `Report ${match?.[1] ?? String(index + 1).padStart(3, "0")}`;
}

function submissionLabel(kind: SubmissionKind) {
  return kind === "final" ? "Final submission" : "Public attempt";
}

function predictionFromScore(
  perField: Array<{
    field: FindingKey;
    actual: FindingValue | null;
  }>,
): Partial<AnswerKey> {
  return Object.fromEntries(
    perField
      .filter((field) => field.actual !== null)
      .map((field) => [field.field, field.actual]),
  ) as Partial<AnswerKey>;
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function isDuplicateSubmissionError(error: SupabaseErrorLike) {
  return (
    error.code === "23505" ||
    error.message.toLowerCase().includes("duplicate key") ||
    error.message.toLowerCase().includes("unique")
  );
}

async function cleanupPromptRun(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  promptRunId: string,
) {
  const { error: itemsError } = await supabase
    .from("prompt_run_items")
    .delete()
    .eq("prompt_run_id", promptRunId);

  if (itemsError) {
    console.error("[submission-workflow] Failed to clean prompt run items", {
      promptRunId,
      error: itemsError.message,
    });
  }

  const { error: runError } = await supabase
    .from("prompt_runs")
    .delete()
    .eq("id", promptRunId);

  if (runError) {
    console.error("[submission-workflow] Failed to clean prompt run", {
      promptRunId,
      error: runError.message,
    });
  }
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
