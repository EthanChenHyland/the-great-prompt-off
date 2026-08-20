export const CHALLENGE_CONFIGURATION_LOCK_MESSAGE =
  "Challenge configuration is locked after the first successful submission.";

/** A submission row is the durable marker for successful event activity. */
export function isChallengeConfigurationLocked(successfulSubmissionCount: number) {
  return successfulSubmissionCount > 0;
}

