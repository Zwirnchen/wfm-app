import type { StaffingParams } from "../types";

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

const MAX_AGENTS = 1000; // search headroom above the offered load (avoids infinite loops)

/**
 * Smallest agent count meeting the service-level target AND the occupancy cap,
 * then grossed up for shrinkage. Returns 0 for zero traffic.
 */
export function requiredAgents(
  calls: number,
  ahtSeconds: number,
  params: StaffingParams,
): number {
  if (ahtSeconds <= 0) return 0; // AHT validated upstream; guard the core against /0
  const a = trafficIntensityErlangs(calls, ahtSeconds, params.intervalLengthMinutes);
  if (a <= 0) return 0;

  let n = Math.max(1, Math.floor(a) + 1);
  // Search up to MAX_AGENTS agents BEYOND the offered load. The bound must be
  // relative to `a`: an absolute bound would never evaluate any candidate when
  // floor(a)+1 already exceeds it. For realistic single-queue loads the search
  // converges far below this headroom; hitting `cap` means the supplied targets
  // are effectively unreachable, and we return the capped (best-effort) count.
  const cap = Math.floor(a) + MAX_AGENTS;
  while (n < cap) {
    const sl = serviceLevel(a, n, ahtSeconds, params.thresholdSeconds);
    const occupancy = a / n;
    if (sl >= params.serviceLevelTarget && occupancy <= params.maxOccupancy) {
      break;
    }
    n++;
  }

  const shrink = params.shrinkagePercent;
  if (shrink > 0 && shrink < 1) {
    n = Math.ceil(n / (1 - shrink));
  }
  return n;
}
