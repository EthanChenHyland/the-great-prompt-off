import { findingKeys } from "./challenge-constants";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "google/gemini-2.0-flash-001";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function shouldUseRealLlm() {
  return process.env.USE_REAL_LLM === "true";
}

export function getOpenRouterModel() {
  return process.env.OPENROUTER_MODEL || defaultModel;
}

export async function extractReportWithOpenRouter({
  prompt,
  reportText,
}: {
  prompt: string;
  reportText: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required when USE_REAL_LLM=true.");
  }

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content:
        "You extract structured findings from synthetic knee MRI reports. Return only strict JSON with exactly these keys: acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion. Each value must be one of: present, absent, uncertain. Do not include markdown, prose, or extra keys.",
    },
    {
      role: "user",
      content: [
        "Participant prompt:",
        prompt || "(No participant prompt provided.)",
        "",
        "Synthetic knee MRI report:",
        reportText,
        "",
        `Required keys: ${findingKeys.join(", ")}`,
        "Allowed values: present, absent, uncertain",
      ].join("\n"),
    },
  ];

  const response = await fetch(openRouterUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenRouterModel(),
      messages,
      temperature: 0,
      max_tokens: 300,
      response_format: {
        type: "json_object",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter request failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenRouter response did not include message content.");
  }

  return content;
}
