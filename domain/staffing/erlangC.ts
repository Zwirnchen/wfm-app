/** Traffic intensity in Erlangs for one interval. */
export function trafficIntensityErlangs(
  calls: number,
  ahtSeconds: number,
  intervalLengthMinutes: number,
): number {
  const intervalSeconds = intervalLengthMinutes * 60;
  return (calls * ahtSeconds) / intervalSeconds;
}

/**
 * Erlang B blocking probability via the numerically stable recurrence:
 * B(0) = 1; B(n) = (A * B(n-1)) / (n + A * B(n-1)).
 */
export function erlangB(a: number, servers: number): number {
  if (a <= 0) return 0;
  let b = 1;
  for (let n = 1; n <= servers; n++) {
    b = (a * b) / (n + a * b);
  }
  return b;
}
