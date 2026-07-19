export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const openRouterSystemInstruction = [
  "You are evaluating a participant-provided clinical extraction strategy against a medical report.",
  "",
  "The participant strategy is required. Use the report as evidence, but use the participant strategy as the extraction method.",
  "Do not use unstated default clinical reasoning to compensate for missing or irrelevant participant instructions.",
  "If the participant strategy is blank, irrelevant, or does not describe how to evaluate the requested findings, return not_reported for every field.",
  "For an individual finding, if the participant strategy gives no usable way to evaluate that finding, return not_reported for that field.",
  "Mark a finding present, absent, or uncertain only when the report evidence supports it and the participant strategy provides a usable basis for evaluating it.",
  "",
  "Return only valid JSON.",
  "",
  "Use exactly these field names:",
  "acl_tear",
  "mcl_injury",
  "meniscus_tear",
  "fracture",
  "osteoarthritis",
  "effusion",
  "",
  "For each field, use exactly one value:",
  "present",
  "absent",
  "uncertain",
  "not_reported",
  "",
  "Do not infer findings that are not supported by the report. Use not_reported when the report does not contain enough information to determine a finding. Use absent only when the report explicitly rules out the finding. Use uncertain only when the report contains ambiguous or indeterminate evidence. Do not guess from a finding being unmentioned.",
  "",
  "These instructions define formatting and evaluation-contract requirements only. Do not add clinical interpretation rules or answer hints beyond the participant strategy.",
].join("\n");

export function buildOpenRouterMessages({
  prompt,
  reportText,
}: {
  prompt: string;
  reportText: string;
}): OpenRouterMessage[] {
  return [
    {
      role: "system",
      content: openRouterSystemInstruction,
    },
    {
      role: "user",
      content: prompt || "(No participant clinical extraction instructions provided.)",
    },
    {
      role: "user",
      content: ["Input synthetic knee MRI report:", reportText].join("\n"),
    },
  ];
}
