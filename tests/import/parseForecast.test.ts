import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseCsv, parseXlsx } from "@/infrastructure/import/parseForecast";

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

describe("parseXlsx", () => {
  it("returns [] for a workbook with no usable sheet data", () => {
    // xlsx refuses to serialize a truly sheet-less workbook, so use an empty sheet
    // (the realistic "empty upload"); the guard / sheet_to_json yield [] either way.
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(parseXlsx(buffer)).toEqual([]);
  });

  it("parses rows from the first sheet", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Datum", "Intervallstart", "Anrufe", "AHT"],
      ["2026-06-15", "08:00", "100", "180"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = parseXlsx(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Datum: "2026-06-15", Anrufe: "100" });
  });
});
