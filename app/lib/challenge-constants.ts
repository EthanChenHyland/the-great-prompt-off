import type { FindingKey } from "./types";

export const findingKeys: FindingKey[] = [
  "acl_tear",
  "mcl_injury",
  "meniscus_tear",
  "fracture",
  "osteoarthritis",
  "effusion",
];

export const findingLabels: Record<FindingKey, string> = {
  acl_tear: "ACL tear",
  mcl_injury: "MCL injury",
  meniscus_tear: "Meniscus tear",
  fracture: "Fracture",
  osteoarthritis: "Osteoarthritis",
  effusion: "Effusion",
};

export const valueOptions = ["present", "absent", "uncertain"] as const;

export const challenge = {
  title: "Knee MRI Extraction Challenge",
  subtitle: "Extract structured findings from synthetic non-PHI radiology reports.",
  allowedValues: valueOptions,
  sampleRange: "Public test reports 001-005",
};

export const participantStorageKey = "great-prompt-off-participant-id";

export const submissionStorageKey = "great-prompt-off-submissions";
