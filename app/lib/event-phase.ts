export const eventPhases = [
  "not_started",
  "practice_open",
  "final_open",
  "ended",
] as const;

export type EventPhase = (typeof eventPhases)[number];

export function isEventPhase(value: unknown): value is EventPhase {
  return typeof value === "string" && eventPhases.includes(value as EventPhase);
}

export function eventPhaseLabel(phase: EventPhase) {
  switch (phase) {
    case "not_started":
      return "Not started";
    case "practice_open":
      return "Practice open";
    case "final_open":
      return "Final open";
    case "ended":
      return "Ended";
  }
}

export function eventPhaseMessage(phase: EventPhase) {
  switch (phase) {
    case "not_started":
      return "The event has not started yet. Please wait for the organizer.";
    case "practice_open":
      return "Test Attempts are open. Use them to refine your prompt before final submission opens.";
    case "final_open":
      return "Final Submission is open. Your final can only be submitted once.";
    case "ended":
      return "The event has ended. Submissions are closed.";
  }
}
