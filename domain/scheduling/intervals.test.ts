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
