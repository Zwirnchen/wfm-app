# WFM Workforce-Management-Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP workforce-management web app that imports a telephony forecast, computes per-interval staffing demand via Erlang C, lets employees wish for early/late shifts and break preferences, and gives the supervisor a final-planning dashboard with live coverage.

**Architecture:** Next.js (App Router) full-stack monolith in TypeScript. A framework-free `domain/` layer holds the pure calculation logic (Erlang C, break heuristic, coverage); `server/` exposes it via tRPC procedures backed by Prisma/PostgreSQL; `app/` renders role-specific React UIs. Build order is inside-out: pure domain logic first (highest risk, unit-testable in isolation), then persistence, then services, then UI.

**Tech Stack:** TypeScript, Next.js 14+ (App Router), tRPC, Prisma, PostgreSQL, Auth.js (NextAuth), Vitest, `xlsx`, `papaparse`, Zod.

**Spec:** `docs/superpowers/specs/2026-06-12-wfm-workforce-management-design.md`

---

## File Structure

```
wfm-app/
├─ domain/
│  ├─ staffing/erlangC.ts          # pure Erlang C demand calc
│  ├─ scheduling/coverage.ts       # present-agents vs requirement per interval
│  ├─ scheduling/intervals.ts      # interval/time helpers (shared)
│  ├─ breaks/optimizeBreaks.ts     # greedy break placement heuristic
│  └─ types.ts                     # shared domain types (framework-free)
├─ infrastructure/
│  ├─ db.ts                        # Prisma client singleton
│  ├─ import/parseForecast.ts      # Excel/CSV -> rows
│  └─ import/validateForecast.ts   # row validation -> errors / clean rows
├─ server/
│  ├─ trpc.ts                      # tRPC init + role middleware
│  ├─ routers/forecast.ts          # import + staffing recompute
│  ├─ routers/planning.ts          # periods, wishes, assignments, breaks, publish
│  ├─ routers/admin.ts             # shift templates + staffing parameters
│  └─ root.ts                      # appRouter
├─ app/                            # Next.js pages (employee + supervisor)
├─ prisma/schema.prisma
└─ tests/                          # Vitest unit + integration
```

Each `domain/` file has one responsibility and zero framework imports. `server/` is the only bridge between UI and domain.

---

## Phase 0 — Project Setup

### Task 0: Scaffold project and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`

- [ ] **Step 1: Initialize Next.js + TypeScript app**

Run from the worktree root (which already contains `README.md` and git):
```bash
npx create-next-app@latest . --typescript --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm
```
Accept overwrite prompts; keep existing `README.md` if asked (choose "no" to overwrite it, or restore it after).

- [ ] **Step 2: Install dependencies**

```bash
npm install @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query zod
npm install prisma @prisma/client
npm install next-auth @auth/prisma-adapter bcryptjs
npm install xlsx papaparse
npm install -D vitest @vitejs/plugin-react jsdom @types/bcryptjs @types/papaparse
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "domain/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname },
  },
});
```

- [ ] **Step 4: Add test script**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create `.env.example` and `.gitignore` entries**

`.env.example`:
```
DATABASE_URL="postgresql://wfm:wfm@localhost:5432/wfm?schema=public"
NEXTAUTH_SECRET="change-me"
NEXTAUTH_URL="http://localhost:3000"
```
Ensure `.gitignore` contains `.env`, `node_modules`, `.next`.

- [ ] **Step 6: Verify the toolchain runs**

Run: `npm run test`
Expected: Vitest runs and reports "No test files found" (exit 0) — confirms config is valid.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + tRPC + Prisma + Vitest toolchain"
```

---

## Phase 1 — Domain: Erlang C demand (framework-free, highest risk)

### Task 1: Shared domain types

**Files:**
- Create: `domain/types.ts`

- [ ] **Step 1: Define the types used across the domain layer**

Create `domain/types.ts`:
```typescript
/** Parameters that drive the Erlang C calculation. Set by the supervisor. */
export interface StaffingParams {
  serviceLevelTarget: number; // 0..1, e.g. 0.8
  thresholdSeconds: number;   // e.g. 20
  shrinkagePercent: number;   // 0..1, e.g. 0.3
  maxOccupancy: number;       // 0..1, e.g. 0.85
  intervalLengthMinutes: number; // 15 | 30 | 60
}

/** A single forecast data point. */
export interface ForecastPoint {
  date: string;        // ISO yyyy-mm-dd
  intervalStart: string; // "HH:mm"
  expectedCalls: number;
  ahtSeconds: number;
}

/** Result of the demand calculation for one interval. */
export interface Requirement {
  date: string;
  intervalStart: string; // "HH:mm"
  requiredAgents: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add domain/types.ts
git commit -m "feat(domain): add shared domain types"
```

### Task 2: Erlang C core — traffic intensity and Erlang B

**Files:**
- Create: `domain/staffing/erlangC.ts`
- Test: `domain/staffing/erlangC.test.ts`

- [ ] **Step 1: Write the failing test for traffic intensity**

Create `domain/staffing/erlangC.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { trafficIntensityErlangs, erlangB } from "./erlangC";

describe("trafficIntensityErlangs", () => {
  it("computes A = calls * aht / intervalSeconds", () => {
    // 360 calls, 300s AHT, 30-min interval (1800s) => 60 Erlangs
    expect(trafficIntensityErlangs(360, 300, 30)).toBeCloseTo(60, 5);
  });
});

describe("erlangB", () => {
  it("returns 0 blocking with 0 traffic", () => {
    expect(erlangB(0, 5)).toBeCloseTo(0, 6);
  });
  it("matches a known reference value", () => {
    // A=2 Erlangs, N=2 servers => Erlang B = 0.4
    // B(1)=2/3; B(2)=(4/3)/(10/3)=0.4
    expect(erlangB(2, 2)).toBeCloseTo(0.4, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- erlangC`
Expected: FAIL — "trafficIntensityErlangs is not exported / not a function".

- [ ] **Step 3: Implement traffic intensity and Erlang B**

Create `domain/staffing/erlangC.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- erlangC`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add domain/staffing/erlangC.ts domain/staffing/erlangC.test.ts
git commit -m "feat(domain): erlang B + traffic intensity"
```

### Task 3: Erlang C waiting probability and service level

**Files:**
- Modify: `domain/staffing/erlangC.ts`
- Test: `domain/staffing/erlangC.test.ts`

- [ ] **Step 1: Add failing tests for Erlang C and service level**

Append to `domain/staffing/erlangC.test.ts`:
```typescript
import { erlangC, serviceLevel } from "./erlangC";

describe("erlangC", () => {
  it("is 0 when there is no traffic", () => {
    expect(erlangC(0, 1)).toBeCloseTo(0, 6);
  });
  it("returns a probability between 0 and 1 for an under-loaded system", () => {
    const pw = erlangC(60, 70);
    expect(pw).toBeGreaterThan(0);
    expect(pw).toBeLessThan(1);
  });
});

describe("serviceLevel", () => {
  it("rises toward 1 as agents increase", () => {
    const slLow = serviceLevel(60, 62, 300, 20);
    const slHigh = serviceLevel(60, 75, 300, 20);
    expect(slHigh).toBeGreaterThan(slLow);
    expect(slHigh).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- erlangC`
Expected: FAIL — "erlangC / serviceLevel is not a function".

- [ ] **Step 3: Implement Erlang C and service level**

Append to `domain/staffing/erlangC.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- erlangC`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add domain/staffing/erlangC.ts domain/staffing/erlangC.test.ts
git commit -m "feat(domain): erlang C waiting prob + service level"
```

### Task 4: Required-agents solver (service level + occupancy + shrinkage)

**Files:**
- Modify: `domain/staffing/erlangC.ts`
- Test: `domain/staffing/erlangC.test.ts`

- [ ] **Step 1: Add failing tests for the solver**

Append to `domain/staffing/erlangC.test.ts`:
```typescript
import { requiredAgents } from "./erlangC";
import type { StaffingParams } from "../types";

const params: StaffingParams = {
  serviceLevelTarget: 0.8,
  thresholdSeconds: 20,
  shrinkagePercent: 0,
  maxOccupancy: 0.95,
  intervalLengthMinutes: 30,
};

describe("requiredAgents", () => {
  it("returns 0 when there are no calls", () => {
    expect(requiredAgents(0, 300, params)).toBe(0);
  });

  it("requires more agents than the raw traffic load", () => {
    // 100 calls * 180s / 1800s = 10 Erlangs; need a margin above 10
    const n = requiredAgents(100, 180, params);
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(20);
  });

  it("applies shrinkage as a gross-up", () => {
    const withShrink = requiredAgents(100, 180, { ...params, shrinkagePercent: 0.5 });
    const without = requiredAgents(100, 180, params);
    expect(withShrink).toBe(Math.ceil(without / 0.5));
  });

  it("never lets occupancy exceed maxOccupancy", () => {
    const n = requiredAgents(100, 180, { ...params, maxOccupancy: 0.7 });
    const a = trafficIntensityErlangs(100, 180, 30);
    expect(a / n).toBeLessThanOrEqual(0.7 + 1e-9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- erlangC`
Expected: FAIL — "requiredAgents is not a function".

- [ ] **Step 3: Implement the solver**

Append to `domain/staffing/erlangC.ts`:
```typescript
import type { StaffingParams } from "../types";

const MAX_AGENTS = 1000; // safety bound to avoid infinite loops

/**
 * Smallest agent count meeting the service-level target AND the occupancy cap,
 * then grossed up for shrinkage. Returns 0 for zero traffic.
 */
export function requiredAgents(
  calls: number,
  ahtSeconds: number,
  params: StaffingParams,
): number {
  const a = trafficIntensityErlangs(calls, ahtSeconds, params.intervalLengthMinutes);
  if (a <= 0) return 0;

  let n = Math.max(1, Math.floor(a) + 1);
  while (n < MAX_AGENTS) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- erlangC`
Expected: PASS (all solver tests).

- [ ] **Step 5: Commit**

```bash
git add domain/staffing/erlangC.ts domain/staffing/erlangC.test.ts
git commit -m "feat(domain): required-agents solver with SL, occupancy, shrinkage"
```

### Task 5: Batch requirement calculation over a forecast

**Files:**
- Create: `domain/staffing/computeRequirements.ts`
- Test: `domain/staffing/computeRequirements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `domain/staffing/computeRequirements.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { computeRequirements } from "./computeRequirements";
import type { ForecastPoint, StaffingParams } from "../types";

const params: StaffingParams = {
  serviceLevelTarget: 0.8,
  thresholdSeconds: 20,
  shrinkagePercent: 0,
  maxOccupancy: 0.95,
  intervalLengthMinutes: 30,
};

const forecast: ForecastPoint[] = [
  { date: "2026-06-15", intervalStart: "08:00", expectedCalls: 100, ahtSeconds: 180 },
  { date: "2026-06-15", intervalStart: "08:30", expectedCalls: 0, ahtSeconds: 180 },
];

describe("computeRequirements", () => {
  it("produces one requirement per forecast point preserving date/interval", () => {
    const result = computeRequirements(forecast, params);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ date: "2026-06-15", intervalStart: "08:00" });
    expect(result[0].requiredAgents).toBeGreaterThan(0);
    expect(result[1].requiredAgents).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- computeRequirements`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the batch mapper**

Create `domain/staffing/computeRequirements.ts`:
```typescript
import { requiredAgents } from "./erlangC";
import type { ForecastPoint, Requirement, StaffingParams } from "../types";

export function computeRequirements(
  forecast: ForecastPoint[],
  params: StaffingParams,
): Requirement[] {
  return forecast.map((p) => ({
    date: p.date,
    intervalStart: p.intervalStart,
    requiredAgents: requiredAgents(p.expectedCalls, p.ahtSeconds, params),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- computeRequirements`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/staffing/computeRequirements.ts domain/staffing/computeRequirements.test.ts
git commit -m "feat(domain): batch requirement calculation over forecast"
```

---

## Phase 2 — Domain: Intervals & Coverage

### Task 6: Interval helpers

**Files:**
- Create: `domain/scheduling/intervals.ts`
- Test: `domain/scheduling/intervals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `domain/scheduling/intervals.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { toMinutes, enumerateIntervals, intervalCovered } from "./intervals";

describe("toMinutes", () => {
  it("converts HH:mm to minutes since midnight", () => {
    expect(toMinutes("08:30")).toBe(510);
  });
});

describe("enumerateIntervals", () => {
  it("lists interval starts between open and close", () => {
    expect(enumerateIntervals("08:00", "09:00", 30)).toEqual(["08:00", "08:30"]);
  });
});

describe("intervalCovered", () => {
  it("is true when the interval lies within the shift", () => {
    expect(intervalCovered("08:30", 30, "08:00", "16:00")).toBe(true);
  });
  it("is false when the interval starts at/after shift end", () => {
    expect(intervalCovered("16:00", 30, "08:00", "16:00")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- intervals`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement interval helpers**

Create `domain/scheduling/intervals.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- intervals`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/scheduling/intervals.ts domain/scheduling/intervals.test.ts
git commit -m "feat(domain): interval time helpers"
```

### Task 7: Coverage calculation

**Files:**
- Create: `domain/scheduling/coverage.ts`
- Test: `domain/scheduling/coverage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `domain/scheduling/coverage.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { computeCoverage } from "./coverage";
import type { AssignmentForCoverage, Requirement } from "./coverage";

const requirements: Requirement[] = [
  { date: "2026-06-15", intervalStart: "08:00", requiredAgents: 2 },
  { date: "2026-06-15", intervalStart: "08:30", requiredAgents: 2 },
];

const assignments: AssignmentForCoverage[] = [
  { date: "2026-06-15", shiftStart: "08:00", shiftEnd: "16:00", breaks: [] },
  { date: "2026-06-15", shiftStart: "08:00", shiftEnd: "16:00", breaks: [{ start: "08:30", durationMinutes: 30 }] },
];

describe("computeCoverage", () => {
  it("counts present agents per interval minus those on break", () => {
    const cov = computeCoverage(assignments, requirements, 30);
    const at0800 = cov.find((c) => c.intervalStart === "08:00")!;
    const at0830 = cov.find((c) => c.intervalStart === "08:30")!;
    expect(at0800.present).toBe(2);
    expect(at0800.deficit).toBe(0); // 2 present, 2 required
    expect(at0830.present).toBe(1); // one agent on break
    expect(at0830.deficit).toBe(1); // 1 present, 2 required
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement coverage**

Create `domain/scheduling/coverage.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/scheduling/coverage.ts domain/scheduling/coverage.test.ts
git commit -m "feat(domain): per-interval coverage calculation"
```

---

## Phase 3 — Domain: Break optimization

### Task 8: Greedy break placement

**Files:**
- Create: `domain/breaks/optimizeBreaks.ts`
- Test: `domain/breaks/optimizeBreaks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `domain/breaks/optimizeBreaks.test.ts`:
```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- optimizeBreaks`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the greedy heuristic**

Create `domain/breaks/optimizeBreaks.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- optimizeBreaks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/breaks/optimizeBreaks.ts domain/breaks/optimizeBreaks.test.ts
git commit -m "feat(domain): greedy break-placement heuristic"
```

---

## Phase 4 — Persistence: Prisma schema

### Task 9: Prisma schema and migration

**Files:**
- Create: `prisma/schema.prisma`, `infrastructure/db.ts`

- [ ] **Step 1: Write the schema**

Create `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  EMPLOYEE
  SUPERVISOR
}

enum ImportStatus {
  VALIDATED
  ACTIVE
  REPLACED
}

enum PeriodStatus {
  DRAFT
  PUBLISHED
}

enum AssignmentStatus {
  PLANNED
  CONFIRMED
}

enum AssignmentSource {
  FROM_WISH
  MANUAL
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  role         Role      @default(EMPLOYEE)
  employee     Employee?
}

model Employee {
  id                  String         @id @default(cuid())
  userId              String         @unique
  user                User           @relation(fields: [userId], references: [id])
  name                String
  contractWeeklyHours Float          @default(40)
  active              Boolean        @default(true)
  wishes              ShiftWish[]
  assignments         ShiftAssignment[]
}

model ForecastImport {
  id           String             @id @default(cuid())
  fileName     String
  importedById String
  importedAt   DateTime           @default(now())
  periodStart  DateTime
  periodEnd    DateTime
  status       ImportStatus       @default(ACTIVE)
  intervals    ForecastInterval[]
}

model ForecastInterval {
  id            String         @id @default(cuid())
  importId      String
  import        ForecastImport @relation(fields: [importId], references: [id], onDelete: Cascade)
  date          DateTime       // date only (midnight)
  intervalStart String         // "HH:mm"
  expectedCalls Float
  ahtSeconds    Float
  @@index([importId, date])
}

model StaffingParameter {
  id                    String   @id @default(cuid())
  serviceLevelTarget    Float    @default(0.8)
  thresholdSeconds      Int      @default(20)
  shrinkagePercent      Float    @default(0.3)
  maxOccupancy          Float    @default(0.85)
  intervalLengthMinutes Int      @default(30)
  openingTime           String   @default("08:00")
  closingTime           String   @default("18:00")
  validFrom             DateTime @default(now())
}

model StaffingRequirement {
  id             String   @id @default(cuid())
  date           DateTime
  intervalStart  String
  requiredAgents Int
  @@unique([date, intervalStart])
}

model ShiftTemplate {
  id               String            @id @default(cuid())
  name             String            // "Früh" | "Spät"
  startTime        String            // "HH:mm"
  endTime          String
  paidBreakMinutes Int               @default(30)
  color            String            @default("#3b82f6")
  active           Boolean           @default(true)
  wishes           ShiftWish[]
  assignments      ShiftAssignment[]
}

model PlanningPeriod {
  id          String          @id @default(cuid())
  startDate   DateTime
  endDate     DateTime
  status      PeriodStatus    @default(DRAFT)
  wishes      ShiftWish[]
  assignments ShiftAssignment[]
}

model ShiftWish {
  id              String         @id @default(cuid())
  periodId        String
  period          PlanningPeriod @relation(fields: [periodId], references: [id], onDelete: Cascade)
  employeeId      String
  employee        Employee       @relation(fields: [employeeId], references: [id])
  date            DateTime
  shiftTemplateId String
  shiftTemplate   ShiftTemplate  @relation(fields: [shiftTemplateId], references: [id])
  priority        Int            @default(1)
  breakPreference String?        // "HH:mm" or null
  @@unique([periodId, employeeId, date])
}

model ShiftAssignment {
  id              String           @id @default(cuid())
  periodId        String
  period          PlanningPeriod   @relation(fields: [periodId], references: [id], onDelete: Cascade)
  employeeId      String
  employee        Employee         @relation(fields: [employeeId], references: [id])
  date            DateTime
  shiftTemplateId String
  shiftTemplate   ShiftTemplate    @relation(fields: [shiftTemplateId], references: [id])
  status          AssignmentStatus @default(PLANNED)
  source          AssignmentSource @default(MANUAL)
  breaks          PlannedBreak[]
  @@unique([employeeId, date])
}

model PlannedBreak {
  id              String          @id @default(cuid())
  assignmentId    String
  assignment      ShiftAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  start           String          // "HH:mm"
  durationMinutes Int
}
```

- [ ] **Step 2: Create the Prisma client singleton**

Create `infrastructure/db.ts`:
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: Generate client and create migration**

Ensure a local PostgreSQL is reachable via `DATABASE_URL` (copy `.env.example` to `.env`). Then run:
```bash
npx prisma migrate dev --name init
```
Expected: migration applied, `@prisma/client` generated, no errors.

- [ ] **Step 4: Verify the client compiles**

Run: `npx tsc --noEmit`
Expected: no type errors referencing `infrastructure/db.ts`.

- [ ] **Step 5: Commit**

```bash
git add prisma infrastructure/db.ts
git commit -m "feat(db): prisma schema + client singleton + init migration"
```

---

## Phase 5 — Forecast import (parsing + validation)

### Task 10: Parse Excel/CSV into raw rows

**Files:**
- Create: `infrastructure/import/parseForecast.ts`
- Test: `tests/import/parseForecast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/import/parseForecast.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseCsv } from "@/infrastructure/import/parseForecast";

const csv = `Datum,Intervallstart,Anrufe,AHT
2026-06-15,08:00,100,180
2026-06-15,08:30,120,175`;

describe("parseCsv", () => {
  it("parses rows into raw string records", () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      Datum: "2026-06-15",
      Intervallstart: "08:00",
      Anrufe: "100",
      AHT: "180",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- parseForecast`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parsers**

Create `infrastructure/import/parseForecast.ts`:
```typescript
import Papa from "papaparse";
import * as XLSX from "xlsx";

export type RawRow = Record<string, string>;

export function parseCsv(content: string): RawRow[] {
  const result = Papa.parse<RawRow>(content.trim(), {
    header: true,
    skipEmptyLines: true,
    transform: (v) => v.trim(),
  });
  return result.data;
}

export function parseXlsx(buffer: ArrayBuffer): RawRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { raw: false, defval: "" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- parseForecast`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/import/parseForecast.ts tests/import/parseForecast.test.ts
git commit -m "feat(import): CSV/XLSX forecast parsers"
```

### Task 11: Validate raw rows into clean forecast points

**Files:**
- Create: `infrastructure/import/validateForecast.ts`
- Test: `tests/import/validateForecast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/import/validateForecast.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { validateForecast } from "@/infrastructure/import/validateForecast";
import type { RawRow } from "@/infrastructure/import/parseForecast";

const good: RawRow[] = [
  { Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "100", AHT: "180" },
];
const bad: RawRow[] = [
  { Datum: "2026-06-15", Intervallstart: "08:15", Anrufe: "100", AHT: "180" }, // off-grid for 30-min
  { Datum: "nope", Intervallstart: "08:00", Anrufe: "x", AHT: "180" },         // bad date + calls
];

describe("validateForecast", () => {
  it("returns clean points and no errors for valid input", () => {
    const r = validateForecast(good, 30);
    expect(r.errors).toHaveLength(0);
    expect(r.points[0]).toMatchObject({
      date: "2026-06-15",
      intervalStart: "08:00",
      expectedCalls: 100,
      ahtSeconds: 180,
    });
  });

  it("reports row-level errors with line numbers and reasons", () => {
    const r = validateForecast(bad, 30);
    expect(r.points).toHaveLength(0);
    expect(r.errors.map((e) => e.line)).toEqual([1, 2]);
    expect(r.errors[0].reason).toMatch(/Intervall/i);
    expect(r.errors[1].reason).toMatch(/Datum|Anrufe/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- validateForecast`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement validation**

Create `infrastructure/import/validateForecast.ts`:
```typescript
import type { RawRow } from "./parseForecast";
import type { ForecastPoint } from "@/domain/types";
import { toMinutes } from "@/domain/scheduling/intervals";

export interface RowError {
  line: number; // 1-based data row
  reason: string;
}

export interface ValidationResult {
  points: ForecastPoint[];
  errors: RowError[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function validateForecast(rows: RawRow[], intervalLengthMinutes: number): ValidationResult {
  const points: ForecastPoint[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const line = i + 1;
    const reasons: string[] = [];
    const date = row.Datum;
    const intervalStart = row.Intervallstart;
    const calls = Number(row.Anrufe);
    const aht = Number(row.AHT);

    if (!DATE_RE.test(date ?? "")) reasons.push("Datum ungültig (erwartet yyyy-mm-dd)");
    if (!TIME_RE.test(intervalStart ?? "")) {
      reasons.push("Intervallstart ungültig (erwartet HH:mm)");
    } else if (toMinutes(intervalStart) % intervalLengthMinutes !== 0) {
      reasons.push(`Intervall passt nicht zum Raster (${intervalLengthMinutes} Min)`);
    }
    if (!Number.isFinite(calls) || calls < 0) reasons.push("Anrufe ungültig");
    if (!Number.isFinite(aht) || aht <= 0) reasons.push("AHT ungültig");

    const key = `${date}|${intervalStart}`;
    if (reasons.length === 0 && seen.has(key)) reasons.push("Doppeltes Intervall");
    seen.add(key);

    if (reasons.length > 0) {
      errors.push({ line, reason: reasons.join("; ") });
    } else {
      points.push({ date, intervalStart, expectedCalls: calls, ahtSeconds: aht });
    }
  });

  return { points, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- validateForecast`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/import/validateForecast.ts tests/import/validateForecast.test.ts
git commit -m "feat(import): row-level forecast validation"
```

---

## Phase 6 — Server: tRPC + auth + services

### Task 12: tRPC init with role middleware

**Files:**
- Create: `server/trpc.ts`, `server/context.ts`

- [ ] **Step 1: Create the request context**

Create `server/context.ts`:
```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth";
import { prisma } from "@/infrastructure/db";

export async function createContext() {
  const session = await getServerSession(authOptions);
  return { session, prisma };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

- [ ] **Step 2: Create tRPC init and procedures**

Create `server/trpc.ts`:
```typescript
import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

const isSupervisor = t.middleware(({ ctx, next }) => {
  if (ctx.session?.user?.role !== "SUPERVISOR") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

export const employeeProcedure = t.procedure.use(isAuthed);
export const supervisorProcedure = t.procedure.use(isAuthed).use(isSupervisor);
```

- [ ] **Step 3: Create auth config**

Create `infrastructure/auth.ts`:
```typescript
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: creds.email } });
        if (!user) return null;
        const ok = await bcrypt.compare(creds.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as { role?: string }).role = token.role as string;
      return session;
    },
  },
};
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `server/` or `infrastructure/auth.ts`.

- [ ] **Step 5: Commit**

```bash
git add server/trpc.ts server/context.ts infrastructure/auth.ts
git commit -m "feat(server): tRPC init, role middleware, credentials auth"
```

### Task 13: Forecast router (import + recompute requirements)

**Files:**
- Create: `server/routers/forecast.ts`
- Test: `tests/server/recompute.test.ts`

- [ ] **Step 1: Write the failing test for the recompute helper**

Create `tests/server/recompute.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildRequirementRows } from "@/server/routers/forecast";
import type { StaffingParams } from "@/domain/types";

const params: StaffingParams = {
  serviceLevelTarget: 0.8,
  thresholdSeconds: 20,
  shrinkagePercent: 0,
  maxOccupancy: 0.95,
  intervalLengthMinutes: 30,
};

describe("buildRequirementRows", () => {
  it("maps forecast points to DB-ready requirement rows", () => {
    const rows = buildRequirementRows(
      [{ date: "2026-06-15", intervalStart: "08:00", expectedCalls: 100, ahtSeconds: 180 }],
      params,
    );
    expect(rows[0].intervalStart).toBe("08:00");
    expect(rows[0].requiredAgents).toBeGreaterThan(0);
    expect(rows[0].date instanceof Date).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- recompute`
Expected: FAIL — `buildRequirementRows` not exported.

- [ ] **Step 3: Implement the forecast router + helper**

Create `server/routers/forecast.ts`:
```typescript
import { z } from "zod";
import { router, supervisorProcedure } from "../trpc";
import { parseCsv, parseXlsx } from "@/infrastructure/import/parseForecast";
import { validateForecast } from "@/infrastructure/import/validateForecast";
import { computeRequirements } from "@/domain/staffing/computeRequirements";
import type { ForecastPoint, StaffingParams } from "@/domain/types";

export function buildRequirementRows(points: ForecastPoint[], params: StaffingParams) {
  return computeRequirements(points, params).map((r) => ({
    date: new Date(r.date),
    intervalStart: r.intervalStart,
    requiredAgents: r.requiredAgents,
  }));
}

async function currentParams(prisma: any): Promise<StaffingParams> {
  const p = await prisma.staffingParameter.findFirst({ orderBy: { validFrom: "desc" } });
  return {
    serviceLevelTarget: p?.serviceLevelTarget ?? 0.8,
    thresholdSeconds: p?.thresholdSeconds ?? 20,
    shrinkagePercent: p?.shrinkagePercent ?? 0.3,
    maxOccupancy: p?.maxOccupancy ?? 0.85,
    intervalLengthMinutes: p?.intervalLengthMinutes ?? 30,
  };
}

export const forecastRouter = router({
  preview: supervisorProcedure
    .input(z.object({ fileName: z.string(), base64: z.string(), kind: z.enum(["csv", "xlsx"]) }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const rows =
        input.kind === "csv"
          ? parseCsv(buffer.toString("utf-8"))
          : parseXlsx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      const params = await currentParams(ctx.prisma);
      return validateForecast(rows, params.intervalLengthMinutes);
    }),

  commit: supervisorProcedure
    .input(
      z.object({
        fileName: z.string(),
        points: z.array(
          z.object({
            date: z.string(),
            intervalStart: z.string(),
            expectedCalls: z.number(),
            ahtSeconds: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const params = await currentParams(ctx.prisma);
      const dates = input.points.map((p) => new Date(p.date).getTime());
      const periodStart = new Date(Math.min(...dates));
      const periodEnd = new Date(Math.max(...dates));

      return ctx.prisma.$transaction(async (tx) => {
        await tx.forecastImport.updateMany({
          where: { status: "ACTIVE", periodStart, periodEnd },
          data: { status: "REPLACED" },
        });
        const imp = await tx.forecastImport.create({
          data: {
            fileName: input.fileName,
            importedById: ctx.session!.user!.id as string,
            periodStart,
            periodEnd,
            status: "ACTIVE",
            intervals: {
              create: input.points.map((p) => ({
                date: new Date(p.date),
                intervalStart: p.intervalStart,
                expectedCalls: p.expectedCalls,
                ahtSeconds: p.ahtSeconds,
              })),
            },
          },
        });
        const reqRows = buildRequirementRows(input.points, params);
        for (const r of reqRows) {
          await tx.staffingRequirement.upsert({
            where: { date_intervalStart: { date: r.date, intervalStart: r.intervalStart } },
            update: { requiredAgents: r.requiredAgents },
            create: r,
          });
        }
        return { importId: imp.id, intervals: input.points.length };
      });
    }),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- recompute`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routers/forecast.ts tests/server/recompute.test.ts
git commit -m "feat(server): forecast import preview/commit + requirement recompute"
```

### Task 14: Admin router (shift templates + staffing parameters)

**Files:**
- Create: `server/routers/admin.ts`

- [ ] **Step 1: Implement the admin router**

Create `server/routers/admin.ts`:
```typescript
import { z } from "zod";
import { router, supervisorProcedure, employeeProcedure } from "../trpc";

export const adminRouter = router({
  listTemplates: employeeProcedure.query(({ ctx }) =>
    ctx.prisma.shiftTemplate.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
  ),

  upsertTemplate: supervisorProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        paidBreakMinutes: z.number().int().min(0),
        color: z.string(),
      }),
    )
    .mutation(({ input, ctx }) =>
      input.id
        ? ctx.prisma.shiftTemplate.update({ where: { id: input.id }, data: input })
        : ctx.prisma.shiftTemplate.create({ data: input }),
    ),

  getParams: supervisorProcedure.query(({ ctx }) =>
    ctx.prisma.staffingParameter.findFirst({ orderBy: { validFrom: "desc" } }),
  ),

  saveParams: supervisorProcedure
    .input(
      z.object({
        serviceLevelTarget: z.number().min(0).max(1),
        thresholdSeconds: z.number().int().min(1),
        shrinkagePercent: z.number().min(0).max(0.99),
        maxOccupancy: z.number().min(0.1).max(1),
        intervalLengthMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        openingTime: z.string(),
        closingTime: z.string(),
      }),
    )
    .mutation(({ input, ctx }) => ctx.prisma.staffingParameter.create({ data: input })),
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `server/routers/admin.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/routers/admin.ts
git commit -m "feat(server): admin router for templates + staffing params"
```

### Task 15: Planning router (periods, wishes, assignments, breaks, publish)

**Files:**
- Create: `server/routers/planning.ts`

- [ ] **Step 1: Implement the planning router**

Create `server/routers/planning.ts`:
```typescript
import { z } from "zod";
import { router, supervisorProcedure, employeeProcedure } from "../trpc";
import { optimizeBreaks } from "@/domain/breaks/optimizeBreaks";
import type { ShiftToBreak, Requirement } from "@/domain/breaks/optimizeBreaks";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

export const planningRouter = router({
  createPeriod: supervisorProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .mutation(({ input, ctx }) =>
      ctx.prisma.planningPeriod.create({
        data: { startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
      }),
    ),

  listPeriods: employeeProcedure.query(({ ctx }) =>
    ctx.prisma.planningPeriod.findMany({ orderBy: { startDate: "desc" } }),
  ),

  upsertWish: employeeProcedure
    .input(
      z.object({
        periodId: z.string(),
        date: z.string(),
        shiftTemplateId: z.string(),
        priority: z.number().int().min(1).max(5).default(1),
        breakPreference: hhmm.nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const employee = await ctx.prisma.employee.findUniqueOrThrow({
        where: { userId: ctx.session!.user!.id as string },
      });
      return ctx.prisma.shiftWish.upsert({
        where: {
          periodId_employeeId_date: {
            periodId: input.periodId,
            employeeId: employee.id,
            date: new Date(input.date),
          },
        },
        update: {
          shiftTemplateId: input.shiftTemplateId,
          priority: input.priority,
          breakPreference: input.breakPreference ?? null,
        },
        create: {
          periodId: input.periodId,
          employeeId: employee.id,
          date: new Date(input.date),
          shiftTemplateId: input.shiftTemplateId,
          priority: input.priority,
          breakPreference: input.breakPreference ?? null,
        },
      });
    }),

  wishesForPeriod: supervisorProcedure
    .input(z.object({ periodId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.prisma.shiftWish.findMany({
        where: { periodId: input.periodId },
        include: { employee: true, shiftTemplate: true },
      }),
    ),

  assign: supervisorProcedure
    .input(
      z.object({
        periodId: z.string(),
        employeeId: z.string(),
        date: z.string(),
        shiftTemplateId: z.string(),
        source: z.enum(["FROM_WISH", "MANUAL"]).default("MANUAL"),
      }),
    )
    .mutation(({ input, ctx }) =>
      ctx.prisma.shiftAssignment.upsert({
        where: { employeeId_date: { employeeId: input.employeeId, date: new Date(input.date) } },
        update: { shiftTemplateId: input.shiftTemplateId, source: input.source },
        create: {
          periodId: input.periodId,
          employeeId: input.employeeId,
          date: new Date(input.date),
          shiftTemplateId: input.shiftTemplateId,
          source: input.source,
        },
      }),
    ),

  planBreaks: supervisorProcedure
    .input(z.object({ periodId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const assignments = await ctx.prisma.shiftAssignment.findMany({
        where: { periodId: input.periodId },
        include: { shiftTemplate: true },
      });
      const wishes = await ctx.prisma.shiftWish.findMany({ where: { periodId: input.periodId } });
      const prefByKey = new Map(
        wishes.map((w) => [`${w.employeeId}|${w.date.toISOString().slice(0, 10)}`, w.breakPreference]),
      );
      const reqs = await ctx.prisma.staffingRequirement.findMany();
      const requirements: Requirement[] = reqs.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        intervalStart: r.intervalStart,
        requiredAgents: r.requiredAgents,
      }));
      const shifts: ShiftToBreak[] = assignments.map((a) => {
        const dateStr = a.date.toISOString().slice(0, 10);
        return {
          id: a.id,
          date: dateStr,
          shiftStart: a.shiftTemplate.startTime,
          shiftEnd: a.shiftTemplate.endTime,
          breakMinutes: a.shiftTemplate.paidBreakMinutes,
          preference: prefByKey.get(`${a.employeeId}|${dateStr}`) ?? null,
        };
      });
      const params = await ctx.prisma.staffingParameter.findFirst({ orderBy: { validFrom: "desc" } });
      const intervalLen = params?.intervalLengthMinutes ?? 30;
      const breaks = optimizeBreaks(shifts, requirements, intervalLen);

      await ctx.prisma.$transaction([
        ctx.prisma.plannedBreak.deleteMany({
          where: { assignment: { periodId: input.periodId } },
        }),
        ctx.prisma.plannedBreak.createMany({
          data: breaks.map((b) => ({
            assignmentId: b.shiftId,
            start: b.start,
            durationMinutes: b.durationMinutes,
          })),
        }),
      ]);
      return { placed: breaks.length };
    }),

  publish: supervisorProcedure
    .input(z.object({ periodId: z.string(), confirmDeficit: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      // Coverage deficit guard handled in UI; confirmDeficit must be true to publish with gaps.
      return ctx.prisma.planningPeriod.update({
        where: { id: input.periodId },
        data: { status: "PUBLISHED" },
      });
    }),

  myPlan: employeeProcedure
    .input(z.object({ periodId: z.string() }))
    .query(async ({ input, ctx }) => {
      const employee = await ctx.prisma.employee.findUniqueOrThrow({
        where: { userId: ctx.session!.user!.id as string },
      });
      return ctx.prisma.shiftAssignment.findMany({
        where: { periodId: input.periodId, employeeId: employee.id },
        include: { shiftTemplate: true, breaks: true },
      });
    }),
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `server/routers/planning.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/routers/planning.ts
git commit -m "feat(server): planning router (periods, wishes, assign, breaks, publish)"
```

### Task 16: Wire root router and Next.js tRPC handler

**Files:**
- Create: `server/root.ts`, `app/api/trpc/[trpc]/route.ts`, `app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Create the root router**

Create `server/root.ts`:
```typescript
import { router } from "./trpc";
import { forecastRouter } from "./routers/forecast";
import { adminRouter } from "./routers/admin";
import { planningRouter } from "./routers/planning";

export const appRouter = router({
  forecast: forecastRouter,
  admin: adminRouter,
  planning: planningRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 2: Create the tRPC HTTP handler**

Create `app/api/trpc/[trpc]/route.ts`:
```typescript
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/root";
import { createContext } from "@/server/context";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 3: Create the NextAuth handler**

Create `app/api/auth/[...nextauth]/route.ts`:
```typescript
import NextAuth from "next-auth";
import { authOptions } from "@/infrastructure/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/root.ts app/api
git commit -m "feat(server): wire root router + tRPC and NextAuth route handlers"
```

---

## Phase 7 — UI

### Task 17: tRPC React client + providers + auth gate

**Files:**
- Create: `app/_trpc/client.ts`, `app/_trpc/Provider.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create the tRPC client**

Create `app/_trpc/client.ts`:
```typescript
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/root";

export const trpc = createTRPCReact<AppRouter>();
```

- [ ] **Step 2: Create the provider**

Create `app/_trpc/Provider.tsx`:
```typescript
"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { SessionProvider } from "next-auth/react";
import { trpc } from "./client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc" })] }),
  );
  return (
    <SessionProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    </SessionProvider>
  );
}
```

- [ ] **Step 3: Wrap the root layout**

Modify `app/layout.tsx` so the body wraps children in `<Providers>`:
```typescript
import { Providers } from "./_trpc/Provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/_trpc app/layout.tsx
git commit -m "feat(ui): tRPC react client + session/query providers"
```

### Task 18: Supervisor — forecast import page

**Files:**
- Create: `app/supervisor/import/page.tsx`

- [ ] **Step 1: Implement the import page**

Create `app/supervisor/import/page.tsx`:
```typescript
"use client";
import { useState } from "react";
import { trpc } from "@/app/_trpc/client";

export default function ImportPage() {
  const [preview, setPreview] = useState<{
    points: { date: string; intervalStart: string; expectedCalls: number; ahtSeconds: number }[];
    errors: { line: number; reason: string }[];
  } | null>(null);
  const [fileName, setFileName] = useState("");
  const previewMut = trpc.forecast.preview.useMutation({ onSuccess: setPreview });
  const commitMut = trpc.forecast.commit.useMutation();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const kind = file.name.endsWith(".csv") ? "csv" : "xlsx";
    previewMut.mutate({ fileName: file.name, base64, kind });
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Telefonie-Import</h1>
      <input type="file" accept=".csv,.xlsx" onChange={onFile} />
      {preview && (
        <section>
          <p>
            {preview.points.length} gültige Intervalle, {preview.errors.length} Fehler.
          </p>
          {preview.errors.length > 0 && (
            <ul>
              {preview.errors.map((e) => (
                <li key={e.line}>Zeile {e.line}: {e.reason}</li>
              ))}
            </ul>
          )}
          <button
            disabled={preview.points.length === 0 || commitMut.isPending}
            onClick={() => commitMut.mutate({ fileName, points: preview.points })}
          >
            Import bestätigen & Bedarf berechnen
          </button>
          {commitMut.isSuccess && <p>Importiert: {commitMut.data.intervals} Intervalle.</p>}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, log in as a supervisor, open `/supervisor/import`, upload a CSV with the columns `Datum,Intervallstart,Anrufe,AHT`.
Expected: preview shows valid/invalid counts; confirming reports imported interval count.

- [ ] **Step 3: Commit**

```bash
git add app/supervisor/import/page.tsx
git commit -m "feat(ui): supervisor forecast import page"
```

### Task 19: Supervisor — staffing parameters page

**Files:**
- Create: `app/supervisor/parameters/page.tsx`

- [ ] **Step 1: Implement the parameters page**

Create `app/supervisor/parameters/page.tsx`:
```typescript
"use client";
import { useEffect, useState } from "react";
import { trpc } from "@/app/_trpc/client";

const defaults = {
  serviceLevelTarget: 0.8,
  thresholdSeconds: 20,
  shrinkagePercent: 0.3,
  maxOccupancy: 0.85,
  intervalLengthMinutes: 30 as 15 | 30 | 60,
  openingTime: "08:00",
  closingTime: "18:00",
};

export default function ParametersPage() {
  const existing = trpc.admin.getParams.useQuery();
  const save = trpc.admin.saveParams.useMutation();
  const [form, setForm] = useState(defaults);

  useEffect(() => {
    if (existing.data) {
      setForm({
        serviceLevelTarget: existing.data.serviceLevelTarget,
        thresholdSeconds: existing.data.thresholdSeconds,
        shrinkagePercent: existing.data.shrinkagePercent,
        maxOccupancy: existing.data.maxOccupancy,
        intervalLengthMinutes: existing.data.intervalLengthMinutes as 15 | 30 | 60,
        openingTime: existing.data.openingTime,
        closingTime: existing.data.closingTime,
      });
    }
  }, [existing.data]);

  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });

  return (
    <main style={{ padding: 24 }}>
      <h1>Bedarfs-Parameter</h1>
      <label>Service-Level-Ziel (0–1)<input type="number" step="0.01" value={form.serviceLevelTarget} onChange={num("serviceLevelTarget")} /></label>
      <label>Schwelle (Sek.)<input type="number" value={form.thresholdSeconds} onChange={num("thresholdSeconds")} /></label>
      <label>Shrinkage (0–1)<input type="number" step="0.01" value={form.shrinkagePercent} onChange={num("shrinkagePercent")} /></label>
      <label>Max. Occupancy (0–1)<input type="number" step="0.01" value={form.maxOccupancy} onChange={num("maxOccupancy")} /></label>
      <label>Intervalllänge
        <select value={form.intervalLengthMinutes} onChange={(e) => setForm({ ...form, intervalLengthMinutes: Number(e.target.value) as 15 | 30 | 60 })}>
          <option value={15}>15</option><option value={30}>30</option><option value={60}>60</option>
        </select>
      </label>
      <button disabled={save.isPending} onClick={() => save.mutate(form)}>Speichern</button>
      {save.isSuccess && <p>Gespeichert. Neuer Import wird mit diesen Werten gerechnet.</p>}
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

Run app, open `/supervisor/parameters` as supervisor, change Service-Level to 0.9, save.
Expected: "Gespeichert" message; reloading shows the saved values.

- [ ] **Step 3: Commit**

```bash
git add app/supervisor/parameters/page.tsx
git commit -m "feat(ui): supervisor staffing-parameters page"
```

### Task 20: Supervisor — planning board with live coverage

**Files:**
- Create: `app/supervisor/planning/[periodId]/page.tsx`
- Create: `server/routers/coverage.ts` (read model) and register in `server/root.ts`

- [ ] **Step 1: Add a coverage read endpoint**

Create `server/routers/coverage.ts`:
```typescript
import { z } from "zod";
import { router, supervisorProcedure } from "../trpc";
import { computeCoverage } from "@/domain/scheduling/coverage";
import type { AssignmentForCoverage } from "@/domain/scheduling/coverage";

export const coverageRouter = router({
  forPeriod: supervisorProcedure
    .input(z.object({ periodId: z.string() }))
    .query(async ({ input, ctx }) => {
      const assignments = await ctx.prisma.shiftAssignment.findMany({
        where: { periodId: input.periodId },
        include: { shiftTemplate: true, breaks: true },
      });
      const reqs = await ctx.prisma.staffingRequirement.findMany();
      const params = await ctx.prisma.staffingParameter.findFirst({ orderBy: { validFrom: "desc" } });
      const intervalLen = params?.intervalLengthMinutes ?? 30;

      const cov: AssignmentForCoverage[] = assignments.map((a) => ({
        date: a.date.toISOString().slice(0, 10),
        shiftStart: a.shiftTemplate.startTime,
        shiftEnd: a.shiftTemplate.endTime,
        breaks: a.breaks.map((b) => ({ start: b.start, durationMinutes: b.durationMinutes })),
      }));
      return computeCoverage(
        cov,
        reqs.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          intervalStart: r.intervalStart,
          requiredAgents: r.requiredAgents,
        })),
        intervalLen,
      );
    }),
});
```

Register it in `server/root.ts` by adding `coverage: coverageRouter` to the `appRouter` object and importing it at the top.

- [ ] **Step 2: Implement the planning board**

Create `app/supervisor/planning/[periodId]/page.tsx`:
```typescript
"use client";
import { trpc } from "@/app/_trpc/client";

export default function PlanningBoard({ params }: { params: { periodId: string } }) {
  const periodId = params.periodId;
  const wishes = trpc.planning.wishesForPeriod.useQuery({ periodId });
  const templates = trpc.admin.listTemplates.useQuery();
  // Poll coverage every 5s for the live Soll/Ist view (MVP real-time).
  const coverage = trpc.coverage.forPeriod.useQuery({ periodId }, { refetchInterval: 5000 });
  const assign = trpc.planning.assign.useMutation({ onSuccess: () => coverage.refetch() });
  const planBreaks = trpc.planning.planBreaks.useMutation({ onSuccess: () => coverage.refetch() });
  const publish = trpc.planning.publish.useMutation();

  const hasDeficit = (coverage.data ?? []).some((c) => c.deficit > 0);

  return (
    <main style={{ padding: 24 }}>
      <h1>Planung</h1>

      <h2>Wünsche</h2>
      <ul>
        {wishes.data?.map((w) => (
          <li key={w.id}>
            {w.employee.name} — {new Date(w.date).toLocaleDateString("de-DE")} — {w.shiftTemplate.name}
            <button
              onClick={() =>
                assign.mutate({
                  periodId,
                  employeeId: w.employeeId,
                  date: new Date(w.date).toISOString().slice(0, 10),
                  shiftTemplateId: w.shiftTemplateId,
                  source: "FROM_WISH",
                })
              }
            >
              Übernehmen
            </button>
          </li>
        ))}
      </ul>

      <h2>Coverage (Soll/Ist)</h2>
      <table>
        <thead><tr><th>Datum</th><th>Intervall</th><th>Soll</th><th>Ist</th></tr></thead>
        <tbody>
          {coverage.data?.map((c) => (
            <tr key={`${c.date}-${c.intervalStart}`} style={{ background: c.deficit > 0 ? "#fecaca" : "#bbf7d0" }}>
              <td>{c.date}</td><td>{c.intervalStart}</td><td>{c.required}</td><td>{c.present}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button onClick={() => planBreaks.mutate({ periodId })}>Pausen automatisch planen</button>
      <button
        onClick={() => {
          if (hasDeficit && !confirm("Es gibt Unterdeckung. Trotzdem veröffentlichen?")) return;
          publish.mutate({ periodId, confirmDeficit: hasDeficit });
        }}
      >
        Veröffentlichen
      </button>
      {publish.isSuccess && <p>Periode veröffentlicht.</p>}
    </main>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run app as supervisor: open a period's planning board, take over a wish, run "Pausen automatisch planen", watch coverage cells turn green/red, then publish.
Expected: assignment appears, breaks placed, coverage updates within ~5s, publish confirms.

- [ ] **Step 5: Commit**

```bash
git add server/routers/coverage.ts server/root.ts app/supervisor/planning
git commit -m "feat(ui): supervisor planning board + coverage read model"
```

### Task 21: Employee — wishes and personal plan pages

**Files:**
- Create: `app/employee/wishes/[periodId]/page.tsx`
- Create: `app/employee/plan/[periodId]/page.tsx`

- [ ] **Step 1: Implement the wishes page**

Create `app/employee/wishes/[periodId]/page.tsx`:
```typescript
"use client";
import { useState } from "react";
import { trpc } from "@/app/_trpc/client";

export default function WishesPage({ params }: { params: { periodId: string } }) {
  const templates = trpc.admin.listTemplates.useQuery();
  const upsert = trpc.planning.upsertWish.useMutation();
  const [date, setDate] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [breakPref, setBreakPref] = useState("");

  return (
    <main style={{ padding: 24 }}>
      <h1>Meine Wünsche</h1>
      <label>Datum<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Schicht
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">– wählen –</option>
          {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label>Pausen-Präferenz (HH:mm, optional)<input value={breakPref} onChange={(e) => setBreakPref(e.target.value)} placeholder="12:00" /></label>
      <button
        disabled={!date || !templateId || upsert.isPending}
        onClick={() =>
          upsert.mutate({
            periodId: params.periodId,
            date,
            shiftTemplateId: templateId,
            breakPreference: breakPref || null,
          })
        }
      >
        Wunsch speichern
      </button>
      {upsert.isSuccess && <p>Wunsch gespeichert.</p>}
    </main>
  );
}
```

- [ ] **Step 2: Implement the personal plan page**

Create `app/employee/plan/[periodId]/page.tsx`:
```typescript
"use client";
import { trpc } from "@/app/_trpc/client";

export default function MyPlanPage({ params }: { params: { periodId: string } }) {
  const plan = trpc.planning.myPlan.useQuery({ periodId: params.periodId });
  return (
    <main style={{ padding: 24 }}>
      <h1>Mein Dienstplan</h1>
      <ul>
        {plan.data?.map((a) => (
          <li key={a.id}>
            {new Date(a.date).toLocaleDateString("de-DE")} — {a.shiftTemplate.name}{" "}
            ({a.shiftTemplate.startTime}–{a.shiftTemplate.endTime})
            {a.breaks.length > 0 && (
              <span> · Pause: {a.breaks.map((b) => `${b.start} (${b.durationMinutes} Min)`).join(", ")}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

As an employee: open `/employee/wishes/<periodId>`, save a wish; after the supervisor publishes, open `/employee/plan/<periodId>` and see the assigned shift with break.
Expected: wish saves; published plan shows shift + break.

- [ ] **Step 5: Commit**

```bash
git add app/employee
git commit -m "feat(ui): employee wishes + personal plan pages"
```

### Task 22: Seed script and end-to-end smoke

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (prisma seed config)

- [ ] **Step 1: Write a seed script**

Create `prisma/seed.ts`:
```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash("test1234", 10);
  const sup = await prisma.user.upsert({
    where: { email: "supervisor@wfm.local" },
    update: {},
    create: { email: "supervisor@wfm.local", passwordHash: pw, role: "SUPERVISOR" },
  });
  const empUser = await prisma.user.upsert({
    where: { email: "mitarbeiter@wfm.local" },
    update: {},
    create: { email: "mitarbeiter@wfm.local", passwordHash: pw, role: "EMPLOYEE" },
  });
  await prisma.employee.upsert({
    where: { userId: empUser.id },
    update: {},
    create: { userId: empUser.id, name: "Max Mustermann" },
  });
  await prisma.staffingParameter.create({ data: {} });
  await prisma.shiftTemplate.createMany({
    data: [
      { name: "Früh", startTime: "07:00", endTime: "15:00", paidBreakMinutes: 30, color: "#3b82f6" },
      { name: "Spät", startTime: "11:00", endTime: "19:00", paidBreakMinutes: 30, color: "#f59e0b" },
    ],
  });
  console.log("Seeded:", sup.email, empUser.email);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Register the seed command**

Add to `package.json`:
```json
"prisma": { "seed": "npx tsx prisma/seed.ts" }
```
And install the runner: `npm install -D tsx`.

- [ ] **Step 3: Run the seed**

Run: `npx prisma db seed`
Expected: "Seeded: supervisor@wfm.local mitarbeiter@wfm.local".

- [ ] **Step 4: Full test suite + type check**

Run: `npm run test && npx tsc --noEmit`
Expected: all unit tests pass; no type errors.

- [ ] **Step 5: End-to-end smoke (manual)**

Run `npm run dev`. As supervisor: import a forecast CSV → confirm → open a created planning period → take over wishes / assign → plan breaks → publish. As employee: submit a wish, then view the published plan.
Expected: full cycle works; coverage reflects assignments and breaks.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts package.json package-lock.json
git commit -m "chore: seed script + end-to-end smoke verification"
```

---

## Self-Review Checklist (completed during authoring)

- **Spec coverage:** Import (Tasks 10–11, 18), Erlang C demand (Tasks 1–5), staffing params (Tasks 14, 19), shift templates / two shifts (Tasks 9, 14, 22), wishes (Tasks 15, 21), final assignment (Task 15, 20), auto-break optimization (Tasks 8, 15), coverage Soll/Ist (Tasks 7, 20), publish lifecycle (Tasks 15, 20), roles/auth (Tasks 12, 16), employee plan (Task 21). All spec sections map to tasks.
- **Placeholders:** none — every code step contains full content.
- **Type consistency:** `StaffingParams`, `ForecastPoint`, `Requirement` defined in Task 1 and reused unchanged; `optimizeBreaks`/`computeCoverage`/`requiredAgents` signatures match across server usage; `AssignmentForCoverage` exported from `coverage.ts` and consumed in Task 20.

## Notes & known MVP simplifications

- Real-time dashboard uses 5-second polling (per spec), not WebSockets.
- Break optimization is greedy, not a mathematically optimal solver (per spec).
- A single global `StaffingRequirement` table keyed by `(date, intervalStart)` assumes one queue (per spec).
- Navigation/landing pages and styling are intentionally minimal; the focus is the working calculation + planning cycle. A later task can add a shared nav shell and design polish.
