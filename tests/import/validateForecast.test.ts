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
