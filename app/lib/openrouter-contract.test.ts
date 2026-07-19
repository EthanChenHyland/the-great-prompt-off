import { describe, expect, it } from "vitest";

import {
  buildOpenRouterMessages,
  openRouterSystemInstruction,
} from "./openrouter-contract";

describe("OpenRouter evaluation contract", () => {
  it("requires a usable participant strategy", () => {
    expect(openRouterSystemInstruction).toContain(
      "First, silently evaluate whether the participant strategy is a usable clinical extraction strategy.",
    );
    expect(openRouterSystemInstruction).toContain(
      "The participant strategy is required.",
    );
    expect(openRouterSystemInstruction).toContain(
      "If the participant strategy is blank, nonsense, irrelevant, or not a usable clinical extraction strategy, immediately return not_reported for every required field.",
    );
    expect(openRouterSystemInstruction).toContain(
      "When the strategy is unusable, do not use the report text to infer, rescue, or fill in any answers.",
    );
    expect(openRouterSystemInstruction).toContain(
      "Do not use your own default medical reasoning or knowledge to compensate for an unusable participant strategy.",
    );
    expect(openRouterSystemInstruction).toContain(
      "If either the participant strategy or the report evidence is insufficient for a finding, output not_reported for that finding.",
    );
  });

  it("requires one raw JSON object without markdown or explanations", () => {
    expect(openRouterSystemInstruction).toContain(
      "Return exactly one raw JSON object and nothing else.",
    );
    expect(openRouterSystemInstruction).toContain(
      "Do not wrap the JSON in markdown or code fences.",
    );
    expect(openRouterSystemInstruction).toContain(
      "Do not include explanations, comments, or extra text before or after the JSON object.",
    );
  });

  it("keeps hidden instructions, participant prompt, and report separate", () => {
    const participantPrompt = "Use my clinical extraction strategy.";
    const reportText = "Synthetic report text.";
    const messages = buildOpenRouterMessages({
      prompt: participantPrompt,
      reportText,
    });

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).not.toContain(participantPrompt);
    expect(messages[1]).toEqual({
      role: "user",
      content: participantPrompt,
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: `Input synthetic knee MRI report:\n${reportText}`,
    });
  });

  it("uses the no-strategy placeholder without exposing the system instruction", () => {
    const messages = buildOpenRouterMessages({
      prompt: "",
      reportText: "Synthetic report text.",
    });

    expect(messages[1].content).toBe(
      "(No participant clinical extraction instructions provided.)",
    );
    expect(messages[1].content).not.toContain("not_reported for every field");
  });
});
