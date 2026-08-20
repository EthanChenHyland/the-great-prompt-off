import { describe, expect, it } from "vitest";
import {
  challengeModes,
  defaultChallengeMode,
  getPublicChallengeModeMetadata,
} from "./challenge-modes";
import { findingKeys, findingLabels, valueOptions } from "./challenge-constants";

describe("challenge mode registry", () => {
  it("defines the current six-field mode as the default", () => {
    expect(defaultChallengeMode.id).toBe("knee_mri_6_basic");
    expect(defaultChallengeMode.fields.map((field) => field.key)).toEqual([
      "acl_tear",
      "mcl_injury",
      "meniscus_tear",
      "fracture",
      "osteoarthritis",
      "effusion",
    ]);
    for (const field of defaultChallengeMode.fields) {
      expect(field.allowedValues).toEqual([
        "present",
        "absent",
        "uncertain",
        "not_reported",
      ]);
    }
  });

  it("exposes the default mode through the registry", () => {
    expect(challengeModes["knee_mri_6_basic"]).toBe(defaultChallengeMode);
  });

  it("keeps compatibility constants derived from the mode", () => {
    expect(findingKeys).toEqual(defaultChallengeMode.fields.map((field) => field.key));
    expect(Object.values(findingLabels)).toEqual(
      defaultChallengeMode.fields.map((field) => field.label),
    );
    expect(valueOptions).toEqual([
      "present",
      "absent",
      "uncertain",
      "not_reported",
    ]);
  });

  it("exposes only safe schema metadata", () => {
    const metadata = getPublicChallengeModeMetadata();

    expect(metadata).toEqual({
      id: "knee_mri_6_basic",
      version: 1,
      title: "Knee MRI Extraction Challenge",
      fields: [
        { key: "acl_tear", label: "ACL tear" },
        { key: "mcl_injury", label: "MCL injury" },
        { key: "meniscus_tear", label: "Meniscus tear" },
        { key: "fracture", label: "Fracture" },
        { key: "osteoarthritis", label: "Osteoarthritis" },
        { key: "effusion", label: "Effusion" },
      ],
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
    });
    expect(JSON.stringify(metadata)).not.toContain("answer");
    expect(JSON.stringify(metadata)).not.toContain("prompt");
  });
});
