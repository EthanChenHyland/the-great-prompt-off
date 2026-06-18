import type { EventPhase } from "./event-phase";

export const leaderboardVisibilityModes = [
  "hidden",
  "practice",
  "final",
  "ended",
  "always",
] as const;

export type LeaderboardVisibility = (typeof leaderboardVisibilityModes)[number];

export function isLeaderboardVisibility(
  value: unknown,
): value is LeaderboardVisibility {
  return (
    typeof value === "string" &&
    leaderboardVisibilityModes.includes(value as LeaderboardVisibility)
  );
}

export function leaderboardVisibilityLabel(mode: LeaderboardVisibility) {
  switch (mode) {
    case "hidden":
      return "Hidden";
    case "practice":
      return "Practice only";
    case "final":
      return "Final and ended";
    case "ended":
      return "Ended only";
    case "always":
      return "Always visible";
  }
}

export function canShowParticipantLeaderboard({
  eventPhase,
  visibility,
}: {
  eventPhase: EventPhase;
  visibility: LeaderboardVisibility;
}) {
  switch (visibility) {
    case "hidden":
      return false;
    case "practice":
      return eventPhase === "practice_open";
    case "final":
      return eventPhase === "final_open" || eventPhase === "ended";
    case "ended":
      return eventPhase === "ended";
    case "always":
      return true;
  }
}
