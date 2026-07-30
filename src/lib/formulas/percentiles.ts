import { Activity, Explanation, UserProfile } from './types';

/**
 * Population percentiles for form metrics.
 *
 * These compare the runner to the general recreational running population,
 * not to elite standards, and only for mechanics that are not a fitness
 * score: cadence, vertical oscillation, ground contact time, and stride
 * length relative to height. Pace, VO2max, and strain are deliberately
 * excluded because ranking people on fitness is shaming, not insight.
 *
 * The reference distributions are a small local database assembled from
 * published sources: Garmin's running dynamics population bands (collected
 * from watch users with the HRM-Run pod) and cadence field studies of
 * recreational runners. Each is modeled as a normal distribution, which is
 * a reasonable fit for the middle 90 percent of these metrics.
 */

export type PercentileMetric = 'cadence' | 'vertosc' | 'gct' | 'stride';

interface ReferenceEntry {
  metric: PercentileMetric;
  label: string;
  unit: string;
  mean: number;
  sd: number;
  /** For bounce and contact time a lower raw value is the less common, "springier" end. */
  lowerIsSpringier: boolean;
  source: string;
}

/** The reference database. Values describe recreational adult runners. */
export const POPULATION_REFERENCE: ReferenceEntry[] = [
  {
    metric: 'cadence',
    label: 'Cadence',
    unit: 'spm',
    mean: 168,
    sd: 9.5,
    lowerIsSpringier: false,
    source: 'Garmin running dynamics population data; recreational cadence field studies',
  },
  {
    metric: 'vertosc',
    label: 'Vertical oscillation',
    unit: 'cm',
    mean: 9.2,
    sd: 1.55,
    lowerIsSpringier: true,
    source: 'Garmin running dynamics population data (HRM-Run cohort)',
  },
  {
    metric: 'gct',
    label: 'Ground contact time',
    unit: 'ms',
    mean: 263,
    sd: 27,
    lowerIsSpringier: true,
    source: 'Garmin running dynamics population data (HRM-Run cohort)',
  },
  {
    metric: 'stride',
    label: 'Stride length for your height',
    unit: 'ratio',
    mean: 0.60, // stride length divided by height, easy-run population
    sd: 0.075,
    lowerIsSpringier: false,
    source: 'Stride-to-height ratios from recreational gait analyses',
  },
];

export interface PercentileResult {
  metric: PercentileMetric;
  label: string;
  /** The runner's raw value, already formatted for display */
  valueLabel: string;
  /** 0 to 100. Read as: this share of the population sits below (or above, see phrasing). */
  percentile: number;
  /** Complete sentence for the UI. Neutral phrasing, no ranking language. */
  phrasing: string;
  explanation: Explanation;
}

/** Standard normal CDF via the Abramowitz and Stegun erf approximation. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return Math.min(0.999, Math.max(0.001, p));
}

/**
 * Cadence expectation shifts slightly with height: taller runners take
 * longer, slower steps. About 0.25 spm per cm is the mild adjustment the
 * literature supports, capped so an unusual height never dominates.
 */
function cadenceMeanForHeight(heightCm: number | null | undefined): number {
  const base = POPULATION_REFERENCE[0].mean;
  if (heightCm == null || heightCm < 120 || heightCm > 220) return base;
  const shift = Math.max(-6, Math.min(6, -0.25 * (heightCm - 172)));
  return base + shift;
}

function build(
  ref: ReferenceEntry,
  value: number,
  valueLabel: string,
  mean: number,
  phrasing: (pct: number) => string,
  extraInputs: { label: string; value: string }[] = [],
): PercentileResult {
  const z = (value - mean) / ref.sd;
  const below = normalCdf(z); // share of population with a lower raw value
  const pct = Math.round(below * 100);
  return {
    metric: ref.metric,
    label: ref.label,
    valueLabel,
    percentile: pct,
    phrasing: phrasing(pct),
    explanation: {
      method: 'Population percentile',
      formula: 'percentile = Φ((your value − population mean) / population SD)',
      inputs: [
        { label: 'Your value', value: valueLabel },
        { label: 'Population mean', value: `${mean.toFixed(1)} ${ref.unit}` },
        { label: 'Population SD', value: `${ref.sd} ${ref.unit}` },
        ...extraInputs,
      ],
      output: `${pct}th percentile of the raw value`,
      caveats: [
        'This describes where you sit in the recreational running population, not what is good or bad. Form metrics vary naturally with build and style.',
        'The reference distribution is approximate and pooled across paces, so compare your own trend over time before comparing to anyone else.',
      ],
      source: ref.source,
    },
  };
}

/**
 * All population percentiles available for one activity, given the profile.
 * Uses recent-average values when the caller passes them, otherwise the
 * single activity's values.
 */
export function populationPercentiles(
  activity: Pick<
    Activity,
    'avgCadence' | 'verticalOscillationCm' | 'groundContactMs' | 'strideLengthM'
  >,
  profile: Pick<UserProfile, 'heightCm'>,
): PercentileResult[] {
  const out: PercentileResult[] = [];
  const [cadRef, voRef, gctRef, strideRef] = POPULATION_REFERENCE;

  if (activity.avgCadence != null && activity.avgCadence > 100) {
    const mean = cadenceMeanForHeight(profile.heightCm);
    out.push(
      build(
        cadRef,
        activity.avgCadence,
        `${Math.round(activity.avgCadence)} spm`,
        mean,
        (p) =>
          `You take more steps per minute than ${p} percent of recreational runners${profile.heightCm ? ' of your height' : ''}.`,
        profile.heightCm
          ? [{ label: 'Height adjustment', value: `expected mean ${mean.toFixed(1)} spm at ${profile.heightCm} cm` }]
          : [],
      ),
    );
  }

  if (activity.verticalOscillationCm != null) {
    const r = build(
      voRef,
      activity.verticalOscillationCm,
      `${activity.verticalOscillationCm.toFixed(1)} cm`,
      voRef.mean,
      () => '',
    );
    // For bounce, the interesting share is who bounces MORE than you.
    const springier = 100 - r.percentile;
    out.push({
      ...r,
      percentile: springier,
      phrasing: `Your torso bounces less than ${springier} percent of recreational runners.`,
    });
  }

  if (activity.groundContactMs != null) {
    const r = build(
      gctRef,
      activity.groundContactMs,
      `${Math.round(activity.groundContactMs)} ms`,
      gctRef.mean,
      () => '',
    );
    const quicker = 100 - r.percentile;
    out.push({
      ...r,
      percentile: quicker,
      phrasing: `Your feet leave the ground quicker than ${quicker} percent of recreational runners.`,
    });
  }

  if (activity.strideLengthM != null && profile.heightCm != null && profile.heightCm > 120) {
    const ratio = activity.strideLengthM / (profile.heightCm / 100);
    out.push(
      build(
        strideRef,
        ratio,
        `${activity.strideLengthM.toFixed(2)} m (${ratio.toFixed(2)} × height)`,
        strideRef.mean,
        (p) => `Relative to your height, your stride is longer than ${p} percent of recreational runners.`,
        [{ label: 'Height', value: `${profile.heightCm} cm` }],
      ),
    );
  }

  return out;
}

/**
 * Percentiles from a runner's recent average rather than a single run,
 * which is steadier. Averages the last `n` runs that carry each metric.
 */
export function recentAveragePercentiles(
  activities: Activity[],
  profile: Pick<UserProfile, 'heightCm'>,
  n = 10,
): PercentileResult[] {
  const avgOf = (get: (a: Activity) => number | null): number | null => {
    const vals = activities.map(get).filter((v): v is number => v != null).slice(0, n);
    return vals.length >= 3 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  return populationPercentiles(
    {
      avgCadence: avgOf((a) => a.avgCadence),
      verticalOscillationCm: avgOf((a) => a.verticalOscillationCm),
      groundContactMs: avgOf((a) => a.groundContactMs),
      strideLengthM: avgOf((a) => a.strideLengthM),
    },
    profile,
  );
}
