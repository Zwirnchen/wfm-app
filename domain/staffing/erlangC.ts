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

/**
 * Erlang C probability that a call must wait, derived from Erlang B:
 * C = (N * B) / (N - A * (1 - B)). Returns 0 if the system cannot be stable.
 */
export function erlangC(a: number, servers: number): number {
  if (a <= 0) return 0;
  if (servers <= a) return 1; // unstable: every call waits
  const b = erlangB(a, servers);
  return (servers * b) / (servers - a * (1 - b));
}

/**
 * Fraction of calls answered within `thresholdSeconds`:
 * SL = 1 - C * exp(-(N - A) * t / AHT).
 */
export function serviceLevel(
  a: number,
  servers: number,
  ahtSeconds: number,
  thresholdSeconds: number,
): number {
  if (a <= 0) return 1;
  if (servers <= a) return 0;
  const c = erlangC(a, servers);
  const sl = 1 - c * Math.exp((-(servers - a) * thresholdSeconds) / ahtSeconds);
  return Math.max(0, Math.min(1, sl));
}
