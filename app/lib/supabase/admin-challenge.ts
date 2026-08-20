import "server-only";

import {
  CHALLENGE_CONFIGURATION_LOCK_MESSAGE,
  isChallengeConfigurationLocked,
} from "@/app/lib/challenge-lock";

export { CHALLENGE_CONFIGURATION_LOCK_MESSAGE, isChallengeConfigurationLocked };

export class ChallengeConfigurationLockedError extends Error {
  constructor() {
    super(CHALLENGE_CONFIGURATION_LOCK_MESSAGE);
    this.name = "ChallengeConfigurationLockedError";
  }
}

/**
 * Route-level preflight for a clearer admin error. The database trigger in
 * supabase/challenge-config-lock.sql is the authoritative race-safe guard.
 */
export async function assertChallengeConfigurationMutable(
  supabase: unknown,
  challengeId: string,
) {
  const client = supabase as {
    from: (table: string) => {
      select: (
        columns: string,
        options?: { count?: "exact"; head?: boolean },
      ) => {
        eq: (column: string, value: string) => Promise<{
          count: number | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
  const { count, error } = await client
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("challenge_id", challengeId);

  if (error) {
    throw new Error(`Could not check challenge configuration lock: ${error.message}`);
  }

  if (isChallengeConfigurationLocked(count ?? 0)) {
    throw new ChallengeConfigurationLockedError();
  }
}
