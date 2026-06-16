import { findingKeys } from "./challenge-constants";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "google/gemini-2.0-flash-001";
const requestTimeoutMs = 30000;

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

export function hasOpenRouterApiKey() {
  return Boolean(process.env.OPENROUTER_API_KEY);
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

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

  let response: Response;

  try {
    response = await fetch(openRouterUrl, {
      method: "POST",
      signal: controller.signal,
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
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenRouter request timed out. Please try again.");
    }

    throw new Error("OpenRouter request failed before a response was received.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter request failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content?.trim()) {
    throw new Error("OpenRouter returned an empty model output.");
  }

  return content;
}
