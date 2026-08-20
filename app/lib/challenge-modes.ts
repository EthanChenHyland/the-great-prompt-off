export type ChallengeFieldDefinition = {
  key: string;
  label: string;
  description?: string;
  allowedValues: readonly string[];
  aliases?: readonly string[];
};

export type ChallengeModeDefinition = {
  id: string;
  version: number;
  title: string;
  description?: string;
  domain: string;
  fields: readonly ChallengeFieldDefinition[];
};

export type PublicChallengeModeMetadata = {
  id: string;
  version: number;
  title: string;
  fields: readonly { key: string; label: string }[];
  allowedValues: readonly string[];
};

export const kneeMri6BasicMode = {
  id: "knee_mri_6_basic",
  version: 1,
  title: "Knee MRI Extraction Challenge",
  description: "Extract structured findings from synthetic non-PHI radiology reports.",
  domain: "knee_mri",
  fields: [
    {
      key: "acl_tear",
      label: "ACL tear",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "acl",
        "ACL",
        "acl_status",
        "ACL_status",
        "ACL_intact_or_torn",
        "acl_intact_or_torn",
        "anterior_cruciate_ligament",
      ],
    },
    {
      key: "mcl_injury",
      label: "MCL injury",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "mcl",
        "MCL",
        "mcl_status",
        "MCL_status",
        "MCL_intact_or_torn",
        "mcl_intact_or_torn",
        "medial_collateral_ligament",
      ],
    },
    {
      key: "meniscus_tear",
      label: "Meniscus tear",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "meniscus",
        "meniscal_tear",
        "meniscal_tear_partial_or_full_thickness",
        "medial_or_lateral_meniscus_tear",
        "medial_meniscus",
        "lateral_meniscus",
      ],
    },
    {
      key: "fracture",
      label: "Fracture",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: ["fx", "bone_fracture"],
    },
    {
      key: "osteoarthritis",
      label: "Osteoarthritis",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "arthritis",
        "oa",
        "degenerative_change",
        "degenerative_joint_disease",
        "degenerative_narrowing_or_spurring_osteoarthritis",
        "degenerative_narrowing",
        "spurring",
      ],
    },
    {
      key: "effusion",
      label: "Effusion",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "joint_effusion",
        "knee_effusion",
        "knee_joint_effusion",
        "suprapatellar_effusion",
      ],
    },
  ],
} as const satisfies ChallengeModeDefinition;

export const challengeModes = {
  [kneeMri6BasicMode.id]: kneeMri6BasicMode,
} as const;

export const defaultChallengeMode = kneeMri6BasicMode;

export function getPublicChallengeModeMetadata(
  mode: ChallengeModeDefinition = defaultChallengeMode,
): PublicChallengeModeMetadata {
  return {
    id: mode.id,
    version: mode.version,
    title: mode.title,
    fields: mode.fields.map(({ key, label }) => ({ key, label })),
    allowedValues: [
      ...new Set(mode.fields.flatMap((field) => field.allowedValues)),
    ],
  };
}
