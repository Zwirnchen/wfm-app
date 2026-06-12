/** Parameters that drive the Erlang C calculation. Set by the supervisor. */
export interface StaffingParams {
  serviceLevelTarget: number; // 0..1, e.g. 0.8
  thresholdSeconds: number;   // e.g. 20
  shrinkagePercent: number;   // 0..1, e.g. 0.3
  maxOccupancy: number;       // 0..1, e.g. 0.85
  intervalLengthMinutes: number; // 15 | 30 | 60
}

/** A single forecast data point. */
export interface ForecastPoint {
  date: string;        // ISO yyyy-mm-dd
  intervalStart: string; // "HH:mm"
  expectedCalls: number;
  ahtSeconds: number;
}

/** Result of the demand calculation for one interval. */
export interface Requirement {
  date: string;
  intervalStart: string; // "HH:mm"
  requiredAgents: number;
}
