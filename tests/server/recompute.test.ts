import { describe, it, expect } from "vitest";
import { buildRequirementRows } from "@/server/routers/forecast";
import type { StaffingParams } from "@/domain/types";

const params: StaffingParams = {
  serviceLevelTarget: 0.8,
  thresholdSeconds: 20,
  shrinkagePercent: 0,
  maxOccupancy: 0.95,
  intervalLengthMinutes: 30,
};

describe("buildRequirementRows", () => {
  it("maps forecast points to DB-ready requirement rows", () => {
    const rows = buildRequirementRows(
      [{ date: "2026-06-15", intervalStart: "08:00", expectedCalls: 100, ahtSeconds: 180 }],
      params,
    );
    expect(rows[0].intervalStart).toBe("08:00");
    expect(rows[0].requiredAgents).toBeGreaterThan(0);
    expect(rows[0].date instanceof Date).toBe(true);
  });
});
