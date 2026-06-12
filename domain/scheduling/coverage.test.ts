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

  it("excludes assignments on a different date", () => {
    const reqs: Requirement[] = [
      { date: "2026-06-16", intervalStart: "08:00", requiredAgents: 2 },
    ];
    const asgs: AssignmentForCoverage[] = [
      { date: "2026-06-15", shiftStart: "08:00", shiftEnd: "16:00", breaks: [] },
    ];
    const cov = computeCoverage(asgs, reqs, 30);
    expect(cov[0].present).toBe(0);
    expect(cov[0].deficit).toBe(2); // deficit equals required
  });

  it("excludes assignments whose shift does not cover the interval", () => {
    const reqs: Requirement[] = [
      { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 1 },
    ];
    const asgs: AssignmentForCoverage[] = [
      { date: "2026-06-15", shiftStart: "13:00", shiftEnd: "16:00", breaks: [] },
    ];
    const cov = computeCoverage(asgs, reqs, 30);
    expect(cov[0].present).toBe(0);
  });

  it("returns deficit = required for every requirement when there are no assignments", () => {
    const cov = computeCoverage([], requirements, 30);
    for (const cell of cov) {
      expect(cell.present).toBe(0);
      expect(cell.deficit).toBe(cell.required);
    }
  });

  it("returns [] when there are no requirements", () => {
    expect(computeCoverage(assignments, [], 30)).toEqual([]);
  });

  it("marks an agent absent when a short break overlaps the interval", () => {
    // 15-min break at 08:30 on a 30-min grid: break window 08:30-08:45
    // overlaps the 08:30-09:00 interval, so the agent is absent for it.
    const reqs: Requirement[] = [
      { date: "2026-06-15", intervalStart: "08:30", requiredAgents: 2 },
    ];
    const asgs: AssignmentForCoverage[] = [
      { date: "2026-06-15", shiftStart: "08:00", shiftEnd: "16:00", breaks: [] },
      {
        date: "2026-06-15",
        shiftStart: "08:00",
        shiftEnd: "16:00",
        breaks: [{ start: "08:30", durationMinutes: 15 }],
      },
    ];
    const cov = computeCoverage(asgs, reqs, 30);
    expect(cov[0].present).toBe(1); // one of two agents on a short break
    expect(cov[0].deficit).toBe(1);
  });
});
