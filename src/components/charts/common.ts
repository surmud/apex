export interface XY {
  x: number; // usually a timestamp
  y: number;
}

export function extent(values: number[], padFrac = 0.08): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * padFrac;
  return [min - pad, max + pad];
}

export function scale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 - d0 === 0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

export function linePath(pts: { px: number; py: number }[]): string {
  if (pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
}

/** Catmull-Rom → bezier smoothing for gentle trend lines */
export function smoothPath(pts: { px: number; py: number }[]): string {
  if (pts.length < 3) return linePath(pts);
  let d = `M${pts[0].px.toFixed(1)},${pts[0].py.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.px + (p2.px - p0.px) / 6;
    const c1y = p1.py + (p2.py - p0.py) / 6;
    const c2x = p2.px - (p3.px - p1.px) / 6;
    const c2y = p2.py - (p3.py - p1.py) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.px.toFixed(1)},${p2.py.toFixed(1)}`;
  }
  return d;
}

/** simple least-squares trendline */
export function trendline(pts: XY[]): { slope: number; intercept: number } | null {
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}
