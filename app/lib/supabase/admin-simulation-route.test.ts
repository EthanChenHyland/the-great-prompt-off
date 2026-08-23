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

  it("protects persistent, retrieval, and cleanup routes with admin auth", () => {
    const routePaths = [
      path.join(process.cwd(), "app", "api", "admin", "simulations", "run", "route.ts"),
      path.join(process.cwd(), "app", "api", "admin", "simulations", "route.ts"),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "analytics",
        "route.ts",
      ),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "compare",
        "route.ts",
      ),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "export",
        "route.ts",
      ),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "[batchId]",
        "route.ts",
      ),
    ];

    for (const routePath of routePaths) {
      expect(readFileSync(routePath, "utf8")).toContain("requireAdminSession");
    }
  });

  it("persists and cleans up only isolated simulation data", () => {
    const service = readFileSync(
      path.join(process.cwd(), "app", "lib", "supabase", "admin-simulations.ts"),
      "utf8",
    );

    expect(service).toContain('.from("simulation_batches")');
    expect(service).toContain('.from("simulation_runs")');
    expect(service).toContain('.from("simulation_run_items")');
    expect(service).toContain('"admin_delete_simulation_batch"');
    expect(service).toContain('"admin_clear_simulation_data"');
    expect(service).not.toContain('.from("participants")');
    expect(service).not.toContain('.from("prompt_runs")');
    expect(service).not.toContain('.from("prompt_run_items")');
    expect(service).not.toContain('.from("submissions")');
    expect(service).not.toContain('.from("participant_attempt_overrides")');
  });

  it("reads simulation analytics only from isolated simulation tables", () => {
    const service = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "lib",
        "supabase",
        "admin-simulation-analytics.ts",
      ),
      "utf8",
    );

    expect(service).toContain('.from("simulation_batches")');
    expect(service).toContain('.from("simulation_runs")');
    expect(service).not.toContain('.from("simulation_run_items")');
    expect(service).not.toContain('.from("participants")');
    expect(service).not.toContain('.from("prompt_runs")');
    expect(service).not.toContain('.from("prompt_run_items")');
    expect(service).not.toContain('.from("submissions")');
    expect(service).not.toContain('.from("reports")');
    expect(service).not.toContain('.from("answer_keys")');
  });

  it("keeps simulation analytics UI free of source and private result fields", () => {
    const component = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "components",
        "AdminSimulationAnalytics.tsx",
      ),
      "utf8",
    );

    expect(component).not.toContain("answer_values");
    expect(component).not.toContain("report_text");
    expect(component).not.toContain("strategy_snapshot");
    expect(component).not.toContain("raw_model_output");
    expect(component).not.toContain("/api/submissions");
    expect(component).not.toContain("/api/admin/challenge-schema");
  });

  it("exports completed simulation aggregates with active-challenge and optional batch scoping", () => {
    const service = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "lib",
        "supabase",
        "admin-simulation-exports.ts",
      ),
      "utf8",
    );

    expect(service).toContain('.from("simulation_batches")');
    expect(service).toContain('.from("simulation_runs")');
    expect(service).toContain('.eq("challenge_id", challenge.id)');
    expect(service).toContain('.eq("status", "completed")');
    expect(service).toContain('batchQuery.eq("id", batchId)');
    expect(service).not.toContain('.from("simulation_run_items")');
    expect(service).not.toContain('.from("participants")');
    expect(service).not.toContain('.from("prompt_runs")');
    expect(service).not.toContain('.from("prompt_run_items")');
    expect(service).not.toContain('.from("submissions")');
    expect(service).not.toContain('.from("reports")');
    expect(service).not.toContain('.from("answer_keys")');
  });

  it("does not expose source content through exports or reproducibility UI", () => {
    const exportService = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "lib",
        "supabase",
        "admin-simulation-exports.ts",
      ),
      "utf8",
    );
    const component = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "components",
        "AdminSimulationDashboard.tsx",
      ),
      "utf8",
    );

    for (const source of [exportService, component]) {
      expect(source).not.toContain("answer_values");
      expect(source).not.toContain("report_text");
      expect(source).not.toContain("strategy_snapshot");
      expect(source).not.toContain("raw_model_output");
    }
    expect(component).toContain("schemaSnapshotHash");
    expect(component).not.toContain("schema_snapshot");
  });
});
