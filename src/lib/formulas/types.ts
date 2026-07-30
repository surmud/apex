/**
 * Shared types for the Apex formula engine.
 * Every computed metric carries an Explanation so the UI can render
 * a "How was this calculated?" panel — this is a core product requirement.
 */

export interface ExplanationInput {
  label: string;
  value: string; // pre-formatted for display
}

export interface Explanation {
  /** Human name of the method, e.g. "Banister TRIMP" */
  method: string;
  /** One or two plain sentences: what this number means, no math. */
  summary?: string;
  /** The formula itself, in plain math notation */
  formula: string;
  /** The actual input values that were plugged in */
  inputs: ExplanationInput[];
  /** Formatted output */
  output: string;
  /** Confidence range or caveats — always at least one caveat */
  caveats: string[];
  /** Optional citation / provenance */
  source?: string;
}

export interface Explained<T> {
  value: T;
  explanation: Explanation;
}

export type WorkoutType = 'easy' | 'tempo' | 'interval' | 'long' | 'race';
export type WorkoutTypeSource = 'auto_detected' | 'user_corrected';

export type QualityFlag =
  | 'missing_hr'
  | 'missing_gps'
  | 'suspicious_pace'
  | 'treadmill'
  | 'gps_drift'
  | 'too_short';

export interface UserProfile {
  sex: 'M' | 'F';
  /** ISO date string */
  dob: string;
  weightKg: number;
  /** Height in cm; used for population comparisons of cadence and stride. */
  heightCm?: number | null;
  restingHr: number;
  maxHr: number;
  maxHrIsEstimated: boolean;
  units: 'mi_f' | 'km_c';
  /** Six bpm boundaries [z1lo..z5lo, max], set by the zone calculator. */
  hrZones?: [number, number, number, number, number, number] | null;
}

export interface Activity {
  id: string;
  startTime: string; // ISO
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  elevationGainM: number;
  avgSpeedMs: number;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  /** Coefficient of variation of split paces, 0–1 (null if no splits) */
  paceCv: number | null;
  /** Running-dynamics metrics (Apple Watch / advanced watches); null when the source lacks them */
  verticalOscillationCm: number | null;
  groundContactMs: number | null;
  strideLengthM: number | null;
  runningPowerW: number | null;
  isTreadmill: boolean;
  startLat: number | null;
  startLng: number | null;
  name: string;
  /** User marked (or Strava tagged) this as a race */
  isRaceTagged: boolean;
}

export interface ActivityWeather {
  tempC: number;
  humidityPct: number;
  dewpointC: number;
  windMs: number;
}

export interface ActivityMetrics {
  trimp: Explained<number> | null;
  efficiencyFactor: Explained<number> | null;
  vo2maxEstimate: Explained<number> | null;
  adjustedPaceSPerKm: Explained<number> | null;
  workoutType: {
    value: WorkoutType;
    source: WorkoutTypeSource;
    rationale: string;
    explanation: Explanation;
  };
  qualityFlags: QualityFlag[];
}

export interface DailyLoad {
  date: string; // yyyy-mm-dd
  dayTrimp: number;
  acute7d: number;
  chronic28d: number;
  acwr: number | null;
}

export const FORMULA_VERSION = 1;
