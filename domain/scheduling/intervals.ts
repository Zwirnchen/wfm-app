/** Minutes since midnight for a "HH:mm" string. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Format minutes since midnight back to "HH:mm". */
export function toHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * All interval start times in [open, close) stepping by length.
 * `intervalLengthMinutes` must be > 0; otherwise an empty list is returned.
 * If the window is narrower than a single step, no interval fits and the
 * result is empty (e.g. open=08:00, close=08:10, length=30 -> []).
 */
export function enumerateIntervals(
  open: string,
  close: string,
  intervalLengthMinutes: number,
): string[] {
  if (intervalLengthMinutes <= 0) return [];
  const openMin = toMinutes(open);
  const closeMin = toMinutes(close);
  if (closeMin - openMin < intervalLengthMinutes) return [];
  const result: string[] = [];
  for (let t = openMin; t < closeMin; t += intervalLengthMinutes) {
    result.push(toHHmm(t));
  }
  return result;
}

/** True if [intervalStart, intervalStart+len) is fully inside [shiftStart, shiftEnd). */
export function intervalCovered(
  intervalStart: string,
  intervalLengthMinutes: number,
  shiftStart: string,
  shiftEnd: string,
): boolean {
  const start = toMinutes(intervalStart);
  const end = start + intervalLengthMinutes;
  return start >= toMinutes(shiftStart) && end <= toMinutes(shiftEnd);
}
