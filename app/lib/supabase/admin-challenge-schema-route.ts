import "server-only";

import {
  createChallengeSchemaMetadata,
  getActivatableChallengeMode,
  getChallengeModeForValidation,
  type AdminSchemaAnswerKeyRow,
  type AdminSchemaReportRow,
  validateAnswerKeyImportPayload,
  validateTargetAnswerKeyCoverage,
  validateTargetAnswerKeys,
} from "./admin-challenge-schema";

const TWELVE_FIELD_MODE = "knee_mri_12_basic";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => unknown;
  };
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
};

async function loadChallengeSchemaInputs(supabase: unknown) {
  const client = supabase as SupabaseLike;
  const challengeResult = await (client.from("challenges").select("id") as unknown as {
    eq: (column: string, value: boolean) => {
      single: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
    };
  }).eq("is_active", true).single<{ id: string }>();
  if (challengeResult.error || !challengeResult.data) {
    throw new Error("No active challenge was found.");
  }

  const reportsQuery = client.from("reports").select("id, split, filename, external_id") as unknown as {
    eq: (column: string, value: string) => {
      in: (column: string, values: string[]) => {
        returns: <T>() => Promise<{ data: T[]; error: { message: string } | null }>;
      };
    };
  };
  const reportsResult = await reportsQuery
    .eq("challenge_id", challengeResult.data.id)
    .in("split", ["public", "private"])
    .returns<AdminSchemaReportRow>();
  if (reportsResult.error) {
    throw new Error("Could not validate challenge reports and answer keys.");
  }

  const keysQuery = client.from("answer_keys").select(
    "report_id, answer_values, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion",
  ) as unknown as {
    in: (column: string, values: string[]) => {
      returns: <T>() => Promise<{ data: T[]; error: { message: string } | null }>;
    };
  };
  const keysResult = await keysQuery
    .in("report_id", reportsResult.data.map((report) => report.id))
    .returns<AdminSchemaAnswerKeyRow>();
  if (keysResult.error) {
    throw new Error("Could not validate challenge reports and answer keys.");
  }

  return {
    challengeId: challengeResult.data.id,
    reports: reportsResult.data,
    answerKeys: keysResult.data,
  };
}

export async function prepareAdminAnswerKeyImport(
  supabase: unknown,
  payload: unknown,
) {
  const body = payload as { mode_id?: unknown; schema_version?: unknown } | null;
  const mode = getChallengeModeForValidation(body?.mode_id, body?.schema_version);
  if (mode.id !== TWELVE_FIELD_MODE) {
    throw new Error("This preparation path is only available for knee_mri_12_basic.");
  }
  const inputs = await loadChallengeSchemaInputs(supabase);
  return validateAnswerKeyImportPayload(payload, inputs.reports, mode);
}

export async function validateAdminChallengeSchema(
  supabase: unknown,
  modeId: unknown,
  schemaVersion: unknown,
) {
  const mode = getChallengeModeForValidation(modeId, schemaVersion);
  const inputs = await loadChallengeSchemaInputs(supabase);
  return validateTargetAnswerKeyCoverage(inputs.reports, inputs.answerKeys, mode);
}

export async function callAdminChallengeSchemaUpdate(
  supabase: unknown,
  modeId: unknown,
  schemaVersion: unknown,
) {
  const mode = getActivatableChallengeMode(modeId, schemaVersion);
  const metadata = createChallengeSchemaMetadata(mode);
  const inputs = await loadChallengeSchemaInputs(supabase);
  validateTargetAnswerKeys(inputs.reports, inputs.answerKeys, mode);
  const client = supabase as SupabaseLike;
  const rpcResult = await client.rpc("admin_update_challenge_schema", {
    target_mode_id: metadata.modeId,
    target_schema_version: metadata.schemaVersion,
    target_output_schema: metadata.outputSchema,
  });
  if (rpcResult.error) throw new Error(rpcResult.error.message);
  return { ok: true, modeId: metadata.modeId, schemaVersion: metadata.schemaVersion, fieldCount: mode.fields.length };
}
