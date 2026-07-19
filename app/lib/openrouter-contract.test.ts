import { describe, expect, it } from "vitest";

import {
  buildOpenRouterMessages,
  openRouterSystemInstruction,
} from "./openrouter-contract";

describe("OpenRouter evaluation contract", () => {
  it("requires a usable participant strategy", () => {
    expect(openRouterSystemInstruction).toContain(
      "The participant strategy is required.",
    );
    expect(openRouterSystemInstruction).toContain(
      "If the participant strategy is blank, irrelevant, or does not describe how to evaluate the requested findings, return not_reported for every field.",
    );
    expect(openRouterSystemInstruction).toContain(
      "Do not use unstated default clinical reasoning to compensate for missing or irrelevant participant instructions.",
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
