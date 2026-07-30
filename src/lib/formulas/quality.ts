import { Activity, QualityFlag } from './types';

export const QUALITY_FLAG_LABEL: Record<QualityFlag, { title: string; detail: string; excludes: boolean }> = {
  missing_hr: {
    title: 'No heart rate',
    detail: 'No heart rate data was recorded, so strain, VO2max, and efficiency cannot be computed for this run.',
    excludes: false,
  },
  missing_gps: {
    title: 'No GPS',
    detail: 'No location was recorded, so weather could not be attached.',
    excludes: false,
  },
  suspicious_pace: {
    title: 'Suspicious pace',
    detail: 'The pace is faster than world class for this distance, which points to a GPS or recording error. It is excluded from trends.',
    excludes: true,
  },
  treadmill: {
    title: 'Treadmill',
    detail: 'Indoor run. No weather is attached, and pace comes from the machine or foot pod.',
    excludes: false,
  },
  gps_drift: {
    title: 'GPS drift',
    detail: 'Speed spikes suggest GPS drift and the distance may be overstated. It is excluded from pace trends.',
    excludes: true,
  },
  too_short: {
    title: 'Very short',
    detail: 'Under five minutes, so it is excluded from fitness metrics.',
    excludes: true,
  },
};

export function detectQualityFlags(a: Activity): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (a.avgHr == null) flags.push('missing_hr');
  if (a.startLat == null && !a.isTreadmill) flags.push('missing_gps');
  if (a.isTreadmill) flags.push('treadmill');
  if (a.movingTimeS < 300) flags.push('too_short');

  const paceSPerKm = a.avgSpeedMs > 0 ? 1000 / a.avgSpeedMs : Infinity;
  // sub-2:45/km (~4:25/mi) sustained is faster than any human race pace
  if (paceSPerKm < 165 && a.distanceM > 1000) flags.push('suspicious_pace');
  // elapsed wildly larger than moving + speed spikes → drift heuristic
  if (a.avgSpeedMs > 7 && a.distanceM > 2000) flags.push('gps_drift');

  return flags;
}

export function isExcludedFromAnalysis(flags: QualityFlag[]): boolean {
  return flags.some((f) => QUALITY_FLAG_LABEL[f].excludes);
}
