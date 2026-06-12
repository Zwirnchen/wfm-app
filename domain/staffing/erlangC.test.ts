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
    // A=2 Erlangs, N=2 servers => Erlang B = 0.4 (textbook value).
    // B(1)=2/(1+2)=2/3; B(2)=(2*2/3)/(2+2*2/3)=(4/3)/(10/3)=0.4.
    expect(erlangB(2, 2)).toBeCloseTo(0.4, 3);
  });
});

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
