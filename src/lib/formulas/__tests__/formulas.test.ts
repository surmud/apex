import { describe, expect, it } from 'vitest';
import { acwrStatus, computeDailyLoads } from '../acwr';
import { classifyWorkout } from '../classifier';
import { efficiencyFactor } from '../efficiency';
import { fitnessFatigueSeries, projectFitness } from '../fitnessFatigue';
import { courseTimePenaltyS, projectScenarios, splitProfile } from '../projections';
import { detectQualityFlags, isExcludedFromAnalysis } from '../quality';
import { recoveryWindow, suggestNextWorkout } from '../recovery';
import { fitRiegelExponent, formatHms, riegelProject } from '../riegel';
import { trimp } from '../trimp';
import { Activity } from '../types';
import { rollingVo2max, vo2maxEstimate } from '../vdot';
import { adjustedPace, heatPacePenaltyPct } from '../weatherAdjust';

const profile = { sex: 'M' as const, restingHr: 50, maxHr: 190, maxHrIsEstimated: false };

function act(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'a1',
    startTime: '2026-07-01T10:00:00Z',
    distanceM: 10000,
    movingTimeS: 3000,
    elapsedTimeS: 3100,
    elevationGainM: 50,
    avgSpeedMs: 10000 / 3000,
    avgHr: 150,
    maxHr: 165,
    avgCadence: 172,
    paceCv: 0.04,
    verticalOscillationCm: 8.2,
    groundContactMs: 245,
    strideLengthM: 1.16,
    runningPowerW: 250,
    isTreadmill: false,
    startLat: 40.7,
    startLng: -74,
    name: 'Morning run',
    isRaceTagged: false,
    ...overrides,
  };
}

describe('TRIMP', () => {
  it('computes a plausible value for a 50-min moderate run', () => {
    const r = trimp(3000, 150, profile);
    // HRr = (150-50)/140 = 0.714; 50 × .714 × .64 × e^(1.92×.714) ≈ 90
    expect(r.value).toBeGreaterThan(70);
    expect(r.value).toBeLessThan(110);
    expect(r.explanation.inputs.length).toBeGreaterThan(3);
  });
  it('is higher for harder efforts', () => {
    expect(trimp(3000, 170, profile).value).toBeGreaterThan(trimp(3000, 140, profile).value);
  });
  it('applies Banister sex-specific curves (0.86·e^1.67x F, 0.64·e^1.92x M)', () => {
    const hrr = (150 - profile.restingHr) / (profile.maxHr - profile.restingHr);
    const minutes = 3000 / 60;
    const f = trimp(3000, 150, { ...profile, sex: 'F' });
    const m = trimp(3000, 150, profile);
    expect(f.value).toBeCloseTo(minutes * hrr * 0.86 * Math.exp(1.67 * hrr), 5);
    expect(m.value).toBeCloseTo(minutes * hrr * 0.64 * Math.exp(1.92 * hrr), 5);
    expect(f.value).not.toBeCloseTo(m.value, 1);
  });
  it('adds a caveat when max HR is estimated', () => {
    const r = trimp(3000, 150, { ...profile, maxHrIsEstimated: true });
    expect(r.explanation.caveats.join(' ')).toMatch(/estimated/i);
  });
});

describe('ACWR', () => {
  it('flags spike as high risk', () => {
    const m = new Map<string, number>();
    // 28 days of 30/day, then 7 days of 120/day
    const end = new Date('2026-07-10T00:00:00Z');
    for (let i = 34; i >= 7; i--) m.set(iso(end, -i), 30);
    for (let i = 6; i >= 0; i--) m.set(iso(end, -i), 120);
    const loads = computeDailyLoads(m, end, 1);
    const last = loads[loads.length - 1];
    expect(last.acwr).toBeGreaterThan(1.5);
    expect(acwrStatus(last.acwr)).toBe('high_risk');
  });
  it('steady load is ~1.0 optimal', () => {
    const m = new Map<string, number>();
    const end = new Date('2026-07-10T00:00:00Z');
    for (let i = 40; i >= 0; i--) m.set(iso(end, -i), 60);
    const last = computeDailyLoads(m, end, 1)[0];
    expect(last.acwr).toBeCloseTo(1.0, 1);
    expect(acwrStatus(last.acwr)).toBe('optimal');
  });
});

describe('VO2max', () => {
  it('estimates a plausible VO2max for a decent 10K effort', () => {
    // 10K in 50 min at HR 160/190
    const r = vo2maxEstimate(10000, 3000, 30, 160, profile);
    expect(r).not.toBeNull();
    expect(r!.value).toBeGreaterThan(35);
    expect(r!.value).toBeLessThan(65);
  });
  it('returns null for too-short runs', () => {
    expect(vo2maxEstimate(800, 240, 0, 150, profile)).toBeNull();
  });
  it('rolling median stabilizes noise', () => {
    expect(rollingVo2max([50, 51, 49, 80, 50])).toBe(50);
  });
});

describe('Riegel', () => {
  it('projects 5K → 10K with default k', () => {
    const r = riegelProject({ distanceM: 5000, timeS: 1200, date: '2026-06-01' }, 10000, 1.06, false);
    // 20:00 5K → ~41:40 10K
    expect(r.value).toBeGreaterThan(2450);
    expect(r.value).toBeLessThan(2560);
  });
  it('fits k from two efforts', () => {
    // constructed with k = 1.08
    const efforts = [
      { distanceM: 5000, timeS: 1200, date: '2026-05-01' },
      { distanceM: 10000, timeS: 1200 * Math.pow(2, 1.08), date: '2026-06-01' },
    ];
    const { k, fitted } = fitRiegelExponent(efforts);
    expect(fitted).toBe(true);
    expect(k).toBeCloseTo(1.08, 2);
  });
  it('falls back to 1.06 with one effort', () => {
    const { k, fitted } = fitRiegelExponent([{ distanceM: 5000, timeS: 1200, date: '2026-06-01' }]);
    expect(k).toBe(1.06);
    expect(fitted).toBe(false);
  });
  it('formats h:mm:ss', () => {
    expect(formatHms(3661)).toBe('1:01:01');
    expect(formatHms(155)).toBe('2:35');
  });
});

describe('fitness-fatigue', () => {
  it('form goes negative right after a training spike', () => {
    const m = new Map<string, number>();
    const end = new Date('2026-07-10T00:00:00Z');
    for (let i = 3; i >= 0; i--) m.set(iso(end, -i), 150);
    const series = fitnessFatigueSeries(m, end, 5);
    expect(series[series.length - 1].form).toBeLessThan(0);
  });
  it('projection converges toward the sustained daily load', () => {
    // 350 TRIMP/week = 50/day. Starting below, fitness climbs toward 50;
    // starting above, it decays toward 50. Never past it.
    const up = projectFitness(20, 20, 350, 90);
    expect(up.fitness).toBeGreaterThan(40);
    expect(up.fitness).toBeLessThanOrEqual(50);
    const down = projectFitness(80, 80, 350, 90);
    expect(down.fitness).toBeLessThan(60);
    expect(down.fitness).toBeGreaterThanOrEqual(50);
  });
  it('form rises through a taper', () => {
    // heavy block then a light week: fatigue drains faster than fitness
    const heavy = projectFitness(60, 60, 420, 0);
    const tapered = projectFitness(heavy.fitness, heavy.fatigue, 150, 10);
    expect(tapered.form).toBeGreaterThan(heavy.form);
  });
});

describe('weather adjustment', () => {
  it('no penalty in cool conditions', () => {
    expect(heatPacePenaltyPct(10, 4)).toBe(0);
  });
  it('meaningful penalty on a hot humid day', () => {
    const pct = heatPacePenaltyPct(30, 22); // 86°F + 71.6°F dew ≈ 158 combined
    expect(pct).toBeGreaterThan(3);
    const adj = adjustedPace(300, 30, 22);
    expect(adj.value).toBeLessThan(300); // effective pace faster than raw
  });
});

describe('classifier', () => {
  const ctx = { medianDurationS: 3000, medianDistanceM: 9000 };
  it('detects race from tag', () => {
    expect(classifyWorkout(act({ isRaceTagged: true }), profile, ctx).type).toBe('race');
  });
  it('detects intervals from pace variance + effort', () => {
    const r = classifyWorkout(act({ paceCv: 0.2, avgHr: 160 }), profile, ctx);
    expect(r.type).toBe('interval');
    expect(r.rationale).toMatch(/pace swung/i);
  });
  it('detects long run', () => {
    const r = classifyWorkout(act({ movingTimeS: 7200, distanceM: 22000, avgHr: 135, avgSpeedMs: 3 }), profile, ctx);
    expect(r.type).toBe('long');
  });
  it('detects tempo from sustained HR', () => {
    const r = classifyWorkout(act({ avgHr: 167, paceCv: 0.03 }), profile, ctx); // 88% max
    expect(r.type).toBe('tempo');
  });
  it('defaults to easy', () => {
    expect(classifyWorkout(act({ avgHr: 135 }), profile, ctx).type).toBe('easy');
  });
});

describe('quality flags', () => {
  it('flags missing HR', () => {
    expect(detectQualityFlags(act({ avgHr: null }))).toContain('missing_hr');
  });
  it('flags impossible pace and excludes it', () => {
    const flags = detectQualityFlags(act({ avgSpeedMs: 7.5, distanceM: 5000 }));
    expect(flags).toContain('suspicious_pace');
    expect(isExcludedFromAnalysis(flags)).toBe(true);
  });
  it('clean run has no flags', () => {
    expect(detectQualityFlags(act())).toHaveLength(0);
  });
});

describe('recovery + next workout', () => {
  it('bigger sessions → longer windows', () => {
    expect(recoveryWindow(160).value.minHours).toBeGreaterThan(recoveryWindow(40).value.maxHours);
  });
  const recent = (
    entries: { type: 'easy' | 'tempo' | 'interval' | 'long' | 'race'; trimp: number; daysAgo: number }[],
  ) => entries.map((e) => ({ ...e, distanceM: 9000 }));

  it('high ACWR always suggests rest/easy with a what-next', () => {
    const s = suggestNextWorkout(recent([{ type: 'tempo', trimp: 80, daysAgo: 1 }]), 'high_risk', 9000);
    expect(s.type).toBe('easy');
    expect(s.reason).toMatch(/load/i);
    expect(s.description).toMatch(/then/i);
  });
  it('optimal with recent long run and easy streak → quality', () => {
    const s = suggestNextWorkout(
      recent([
        { type: 'easy', trimp: 60, daysAgo: 1 },
        { type: 'easy', trimp: 55, daysAgo: 2 },
        { type: 'easy', trimp: 58, daysAgo: 3 },
        { type: 'long', trimp: 110, daysAgo: 5 },
      ]),
      'optimal',
      9000,
    );
    expect(s.type).toBe('tempo');
  });
  it('optimal with no long run in the block → long run', () => {
    const s = suggestNextWorkout(
      recent([
        { type: 'easy', trimp: 60, daysAgo: 1 },
        { type: 'tempo', trimp: 90, daysAgo: 3 },
      ]),
      'optimal',
      9000,
    );
    expect(s.type).toBe('long');
  });
});

describe('projections + scenarios', () => {
  const efforts = [
    { distanceM: 5000, timeS: 1305, date: '2026-06-01' }, // 21:45 5K
    { distanceM: 10000, timeS: 2760, date: '2026-05-01' }, // 46:00 10K
  ];
  it('generates three ordered bands', () => {
    const p = projectScenarios(efforts, 42195, 90, 35)!;
    expect(p.bands).toHaveLength(3);
    const [c, t, s] = p.bands;
    expect(c.lowS).toBeGreaterThan(t.lowS);
    expect(t.lowS).toBeGreaterThan(s.lowS);
    // every band is a range, never a point
    for (const b of p.bands) expect(b.highS).toBeGreaterThan(b.lowS);
  });
  it('widens band when extrapolating beyond history', () => {
    const marathon = projectScenarios(efforts, 42195, 90, 35)!;
    expect(marathon.bands[1].explanation.caveats.join(' ')).toMatch(/extrapolates/i);
  });
  it('course penalty grows with elevation', () => {
    const flat = courseTimePenaltyS(13000, 42195, 0, null, null);
    const hilly = courseTimePenaltyS(13000, 42195, 250, null, null);
    expect(hilly.lowS).toBeGreaterThan(flat.lowS);
  });
  it('split profile fades and bumps on climbs', () => {
    const splits = splitProfile(13000, 42195, [{ mile: 16, label: 'Queensboro' }]);
    expect(splits).toHaveLength(27);
    expect(splits[25].paceSPerMi).toBeGreaterThan(splits[0].paceSPerMi);
    const m16 = splits.find((s) => s.mile === 16)!;
    const m10 = splits.find((s) => s.mile === 10)!;
    expect(m16.paceSPerMi).toBeGreaterThan(m10.paceSPerMi);
  });
  it('efficiency factor sanity', () => {
    expect(efficiencyFactor(3.33, 150).value).toBeCloseTo(22.2, 0);
  });
});

function iso(base: Date, offsetDays: number): string {
  return new Date(base.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);
}
