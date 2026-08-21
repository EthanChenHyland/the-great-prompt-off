import "server-only";

import { getSimulationProfile } from "@/app/lib/simulation-profiles";
import {
  runDeterministicSimulation,
  type SimulationReportScope,
} from "@/app/lib/simulation-runner";
import { resolveChallengeMode } from "@/app/lib/schema-storage";
import { createSupabaseAdminClient } from "./admin";
import {
  getActiveChallenge,
  getSupabaseAnswerKeysForSplit,
} from "./submission-workflow";

export class SimulationInputError extends Error {}
export class SimulationDataUnavailableError extends Error {}

export async function runAdminSimulationDryRun(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  payload: unknown,
) {
  const input = parseSimulationInput(payload);
  let mode;

  try {
    mode = resolveChallengeMode(input.modeId, input.schemaVersion);
  } catch {
    throw new SimulationInputError(
      "The requested challenge mode or schema version is unsupported.",
    );
  }
  const challenge = await getActiveChallenge(supabase);
  const splits = input.reportScope === "all"
    ? (["public", "private"] as const)
    : ([input.reportScope] as const);

  try {
    const reportSets = await Promise.all(
      splits.map((split) =>
        getSupabaseAnswerKeysForSplit(supabase, challenge.id, split, mode),
      ),
    );
    const reports = reportSets.flat().map((report) => ({
      id: report.id,
      split: report.split as "public" | "private",
      answerKey: report.answer_key,
    }));

    return runDeterministicSimulation({
      mode,
      reportScope: input.reportScope,
      reports,
      profileIds: input.profileIds,
    });
  } catch (error) {
    if (error instanceof SimulationInputError) {
      throw error;
    }

    console.error("[admin-simulation] Dry-run data loading failed", {
      modeId: mode.id,
      schemaVersion: mode.version,
      reportScope: input.reportScope,
      message: error instanceof Error ? error.message : "Unknown data error",
    });
    throw new SimulationDataUnavailableError(
      "Matching reports and answer keys are not available for this simulation.",
    );
  }
}

function parseSimulationInput(payload: unknown) {
  if (!isPlainObject(payload)) {
    throw new SimulationInputError("A simulation request body is required.");
  }

  const modeId = payload.modeId;
  const schemaVersion = payload.schemaVersion;
  const reportScope = payload.reportScope ?? "public";
  const profileIds = payload.profileIds;

  if (typeof modeId !== "string" || !modeId.trim()) {
    throw new SimulationInputError("A valid challenge mode is required.");
  }

  if (!Number.isInteger(schemaVersion) || Number(schemaVersion) <= 0) {
    throw new SimulationInputError("A valid schema version is required.");
  }

  if (!isSimulationReportScope(reportScope)) {
    throw new SimulationInputError("Report scope must be public, private, or all.");
  }

  if (
    profileIds !== undefined &&
    (!Array.isArray(profileIds) ||
      profileIds.length === 0 ||
      profileIds.some((profileId) => typeof profileId !== "string"))
  ) {
    throw new SimulationInputError("Select at least one valid simulation profile.");
  }

  const uniqueProfileIds = profileIds
    ? [...new Set(profileIds as string[])]
    : undefined;
  if (
    uniqueProfileIds?.some((profileId) => !getSimulationProfile(profileId))
  ) {
    throw new SimulationInputError("One or more simulation profiles are unsupported.");
  }

  return {
    modeId: modeId.trim(),
    schemaVersion: Number(schemaVersion),
    reportScope,
    profileIds: uniqueProfileIds,
  };
}

function isSimulationReportScope(
  value: unknown,
): value is SimulationReportScope {
  return value === "public" || value === "private" || value === "all";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
