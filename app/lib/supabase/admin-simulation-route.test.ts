import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("admin simulation dry-run route", () => {
  it("requires admin auth and delegates only to the dry-run service", () => {
    const route = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "dry-run",
        "route.ts",
      ),
      "utf8",
    );

    expect(route).toContain("requireAdminSession");
    expect(route).toContain("runAdminSimulationDryRun");
    expect(route).not.toContain("extractReportWithOpenRouter");
    expect(route).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });
});
