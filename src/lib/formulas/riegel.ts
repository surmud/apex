import { Explained } from './types';

export interface BestEffort {
  distanceM: number;
  timeS: number;
  date: string;
}

/**
 * Riegel race-time projection: T2 = T1 × (D2/D1)^k.
 * k defaults to 1.06; with ≥ 2 best efforts at distinct distances we fit
 * a per-user k by least squares on log(T) vs log(D).
 */
export function fitRiegelExponent(efforts: BestEffort[]): { k: number; fitted: boolean } {
  const distinct = dedupeByDistance(efforts);
  if (distinct.length < 2) return { k: 1.06, fitted: false };

  // least squares slope of ln(T) on ln(D)
  const xs = distinct.map((e) => Math.log(e.distanceM));
  const ys = distinct.map((e) => Math.log(e.timeS));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const k = den > 0 ? num / den : 1.06;
  // sanity clamp — outside this range the fit is telling us the data is bad
  if (k < 1.02 || k > 1.15) return { k: 1.06, fitted: false };
  return { k, fitted: true };
}

export function riegelProject(
  reference: BestEffort,
  targetDistanceM: number,
  k: number,
  kFitted: boolean,
): Explained<number> {
  const value = reference.timeS * Math.pow(targetDistanceM / reference.distanceM, k);
  return {
    value,
    explanation: {
      method: 'Riegel endurance projection',
      summary:
        'Predicts a race time at a new distance from a race you have already run, using the well-tested rule that pace fades by a few percent each time the distance doubles.',
      formula: 'T₂ = T₁ × (D₂ ÷ D₁)^k',
      inputs: [
        { label: 'Reference effort', value: `${(reference.distanceM / 1000).toFixed(1)} km in ${formatHms(reference.timeS)}` },
        { label: 'Target distance', value: `${(targetDistanceM / 1000).toFixed(1)} km` },
        { label: 'Exponent k', value: `${k.toFixed(3)} ${kFitted ? '(fit to your race history)' : '(standard default)'}` },
      ],
      output: formatHms(value),
      caveats: [
        kFitted
          ? 'The exponent was fit from your own best efforts, so it reflects how your endurance actually scales with distance.'
          : 'This uses the population standard of 1.06. Race at two or more different distances to personalize it.',
        'This assumes adequate distance-specific training. A fast 5K alone does not buy a marathon.',
      ],
      source: 'Riegel (1981), American Scientist',
    },
  };
}

function dedupeByDistance(efforts: BestEffort[]): BestEffort[] {
  const byBucket = new Map<number, BestEffort>();
  for (const e of efforts) {
    const bucket = Math.round(e.distanceM / 500);
    const cur = byBucket.get(bucket);
    if (!cur || e.timeS / e.distanceM < cur.timeS / cur.distanceM) byBucket.set(bucket, e);
  }
  return [...byBucket.values()];
}

export function formatHms(totalS: number): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
