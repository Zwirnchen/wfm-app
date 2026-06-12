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
