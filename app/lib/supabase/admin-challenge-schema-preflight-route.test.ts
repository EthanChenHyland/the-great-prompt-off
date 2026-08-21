import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isChallengeModeActivationAllowed } from "../challenge-modes";

describe("admin challenge schema preflight route", () => {
  it("is read-only and keeps dormant modes outside the activation allowlist", () => {
    const route = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "challenge-schema",
        "preflight",
        "route.ts",
      ),
      "utf8",
    );

    expect(route).toContain("requireAdminSession");
    expect(route).toContain("preflightAdminChallengeSchema");
    expect(route).not.toContain("admin_update_challenge_schema");
    expect(route).not.toContain(".rpc(");
    expect(isChallengeModeActivationAllowed("knee_mri_12_basic")).toBe(false);
    expect(isChallengeModeActivationAllowed("shoulder_mri_basic")).toBe(false);
  });
});
