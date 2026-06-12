import { enumerateIntervals, toMinutes, toHHmm, intervalCovered } from "../scheduling/intervals";

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
 *
 * Shifts are processed in the given order and ties are broken first-seen, so
 * callers should pass a stable order for reproducible output. A shift with no
 * interval large enough to hold its break receives no planned break.
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
    // No interval fits the break (e.g. break longer than the shift): a shift
    // with no room for its break gets no planned break, so skip it rather than
    // emit an out-of-shift break. The surplus loop sets `best` on its first
    // candidate, so `best` is non-null iff `candidates` is non-empty.
    if (candidates.length === 0) continue;
    const chosen = best!;
    // decrement present across the break's intervals; each interval the break
    // touches is treated as fully occupied (a break whose duration is not a
    // multiple of the interval length conservatively frees no fractional
    // capacity).
    for (
      let t = toMinutes(chosen);
      t < toMinutes(chosen) + s.breakMinutes;
      t += intervalLengthMinutes
    ) {
      const iv = toHHmm(t);
      const k = key(s.date, iv);
      present.set(k, (present.get(k) ?? 0) - 1);
    }
    result.push({ shiftId: s.id, start: chosen, durationMinutes: s.breakMinutes });
  }
  return result;
}
