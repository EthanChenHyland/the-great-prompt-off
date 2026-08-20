import {
  challengeModes,
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

export type AdminSchemaReportRow = ReportRow;

export type AdminSchemaAnswerKeyRow = {
  report_id: string;
  answer_values: unknown;
  acl_tear: unknown;
  mcl_injury: unknown;
  meniscus_tear: unknown;
  fracture: unknown;
  osteoarthritis: unknown;
  effusion: unknown;
};

export type ChallengeSchemaValidationIssue = {
  type:
    | "missing_answer_key"
    | "duplicate_answer_key"
    | "missing_schema_values"
    | "invalid_fields"
    | "invalid_values";
  count: number;
  message: string;
};

export type ChallengeSchemaValidationResult = {
  ok: boolean;
  modeId: string;
  schemaVersion: number;
  reportCounts: { public: number; private: number };
  issues: ChallengeSchemaValidationIssue[];
};

export function getChallengeModeForValidation(
  modeId: unknown,
  schemaVersion: unknown,
): ChallengeModeDefinition {
  if (typeof modeId !== "string" || !challengeModes[modeId as keyof typeof challengeModes]) {
    throw new Error(CHALLENGE_MODE_ERROR);
  }
  if (typeof schemaVersion !== "number") {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  let mode: ChallengeModeDefinition;
  try {
    mode = resolveChallengeMode(modeId, schemaVersion);
  } catch {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  const keys = mode.fields.map((field) => field.key);
  if (
    new Set(keys).size !== keys.length ||
    mode.fields.some((field) => field.allowedValues.length === 0)
  ) {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  return mode;
}

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

  return getChallengeModeForValidation(modeId, schemaVersion);
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
  answerKeys: readonly AdminSchemaAnswerKeyRow[],
  mode: ChallengeModeDefinition,
) {
  const validation = validateTargetAnswerKeyCoverage(reports, answerKeys, mode);
  if (validation.issues.length > 0) {
    const issue = validation.issues[0];
    if (issue.type === "missing_answer_key" || issue.type === "duplicate_answer_key") {
      throw new Error(MISSING_ANSWER_KEYS_ERROR);
    }
    if (issue.type === "missing_schema_values") {
      throw new Error(MISSING_SCHEMA_VALUES_ERROR);
    }
    if (issue.type === "invalid_values") {
      throw new Error(ANSWER_KEY_VALUE_ERROR);
    }
    throw new Error(ANSWER_KEY_FIELDS_ERROR);
  }
}

export function validateTargetAnswerKeyCoverage(
  reports: readonly ReportRow[],
  answerKeys: readonly AdminSchemaAnswerKeyRow[],
  mode: ChallengeModeDefinition,
): ChallengeSchemaValidationResult {
  const answerKeysByReport = new Map<string, AdminSchemaAnswerKeyRow[]>();
  for (const answerKey of answerKeys) {
    const rows = answerKeysByReport.get(answerKey.report_id) || [];
    rows.push(answerKey);
    answerKeysByReport.set(answerKey.report_id, rows);
  }

  const issueCounts = new Map<ChallengeSchemaValidationIssue["type"], number>();
  const increment = (type: ChallengeSchemaValidationIssue["type"]) => {
    issueCounts.set(type, (issueCounts.get(type) || 0) + 1);
  };

  for (const report of reports) {
    const rows = answerKeysByReport.get(report.id) || [];
    if (rows.length === 0) {
      increment("missing_answer_key");
      continue;
    }
    if (rows.length > 1) {
      increment("duplicate_answer_key");
      continue;
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
      increment("missing_schema_values");
      continue;
    }

    try {
      validateAnswerValues(answerValues, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("invalid for challenge mode")) {
        increment("invalid_values");
      } else {
        increment("invalid_fields");
      }
    }
  }

  const messages: Record<ChallengeSchemaValidationIssue["type"], string> = {
    missing_answer_key: MISSING_ANSWER_KEYS_ERROR,
    duplicate_answer_key:
      "One or more public or private reports have duplicate answer keys for this mode.",
    missing_schema_values: MISSING_SCHEMA_VALUES_ERROR,
    invalid_fields: ANSWER_KEY_FIELDS_ERROR,
    invalid_values: ANSWER_KEY_VALUE_ERROR,
  };
  const issues = [...issueCounts.entries()].map(([type, count]) => ({
    type,
    count,
    message: messages[type],
  }));
  const reportCounts = reports.reduce(
    (counts, report) => ({ ...counts, [report.split]: counts[report.split] + 1 }),
    { public: 0, private: 0 },
  );

  return {
    ok: issues.length === 0,
    modeId: mode.id,
    schemaVersion: mode.version,
    reportCounts,
    issues,
  };
}
