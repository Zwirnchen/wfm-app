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

/** All interval start times in [open, close) stepping by length. */
export function enumerateIntervals(
  open: string,
  close: string,
  intervalLengthMinutes: number,
): string[] {
  const result: string[] = [];
  for (let t = toMinutes(open); t < toMinutes(close); t += intervalLengthMinutes) {
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
