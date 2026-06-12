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
