export const evaluationModelOptions = [
  {
    id: "meta-llama/llama-3.2-1b-instruct",
    label: "Llama 3.2 1B Instruct",
    difficulty: "Very lightweight",
    note: "Very small model; useful to test whether prompt strategy matters, but may be less reliable.",
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct",
    label: "Llama 3.2 3B Instruct",
    difficulty: "Lightweight",
    note: "Small model; may show more separation between weak and strong prompts.",
  },
  {
    id: "qwen/qwen3-4b",
    label: "Qwen3 4B",
    difficulty: "Lightweight / reasoning-focused",
    note: "Small Qwen model; useful for testing whether stricter prompting improves extraction.",
  },
  {
    id: "microsoft/phi-4-mini-instruct",
    label: "Phi-4 Mini Instruct",
    difficulty: "Lightweight / reasoning-focused",
    note: "Lightweight model; useful as an alternative to Gemini/Mistral.",
  },
  {
    id: "qwen/qwen-2.5-7b-instruct",
    label: "Qwen2.5 7B Instruct",
    difficulty: "Lightweight-medium",
    note: "Slightly larger Qwen option; useful if very small models fail JSON or extraction.",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    difficulty: "Lightweight",
    note: "Recommended starting point for easier calibration.",
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct",
    label: "Mistral Small 3.2 24B",
    difficulty: "Medium-low",
    note: "Useful alternative when Gemini baselines are too high.",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    difficulty: "Strong",
    note: "Strong baseline; may make current 6-field reports too easy.",
  },
] as const;

export type ApprovedEvaluationModel = (typeof evaluationModelOptions)[number]["id"];

export function isApprovedEvaluationModel(
  model: unknown,
): model is ApprovedEvaluationModel {
  return (
    typeof model === "string" &&
    evaluationModelOptions.some((option) => option.id === model)
  );
}

export function resolveChallengeEvaluationModel(
  challengeModel: string | null | undefined,
  fallbackModel: string,
) {
  return isApprovedEvaluationModel(challengeModel) ? challengeModel : fallbackModel;
}
