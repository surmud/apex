import { describe, expect, it } from 'vitest';
import { climateLabel, climateScore } from '../climate';
import { computeZones, observedMaxHr, zoneForHr } from '../zones';

describe('climate score', () => {
  it('is ideal on a crisp dry day', () => {
    // 48F, dew point 35F: combined 83
    const r = climateScore(8.9, 1.7, 2);
    expect(r.value.score).toBeGreaterThanOrEqual(85);
    expect(r.value.label).toBe('Ideal');
    expect(r.value.pacePenaltyPct).toBe(0);
  });

  it('is severe on an oppressive summer morning', () => {
    // 84F, dew point 74F: combined 158, dew point over the indoor threshold
    const r = climateScore(28.9, 23.3, 0);
    expect(r.value.score).toBeLessThan(40);
    expect(r.value.label).toBe('Severe');
    expect(r.value.pacePenaltyPct).toBeGreaterThan(3);
  });

  it('penalizes deep cold mildly', () => {
    // 18F, dew point 8F
    const r = climateScore(-7.8, -13.3, 0);
    expect(r.value.score).toBeLessThan(100);
    expect(r.value.score).toBeGreaterThan(70); // cold costs less than heat
  });

  it('wind helps on a hot day', () => {
    const calm = climateScore(30, 18, 0).value.score;
    const breezy = climateScore(30, 18, 5).value.score;
    expect(breezy).toBeGreaterThan(calm);
  });

  it('labels map to bands', () => {
    expect(climateLabel(90)).toBe('Ideal');
    expect(climateLabel(72)).toBe('Good');
    expect(climateLabel(60)).toBe('Fair');
    expect(climateLabel(45)).toBe('Tough');
    expect(climateLabel(20)).toBe('Severe');
  });
});

describe('heart rate zones', () => {
  it('computes Karvonen boundaries', () => {
    const z = computeZones(50, 190).value;
    // reserve 140: floors at 120, 134, 148, 162, 176; ceiling 190
    expect(z).toEqual([120, 134, 148, 162, 176, 190]);
  });

  it('assigns heart rates to zones', () => {
    const z = computeZones(50, 190).value;
    expect(zoneForHr(110, z)).toBe(0);
    expect(zoneForHr(125, z)).toBe(1);
    expect(zoneForHr(150, z)).toBe(3);
    expect(zoneForHr(185, z)).toBe(5);
  });

  it('finds max observed HR across runs', () => {
    const runs = [
      { avgHr: 150, maxHr: 182 },
      { avgHr: 140, maxHr: null },
      { avgHr: null, maxHr: 188 },
    ] as any[];
    expect(observedMaxHr(runs)).toBe(188);
  });

  it('returns null with no HR data', () => {
    expect(observedMaxHr([{ avgHr: null, maxHr: null }] as any[])).toBeNull();
  });
});
