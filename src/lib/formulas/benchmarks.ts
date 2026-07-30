import { RACE_DISTANCES, RaceDistanceKey } from './projections';
import { HrZones } from './zones';

/**
 * Pre-race benchmark workouts: the checkpoints a runner should be able to
 * hit on the way to a goal, so "am I on track" has a concrete answer weeks
 * before race day. Derived from the goal pace with standard training-pace
 * offsets (easy runs 45 to 90 seconds per mile slower than marathon pace,
 * tempo near threshold, tune-up races near goal effort).
 */

export interface Benchmark {
  weeksOut: number;
  /** Concrete date when the race date is known, else null */
  dateISO: string | null;
  workout: string;
  detail: string;
  /** Target pace window in seconds per mile */
  targetPaceSPerMi: [number, number] | null;
  /** Target heart rate window in bpm, from the runner's own zones */
  targetHrBpm: [number, number] | null;
  /** Set when a completed run plausibly checked this box */
  achieved: boolean;
}

interface BenchmarkSpec {
  weeksOut: number;
  workout: string;
  detail: string;
  /** Pace offset from goal race pace, in s/mi: [lowOffset, highOffset] */
  paceOffset: [number, number] | null;
  /** HR window as 1-based zone numbers: [lowest zone, highest zone] */
  hrZone: [number, number] | null;
  /** Rough distance of the keystone run in miles, for achievement matching */
  distanceMi: number | null;
}

const SPECS: Record<RaceDistanceKey, BenchmarkSpec[]> = {
  Marathon: [
    { weeksOut: 8, workout: '16 mile long run', detail: 'Fully conversational. The point is time on your feet, not pace.', paceOffset: [60, 100], hrZone: [1, 2], distanceMi: 16 },
    { weeksOut: 6, workout: 'Half marathon tune-up or 13 mile steady run', detail: 'Run the middle miles near goal marathon effort to rehearse fueling and rhythm.', paceOffset: [0, 30], hrZone: [2, 3], distanceMi: 13 },
    { weeksOut: 4, workout: '20 mile easy long run', detail: 'The confidence run. Easy heart rate the whole way proves the aerobic base is there.', paceOffset: [45, 90], hrZone: [1, 2], distanceMi: 20 },
    { weeksOut: 3, workout: '8 to 10 miles with 6 at marathon pace', detail: 'Goal pace should feel controlled here, not like a race.', paceOffset: [0, 10], hrZone: [2, 3], distanceMi: 9 },
    { weeksOut: 2, workout: '12 mile final long run', detail: 'Volume starts dropping. Keep it honest but comfortable.', paceOffset: [45, 90], hrZone: [1, 2], distanceMi: 12 },
  ],
  Half: [
    { weeksOut: 6, workout: '10 mile long run', detail: 'Conversational effort throughout.', paceOffset: [60, 100], hrZone: [1, 2], distanceMi: 10 },
    { weeksOut: 4, workout: '10K tune-up or 6 mile tempo', detail: 'Run near goal half effort to calibrate what race pace feels like.', paceOffset: [-15, 10], hrZone: [3, 4], distanceMi: 6 },
    { weeksOut: 3, workout: '11 to 12 mile long run', detail: 'Longest run of the block. Easy heart rate proves the distance is covered.', paceOffset: [50, 90], hrZone: [1, 2], distanceMi: 11.5 },
    { weeksOut: 2, workout: '7 miles with 4 at goal pace', detail: 'Goal pace should feel sustainable, with something left.', paceOffset: [0, 10], hrZone: [2, 3], distanceMi: 7 },
  ],
  '10K': [
    { weeksOut: 5, workout: '8 mile long run', detail: 'Relaxed. Endurance still decides the last 2K of a 10K.', paceOffset: [75, 115], hrZone: [1, 2], distanceMi: 8 },
    { weeksOut: 3, workout: '5K tune-up race or hard 3 miles', detail: 'A best-effort 5K predicts the 10K well and sharpens speed.', paceOffset: [-20, -5], hrZone: [3, 5], distanceMi: 3.1 },
    { weeksOut: 2, workout: '4 miles at goal 10K pace, broken as needed', detail: 'For example 4 by 1 mile with short jogs. Pace should feel repeatable.', paceOffset: [0, 8], hrZone: [3, 4], distanceMi: 4 },
  ],
  '5K': [
    { weeksOut: 4, workout: '6 mile long run', detail: 'Easy effort. Aerobic base sets the ceiling even at 5K.', paceOffset: [90, 130], hrZone: [1, 2], distanceMi: 6 },
    { weeksOut: 2, workout: '3 by 1 mile at goal pace', detail: 'With 2 to 3 minute jogs. Hitting all three reps on pace is the green light.', paceOffset: [0, 8], hrZone: [4, 5], distanceMi: 3 },
  ],
};

/**
 * Build the benchmark list for a goal. `goalTimeS` is required (use the
 * projection target midpoint when the user has not set an explicit time).
 * Completed activities are scanned to mark checkpoints already achieved:
 * a run within 6 days of the checkpoint date (or any run when no race
 * date exists) at 90 percent or more of the keystone distance counts.
 */
export function raceBenchmarks(
  distanceKey: RaceDistanceKey,
  goalTimeS: number,
  raceDateISO: string | null,
  zones: HrZones,
  completed: { dateISO: string; distanceMi: number }[],
  todayISO: string,
): Benchmark[] {
  const racePaceSPerMi = goalTimeS / (RACE_DISTANCES[distanceKey] / 1609.344);
  const raceT = raceDateISO ? new Date(raceDateISO).getTime() : null;

  return SPECS[distanceKey]
    .map((s) => {
      const dateISO =
        raceT != null ? new Date(raceT - s.weeksOut * 7 * 86400000).toISOString().slice(0, 10) : null;
      const targetPace: [number, number] | null = s.paceOffset
        ? [racePaceSPerMi + s.paceOffset[0], racePaceSPerMi + s.paceOffset[1]]
        : null;
      const targetHr: [number, number] | null = s.hrZone
        ? [zones[s.hrZone[0] - 1], s.hrZone[1] >= 5 ? zones[5] : zones[s.hrZone[1]] - 1]
        : null;

      const achieved =
        s.distanceMi != null &&
        completed.some((c) => {
          const near =
            dateISO == null ||
            Math.abs(new Date(c.dateISO).getTime() - new Date(dateISO).getTime()) <= 6 * 86400000;
          return near && c.dateISO <= todayISO && c.distanceMi >= s.distanceMi! * 0.9;
        });

      return {
        weeksOut: s.weeksOut,
        dateISO,
        workout: s.workout,
        detail: s.detail,
        targetPaceSPerMi: targetPace,
        targetHrBpm: targetHr,
        achieved,
      };
    })
    .sort((a, b) => b.weeksOut - a.weeksOut);
}

/**
 * The weekly mileage path a projection assumes: ramp from current volume
 * toward the scenario's peak at 10 percent per week with a cutback every
 * fourth week, hold the peak, then taper over the final two weeks.
 */
export function requiredRamp(
  currentMpw: number,
  peakMpw: number,
  weeks: number,
): { week: number; mpw: number }[] {
  const out: { week: number; mpw: number }[] = [];
  let mpw = Math.max(5, currentMpw);
  for (let w = 1; w <= weeks; w++) {
    const weeksLeft = weeks - w;
    if (weeksLeft === 0) {
      out.push({ week: w, mpw: Math.round(peakMpw * 0.45) });
    } else if (weeksLeft === 1) {
      out.push({ week: w, mpw: Math.round(peakMpw * 0.7) });
    } else if (w % 4 === 0) {
      out.push({ week: w, mpw: Math.round(mpw * 0.78) });
    } else {
      mpw = Math.min(peakMpw, mpw * 1.1);
      out.push({ week: w, mpw: Math.round(mpw) });
    }
  }
  return out;
}
