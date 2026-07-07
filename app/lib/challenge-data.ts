import fs from "node:fs/promises";
import path from "node:path";

import answerKeys from "@/data/mock-answer-keys.json";
import manifest from "@/data/mock-report-manifest.json";
import { createSupabaseAdminClient } from "./supabase/admin";
import type { AnswerKeyItem, ReportManifestItem, ReportSplit, SampleReport } from "./types";

const typedManifest = manifest as ReportManifestItem[];
const typedAnswerKeys = answerKeys as AnswerKeyItem[];

type SupabaseChallengeRow = {
  id: string;
};

type SupabaseReportRow = {
  id: string;
  external_id: string;
  filename: string | null;
  split: ReportSplit;
  report_text: string;
};

type SupabaseAnswerKeyRow = {
  report_id: string;
  acl_tear: "present" | "absent" | "uncertain";
  mcl_injury: "present" | "absent" | "uncertain";
  meniscus_tear: "present" | "absent" | "uncertain";
  fracture: "present" | "absent" | "uncertain";
  osteoarthritis: "present" | "absent" | "uncertain";
  effusion: "present" | "absent" | "uncertain";
};

export type PublicChallengeReport = Pick<
  SampleReport,
  "id" | "filename" | "split" | "text"
>;

export function getAnswerKeyItems() {
  return typedAnswerKeys;
}

export function getLeaderboardRows(participantId?: string) {
  const rows = [
    { rank: 1, participant: "RAD-014", score: 94, final: true },
    { rank: 2, participant: "RAD-027", score: 91, final: true },
    { rank: 3, participant: "RAD-006", score: 88, final: true },
    { rank: 4, participant: "RAD-033", score: 83, final: true },
  ];

  if (!participantId) {
    return rows;
  }

  return [
    ...rows,
    { rank: rows.length + 1, participant: participantId, score: 0, final: false },
  ];
}

export async function getSampleReports(): Promise<SampleReport[]> {
  try {
    return await getSupabasePublicReports();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (process.env.ALLOW_LOCAL_FALLBACK !== "true") {
      console.error(
        "[challenge-data] Supabase public reports unavailable and local fallback is disabled",
        message,
      );

      return [];
    }

    return getLocalPublicReports();
  }
}

export async function getPublicChallengeReports(): Promise<PublicChallengeReport[]> {
  const reports = await getSampleReports();

  return reports.map(({ id, filename, split, text }) => ({
    id,
    filename,
    split,
    text,
  }));
}

async function getLocalPublicReports(): Promise<SampleReport[]> {
  const publicFiles = typedManifest.filter((item) => item.split === "public");

  return Promise.all(
    publicFiles.map(async (item) => {
      const key = typedAnswerKeys.find((answer) => answer.id === item.id);

      if (!key) {
        throw new Error(`Missing answer key for ${item.id}`);
      }

      const reportPath = path.join(
        process.cwd(),
        "seed-data",
        "mock-reports",
        item.filename,
      );
      const text = await fs.readFile(reportPath, "utf8");

      return {
        ...key,
        text,
      };
    }),
  );
}

async function getSupabasePublicReports(): Promise<SampleReport[]> {
  const supabase = createSupabaseAdminClient();
  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single<SupabaseChallengeRow>();

  if (challengeError || !challenge) {
    throw new Error(challengeError?.message || "No active challenge found.");
  }

  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select("id, external_id, filename, split, report_text")
    .eq("challenge_id", challenge.id)
    .eq("split", "public")
    .order("filename", { ascending: true })
    .returns<SupabaseReportRow[]>();

  if (reportsError) {
    throw new Error(reportsError.message);
  }

  if (reports.length === 0) {
    throw new Error("No public reports are seeded.");
  }

  const reportIds = reports.map((report) => report.id);
  const { data: answerKeyRows, error: answerKeyError } = await supabase
    .from("answer_keys")
    .select(
      "report_id, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion",
    )
    .in("report_id", reportIds)
    .returns<SupabaseAnswerKeyRow[]>();

  if (answerKeyError) {
    throw new Error(answerKeyError.message);
  }

  const answerKeyByReportId = new Map(
    answerKeyRows.map((answerKey) => [answerKey.report_id, answerKey]),
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
      text: report.report_text,
      answer_key: {
        acl_tear: answerKey.acl_tear,
        mcl_injury: answerKey.mcl_injury,
        meniscus_tear: answerKey.meniscus_tear,
        fracture: answerKey.fracture,
        osteoarthritis: answerKey.osteoarthritis,
        effusion: answerKey.effusion,
      },
    };
  });
}
