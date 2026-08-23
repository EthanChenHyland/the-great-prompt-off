import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase", "simulation-storage.sql"),
  "utf8",
);

describe("isolated simulation storage migration", () => {
  it("creates only the three simulation storage tables", () => {
    expect(sql).toContain("create table if not exists public.simulation_batches");
    expect(sql).toContain("create table if not exists public.simulation_runs");
    expect(sql).toContain("create table if not exists public.simulation_run_items");
    expect(sql).not.toMatch(/alter table public\.(prompt_runs|prompt_run_items|submissions)/i);
  });

  it("adds simulation-only cleanup RPCs with service-role access", () => {
    expect(sql).toContain("admin_delete_simulation_batch");
    expect(sql).toContain("admin_clear_simulation_data");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/delete from public\.(prompt_runs|prompt_run_items|submissions)/i);
  });

  it("constrains deterministic evaluator, scope, status, and score percentage", () => {
    expect(sql).toContain("evaluator_type in ('deterministic_mock')");
    expect(sql).toContain("report_scope in ('public', 'private', 'all')");
    expect(sql).toContain("status in ('running', 'completed', 'failed')");
    expect(sql).toMatch(/score >= 0 and score <= 100/);
  });
});
