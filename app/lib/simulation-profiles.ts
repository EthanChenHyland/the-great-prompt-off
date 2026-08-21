import type { ChallengeModeDefinition } from "./challenge-modes";

export type SimulationProfileId =
  | "blank"
  | "nonsense"
  | "vague"
  | "partial_first_field"
  | "basic_all_fields"
  | "strong_all_fields";

export type SimulationProfile = {
  id: SimulationProfileId;
  version: number;
  label: string;
  description: string;
  purpose: string;
  predictionPolicy:
    | "all_not_reported"
    | "weak_all_fields"
    | "first_field_only"
    | "basic_all_fields"
    | "exact_all_fields";
  buildStrategy: (mode: ChallengeModeDefinition) => string;
};

export const simulationProfiles = [
  {
    id: "blank",
    version: 1,
    label: "Blank strategy",
    description: "No participant-provided extraction strategy.",
    purpose: "Checks the no-strategy baseline.",
    predictionPolicy: "all_not_reported",
    buildStrategy: () => "",
  },
  {
    id: "nonsense",
    version: 1,
    label: "Nonsense strategy",
    description: "An irrelevant participant strategy.",
    purpose: "Checks the irrelevant-strategy baseline.",
    predictionPolicy: "all_not_reported",
    buildStrategy: () => "goon goon",
  },
  {
    id: "vague",
    version: 1,
    label: "Vague relevant strategy",
    description: "A relevant request without evidence-to-label rules.",
    purpose: "Represents weak, underspecified extraction guidance.",
    predictionPolicy: "weak_all_fields",
    buildStrategy: () => "Extract the requested findings.",
  },
  {
    id: "partial_first_field",
    version: 1,
    label: "Partial single-field strategy",
    description: "A usable strategy for only the first field in the selected schema.",
    purpose: "Checks partial schema coverage without evaluating other fields.",
    predictionPolicy: "first_field_only",
    buildStrategy: (mode) => {
      const firstField = mode.fields[0];
      return `Evaluate only ${firstField.key}. Use explicit evidence to distinguish present, absent, uncertain, and not_reported. Do not evaluate the other findings.`;
    },
  },
  {
    id: "basic_all_fields",
    version: 1,
    label: "Basic rule-based all-fields strategy",
    description: "A usable evidence-to-label strategy for every requested field.",
    purpose: "Represents a competent baseline strategy.",
    predictionPolicy: "basic_all_fields",
    buildStrategy: () =>
      "For each requested finding, use explicit report evidence. Mark present when identified, absent when explicitly ruled out, uncertain when indeterminate, and not_reported when the report is silent.",
  },
  {
    id: "strong_all_fields",
    version: 1,
    label: "Strong rule-based all-fields strategy",
    description: "A careful evidence-based strategy covering every schema field.",
    purpose: "Provides the deterministic high-quality comparison baseline.",
    predictionPolicy: "exact_all_fields",
    buildStrategy: (mode) =>
      `Evaluate every requested field (${mode.fields.map((field) => field.key).join(", ")}) independently. Use only explicit evidence, distinguish explicit negation from silence, preserve indeterminate findings as uncertain, and use not_reported when evidence is insufficient.`,
  },
] as const satisfies readonly SimulationProfile[];

const profileById = new Map(
  simulationProfiles.map((profile) => [profile.id, profile]),
);

export function getSimulationProfile(profileId: string) {
  return profileById.get(profileId as SimulationProfileId) ?? null;
}

export function getSimulationProfiles(profileIds?: readonly string[]) {
  if (!profileIds) {
    return [...simulationProfiles];
  }

  const uniqueIds = [...new Set(profileIds)];
  return uniqueIds.map((profileId) => {
    const profile = getSimulationProfile(profileId);

    if (!profile) {
      throw new Error(`Unsupported simulation profile: ${profileId}`);
    }

    return profile;
  });
}
