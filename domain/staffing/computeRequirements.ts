import { requiredAgents } from "./erlangC";
import type { ForecastPoint, Requirement, StaffingParams } from "../types";

export function computeRequirements(
  forecast: ForecastPoint[],
  params: StaffingParams,
): Requirement[] {
  return forecast.map((p) => ({
    date: p.date,
    intervalStart: p.intervalStart,
    requiredAgents: requiredAgents(p.expectedCalls, p.ahtSeconds, params),
  }));
}
