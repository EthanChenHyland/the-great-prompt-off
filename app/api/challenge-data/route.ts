import manifest from "@/data/mock-report-manifest.json";
import answerKeys from "@/data/mock-answer-keys.json";
import { createSupabaseAdminClient } from "@/app/lib/supabase/admin";
import { fallbackChallengeConfig } from "@/app/lib/challenge-config";
import { challenge as mockChallenge } from "@/app/lib/challenge-constants";
import { getFriendlyModelName } from "@/app/lib/model-display";
import { getOpenRouterModel } from "@/app/lib/openrouter";
import type { EventPhase } from "@/app/lib/event-phase";
import type { LeaderboardVisibility } from "@/app/lib/leaderboard-visibility";
import type { ReportManifestItem } from "@/app/lib/types";

type ReportSplit = "sample" | "public" | "private";

type ChallengeRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  instructions: string | null;
  locked_model: string;
  public_submission_limit: number;
  final_submission_limit: number;
  event_phase: EventPhase;
  leaderboard_visibility: LeaderboardVisibility;
  event_announcement: string;
  event_timer_ends_at: string | null;
  event_timer_label: string;
};

type ReportMetadataRow = {
  id: string;
  external_id: string;
  filename: string | null;
  split: ReportSplit;
};

const typedManifest = manifest as ReportManifestItem[];
const typedAnswerKeys = answerKeys as unknown[];

function emptySplitCounts() {
  return {
    sample: 0,
    public: 0,
    private: 0,
  };
}

function getFallbackChallengeData(reason: string) {
  const reportCounts = typedManifest.reduce<Record<ReportSplit, number>>(
    (counts, report) => {
      counts[report.split] += 1;
      return counts;
    },
    emptySplitCounts(),
  );

  return {
    source: "mock-file-fallback",
    fallbackReason: reason,
    challenge: {
      id: "local-mock-challenge",
      slug: "knee-mri-extraction",
      title: mockChallenge.title,
      description: mockChallenge.subtitle,
      instructions: null,
      evaluationModelDisplayName: getFriendlyModelName(getOpenRouterModel()),
      publicSubmissionLimit: fallbackChallengeConfig.publicSubmissionLimit,
      finalSubmissionLimit: fallbackChallengeConfig.finalSubmissionLimit,
      eventPhase: "practice_open" satisfies EventPhase,
      leaderboardVisibility: "practice" satisfies LeaderboardVisibility,
      eventAnnouncement: "",
      eventTimerEndsAt: null,
      eventTimerLabel: "",
    },
    reportCounts,
    sampleReports: typedManifest
      .filter((report) => report.split === "public")
      .map((report) => ({
        id: report.id,
        filename: report.filename,
        split: report.split,
      })),
    participantCount: 0,
    answerKeyCount: typedAnswerKeys.length,
  };
}

async function getExactCount(
  query: PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>,
  label: string,
) {
  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to load ${label}: ${error.message}`);
  }

  return count ?? 0;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: challenge, error: challengeError } = await supabase
      .from("challenges")
      .select(
        "id, slug, title, description, instructions, locked_model, public_submission_limit, final_submission_limit, event_phase, leaderboard_visibility, event_announcement, event_timer_ends_at, event_timer_label",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single<ChallengeRow>();

    if (challengeError) {
      return Response.json(
        getFallbackChallengeData(
          `Supabase active challenge unavailable: ${challengeError.message}`,
        ),
      );
    }

    if (!challenge) {
      return Response.json(
        getFallbackChallengeData(
          "Supabase is reachable, but no active challenge is seeded.",
        ),
      );
    }

    const { data: reports, error: reportsError } = await supabase
      .from("reports")
      .select("id, external_id, filename, split")
      .eq("challenge_id", challenge.id)
      .order("external_id", { ascending: true })
      .returns<ReportMetadataRow[]>();

    if (reportsError) {
      throw new Error(`Failed to load reports: ${reportsError.message}`);
    }

    if (reports.length === 0) {
      return Response.json(
        getFallbackChallengeData(
          "Supabase active challenge exists, but no reports are seeded.",
        ),
      );
    }

    const reportIds = reports.map((report) => report.id);
    const [participantCount, answerKeyCount] = await Promise.all([
      getExactCount(
        supabase
          .from("participants")
          .select("id", { count: "exact", head: true })
          .then((result) => result),
        "participant count",
      ),
      getExactCount(
        supabase
          .from("answer_keys")
          .select("id", { count: "exact", head: true })
          .in("report_id", reportIds)
          .then((result) => result),
        "answer key count",
      ),
    ]);
    const reportCounts = reports.reduce<Record<ReportSplit, number>>(
      (counts, report) => {
        counts[report.split] += 1;
        return counts;
      },
      emptySplitCounts(),
    );

    return Response.json({
      source: "supabase",
      fallbackReason: null,
      challenge: {
        id: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        description: challenge.description,
        instructions: challenge.instructions,
        evaluationModelDisplayName: getFriendlyModelName(getOpenRouterModel()),
        publicSubmissionLimit: challenge.public_submission_limit,
        finalSubmissionLimit: challenge.final_submission_limit,
        eventPhase: challenge.event_phase,
        leaderboardVisibility: challenge.leaderboard_visibility,
        eventAnnouncement: challenge.event_announcement,
        eventTimerEndsAt: challenge.event_timer_ends_at,
        eventTimerLabel: challenge.event_timer_label,
      },
      reportCounts,
      sampleReports: reports
        .filter((report) => report.split === "public")
        .map((report) => ({
          id: report.external_id,
          filename: report.filename,
          split: report.split,
        })),
      participantCount,
      answerKeyCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(getFallbackChallengeData(message));
  }
}
