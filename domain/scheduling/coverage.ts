import { intervalCovered, toMinutes } from "./intervals";

export interface Requirement {
  date: string;
  intervalStart: string;
  requiredAgents: number;
}

export interface BreakSlot {
  start: string; // "HH:mm"
  durationMinutes: number;
}

export interface AssignmentForCoverage {
  date: string;
  shiftStart: string;
  shiftEnd: string;
  breaks: BreakSlot[];
}

export interface CoverageCell {
  date: string;
  intervalStart: string;
  required: number;
  present: number;
  deficit: number; // max(0, required - present)
}

/**
 * An agent counts as absent for an interval if any of their breaks overlaps
 * that interval. Overlap is detected on minutes-since-midnight: a break and an
 * interval overlap when the break starts before the interval ends and ends
 * after the interval starts. (A break shorter than the interval still marks the
 * agent absent.)
 */
function onBreak(intervalStart: string, intervalLen: number, breaks: BreakSlot[]): boolean {
  const ivStart = toMinutes(intervalStart);
  const ivEnd = ivStart + intervalLen;
  return breaks.some((b) => {
    const bStart = toMinutes(b.start);
    const bEnd = bStart + b.durationMinutes;
    return bStart < ivEnd && bEnd > ivStart; // any overlap
  });
}

export function computeCoverage(
  assignments: AssignmentForCoverage[],
  requirements: Requirement[],
  intervalLengthMinutes: number,
): CoverageCell[] {
  return requirements.map((r) => {
    const present = assignments.filter(
      (a) =>
        a.date === r.date &&
        intervalCovered(r.intervalStart, intervalLengthMinutes, a.shiftStart, a.shiftEnd) &&
        !onBreak(r.intervalStart, intervalLengthMinutes, a.breaks),
    ).length;
    return {
      date: r.date,
      intervalStart: r.intervalStart,
      required: r.requiredAgents,
      present,
      deficit: Math.max(0, r.requiredAgents - present),
    };
  });
}
