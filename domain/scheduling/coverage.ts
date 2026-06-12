import { intervalCovered } from "./intervals";

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

function onBreak(intervalStart: string, intervalLen: number, breaks: BreakSlot[]): boolean {
  return breaks.some((b) =>
    intervalCovered(intervalStart, intervalLen, b.start, addMinutes(b.start, b.durationMinutes)),
  );
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
