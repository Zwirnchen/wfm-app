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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function validateForecast(rows: RawRow[], intervalLengthMinutes: number): ValidationResult {
  const points: ForecastPoint[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const line = i + 1;
    const reasons: string[] = [];
    const date = row.Datum;
    const intervalStart = row.Intervallstart;
    const calls = Number(row.Anrufe);
    const aht = Number(row.AHT);

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
    seen.add(key);

    if (reasons.length > 0) {
      errors.push({ line, reason: reasons.join("; ") });
    } else {
      points.push({ date, intervalStart, expectedCalls: calls, ahtSeconds: aht });
    }
  });

  return { points, errors };
}
