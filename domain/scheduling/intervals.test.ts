import { describe, it, expect } from "vitest";
import { toMinutes, toHHmm, enumerateIntervals, intervalCovered } from "./intervals";

describe("toMinutes", () => {
  it("converts HH:mm to minutes since midnight", () => {
    expect(toMinutes("08:30")).toBe(510);
  });
});

describe("toHHmm", () => {
  it("formats minutes since midnight to HH:mm", () => {
    expect(toHHmm(510)).toBe("08:30");
  });
  it("round-trips through toMinutes", () => {
    expect(toHHmm(toMinutes("13:45"))).toBe("13:45");
  });
});

describe("enumerateIntervals", () => {
  it("lists interval starts between open and close", () => {
    expect(enumerateIntervals("08:00", "09:00", 30)).toEqual(["08:00", "08:30"]);
  });
  it("stops before close on a non-divisible range", () => {
    expect(enumerateIntervals("08:00", "08:40", 30)).toEqual(["08:00", "08:30"]);
  });
  it("returns [] when open equals close", () => {
    expect(enumerateIntervals("08:00", "08:00", 30)).toEqual([]);
  });
  it("returns [] when the first step overshoots close", () => {
    expect(enumerateIntervals("08:00", "08:10", 30)).toEqual([]);
  });
  it("supports a 15-minute step", () => {
    expect(enumerateIntervals("08:00", "09:00", 15)).toEqual([
      "08:00",
      "08:15",
      "08:30",
      "08:45",
    ]);
  });
  it("returns [] for a non-positive step (no infinite loop)", () => {
    expect(enumerateIntervals("08:00", "16:00", 0)).toEqual([]);
  });
});

describe("intervalCovered", () => {
  it("is true when the interval lies within the shift", () => {
    expect(intervalCovered("08:30", 30, "08:00", "16:00")).toBe(true);
  });
  it("is true on the exact lower boundary", () => {
    expect(intervalCovered("08:00", 30, "08:00", "16:00")).toBe(true);
  });
  it("is false when the interval starts at/after shift end", () => {
    expect(intervalCovered("16:00", 30, "08:00", "16:00")).toBe(false);
  });
  it("is false when the interval straddles the shift end", () => {
    expect(intervalCovered("15:45", 30, "08:00", "16:00")).toBe(false);
  });
});
