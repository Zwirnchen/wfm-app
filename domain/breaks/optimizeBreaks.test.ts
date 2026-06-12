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

  it("spreads two breaks onto different intervals via running-present decrement", () => {
    // Two agents, same shift 08:00-09:00, 30-min breaks, FLAT zero requirements.
    // The first lands at 08:00; its decrement makes 08:00 less attractive so the
    // second agent is pushed to 08:30.
    const spreadShifts: ShiftToBreak[] = [
      { id: "a1", date: "2026-06-15", shiftStart: "08:00", shiftEnd: "09:00", breakMinutes: 30, preference: null },
      { id: "a2", date: "2026-06-15", shiftStart: "08:00", shiftEnd: "09:00", breakMinutes: 30, preference: null },
    ];
    const flat: Requirement[] = [
      { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 0 },
      { date: "2026-06-15", intervalStart: "08:30", requiredAgents: 0 },
    ];
    const breaks = optimizeBreaks(spreadShifts, flat, 30);
    expect(breaks).toHaveLength(2);
    expect(breaks.map((b) => b.start).sort()).toEqual(["08:00", "08:30"]);
  });

  it("decrements every interval a multi-interval break spans", () => {
    // First agent has a 60-min break (spans 08:00 and 08:30); second agent has a
    // 30-min break. Because both 08:00 and 08:30 are decremented by the first,
    // the second agent's break is pushed to 09:00.
    const multiShifts: ShiftToBreak[] = [
      { id: "long", date: "2026-06-15", shiftStart: "08:00", shiftEnd: "10:00", breakMinutes: 60, preference: null },
      { id: "short", date: "2026-06-15", shiftStart: "08:00", shiftEnd: "10:00", breakMinutes: 30, preference: null },
    ];
    const flat: Requirement[] = [
      { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 0 },
      { date: "2026-06-15", intervalStart: "08:30", requiredAgents: 0 },
      { date: "2026-06-15", intervalStart: "09:00", requiredAgents: 0 },
      { date: "2026-06-15", intervalStart: "09:30", requiredAgents: 0 },
    ];
    const breaks = optimizeBreaks(multiShifts, flat, 30);
    const long = breaks.find((b) => b.shiftId === "long");
    const short = breaks.find((b) => b.shiftId === "short");
    expect(long?.start).toBe("08:00");
    expect(short?.start).toBe("09:00");
  });

  it("skips a shift whose break is longer than the shift (no overrun)", () => {
    // Single shift 08:00-08:30 (one interval) with a 60-min break: no candidate
    // interval fits, so no break is emitted (rather than an out-of-shift break).
    const tooLong: ShiftToBreak[] = [
      { id: "x", date: "2026-06-15", shiftStart: "08:00", shiftEnd: "08:30", breakMinutes: 60, preference: null },
    ];
    const flat: Requirement[] = [
      { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 0 },
    ];
    const breaks = optimizeBreaks(tooLong, flat, 30);
    expect(breaks).toEqual([]);
  });

  it("keeps shifts on different dates independent via date keying", () => {
    // Identical times on two different dates: each gets its own break, and both
    // can be at 08:00 because the present counts are keyed per date.
    const twoDays: ShiftToBreak[] = [
      { id: "d1", date: "2026-06-15", shiftStart: "08:00", shiftEnd: "09:00", breakMinutes: 30, preference: null },
      { id: "d2", date: "2026-06-16", shiftStart: "08:00", shiftEnd: "09:00", breakMinutes: 30, preference: null },
    ];
    const flat: Requirement[] = [
      { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 0 },
      { date: "2026-06-15", intervalStart: "08:30", requiredAgents: 0 },
      { date: "2026-06-16", intervalStart: "08:00", requiredAgents: 0 },
      { date: "2026-06-16", intervalStart: "08:30", requiredAgents: 0 },
    ];
    const breaks = optimizeBreaks(twoDays, flat, 30);
    expect(breaks).toHaveLength(2);
    expect(breaks.find((b) => b.shiftId === "d1")?.start).toBe("08:00");
    expect(breaks.find((b) => b.shiftId === "d2")?.start).toBe("08:00");
  });
});
