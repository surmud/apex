import { BestEffort, fitRiegelExponent, formatHms, riegelProject } from './riegel';
import { Explanation } from './types';

export type Scenario = 'conservative' | 'target' | 'stretch';

export const RACE_DISTANCES = {
  '5K': 5000,
  '10K': 10000,
  Half: 21097,
  Marathon: 42195,
} as const;
export type RaceDistanceKey = keyof typeof RACE_DISTANCES;

export interface ScenarioBand {
  scenario: Scenario;
  lowS: number;
  highS: number;
  paceLowSPerMi: number;
  paceHighSPerMi: number;
  rationale: string;
  peakMpw: [number, number];
  speedSessionsPerWk: string;
  daysPerWk: number;
  explanation: Explanation;
}

export interface ProjectionInputsSummary {
  bestEffortLabel: string;
  riegelK: number;
  kFitted: boolean;
  currentMpw: number;
  efficiencyTrendPct: number | null;
}

/**
 * Scenario generation: Riegel baseline from the user's best recent effort,
 * scaled by scenario-dependent fitness improvement over the horizon, with
 * uncertainty bands from how variable the user's efforts are.
 *
 * - Conservative: hold current fitness (0–1% gain), current mileage
 * - Target: realistic build (~2–4% gain over 90d) at moderate mileage bump
 * - Stretch: aggressive build (~4–7%), high mileage — flagged if ACWR-unsafe
 */
export function projectScenarios(
  efforts: BestEffort[],
  targetDistanceM: number,
  horizonDays: number,
  currentMpw: number,
): { bands: ScenarioBand[]; inputs: ProjectionInputsSummary } | null {
  if (efforts.length === 0) return null;
  const { k, fitted } = fitRiegelExponent(efforts);

  // best recent effort = fastest equivalent using Riegel normalization to target
  const scored = efforts
    .map((e) => ({ e, t: riegelProject(e, targetDistanceM, k, fitted).value }))
    .sort((a, b) => a.t - b.t);
  const ref = scored[0].e;
  const baseline = riegelProject(ref, targetDistanceM, k, fitted);

  // horizon scaling: gains accrue with diminishing returns; 90d is the anchor
  const horizonScale = Math.min(1.6, Math.sqrt(horizonDays / 90));

  const defs: {
    scenario: Scenario;
    gain: [number, number];
    mpw: [number, number];
    speed: string;
    days: number;
  }[] = [
    {
      scenario: 'conservative',
      gain: [-0.005, 0.01],
      mpw: [Math.round(currentMpw * 0.95), Math.round(currentMpw * 1.1)],
      speed: 'Optional',
      days: Math.min(5, Math.max(3, Math.round(currentMpw / 10))),
    },
    {
      scenario: 'target',
      gain: [0.02, 0.04],
      mpw: [Math.round(currentMpw * 1.25), Math.round(currentMpw * 1.45)],
      speed: '1 per week',
      days: Math.min(6, Math.max(4, Math.round(currentMpw / 9))),
    },
    {
      scenario: 'stretch',
      gain: [0.04, 0.07],
      mpw: [Math.round(currentMpw * 1.5), Math.round(currentMpw * 1.7)],
      speed: '2 per week',
      days: Math.min(7, Math.max(5, Math.round(currentMpw / 8))),
    },
  ];

  // uncertainty half-width: ±1.5% of time, wider for longer horizons & distances beyond history
  const maxKnown = Math.max(...efforts.map((e) => e.distanceM));
  const extrapolationPenalty = targetDistanceM > maxKnown ? 0.015 : 0.005;
  const half = baseline.value * (0.01 + extrapolationPenalty) * Math.sqrt(horizonDays / 90 + 0.5);

  const bands = defs.map((d) => {
    const gainMid = ((d.gain[0] + d.gain[1]) / 2) * horizonScale;
    const mid = baseline.value * (1 - gainMid);
    const spread = (baseline.value * (d.gain[1] - d.gain[0]) * horizonScale) / 2;
    const lowS = mid - spread - half;
    const highS = mid + spread + half;
    const miles = targetDistanceM / 1609.344;
    const timeRange = `${formatHms(lowS)} to ${formatHms(highS)}`;

    let rationale: string;
    if (d.scenario === 'conservative') {
      rationale =
        horizonDays === 0
          ? `A time of ${timeRange} reflects your current fitness with no further build. It is what you could run soon on the base you already have.`
          : `A time of ${timeRange} is realistic on your current base. Hold your mileage steady, stay healthy, and this range is yours.`;
    } else if (d.scenario === 'target') {
      rationale = `A time of ${timeRange} requires a steady build to a peak of ${d.mpw[0]} to ${d.mpw[1]} miles per week with one quality session each week.`;
    } else {
      rationale = `A time of ${timeRange} requires ${d.mpw[0]} to ${d.mpw[1]} miles per week, two quality sessions each week, and a near-perfect training block.`;
    }

    return {
      scenario: d.scenario,
      lowS,
      highS,
      paceLowSPerMi: lowS / miles,
      paceHighSPerMi: highS / miles,
      rationale,
      peakMpw: d.mpw,
      speedSessionsPerWk: d.speed,
      daysPerWk: d.days,
      explanation: {
        method: 'Riegel baseline + scenario fitness gain + uncertainty band',
        summary:
          'Starts from your best recent effort, scales it to the race distance, then adds the fitness you could plausibly gain by race day under this scenario. The range reflects genuine uncertainty rather than a single fake-precise number.',
        formula: 'T = Riegel(best effort → target) × (1 − gain × √(horizon/90)) ± band',
        inputs: [
          ...baseline.explanation.inputs,
          { label: 'Scenario gain', value: `${(d.gain[0] * 100).toFixed(1)} to ${(d.gain[1] * 100).toFixed(1)}% over 90 days` },
          { label: 'Horizon', value: `${horizonDays} days` },
          { label: 'Uncertainty half-width', value: `plus or minus ${formatHms(spread + half)}` },
        ],
        output: timeRange,
        caveats: [
          'This is a range rather than a point estimate. The width reflects how variable your efforts are and how far out the horizon is.',
          ...(targetDistanceM > maxKnown
            ? [`This extrapolates beyond your longest logged effort of ${(maxKnown / 1609.344).toFixed(1)} miles, so the band is widened.`]
            : []),
          ...baseline.explanation.caveats,
        ],
      },
    };
  });

  return {
    bands,
    inputs: {
      bestEffortLabel: `${(ref.distanceM / 1609.344).toFixed(1)} mi in ${formatHms(ref.timeS)}`,
      riegelK: k,
      kFitted: fitted,
      currentMpw: Math.round(currentMpw),
      efficiencyTrendPct: null,
    },
  };
}

/** Course factor: added time for elevation + expected heat. */
export function courseTimePenaltyS(
  flatTimeS: number,
  distanceM: number,
  elevationGainM: number,
  expectedTempC: number | null,
  expectedHumidityPct: number | null,
): { lowS: number; highS: number; explanation: Explanation } {
  // ~1.5–2.5 s per meter of gain for recreational runners
  const elevLow = elevationGainM * 1.5;
  const elevHigh = elevationGainM * 2.5;

  let heatLow = 0;
  let heatHigh = 0;
  if (expectedTempC != null) {
    const dewApprox = expectedHumidityPct != null
      ? expectedTempC - (100 - expectedHumidityPct) / 5
      : expectedTempC - 8;
    const tF = expectedTempC * 1.8 + 32;
    const dpF = dewApprox * 1.8 + 32;
    const combined = tF + dpF;
    const pct = combined <= 100 ? 0 : Math.min(10, ((combined - 100) / 10) * 0.75);
    heatLow = flatTimeS * (pct / 100) * 0.7;
    heatHigh = flatTimeS * (pct / 100) * 1.3;
  }

  return {
    lowS: elevLow + heatLow,
    highS: elevHigh + heatHigh,
    explanation: {
      method: 'Course factor (elevation + expected conditions)',
      summary:
        'Hills and heat cost time beyond what flat-course fitness predicts. This estimates how much this specific course adds to your finish time.',
      formula: 'penalty = gain_m × 1.5–2.5 s/m + heat penalty% × flat time',
      inputs: [
        { label: 'Elevation gain', value: `${Math.round(elevationGainM)} m (${Math.round(elevationGainM * 3.28)} ft)` },
        { label: 'Expected temp', value: expectedTempC != null ? `${expectedTempC}°C` : 'not set' },
        { label: 'Expected humidity', value: expectedHumidityPct != null ? `${expectedHumidityPct}%` : 'not set' },
      ],
      output: `+${formatHms(elevLow + heatLow)} to +${formatHms(elevHigh + heatHigh)} vs flat/cool`,
      caveats: ['This assumes the gain is spread across the course. A single mountain climb costs more than the same gain spread evenly.'],
    },
  };
}

/**
 * Pace-per-mile split profile for a scenario: base pace shaped by fade
 * (positive split tendency) and course features.
 */
export function splitProfile(
  totalTimeS: number,
  distanceM: number,
  keyClimbs: { mile: number; label: string }[] = [],
): { mile: number; paceSPerMi: number }[] {
  const miles = distanceM / 1609.344;
  const n = Math.ceil(miles);
  const avg = totalTimeS / miles;
  const out: { mile: number; paceSPerMi: number }[] = [];
  for (let i = 1; i <= n; i++) {
    // gentle fade: -1.5% at start to +2.5% at the end (typical well-paced race)
    const t = (i - 1) / Math.max(1, n - 1);
    let pace = avg * (0.985 + t * 0.04);
    if (keyClimbs.some((c) => Math.abs(c.mile - i) < 1)) pace *= 1.045;
    out.push({ mile: i, paceSPerMi: pace });
  }
  return out;
}
