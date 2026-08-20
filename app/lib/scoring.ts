import { defaultChallengeMode } from "./challenge-modes";
import { findingKeys, valueOptions } from "./challenge-constants";
import type {
  AnswerKey,
  FieldScoreResult,
  FindingKey,
  FindingValue,
  InvalidFieldResult,
  ScoringDiagnostics,
  ScoringResult,
} from "./types";

type ModelOutputObject = Record<string, unknown>;

type ParsedModelOutput = {
  diagnostics: ScoringDiagnostics;
  output: ModelOutputObject | null;
};

const allowedValues = new Set<string>(valueOptions);

const keyAliases: Array<[FindingKey, string[]]> = defaultChallengeMode.fields.map(
  (field) => [field.key as FindingKey, [...(field.aliases ?? [])]],
);

const keyMap = new Map<string, FindingKey>();

for (const field of findingKeys) {
  keyMap.set(normalizeKeyToken(field), field);
}

for (const [field, aliases] of keyAliases) {
  for (const alias of aliases) {
    keyMap.set(normalizeKeyToken(alias), field);
  }
}

const nestedReportKeys = new Set([
  "report",
  "report1",
  "report_1",
  "findings",
  "result",
  "results",
]);

export function scoreModelOutput(
  modelOutput: ModelOutputObject | string,
  answerKey: AnswerKey,
): ScoringResult {
  const parsed = parseModelOutput(modelOutput);

  if (!parsed.output) {
    return buildInvalidJsonResult(answerKey, parsed.diagnostics);
  }

  const normalized = normalizeOutputObject(parsed.output, parsed.diagnostics);
  const output = normalized.output;
  const missingFields: FindingKey[] = [];
  const invalidFields: InvalidFieldResult[] = [];

  const perField = findingKeys.map<FieldScoreResult>((field) => {
    const rawValue = output[field];
    const missing = rawValue === undefined;
    const invalid = !missing && !isFindingValue(rawValue);
    const actual = isFindingValue(rawValue) ? rawValue : null;

    if (missing) {
      missingFields.push(field);
    }

    if (invalid) {
      invalidFields.push({ field, value: rawValue });
    }

    return {
      field,
      expected: answerKey[field],
      actual,
      correct: actual === answerKey[field],
      missing,
      invalid,
    };
  });

  return buildScoringResult({
    diagnostics: normalized.diagnostics,
    invalidFields,
    missingFields,
    perField,
    validJson: true,
  });
}

function parseModelOutput(modelOutput: ModelOutputObject | string): ParsedModelOutput {
  const baseDiagnostics: ScoringDiagnostics = {
    strict_json_valid: false,
    recovered_json_used: false,
    nested_object_used: false,
    normalization_used: false,
    key_normalization_used: false,
    value_normalization_used: false,
    ignored_outer_key: null,
    ignored_extra_fields: [],
  };

  if (typeof modelOutput !== "string") {
    return {
      diagnostics: {
        ...baseDiagnostics,
        strict_json_valid: isPlainObject(modelOutput),
      },
      output: isPlainObject(modelOutput) ? modelOutput : null,
    };
  }

  const strict = parseJson(modelOutput);
  const strictJsonWasValid = strict.ok;

  if (strict.ok) {
    if (isPlainObject(strict.value)) {
      return {
        diagnostics: { ...baseDiagnostics, strict_json_valid: true },
        output: strict.value,
      };
    }

    if (isSingleObjectArray(strict.value)) {
      return {
        diagnostics: {
          ...baseDiagnostics,
          strict_json_valid: true,
          recovered_json_used: true,
        },
        output: strict.value[0],
      };
    }
  }

  const candidates = [
    stripMarkdownFence(modelOutput),
    extractFirstJsonObject(modelOutput),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const recovered = parseJson(candidate);

    if (!recovered.ok) {
      continue;
    }

    if (isPlainObject(recovered.value)) {
      return {
        diagnostics: {
          ...baseDiagnostics,
          strict_json_valid: false,
          recovered_json_used: true,
        },
        output: recovered.value,
      };
    }

    if (isSingleObjectArray(recovered.value)) {
      return {
        diagnostics: {
          ...baseDiagnostics,
          strict_json_valid: false,
          recovered_json_used: true,
        },
        output: recovered.value[0],
      };
    }
  }

  return {
    diagnostics: {
      ...baseDiagnostics,
      strict_json_valid: strictJsonWasValid,
    },
    output: null,
  };
}

function normalizeOutputObject(
  output: ModelOutputObject,
  diagnostics: ScoringDiagnostics,
) {
  const unwrapped = unwrapNestedSingleReport(output);
  const sourceOutput = unwrapped.output;
  const normalized: ModelOutputObject = {};
  const ignoredExtraFields: string[] = [];
  let normalizationUsed = diagnostics.normalization_used;
  let keyNormalizationUsed = diagnostics.key_normalization_used;
  let valueNormalizationUsed = diagnostics.value_normalization_used;

  Object.entries(sourceOutput).forEach(([rawField, rawValue]) => {
    const field = normalizeField(rawField);

    if (!field) {
      ignoredExtraFields.push(rawField);
      return;
    }

    if (field !== rawField) {
      normalizationUsed = true;
      keyNormalizationUsed = true;
    }

    if (normalized[field] !== undefined) {
      ignoredExtraFields.push(rawField);
      return;
    }

    const normalizedValue = normalizeValue(rawValue, field);

    if (normalizedValue !== rawValue) {
      normalizationUsed = true;
      valueNormalizationUsed = true;
    }

    normalized[field] = normalizedValue;
  });

  return {
    diagnostics: {
      ...diagnostics,
      nested_object_used: diagnostics.nested_object_used || unwrapped.used,
      normalization_used: normalizationUsed,
      key_normalization_used: keyNormalizationUsed,
      value_normalization_used: valueNormalizationUsed,
      ignored_outer_key: unwrapped.ignoredOuterKey ?? diagnostics.ignored_outer_key,
      ignored_extra_fields: ignoredExtraFields,
    },
    output: normalized,
  };
}

function normalizeField(field: string): FindingKey | null {
  const normalized = normalizeKeyToken(field);

  return keyMap.get(normalized) ?? null;
}

function normalizeValue(value: unknown, field: FindingKey) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = normalizeValueText(value);

  if (allowedValues.has(normalized)) {
    return normalized;
  }

  // Structural recovery and field-name aliases are allowed, but value scoring is
  // intentionally strict: clinical phrases are invalid unless the model returns
  // one of the exact controlled labels after trim/lowercase cleanup.
  void field;
  return value;
}

function normalizeKeyToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeValueText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function unwrapNestedSingleReport(output: ModelOutputObject) {
  // Manual fixture this should recover:
  // { "report_1": { "ACL_intact_or_torn": "intact", ... } }
  // Multi-report objects are left alone because each scoring call is for one report.
  const entries = Object.entries(output);

  if (entries.length !== 1) {
    return { ignoredOuterKey: null, output, used: false };
  }

  const [outerKey, innerValue] = entries[0];

  if (!nestedReportKeys.has(outerKey.trim().toLowerCase()) || !isPlainObject(innerValue)) {
    return { ignoredOuterKey: null, output, used: false };
  }

  return {
    ignoredOuterKey: outerKey,
    output: innerValue,
    used: true,
  };
}

function parseJson(value: string):
  | { ok: true; value: unknown }
  | { ok: false; value: null } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
}

function stripMarkdownFence(value: string) {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  return match?.[1]?.trim() ?? "";
}

function extractFirstJsonObject(value: string) {
  const start = value.indexOf("{");

  if (start === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return "";
}

function buildInvalidJsonResult(
  answerKey: AnswerKey,
  diagnostics: ScoringDiagnostics,
): ScoringResult {
  const perField = findingKeys.map<FieldScoreResult>((field) => ({
    field,
    expected: answerKey[field],
    actual: null,
    correct: false,
    missing: true,
    invalid: false,
  }));

  return buildScoringResult({
    diagnostics,
    validJson: false,
    perField,
    missingFields: [...findingKeys],
    invalidFields: [],
  });
}

function buildScoringResult({
  diagnostics,
  invalidFields,
  missingFields,
  perField,
  validJson,
}: {
  diagnostics: ScoringDiagnostics;
  invalidFields: InvalidFieldResult[];
  missingFields: FindingKey[];
  perField: FieldScoreResult[];
  validJson: boolean;
}): ScoringResult {
  const correct = perField.filter((result) => result.correct).length;
  const fieldAccuracy = (correct / findingKeys.length) * 100;

  return {
    valid_json: validJson,
    per_field: perField,
    missing_fields: missingFields,
    invalid_fields: invalidFields,
    field_accuracy: fieldAccuracy,
    overall_score: validJson ? fieldAccuracy : 0,
    diagnostics,
  };
}

function isFindingValue(value: unknown): value is FindingValue {
  return typeof value === "string" && allowedValues.has(value);
}

function isPlainObject(value: unknown): value is ModelOutputObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSingleObjectArray(value: unknown): value is [ModelOutputObject] {
  return Array.isArray(value) && value.length === 1 && isPlainObject(value[0]);
}
