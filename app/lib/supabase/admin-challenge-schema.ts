import {
  defaultChallengeMode,
  isChallengeModeActivationAllowed,
  type ChallengeModeDefinition,
} from "@/app/lib/challenge-modes";
import {
  buildOutputSchema,
  resolveChallengeMode,
  validateAnswerValues,
} from "@/app/lib/schema-storage";

export const CHALLENGE_MODE_ERROR = "That challenge mode is not available for activation.";
export const SCHEMA_VERSION_ERROR =
  "That schema version is not supported for the selected challenge mode.";
export const MISSING_ANSWER_KEYS_ERROR =
  "One or more public or private reports are missing answer keys for this mode.";
export const MISSING_SCHEMA_VALUES_ERROR =
  "One or more answer keys do not contain values for the selected schema.";
export const ANSWER_KEY_FIELDS_ERROR =
  "An answer key does not contain exactly the fields required by the selected schema.";
export const ANSWER_KEY_VALUE_ERROR =
  "An answer key contains a value that is not allowed for the selected schema.";

export type AdminChallengeSchemaMetadata = {
  modeId: string;
  schemaVersion: number;
  outputSchema: ReturnType<typeof buildOutputSchema>;
};

type ReportRow = { id: string; split: "public" | "private" };

type AnswerKeyRow = {
  report_id: string;
  answer_values: unknown;
  acl_tear: unknown;
  mcl_injury: unknown;
  meniscus_tear: unknown;
  fracture: unknown;
  osteoarthritis: unknown;
  effusion: unknown;
};

export function getActivatableChallengeMode(
  modeId: unknown,
  schemaVersion: unknown,
): ChallengeModeDefinition {
  if (typeof modeId !== "string" || !isChallengeModeActivationAllowed(modeId)) {
    throw new Error(CHALLENGE_MODE_ERROR);
  }
  if (typeof schemaVersion !== "number") {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  let mode: ChallengeModeDefinition;
  try {
    mode = resolveChallengeMode(
      modeId,
      schemaVersion,
    );
  } catch {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  const keys = mode.fields.map((field) => field.key);
  if (new Set(keys).size !== keys.length || mode.fields.some((field) => field.allowedValues.length === 0)) {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  return mode;
}

export function createChallengeSchemaMetadata(
  mode: ChallengeModeDefinition,
): AdminChallengeSchemaMetadata {
  return {
    modeId: mode.id,
    schemaVersion: mode.version,
    outputSchema: buildOutputSchema(mode),
  };
}

export function validateTargetAnswerKeys(
  reports: readonly ReportRow[],
  answerKeys: readonly AnswerKeyRow[],
  mode: ChallengeModeDefinition,
) {
  const answerKeysByReport = new Map<string, AnswerKeyRow[]>();
  for (const answerKey of answerKeys) {
    const rows = answerKeysByReport.get(answerKey.report_id) || [];
    rows.push(answerKey);
    answerKeysByReport.set(answerKey.report_id, rows);
  }

  for (const report of reports) {
    const rows = answerKeysByReport.get(report.id) || [];
    if (rows.length !== 1) {
      throw new Error(MISSING_ANSWER_KEYS_ERROR);
    }

    const answerKey = rows[0];
    const legacyValues = {
      acl_tear: answerKey.acl_tear,
      mcl_injury: answerKey.mcl_injury,
      meniscus_tear: answerKey.meniscus_tear,
      fracture: answerKey.fracture,
      osteoarthritis: answerKey.osteoarthritis,
      effusion: answerKey.effusion,
    };
    const answerValues =
      answerKey.answer_values ??
      (mode.id === defaultChallengeMode.id ? legacyValues : null);

    if (answerValues === null) {
      throw new Error(MISSING_SCHEMA_VALUES_ERROR);
    }

    try {
      validateAnswerValues(answerValues, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("invalid for challenge mode")) {
        throw new Error(ANSWER_KEY_VALUE_ERROR);
      }
      throw new Error(ANSWER_KEY_FIELDS_ERROR);
    }
  }
}
