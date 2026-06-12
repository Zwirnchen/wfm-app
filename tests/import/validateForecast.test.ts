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

  describe("German number formats", () => {
    it("parses thousands-separated Anrufe (\"1.000\" -> 1000)", () => {
      const r = validateForecast(
        [{ Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "1.000", AHT: "180" }],
        30,
      );
      expect(r.errors).toHaveLength(0);
      expect(r.points[0].expectedCalls).toBe(1000);
    });

    it("parses decimal-comma AHT (\"180,5\" -> 180.5)", () => {
      const r = validateForecast(
        [{ Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "100", AHT: "180,5" }],
        30,
      );
      expect(r.errors).toHaveLength(0);
      expect(r.points[0].ahtSeconds).toBe(180.5);
    });

    it("parses combined thousands + decimal (\"1.234,5\" -> 1234.5)", () => {
      const r = validateForecast(
        [{ Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "1.234,5", AHT: "180" }],
        30,
      );
      expect(r.errors).toHaveLength(0);
      expect(r.points[0].expectedCalls).toBe(1234.5);
    });

    it("still parses plain integer strings (\"100\"/\"180\")", () => {
      const r = validateForecast(
        [{ Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "100", AHT: "180" }],
        30,
      );
      expect(r.errors).toHaveLength(0);
      expect(r.points[0]).toMatchObject({ expectedCalls: 100, ahtSeconds: 180 });
    });

    it("errors on non-numeric Anrufe (\"x\")", () => {
      const r = validateForecast(
        [{ Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "x", AHT: "180" }],
        30,
      );
      expect(r.points).toHaveLength(0);
      expect(r.errors[0].reason).toMatch(/Anrufe/i);
    });

    it("errors on empty AHT", () => {
      const r = validateForecast(
        [{ Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "100", AHT: " " }],
        30,
      );
      expect(r.points).toHaveLength(0);
      expect(r.errors[0].reason).toMatch(/AHT/i);
    });
  });

  describe("validation edge cases", () => {
    it("flags a duplicate interval (first yields a point, second errors)", () => {
      const dup: RawRow[] = [
        { Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "100", AHT: "180" },
        { Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "100", AHT: "180" },
      ];
      const r = validateForecast(dup, 30);
      expect(r.points).toHaveLength(1);
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatchObject({ line: 2 });
      expect(r.errors[0].reason).toMatch(/Doppeltes Intervall/);
    });

    it("errors on negative Anrufe (\"-5\")", () => {
      const r = validateForecast(
        [{ Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "-5", AHT: "180" }],
        30,
      );
      expect(r.points).toHaveLength(0);
      expect(r.errors[0].reason).toMatch(/Anrufe/i);
    });

    it("errors on AHT=0 (boundary of > 0)", () => {
      const r = validateForecast(
        [{ Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "100", AHT: "0" }],
        30,
      );
      expect(r.points).toHaveLength(0);
      expect(r.errors[0].reason).toMatch(/AHT/i);
    });

    it("does not throw on a row missing a column (no Datum key)", () => {
      const rows = [
        { Intervallstart: "08:00", Anrufe: "100", AHT: "180" } as unknown as RawRow,
      ];
      const r = validateForecast(rows, 30);
      expect(r.points).toHaveLength(0);
      expect(r.errors[0].reason).toMatch(/Datum/i);
    });

    it("accepts multiple valid rows -> multiple points, no errors", () => {
      const rows: RawRow[] = [
        { Datum: "2026-06-15", Intervallstart: "08:00", Anrufe: "100", AHT: "180" },
        { Datum: "2026-06-15", Intervallstart: "08:30", Anrufe: "120", AHT: "175" },
        { Datum: "2026-06-15", Intervallstart: "09:00", Anrufe: "90", AHT: "200" },
      ];
      const r = validateForecast(rows, 30);
      expect(r.errors).toHaveLength(0);
      expect(r.points).toHaveLength(3);
    });
  });
});
