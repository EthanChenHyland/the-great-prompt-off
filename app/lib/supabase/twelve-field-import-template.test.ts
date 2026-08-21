import { describe, expect, it } from "vitest";
import template from "../../../seed-data/templates/knee-mri-12-answer-keys.template.json";
import {
  getChallengeModeForValidation,
  prepareAnswerKeyImportPayload,
} from "./admin-challenge-schema";
import { isChallengeModeActivationAllowed } from "../challenge-modes";

describe("twelve-field answer-key rehearsal template", () => {
  it("is a valid validate-only example for the dormant twelve-field schema", () => {
    const mode = getChallengeModeForValidation(template.modeId, template.schemaVersion);
    const report = {
      id: "template-report-id",
      split: "public" as const,
      external_id: template.items[0].report_id_or_filename,
    };
    const preparation = prepareAnswerKeyImportPayload(template, [report], mode);

    expect(template.templateNotice).toContain("Example structure and labels only");
    expect(template.write).toBe(false);
    expect(template.overwrite).toBe(false);
    expect(preparation.validation.ok).toBe(true);
    expect(Object.keys(template.items[0].answer_values)).toEqual(
      mode.fields.map((field) => field.key),
    );
    expect(isChallengeModeActivationAllowed(template.modeId)).toBe(false);
  });
});
