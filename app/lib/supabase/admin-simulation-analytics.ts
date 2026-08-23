import "server-only";

import {
  buildSimulationAnalytics,
  buildSimulationBatchComparison,
  type SimulationAnalyticsBatch,
  type SimulationAnalyticsRun,
} from "@/app/lib/simulation-analytics";
import { createSupabaseAdminClient } from "./admin";
import {
  SimulationDataUnavailableError,
  SimulationInputError,
  SimulationNotFoundError,
} from "./admin-simulations";
import { getActiveChallenge } from "./submission-workflow";

export async function getAdminSimulationAnalytics(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const challenge = await getActiveChallenge(supabase);
  const { data: batches, error: batchError } = await supabase
    .from("simulation_batches")
    .select(
      "id, mode_id, schema_version, evaluator_type, report_scope, status, report_count, field_count, profile_count, total_evaluations, created_at, completed_at",
    )
    .eq("challenge_id", challenge.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<SimulationAnalyticsBatch[]>();

  if (batchError) {
    throw new SimulationDataUnavailableError(
      "Simulation analytics are temporarily unavailable.",
    );
  }

  if (!batches?.length) {
    return buildSimulationAnalytics([], []);
  }

  const { data: runs, error: runError } = await supabase
    .from("simulation_runs")
    .select(
      "id, simulation_batch_id, profile_id, profile_version, profile_label, correct_fields, total_fields, score, valid_json_count, invalid_json_count, missing_field_count, invalid_value_count, completed_report_count, created_at",
    )
    .in("simulation_batch_id", batches.map((batch) => batch.id))
    .returns<SimulationAnalyticsRun[]>();

  if (runError) {
    throw new SimulationDataUnavailableError(
      "Simulation analytics are temporarily unavailable.",
    );
  }

  return buildSimulationAnalytics(batches, runs ?? []);
}

export async function compareAdminSimulationBatches(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  leftBatchId: string,
  rightBatchId: string,
) {
  if (leftBatchId === rightBatchId) {
    throw new SimulationInputError("Select two different simulation batches.");
  }

  const challenge = await getActiveChallenge(supabase);
  const [leftBatch, rightBatch] = await Promise.all([
    getChallengeSimulationBatch(supabase, challenge.id, leftBatchId),
    getChallengeSimulationBatch(supabase, challenge.id, rightBatchId),
  ]);
  if (leftBatch.status !== "completed" || rightBatch.status !== "completed") {
    throw new SimulationInputError(
      "Only completed simulation batches can be compared.",
    );
  }
  const { data: runs, error } = await supabase
    .from("simulation_runs")
    .select(
      "id, simulation_batch_id, profile_id, profile_version, profile_label, correct_fields, total_fields, score, valid_json_count, invalid_json_count, missing_field_count, invalid_value_count, completed_report_count, created_at",
    )
    .in("simulation_batch_id", [leftBatch.id, rightBatch.id])
    .returns<SimulationAnalyticsRun[]>();

  if (error) {
    throw new SimulationDataUnavailableError(
      "Simulation comparison is temporarily unavailable.",
    );
  }

  return buildSimulationBatchComparison(
    leftBatch,
    (runs ?? []).filter((run) => run.simulation_batch_id === leftBatch.id),
    rightBatch,
    (runs ?? []).filter((run) => run.simulation_batch_id === rightBatch.id),
  );
}

async function getChallengeSimulationBatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  challengeId: string,
  batchId: string,
) {
  if (!isUuid(batchId)) {
    throw new SimulationInputError("A valid simulation batch ID is required.");
  }

  const { data, error } = await supabase
    .from("simulation_batches")
    .select(
      "id, mode_id, schema_version, evaluator_type, report_scope, status, report_count, field_count, profile_count, total_evaluations, created_at, completed_at",
    )
    .eq("id", batchId)
    .eq("challenge_id", challengeId)
    .maybeSingle<SimulationAnalyticsBatch>();

  if (error) {
    throw new SimulationDataUnavailableError(
      "Simulation comparison is temporarily unavailable.",
    );
  }
  if (!data) {
    throw new SimulationNotFoundError("Simulation batch not found.");
  }

  return data;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
