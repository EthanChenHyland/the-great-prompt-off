import "server-only";

import { createChallengeSchemaMetadata, getActivatableChallengeMode, validateTargetAnswerKeys } from "./admin-challenge-schema";

export async function callAdminChallengeSchemaUpdate(
  supabase: unknown,
  modeId: unknown,
  schemaVersion: unknown,
) {
  const numericVersion = typeof schemaVersion === "number" ? schemaVersion : null;
  const mode = getActivatableChallengeMode(modeId, numericVersion);
  const metadata = createChallengeSchemaMetadata(mode);
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string | boolean) => unknown;
        in: (column: string, values: string[]) => unknown;
      };
    };
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
  const challengeResult = await (client.from("challenges").select("id") as unknown as {
    eq: (column: string, value: boolean) => {
      single: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
    };
  }).eq("is_active", true).single<{ id: string }>();
  if (challengeResult.error || !challengeResult.data) throw new Error("No active challenge was found.");
  const reportsQuery = client.from("reports").select("id, split") as unknown as {
    eq: (column: string, value: string) => {
      in: (column: string, values: string[]) => {
        returns: <T>() => Promise<{ data: T[]; error: { message: string } | null }>;
      };
    };
  };
  const reportsResult = await reportsQuery
    .eq("challenge_id", challengeResult.data.id)
    .in("split", ["public", "private"])
    .returns<{ id: string; split: "public" | "private" }>();
  if (reportsResult.error) {
    throw new Error("Could not validate challenge reports and answer keys.");
  }
  const keysQuery = client.from("answer_keys").select("report_id, answer_values, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion") as unknown as {
    in: (column: string, values: string[]) => {
      returns: <T>() => Promise<{ data: T[]; error: { message: string } | null }>;
    };
  };
  const keysResult = await keysQuery
    .in("report_id", reportsResult.data.map((report) => report.id))
    .returns<Parameters<typeof validateTargetAnswerKeys>[1][number]>();
  if (keysResult.error) throw new Error("Could not validate challenge reports and answer keys.");
  validateTargetAnswerKeys(reportsResult.data, keysResult.data, mode);
  const rpcResult = await client.rpc("admin_update_challenge_schema", {
    target_mode_id: metadata.modeId,
    target_schema_version: metadata.schemaVersion,
    target_output_schema: metadata.outputSchema,
  });
  if (rpcResult.error) throw new Error(rpcResult.error.message);
  return { ok: true, modeId: metadata.modeId, schemaVersion: metadata.schemaVersion, fieldCount: mode.fields.length };
}
