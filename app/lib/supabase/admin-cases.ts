import "server-only";

import { createSupabaseAdminClient } from "./admin";

const findingFields = [
  "acl_tear",
  "mcl_injury",
  "meniscus_tear",
  "fracture",
  "osteoarthritis",
  "effusion",
] as const;
const findingValues = ["present", "absent", "uncertain"] as const;

export type AdminCaseSplit = "public" | "private";
export type AdminFindingField = (typeof findingFields)[number];
export type AdminFindingValue = (typeof findingValues)[number];
export type AdminAnswerKey = Record<AdminFindingField, AdminFindingValue>;

export type AdminCaseRow = {
  id: string;
  externalId: string;
  filename: string;
  split: AdminCaseSplit;
  reportText: string;
  answerKey: AdminAnswerKey | null;
  hasAnswerKey: boolean;
  promptRunItemCount: number;
};

export type AdminCaseSummary = {
  totalReports: number;
  publicReports: number;
  privateReports: number;
  reportsWithAnswerKeys: number;
  reportsMissingAnswerKeys: number;
};

export type AdminCaseManagerData = {
  summary: AdminCaseSummary;
  cases: AdminCaseRow[];
};

type ActiveChallenge = {
  id: string;
};

type ReportRow = {
  id: string;
  external_id: string;
  filename: string | null;
  split: "sample" | "public" | "private";
  report_text: string;
};

type AnswerKeyRow = {
  report_id: string;
  acl_tear: AdminFindingValue;
  mcl_injury: AdminFindingValue;
  meniscus_tear: AdminFindingValue;
  fracture: AdminFindingValue;
  osteoarthritis: AdminFindingValue;
  effusion: AdminFindingValue;
};

export async function getAdminCaseManagerData(): Promise<AdminCaseManagerData> {
  const supabase = createSupabaseAdminClient();
  const challenge = await getActiveChallenge(supabase);
  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select("id, external_id, filename, split, report_text")
    .eq("challenge_id", challenge.id)
    .in("split", ["public", "private"])
    .order("filename", { ascending: true })
    .returns<ReportRow[]>();

  if (reportsError) {
    throw new Error(`Failed to load reports: ${reportsError.message}`);
  }

  const reportIds = reports.map((report) => report.id);
  const [answerKeysResult, runItemsResult] = await Promise.all([
    reportIds.length > 0
      ? supabase
          .from("answer_keys")
          .select(
            "report_id, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion",
          )
          .in("report_id", reportIds)
          .returns<AnswerKeyRow[]>()
      : Promise.resolve({ data: [], error: null }),
    reportIds.length > 0
      ? supabase
          .from("prompt_run_items")
          .select("report_id")
          .in("report_id", reportIds)
          .returns<Array<{ report_id: string }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (answerKeysResult.error) {
    throw new Error(`Failed to load answer keys: ${answerKeysResult.error.message}`);
  }

  if (runItemsResult.error) {
    throw new Error(`Failed to load report run history: ${runItemsResult.error.message}`);
  }

  const answerKeyByReportId = new Map(
    answerKeysResult.data.map((answerKey) => [answerKey.report_id, answerKey]),
  );
  const runItemCounts = runItemsResult.data.reduce((counts, item) => {
    counts.set(item.report_id, (counts.get(item.report_id) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const cases: AdminCaseRow[] = reports.map((report) => {
    const answerKey = answerKeyByReportId.get(report.id);
    const split: AdminCaseSplit = report.split === "private" ? "private" : "public";

    return {
      id: report.id,
      externalId: report.external_id,
      filename: report.filename || report.external_id,
      split,
      reportText: report.report_text,
      answerKey: answerKey ? toAnswerKey(answerKey) : null,
      hasAnswerKey: Boolean(answerKey),
      promptRunItemCount: runItemCounts.get(report.id) || 0,
    };
  });

  return {
    summary: {
      totalReports: cases.length,
      publicReports: cases.filter((item) => item.split === "public").length,
      privateReports: cases.filter((item) => item.split === "private").length,
      reportsWithAnswerKeys: cases.filter((item) => item.hasAnswerKey).length,
      reportsMissingAnswerKeys: cases.filter((item) => !item.hasAnswerKey).length,
    },
    cases,
  };
}

export async function createAdminCase(input: {
  answerKey: AdminAnswerKey;
  filename: string;
  reportText: string;
  split: AdminCaseSplit;
}) {
  const validated = validateCaseInput(input);
  const supabase = createSupabaseAdminClient();
  const challenge = await getActiveChallenge(supabase);
  const externalId = externalIdFromFilename(validated.filename);
  await ensureUniqueReportIdentity(supabase, challenge.id, {
    externalId,
    filename: validated.filename,
  });

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .insert({
      challenge_id: challenge.id,
      external_id: externalId,
      filename: validated.filename,
      split: validated.split,
      report_text: validated.reportText,
      synthetic: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (reportError) {
    throw new Error(`Failed to create report: ${reportError.message}`);
  }

  await upsertAnswerKey(report.id, validated.answerKey);
}

export async function updateAdminCase(input: {
  answerKey: AdminAnswerKey;
  filename: string;
  reportId: string;
  reportText: string;
  split: AdminCaseSplit;
}) {
  const reportId = input.reportId.trim();

  if (!reportId) {
    throw new Error("reportId is required.");
  }

  const validated = validateCaseInput(input);
  const supabase = createSupabaseAdminClient();
  const challenge = await getActiveChallenge(supabase);
  const { data: existing, error: existingError } = await supabase
    .from("reports")
    .select("id")
    .eq("challenge_id", challenge.id)
    .eq("id", reportId)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw new Error(`Failed to load report: ${existingError.message}`);
  }

  if (!existing) {
    throw new Error("Report not found.");
  }

  await ensureUniqueReportIdentity(supabase, challenge.id, {
    filename: validated.filename,
    ignoreReportId: reportId,
  });

  const { error: reportError } = await supabase
    .from("reports")
    .update({
      filename: validated.filename,
      split: validated.split,
      report_text: validated.reportText,
    })
    .eq("id", reportId);

  if (reportError) {
    throw new Error(`Failed to update report: ${reportError.message}`);
  }

  await upsertAnswerKey(reportId, validated.answerKey);
}

export async function deleteAdminCase(input: {
  confirmationFilename: string;
  reportId: string;
}) {
  const reportId = input.reportId.trim();

  if (!reportId) {
    throw new Error("reportId is required.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, filename")
    .eq("id", reportId)
    .maybeSingle<{ id: string; filename: string | null }>();

  if (reportError) {
    throw new Error(`Failed to load report: ${reportError.message}`);
  }

  if (!report) {
    throw new Error("Report not found.");
  }

  const filename = report.filename || report.id;

  if (input.confirmationFilename !== filename) {
    throw new Error("Confirm deletion by typing the exact filename.");
  }

  const { data: runItems, error: runItemsError } = await supabase
    .from("prompt_run_items")
    .select("id")
    .eq("report_id", reportId)
    .limit(1)
    .returns<Array<{ id: string }>>();

  if (runItemsError) {
    throw new Error(`Failed to check report run history: ${runItemsError.message}`);
  }

  if (runItems.length > 0) {
    throw new Error(
      "This report has run history and cannot be deleted. Clear workshop run data first, or keep the report for auditability.",
    );
  }

  // answer_keys.report_id has ON DELETE CASCADE, so deleting the report removes
  // only its answer key after the run-history guard above has passed.
  const { error: deleteError } = await supabase
    .from("reports")
    .delete()
    .eq("id", reportId);

  if (deleteError) {
    throw new Error(`Failed to delete report: ${deleteError.message}`);
  }
}

function validateCaseInput(input: {
  answerKey: AdminAnswerKey;
  filename: string;
  reportText: string;
  split: AdminCaseSplit;
}) {
  const filename = input.filename.trim();
  const reportText = input.reportText.trim();

  if (!filename || filename.length > 160) {
    throw new Error("Filename is required and must be 160 characters or fewer.");
  }

  if (!/^[A-Za-z0-9._-]+\.txt$/.test(filename)) {
    throw new Error("Filename must be a .txt file using letters, numbers, dots, dashes, or underscores.");
  }

  if (input.split !== "public" && input.split !== "private") {
    throw new Error("Split must be public or private.");
  }

  if (!reportText) {
    throw new Error("Report text is required.");
  }

  return {
    filename,
    reportText,
    split: input.split,
    answerKey: validateAnswerKey(input.answerKey),
  };
}

export function validateAnswerKey(value: unknown): AdminAnswerKey {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Answer key is required.");
  }

  return Object.fromEntries(
    findingFields.map((field) => {
      const fieldValue = (value as Partial<Record<AdminFindingField, unknown>>)[field];

      if (!isFindingValue(fieldValue)) {
        throw new Error(`${field} must be present, absent, or uncertain.`);
      }

      return [field, fieldValue];
    }),
  ) as AdminAnswerKey;
}

async function upsertAnswerKey(reportId: string, answerKey: AdminAnswerKey) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("answer_keys").upsert(
    {
      report_id: reportId,
      ...answerKey,
    },
    { onConflict: "report_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert answer key: ${error.message}`);
  }
}

async function ensureUniqueReportIdentity(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  challengeId: string,
  input: {
    externalId?: string;
    filename: string;
    ignoreReportId?: string;
  },
) {
  let query = supabase
    .from("reports")
    .select("id, external_id, filename")
    .eq("challenge_id", challengeId);

  if (input.externalId) {
    query = query.or(`external_id.eq.${input.externalId},filename.eq.${input.filename}`);
  } else {
    query = query.eq("filename", input.filename);
  }

  const { data, error } = await query.returns<
    Array<{ id: string; external_id: string; filename: string | null }>
  >();

  if (error) {
    throw new Error(`Failed to check report uniqueness: ${error.message}`);
  }

  const duplicate = data.find((report) => report.id !== input.ignoreReportId);

  if (duplicate) {
    throw new Error("A report with this filename or generated report ID already exists.");
  }
}

async function getActiveChallenge(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data, error } = await supabase
    .from("challenges")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single<ActiveChallenge>();

  if (error) {
    throw new Error(`Supabase active challenge unavailable: ${error.message}`);
  }

  return data;
}

function externalIdFromFilename(filename: string) {
  return filename
    .replace(/\.txt$/i, "")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toAnswerKey(answerKey: AnswerKeyRow): AdminAnswerKey {
  return {
    acl_tear: answerKey.acl_tear,
    mcl_injury: answerKey.mcl_injury,
    meniscus_tear: answerKey.meniscus_tear,
    fracture: answerKey.fracture,
    osteoarthritis: answerKey.osteoarthritis,
    effusion: answerKey.effusion,
  };
}

function isFindingValue(value: unknown): value is AdminFindingValue {
  return (
    typeof value === "string" &&
    (findingValues as readonly string[]).includes(value)
  );
}
