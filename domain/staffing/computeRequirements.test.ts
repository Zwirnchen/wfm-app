import { describe, it, expect } from "vitest";
import { computeRequirements } from "./computeRequirements";
import type { ForecastPoint, StaffingParams } from "../types";

const params: StaffingParams = {
  serviceLevelTarget: 0.8,
  thresholdSeconds: 20,
  shrinkagePercent: 0,
  maxOccupancy: 0.95,
  intervalLengthMinutes: 30,
};

const forecast: ForecastPoint[] = [
  { date: "2026-06-15", intervalStart: "08:00", expectedCalls: 100, ahtSeconds: 180 },
  { date: "2026-06-15", intervalStart: "08:30", expectedCalls: 0, ahtSeconds: 180 },
];

describe("computeRequirements", () => {
  it("produces one requirement per forecast point preserving date/interval", () => {
    const result = computeRequirements(forecast, params);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ date: "2026-06-15", intervalStart: "08:00" });
    expect(result[0].requiredAgents).toBeGreaterThan(0);
    expect(result[1].requiredAgents).toBe(0);
  });
});
