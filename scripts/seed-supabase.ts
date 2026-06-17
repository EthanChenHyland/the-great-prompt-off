import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

loadEnvConfig(process.cwd());

const challengeSlug = "knee-mri-extraction";
const challengeTitle = "Knee MRI Extraction Challenge";
const defaultModel = "google/gemini-2.0-flash-001";
const findingFields = [
  "acl_tear",
  "mcl_injury",
  "meniscus_tear",
  "fracture",
  "osteoarthritis",
  "effusion",
] as const;
const allowedFindingValues = ["present", "absent", "uncertain"] as const;

type FindingField = (typeof findingFields)[number];
type FindingValue = (typeof allowedFindingValues)[number];
type ReportSplit = "sample" | "public" | "private";

type ManifestReport = {
  id: string;
  filename: string;
  split: ReportSplit;
};

type AnswerKeyReport = ManifestReport & {
  answer_key: Record<FindingField, FindingValue>;
  notes?: string;
};

type ChallengeRow = {
  id: string;
};

type ReportRow = {
  id: string;
  external_id: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required to seed Supabase. Add it to .env.local or your shell environment.`,
    );
  }

  return value;
}

async function readJsonFile<T>(relativePath: string) {
  const filePath = path.join(process.cwd(), relativePath);
  const contents = await readFile(filePath, "utf8");

  return JSON.parse(contents) as T;
}

function assertFindingValues(report: AnswerKeyReport) {
  for (const field of findingFields) {
    const value = report.answer_key[field];

    if (!allowedFindingValues.includes(value)) {
      throw new Error(
        `${report.id} has invalid ${field}: ${String(value)}. Expected present, absent, or uncertain.`,
      );
    }
  }
}

async function readReportText(filename: string) {
  const reportPath = path.join(process.cwd(), "public", "mock-reports", filename);
  const reportText = await readFile(reportPath, "utf8");

  if (!reportText.trim()) {
    throw new Error(`${filename} is empty.`);
  }

  return reportText;
}

async function main() {
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [manifest, answerKeys] = await Promise.all([
    readJsonFile<ManifestReport[]>("data/mock-report-manifest.json"),
    readJsonFile<AnswerKeyReport[]>("data/mock-answer-keys.json"),
  ]);

  const answerKeyById = new Map(answerKeys.map((report) => [report.id, report]));

  for (const report of manifest) {
    const answerKey = answerKeyById.get(report.id);

    if (!answerKey) {
      throw new Error(`No answer key found for ${report.id}.`);
    }

    if (answerKey.filename !== report.filename || answerKey.split !== report.split) {
      throw new Error(`Manifest and answer key metadata disagree for ${report.id}.`);
    }

    assertFindingValues(answerKey);
  }

  const outputSchema = {
    type: "object",
    required: findingFields,
    additionalProperties: false,
    properties: Object.fromEntries(
      findingFields.map((field) => [
        field,
        {
          type: "string",
          enum: allowedFindingValues,
        },
      ]),
    ),
  };

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .upsert(
      {
        slug: challengeSlug,
        title: challengeTitle,
        description:
          "Synthetic knee MRI report extraction challenge seeded from local mock data.",
        instructions:
          "Extract six structured findings from each synthetic knee MRI report.",
        output_schema: outputSchema,
        locked_model: process.env.OPENROUTER_MODEL || defaultModel,
        public_submission_limit: 5,
        final_submission_limit: 1,
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single<ChallengeRow>();

  if (challengeError) {
    throw new Error(`Failed to upsert challenge: ${challengeError.message}`);
  }

  const reportRows = await Promise.all(
    manifest.map(async (report) => ({
      challenge_id: challenge.id,
      external_id: report.id,
      filename: report.filename,
      split: report.split,
      report_text: await readReportText(report.filename),
      synthetic: true,
    })),
  );

  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .upsert(reportRows, { onConflict: "challenge_id,external_id" })
    .select("id, external_id")
    .returns<ReportRow[]>();

  if (reportsError) {
    throw new Error(`Failed to upsert reports: ${reportsError.message}`);
  }

  const reportIdByExternalId = new Map(
    reports.map((report) => [report.external_id, report.id]),
  );
  const answerKeyRows = answerKeys.map((report) => {
    const reportId = reportIdByExternalId.get(report.id);

    if (!reportId) {
      throw new Error(`Could not resolve seeded report ID for ${report.id}.`);
    }

    return {
      report_id: reportId,
      acl_tear: report.answer_key.acl_tear,
      mcl_injury: report.answer_key.mcl_injury,
      meniscus_tear: report.answer_key.meniscus_tear,
      fracture: report.answer_key.fracture,
      osteoarthritis: report.answer_key.osteoarthritis,
      effusion: report.answer_key.effusion,
      notes: report.notes || null,
    };
  });

  const { error: answerKeysError } = await supabase
    .from("answer_keys")
    .upsert(answerKeyRows, { onConflict: "report_id" });

  if (answerKeysError) {
    throw new Error(`Failed to upsert answer keys: ${answerKeysError.message}`);
  }

  const participantRows = Array.from({ length: 50 }, (_, index) => {
    const participantNumber = String(index + 1).padStart(3, "0");

    return {
      participant_code: `P${participantNumber}`,
      display_name: `Participant ${participantNumber}`,
      role: "participant",
    };
  });

  const { error: participantsError } = await supabase
    .from("participants")
    .upsert(participantRows, { onConflict: "participant_code" });

  if (participantsError) {
    throw new Error(`Failed to upsert mock participants: ${participantsError.message}`);
  }

  const splitCounts = manifest.reduce<Record<ReportSplit, number>>(
    (counts, report) => {
      counts[report.split] += 1;
      return counts;
    },
    { sample: 0, public: 0, private: 0 },
  );

  console.log(`Seeded challenge: ${challengeTitle} (${challengeSlug})`);
  console.log(
    `Seeded ${manifest.length} reports: ${splitCounts.public} public test, ${splitCounts.private} hidden final, ${splitCounts.sample} legacy sample.`,
  );
  console.log(`Seeded ${answerKeyRows.length} answer keys.`);
  console.log(`Seeded ${participantRows.length} mock participants.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Supabase seed failed: ${message}`);
  process.exit(1);
});
