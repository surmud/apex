import { Explained, UserProfile } from './types';

/**
 * VO2max estimate from a run's pace + heart rate, Daniels/Swain style.
 *
 * 1. Grade-adjust speed: each meter of climb ≈ 6 m of flat-equivalent distance.
 * 2. Running economy (Daniels): VO2 = −4.60 + 0.182258·v + 0.000104·v²  (v in m/min)
 * 3. Fraction of VO2max from HR (Swain 1994): %VO2max = (%HRmax − 37) / 0.64
 * 4. VO2max = VO2 ÷ fraction
 */
export function vo2maxEstimate(
  distanceM: number,
  movingTimeS: number,
  elevationGainM: number,
  avgHr: number,
  profile: Pick<UserProfile, 'maxHr' | 'maxHrIsEstimated'>,
): Explained<number> | null {
  if (movingTimeS < 600 || distanceM < 1500) return null; // too short to be meaningful
  const flatEquivM = distanceM + elevationGainM * 6;
  const v = flatEquivM / (movingTimeS / 60); // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;

  const pctHrMax = avgHr / profile.maxHr;
  const frac = Math.min(1, Math.max(0.4, (pctHrMax * 100 - 37) / 64));
  const value = vo2 / frac;

  if (!isFinite(value) || value < 20 || value > 90) return null;

  const caveats = [
    'Any single run can read 3 to 4 points high or low. The dashboard uses a rolling median to stabilize the trend.',
    'Heat, wind, and surface are not in this formula, so hot-day runs read a little low.',
  ];
  if (profile.maxHrIsEstimated) {
    caveats.push('Your max HR is estimated from age. A measured max would tighten this estimate.');
  }

  return {
    value,
    explanation: {
      method: 'Daniels running economy + Swain HR fraction',
      summary:
        'Estimates the size of your aerobic engine from how fast you ran relative to how hard your heart was working. One run is noisy. The trend across many runs is the signal.',
      formula: 'VO2max = (−4.60 + 0.182·v + 0.000104·v²) ÷ ((%HRmax − 37)/64)',
      inputs: [
        { label: 'Distance (grade-adjusted)', value: `${(flatEquivM / 1000).toFixed(2)} km` },
        { label: 'Elevation gain', value: `${Math.round(elevationGainM)} m` },
        { label: 'Speed v', value: `${v.toFixed(1)} m/min` },
        { label: 'Avg HR', value: `${Math.round(avgHr)} bpm (${(pctHrMax * 100).toFixed(0)}% of max)` },
        { label: 'VO2 at pace', value: `${vo2.toFixed(1)} ml/kg/min` },
        { label: '%VO2max fraction', value: frac.toFixed(2) },
      ],
      output: `${value.toFixed(1)} ml/kg/min`,
      caveats,
      source: 'Daniels & Gilbert running economy; Swain et al. (1994) HR–VO2 relationship',
    },
  };
}

/** Rolling median of the last n per-run estimates — what the dashboard shows. */
export function rollingVo2max(estimates: number[], n = 10): number | null {
  if (estimates.length === 0) return null;
  const recent = estimates.slice(-n).slice().sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  return recent.length % 2 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
}
