import { defaultChallengeMode } from "./challenge-modes";
import type { FindingKey } from "./types";

export const findingKeys = defaultChallengeMode.fields.map(
  (field) => field.key,
) as FindingKey[];

export const findingFields = findingKeys;

export const findingLabels = Object.fromEntries(
  defaultChallengeMode.fields.map((field) => [field.key, field.label]),
) as Record<FindingKey, string>;

export const valueOptions = defaultChallengeMode.fields[0].allowedValues;

export const findingValues = valueOptions;

export const challenge = {
  title: defaultChallengeMode.title,
  subtitle: defaultChallengeMode.description ?? "",
  allowedValues: valueOptions,
  sampleRange: "Public test reports 001-005",
};

export const participantStorageKey = "great-prompt-off-participant-id";
export const participantSessionTokenStorageKey =
  "great-prompt-off-participant-session-token";

export const submissionStorageKey = "great-prompt-off-submissions";
