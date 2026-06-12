import { enumerateIntervals, toMinutes, intervalCovered } from "../scheduling/intervals";

export interface Requirement {
  date: string;
  intervalStart: string;
  requiredAgents: number;
}

export interface ShiftToBreak {
  id: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  preference: string | null; // preferred "HH:mm" or null
}

export interface PlannedBreak {
  shiftId: string;
  start: string;
  durationMinutes: number;
}

/**
 * Greedy: process shifts in order; for each, place its break in the in-shift
 * interval with the current largest surplus (present - required). The chosen
 * interval's running "present" count is decremented so later shifts see the
 * updated surplus. Preference wins ties.
 */
export function optimizeBreaks(
  shifts: ShiftToBreak[],
  requirements: Requirement[],
  intervalLengthMinutes: number,
): PlannedBreak[] {
  // running present count per "date|interval"
  const present = new Map<string, number>();
  const key = (date: string, interval: string) => `${date}|${interval}`;
  const required = new Map<string, number>();
  for (const r of requirements) required.set(key(r.date, r.intervalStart), r.requiredAgents);

  // initialize present from shift coverage (ignoring breaks)
  for (const s of shifts) {
    for (const iv of enumerateIntervals(s.shiftStart, s.shiftEnd, intervalLengthMinutes)) {
      const k = key(s.date, iv);
      present.set(k, (present.get(k) ?? 0) + 1);
    }
  }

  const result: PlannedBreak[] = [];
  for (const s of shifts) {
    const candidates = enumerateIntervals(s.shiftStart, s.shiftEnd, intervalLengthMinutes).filter(
      (iv) => intervalCovered(iv, s.breakMinutes, s.shiftStart, s.shiftEnd),
    );
    let best: string | null = null;
    let bestSurplus = -Infinity;
    for (const iv of candidates) {
      const k = key(s.date, iv);
      const surplus = (present.get(k) ?? 0) - (required.get(k) ?? 0);
      const isPref = s.preference === iv;
      if (surplus > bestSurplus || (surplus === bestSurplus && isPref)) {
        bestSurplus = surplus;
        best = iv;
      }
    }
    const chosen = best ?? candidates[0] ?? s.shiftStart;
    // decrement present across the break's intervals
    for (
      let t = toMinutes(chosen);
      t < toMinutes(chosen) + s.breakMinutes;
      t += intervalLengthMinutes
    ) {
      const iv = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      const k = key(s.date, iv);
      present.set(k, (present.get(k) ?? 0) - 1);
    }
    result.push({ shiftId: s.id, start: chosen, durationMinutes: s.breakMinutes });
  }
  return result;
}
