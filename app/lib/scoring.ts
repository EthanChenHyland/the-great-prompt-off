import { findingKeys, valueOptions } from "./challenge-constants";
import type {
  AnswerKey,
  FieldScoreResult,
  FindingKey,
  FindingValue,
  InvalidFieldResult,
  ScoringResult,
} from "./types";

type ModelOutputObject = Record<string, unknown>;

const allowedValues = new Set<string>(valueOptions);

export function scoreModelOutput(
  modelOutput: ModelOutputObject | string,
  answerKey: AnswerKey,
): ScoringResult {
  const parsed = parseModelOutput(modelOutput);

  if (!parsed.valid_json || !parsed.output) {
    return buildInvalidJsonResult(answerKey);
  }

  const output = parsed.output;
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

  Object.entries(output).forEach(([field, value]) => {
    if (!findingKeys.includes(field as FindingKey)) {
      invalidFields.push({ field, value });
    }
  });

  return buildScoringResult({
    validJson: true,
    perField,
    missingFields,
    invalidFields,
  });
}

function parseModelOutput(modelOutput: ModelOutputObject | string) {
  if (typeof modelOutput !== "string") {
    return {
      valid_json: isPlainObject(modelOutput),
      output: isPlainObject(modelOutput) ? modelOutput : null,
    };
  }

  try {
    const parsed = JSON.parse(modelOutput);

    return {
      valid_json: true,
      output: isPlainObject(parsed) ? parsed : null,
    };
  } catch {
    return {
      valid_json: false,
      output: null,
    };
  }
}

function buildInvalidJsonResult(answerKey: AnswerKey): ScoringResult {
  const perField = findingKeys.map<FieldScoreResult>((field) => ({
    field,
    expected: answerKey[field],
    actual: null,
    correct: false,
    missing: true,
    invalid: false,
  }));

  return buildScoringResult({
    validJson: false,
    perField,
    missingFields: [...findingKeys],
    invalidFields: [],
  });
}

function buildScoringResult({
  invalidFields,
  missingFields,
  perField,
  validJson,
}: {
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
  };
}

function isFindingValue(value: unknown): value is FindingValue {
  return typeof value === "string" && allowedValues.has(value);
}

function isPlainObject(value: unknown): value is ModelOutputObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
