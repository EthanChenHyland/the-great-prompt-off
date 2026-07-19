export const evaluationModelOptions = [
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
    id: "google/gemma-3-4b-it",
    label: "Gemma 3 4B",
    difficulty: "Experimental",
    note: "May be less reliable; use calibration to check JSON/scoring behavior.",
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
