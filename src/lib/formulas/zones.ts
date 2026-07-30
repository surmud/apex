import { Activity, Explained } from './types';

/**
 * Heart rate zones using the Karvonen (heart rate reserve) method, which
 * anchors zones to both resting and max HR instead of max alone. It is
 * the most individualized of the standard formulas.
 *
 * zone floor = resting + fraction x (max - resting)
 * Z1 50-60% of reserve, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 90-100%.
 */

/** Six boundaries in bpm: [z1lo, z2lo, z3lo, z4lo, z5lo, max] */
export type HrZones = [number, number, number, number, number, number];

export const ZONE_NAMES = ['Recovery', 'Aerobic', 'Tempo', 'Threshold', 'Max'] as const;

export function computeZones(restingHr: number, maxHr: number): Explained<HrZones> {
  const reserve = maxHr - restingHr;
  const at = (frac: number) => Math.round(restingHr + frac * reserve);
  const zones: HrZones = [at(0.5), at(0.6), at(0.7), at(0.8), at(0.9), maxHr];

  return {
    value: zones,
    explanation: {
      method: 'Karvonen heart rate reserve zones',
      summary:
        'Your training zones anchored to your own resting and maximum heart rate rather than generic percentages, so easy for you is defined by your physiology.',
      formula: 'zone floor = resting HR + fraction x (max HR - resting HR), with fractions at 50, 60, 70, 80, and 90 percent',
      inputs: [
        { label: 'Resting HR', value: `${restingHr} bpm` },
        { label: 'Max HR', value: `${maxHr} bpm` },
        { label: 'Heart rate reserve', value: `${reserve} bpm` },
      ],
      output: zones
        .slice(0, 5)
        .map((lo, i) => `Z${i + 1} ${lo}-${i < 4 ? zones[i + 1] - 1 : zones[5]}`)
        .join(', '),
      caveats: [
        'The Karvonen method uses your heart rate reserve, so it is more individualized than percent-of-max formulas.',
        'Zones are only as accurate as the resting and max values behind them. A measured max beats an estimate.',
      ],
      source: 'Karvonen et al. (1957), the heart rate reserve training method',
    },
  };
}

/** Which zone (1-5) a heart rate falls in. 0 if below Z1. */
export function zoneForHr(hr: number, zones: HrZones): number {
  for (let z = 5; z >= 1; z--) {
    if (hr >= zones[z - 1]) return z;
  }
  return 0;
}

/**
 * Best available max HR from the user's own data: the highest heart rate
 * ever recorded across their runs. Slightly conservative but measured.
 */
export function observedMaxHr(activities: Activity[]): number | null {
  let best: number | null = null;
  for (const a of activities) {
    for (const v of [a.maxHr, a.avgHr]) {
      if (v != null && (best == null || v > best)) best = v;
    }
  }
  return best != null ? Math.round(best) : null;
}

/**
 * Best available resting HR proxy from run data: the lowest average HR
 * seen on any run, minus a small offset, since even the easiest jog sits
 * well above true resting. This is a floor estimate, not a measurement.
 */
export function observedRestingHrEstimate(activities: Activity[]): number | null {
  let lowestAvg: number | null = null;
  for (const a of activities) {
    if (a.avgHr != null && (lowestAvg == null || a.avgHr < lowestAvg)) lowestAvg = a.avgHr;
  }
  if (lowestAvg == null) return null;
  // The easiest recorded run still runs roughly 55-65% of reserve above rest.
  return Math.max(35, Math.round(lowestAvg - 60));
}
