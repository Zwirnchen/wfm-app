import { describe, it, expect } from "vitest";
import { optimizeBreaks } from "./optimizeBreaks";
import type { ShiftToBreak, Requirement } from "./optimizeBreaks";

// Two agents on the same shift, requirement peaks at 08:30. The single break
// should be placed at the interval with the MOST surplus (08:00), not the peak.
const requirements: Requirement[] = [
  { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 1 },
  { date: "2026-06-15", intervalStart: "08:30", requiredAgents: 2 },
];

const shifts: ShiftToBreak[] = [
  { id: "a1", date: "2026-06-15", shiftStart: "08:00", shiftEnd: "09:00", breakMinutes: 30, preference: null },
  { id: "a2", date: "2026-06-15", shiftStart: "08:00", shiftEnd: "09:00", breakMinutes: 30, preference: null },
];

describe("optimizeBreaks", () => {
  it("places each break in the highest-surplus interval within the shift", () => {
    const breaks = optimizeBreaks(shifts, requirements, 30);
    expect(breaks).toHaveLength(2);
    // both breaks land at 08:00 where surplus is largest
    expect(breaks.every((b) => b.start === "08:00")).toBe(true);
  });

  it("respects a feasible preference as a tie-breaker", () => {
    const withPref: ShiftToBreak[] = [
      { ...shifts[0], preference: "08:30" },
    ];
    const flat: Requirement[] = [
      { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 0 },
      { date: "2026-06-15", intervalStart: "08:30", requiredAgents: 0 },
    ];
    const breaks = optimizeBreaks(withPref, flat, 30);
    expect(breaks[0].start).toBe("08:30");
  });
});
