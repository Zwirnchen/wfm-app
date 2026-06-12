import { describe, it, expect } from "vitest";
import { computeCoverage } from "./coverage";
import type { AssignmentForCoverage, Requirement } from "./coverage";

const requirements: Requirement[] = [
  { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 2 },
  { date: "2026-06-15", intervalStart: "08:30", requiredAgents: 2 },
];

const assignments: AssignmentForCoverage[] = [
  { date: "2026-06-15", shiftStart: "08:00", shiftEnd: "16:00", breaks: [] },
  { date: "2026-06-15", shiftStart: "08:00", shiftEnd: "16:00", breaks: [{ start: "08:30", durationMinutes: 30 }] },
];

describe("computeCoverage", () => {
  it("counts present agents per interval minus those on break", () => {
    const cov = computeCoverage(assignments, requirements, 30);
    const at0800 = cov.find((c) => c.intervalStart === "08:00")!;
    const at0830 = cov.find((c) => c.intervalStart === "08:30")!;
    expect(at0800.present).toBe(2);
    expect(at0800.deficit).toBe(0); // 2 present, 2 required
    expect(at0830.present).toBe(1); // one agent on break
    expect(at0830.deficit).toBe(1); // 1 present, 2 required
  });
});
