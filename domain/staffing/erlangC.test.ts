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
