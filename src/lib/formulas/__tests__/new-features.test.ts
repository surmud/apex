import { describe, expect, it } from 'vitest';
import { samplePlan } from '../../ai/plans';
import { raceBenchmarks, requiredRamp } from '../benchmarks';
import { paceTrendProjection } from '../pacetrend';
import { normalCdf, populationPercentiles, recentAveragePercentiles } from '../percentiles';
import { computeZones } from '../zones';
import { Activity } from '../types';

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  startTime: '2026-07-01T12:00:00Z',
  distanceM: 10000,
  movingTimeS: 3000,
  elapsedTimeS: 3100,
  elevationGainM: 50,
  avgSpeedMs: 3.33,
  avgHr: 150,
  maxHr: 170,
  avgCadence: 172,
  paceCv: 0.04,
  verticalOscillationCm: 8.0,
  groundContactMs: 240,
  strideLengthM: 1.15,
  runningPowerW: 280,
  isTreadmill: false,
  startLat: 40.7,
  startLng: -74.0,
  name: 'Run',
  isRaceTagged: false,
  ...over,
});

describe('population percentiles', () => {
  it('normalCdf is sane at the mean and tails', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 2);
    expect(normalCdf(2)).toBeGreaterThan(0.95);
    expect(normalCdf(-2)).toBeLessThan(0.05);
  });

  it('computes all four metrics when height is known', () => {
    const res = populationPercentiles(act(), { heightCm: 178 });
    expect(res.map((r) => r.metric).sort()).toEqual(['cadence', 'gct', 'stride', 'vertosc']);
    for (const r of res) {
      expect(r.percentile).toBeGreaterThanOrEqual(0);
      expect(r.percentile).toBeLessThanOrEqual(100);
      expect(r.phrasing).toMatch(/percent of recreational runners/);
    }
  });

  it('above-average cadence lands above the 50th percentile', () => {
    const res = populationPercentiles(act({ avgCadence: 180 }), { heightCm: null });
    const cad = res.find((r) => r.metric === 'cadence')!;
    expect(cad.percentile).toBeGreaterThan(60);
  });

  it('low bounce reads as springier than most', () => {
    const res = populationPercentiles(act({ verticalOscillationCm: 6.5 }), { heightCm: null });
    const vo = res.find((r) => r.metric === 'vertosc')!;
    expect(vo.percentile).toBeGreaterThan(80); // bounces less than >80%
  });

  it('skips stride without height and skips missing metrics', () => {
    const res = populationPercentiles(
      act({ verticalOscillationCm: null, groundContactMs: null }),
      { heightCm: null },
    );
    expect(res.map((r) => r.metric)).toEqual(['cadence']);
  });

  it('recent averages need at least three samples per metric', () => {
    const acts = [act(), act({ id: 'a2' })];
    const res = recentAveragePercentiles(acts, { heightCm: 178 });
    expect(res).toEqual([]);
  });
});

describe('race benchmarks', () => {
  const zones = computeZones(50, 190).value;

  it('produces dated marathon checkpoints sorted farthest-out first', () => {
    const bm = raceBenchmarks('Marathon', 4 * 3600, '2026-10-18', zones, [], '2026-07-15');
    expect(bm.length).toBeGreaterThanOrEqual(4);
    expect(bm[0].weeksOut).toBeGreaterThan(bm[bm.length - 1].weeksOut);
    for (const b of bm) {
      expect(b.dateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (b.targetPaceSPerMi) {
        expect(b.targetPaceSPerMi[0]).toBeLessThanOrEqual(b.targetPaceSPerMi[1]);
      }
      if (b.targetHrBpm) {
        expect(b.targetHrBpm[0]).toBeLessThan(b.targetHrBpm[1]);
        expect(b.targetHrBpm[1]).toBeLessThanOrEqual(190);
      }
    }
  });

  it('easy long-run pace targets sit slower than race pace', () => {
    const goalTimeS = 4 * 3600; // marathon at ~9:09/mi
    const racePace = goalTimeS / 26.2;
    const bm = raceBenchmarks('Marathon', goalTimeS, null, zones, [], '2026-07-15');
    const twenty = bm.find((b) => b.workout.includes('20 mile'))!;
    expect(twenty.targetPaceSPerMi![0]).toBeGreaterThan(racePace);
  });

  it('marks a checkpoint achieved when a matching run exists near its date', () => {
    const bm = raceBenchmarks(
      'Marathon',
      4 * 3600,
      '2026-09-09', // 8 weeks out = 2026-07-15
      zones,
      [{ dateISO: '2026-07-13', distanceMi: 16.2 }],
      '2026-07-15',
    );
    const sixteen = bm.find((b) => b.workout.includes('16 mile'))!;
    expect(sixteen.achieved).toBe(true);
  });
});

describe('requiredRamp', () => {
  it('never exceeds 10 percent growth outside cutbacks and ends in a taper', () => {
    const ramp = requiredRamp(25, 50, 16);
    expect(ramp).toHaveLength(16);
    for (let i = 1; i < ramp.length - 2; i++) {
      const isCutback = (i + 1) % 4 === 0;
      const cameOffCutback = i % 4 === 0;
      if (!isCutback && !cameOffCutback) {
        expect(ramp[i].mpw).toBeLessThanOrEqual(Math.ceil(ramp[i - 1].mpw * 1.11));
      }
    }
    expect(ramp[15].mpw).toBeLessThan(ramp[13].mpw); // race week lightest
  });
});

describe('paceTrendProjection', () => {
  const mkHistory = (slopePerDay: number, days = 90, everyN = 3) => {
    const now = Date.now();
    const pts = [];
    for (let d = days; d >= 0; d -= everyN) {
      pts.push({ x: now - d * 86400000, y: 330 + slopePerDay * (days - d) });
    }
    return pts;
  };

  it('projects continued improvement with damping', () => {
    const p = paceTrendProjection(mkHistory(-0.15), 90)!;
    expect(p.value.slopePerWeekS).toBeLessThan(0);
    const undamped = p.value.projected[0].y + p.value.slopePerWeekS * (90 / 7);
    expect(p.value.paceAtHorizonS).toBeLessThan(p.value.projected[0].y); // still improving
    expect(p.value.paceAtHorizonS).toBeGreaterThan(undamped); // but less than linear
  });

  it('returns null on thin history', () => {
    expect(paceTrendProjection(mkHistory(-0.1, 10, 2), 90)).toBeNull();
    expect(paceTrendProjection([], 90)).toBeNull();
  });
});

describe('samplePlan', () => {
  it('starts on the next Monday and ends with a race', () => {
    const p = samplePlan('2026-07-15'); // a Wednesday
    expect(p.startDate).toBe('2026-07-20'); // Monday
    expect(new Date(p.startDate + 'T00:00:00Z').getUTCDay()).toBe(1);
    expect(p.weeks).toHaveLength(10);
    const lastWeek = p.weeks[9];
    expect(lastWeek.runs.some((r) => r.type === 'race')).toBe(true);
    expect(p.raceDate).toBe(lastWeek.runs[lastWeek.runs.length - 1].dateISO);
  });

  it('is deterministic for a given day', () => {
    expect(samplePlan('2026-07-15')).toEqual(samplePlan('2026-07-15'));
  });
});
