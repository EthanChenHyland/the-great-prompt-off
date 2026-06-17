import fs from "node:fs/promises";
import path from "node:path";

import answerKeys from "@/data/mock-answer-keys.json";
import manifest from "@/data/mock-report-manifest.json";
import type { AnswerKeyItem, ReportManifestItem, SampleReport } from "./types";

const typedManifest = manifest as ReportManifestItem[];
const typedAnswerKeys = answerKeys as AnswerKeyItem[];

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
  const sampleFiles = typedManifest
    .filter((item) => item.split === "public")
    .slice(0, 5);

  return Promise.all(
    sampleFiles.map(async (item) => {
      const key = typedAnswerKeys.find((answer) => answer.id === item.id);

      if (!key) {
        throw new Error(`Missing answer key for ${item.id}`);
      }

      const reportPath = path.join(
        process.cwd(),
        "public",
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
