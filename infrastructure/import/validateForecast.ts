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

// The importer expects German number formatting (Excel/telephony exports):
// "." is the thousands separator and "," is the decimal separator.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Parse a German- or machine-formatted number string. Returns NaN if not numeric.
 *  German convention: "." thousands separator, "," decimal separator.
 *  Strips thousands dots and converts the decimal comma, e.g. "1.234,5" -> 1234.5,
 *  "1.000" -> 1000, "180,5" -> 180.5, "100" -> 100.
 *  Tradeoff: an English-decimal like "180.5" normalizes to 1805. This is the
 *  accepted German-format behaviour; we deliberately do not auto-detect locale. */
function parseGermanNumber(raw: string): number {
  const s = (raw ?? "").trim();
  if (s === "") return NaN;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  // reject anything that isn't a clean number after normalization
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}

export function validateForecast(rows: RawRow[], intervalLengthMinutes: number): ValidationResult {
  const points: ForecastPoint[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const line = i + 1;
    const reasons: string[] = [];
    const date = row.Datum;
    const intervalStart = row.Intervallstart;
    const calls = parseGermanNumber(row.Anrufe);
    const aht = parseGermanNumber(row.AHT);

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

    if (reasons.length > 0) {
      errors.push({ line, reason: reasons.join("; ") });
    } else {
      // Only track valid rows for dedup so invalid rows don't pollute `seen`.
      seen.add(key);
      points.push({ date, intervalStart, expectedCalls: calls, ahtSeconds: aht });
    }
  });

  return { points, errors };
}
