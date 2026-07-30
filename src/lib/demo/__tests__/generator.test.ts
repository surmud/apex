import { describe, expect, it } from 'vitest';
import { classifyWorkout } from '../../formulas/classifier';
import { generateDemoData } from '../generator';

describe('demo generator', () => {
  const end = new Date('2026-07-12T00:00:00Z');
  const data = generateDemoData(end);

  it('produces a realistic volume of runs', () => {
    expect(data.length).toBeGreaterThan(120);
    expect(data.length).toBeLessThan(280);
  });

  it('is deterministic', () => {
    const again = generateDemoData(end);
    expect(again.length).toBe(data.length);
    expect(again[0].activity.id).toBe(data[0].activity.id);
  });

  it('includes races, treadmill runs, and missing-HR runs', () => {
    expect(data.filter((d) => d.activity.isRaceTagged).length).toBeGreaterThanOrEqual(2);
    expect(data.some((d) => d.activity.isTreadmill)).toBe(true);
    expect(data.some((d) => d.activity.avgHr == null)).toBe(true);
  });

  it('attaches weather to outdoor runs only', () => {
    for (const d of data) {
      if (d.activity.isTreadmill) expect(d.weather).toBeNull();
      else expect(d.weather).not.toBeNull();
    }
  });

  it('classifier recovers the planned types most of the time', () => {
    const profile = { restingHr: 50, maxHr: 190 };
    const durations = data.map((d) => d.activity.movingTimeS).sort((a, b) => a - b);
    const distances = data.map((d) => d.activity.distanceM).sort((a, b) => a - b);
    const ctx = {
      medianDurationS: durations[Math.floor(durations.length / 2)],
      medianDistanceM: distances[Math.floor(distances.length / 2)],
    };
    const types = new Set(data.map((d) => classifyWorkout(d.activity, profile, ctx).type));
    // all five types should appear in a 10-month realistic history
    expect(types.size).toBeGreaterThanOrEqual(4);
  });
});
