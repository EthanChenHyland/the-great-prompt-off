const fallbackModelLabel = "Current evaluation model";

export function getFriendlyModelName(modelId: string | null | undefined) {
  if (!modelId?.trim()) {
    return fallbackModelLabel;
  }

  const withoutProvider = modelId.trim().split("/").pop() || "";

  if (/^gpt-/iu.test(withoutProvider)) {
    return withoutProvider.replace(/^gpt-/iu, "GPT-").toUpperCase();
  }

  const cleaned = withoutProvider
    .replace(/-\d{3,}$/u, "")
    .replace(/[_-]+/gu, " ")
    .trim();

  if (!cleaned) {
    return fallbackModelLabel;
  }

  return cleaned
    .split(/\s+/u)
    .map(formatModelWord)
    .join(" ");
}

function formatModelWord(word: string) {
  const normalized = word.toLowerCase();

  if (normalized === "gpt") {
    return "GPT";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
