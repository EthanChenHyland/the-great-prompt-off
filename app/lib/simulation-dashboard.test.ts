import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSimulationRunPayload,
  getSimulationEvaluationEstimate,
} from "./simulation-dashboard";

describe("admin simulation dashboard", () => {
  it("builds the exact safe simulation run payload", () => {
    const payload = buildSimulationRunPayload({
      modeId: "knee_mri_12_basic",
      schemaVersion: 1,
      reportScope: "public",
      profileIds: ["blank", "basic_all_fields"],
    });

    expect(payload).toEqual({
      modeId: "knee_mri_12_basic",
      schemaVersion: 1,
      reportScope: "public",
      profileIds: ["blank", "basic_all_fields"],
    });
    expect(Object.keys(payload).sort()).toEqual([
      "modeId",
      "profileIds",
      "reportScope",
      "schemaVersion",
    ]);
  });

  it("calculates evaluations from reports and selected profiles", () => {
    expect(getSimulationEvaluationEstimate(5, 4)).toBe(20);
    expect(getSimulationEvaluationEstimate(0, 4)).toBe(0);
  });

  it("keeps the page admin-only and the client on simulation endpoints", () => {
    const page = readFileSync(
      path.join(process.cwd(), "app", "admin", "simulations", "page.tsx"),
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

    expect(page).toContain("hasAdminSession");
    expect(page).toContain("AdminLoginForm");
    expect(component).toContain('const simulationEndpoint = "/api/admin/simulations"');
    expect(component).not.toContain("/api/submissions");
    expect(component).not.toContain("/api/challenge-data");
    expect(component).not.toContain("/api/admin/challenge-schema");
  });

  it("requires confirmations and marks dormant modes as rehearsal-only", () => {
    const component = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "components",
        "AdminSimulationDashboard.tsx",
      ),
      "utf8",
    );

    expect(component).toContain("window.confirm");
    expect(component).toContain("window.prompt");
    expect(component).toContain("CLEAR SIMULATIONS");
    expect(component).toContain("Dormant / rehearsal-only");
    expect(component).toContain("Deterministic simulation is synthetic and not a real LLM benchmark.");
  });

  it("does not render sensitive simulation source data", () => {
    const component = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "components",
        "AdminSimulationDashboard.tsx",
      ),
      "utf8",
    );

    expect(component).not.toContain("answer_values");
    expect(component).not.toContain("report_text");
    expect(component).not.toContain("strategy_snapshot");
    expect(component).not.toContain("raw_model_output");
  });
});
