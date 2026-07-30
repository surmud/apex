import { Explained } from './types';

/**
 * Future pace projection: where is your easy pace heading?
 *
 * Fits a linear trend to comparable runs (easy and long, excluded runs
 * dropped) over the recent window, then extrapolates with damping so the
 * projection flattens rather than promising unbounded improvement. The
 * damping models the reality that fitness gains slow as you approach your
 * current trainable ceiling: the fitted weekly improvement decays with a
 * half-life of about eight weeks.
 */

export interface PacePoint {
  /** ms epoch */
  x: number;
  /** seconds per km */
  y: number;
}

export interface PaceTrendProjection {
  history: PacePoint[];
  projected: PacePoint[];
  /** Fitted change in s/km per week; negative means getting faster */
  slopePerWeekS: number;
  /** Damped projected pace at the horizon, s/km */
  paceAtHorizonS: number;
}

const DAMP_HALF_LIFE_DAYS = 42;

export function paceTrendProjection(
  history: PacePoint[],
  horizonDays: number,
  now = Date.now(),
): Explained<PaceTrendProjection> | null {
  const pts = [...history].sort((a, b) => a.x - b.x);
  if (pts.length < 6) return null;
  const spanDays = (pts[pts.length - 1].x - pts[0].x) / 86400000;
  if (spanDays < 21) return null;

  // ordinary least squares on (days, pace)
  const t0 = pts[0].x;
  const xs = pts.map((p) => (p.x - t0) / 86400000);
  const ys = pts.map((p) => p.y);
  const n = pts.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const rawSlopePerDay = den > 0 ? num / den : 0;

  // Shrink the slope by the fit's R². A noisy cloud of paces should
  // project almost flat; only a consistent trend earns extrapolation.
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = my + rawSlopePerDay * (xs[i] - mx);
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const slopePerDay = rawSlopePerDay * r2;

  const nowDays = (now - t0) / 86400000;
  const paceNow = my + slopePerDay * (nowDays - mx);

  // Damped extrapolation, then a hard cap: the projection may not promise
  // more additional improvement than half of what was actually observed
  // in the history window.
  const observedChange = slopePerDay * spanDays; // negative when improving
  const maxFurtherImprovement = Math.abs(Math.min(0, observedChange)) * 0.5;
  const tau = DAMP_HALF_LIFE_DAYS / Math.LN2;
  const projected: PacePoint[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const d = (horizonDays * i) / steps;
    let y = paceNow + slopePerDay * tau * (1 - Math.exp(-d / tau));
    if (paceNow - y > maxFurtherImprovement) y = paceNow - maxFurtherImprovement;
    projected.push({ x: now + d * 86400000, y: Math.max(120, y) });
  }
  const paceAtHorizonS = projected[projected.length - 1].y;
  const slopePerWeekS = slopePerDay * 7;

  return {
    value: { history: pts, projected, slopePerWeekS, paceAtHorizonS },
    explanation: {
      method: 'Damped pace trend',
      summary:
        'Fits the direction your easy pace has been moving and carries it forward, flattening the curve over time because nobody improves in a straight line forever.',
      formula: 'pace(t) = pace_now + slope · τ · (1 − e^(−t/τ)), τ ≈ 81 days',
      inputs: [
        { label: 'Comparable runs used', value: `${n}` },
        { label: 'History span', value: `${Math.round(spanDays)} days` },
        {
          label: 'Fitted trend (after reliability shrink)',
          value: `${slopePerWeekS >= 0 ? '+' : ''}${slopePerWeekS.toFixed(1)} s/km per week`,
        },
        { label: 'Fit reliability (R²)', value: r2.toFixed(2) },
        { label: 'Projection horizon', value: `${horizonDays} days` },
      ],
      output: `${Math.round(paceAtHorizonS)} s/km projected`,
      caveats: [
        'The projection is deliberately conservative. The trend is shrunk by how consistent it actually is, damped toward a plateau, and never promises more than half the improvement already observed.',
        'It assumes training continues roughly as it has. A big change in volume, an injury, or a long break makes it stale.',
      ],
      source: 'Least-squares trend on easy-run paces, R²-shrunk, exponentially damped',
    },
  };
}
