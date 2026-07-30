import { Explained } from './types';

/**
 * Heat/humidity pace penalty.
 * Uses the temp+dewpoint rule: combined = T(°F) + DP(°F).
 * ≤ 100 → no penalty; above that, ~0.75% pace penalty per 10 points, capped at 10%.
 * "Effective pace" = what the run would have been at reference conditions (60°F / 50% RH).
 */
export function heatPacePenaltyPct(tempC: number, dewpointC: number): number {
  const tF = tempC * 1.8 + 32;
  const dpF = dewpointC * 1.8 + 32;
  const combined = tF + dpF;
  if (combined <= 100) return 0;
  return Math.min(10, ((combined - 100) / 10) * 0.75);
}

export function adjustedPace(
  rawPaceSPerKm: number,
  tempC: number,
  dewpointC: number,
): Explained<number> {
  const penaltyPct = heatPacePenaltyPct(tempC, dewpointC);
  const value = rawPaceSPerKm / (1 + penaltyPct / 100);
  const tF = tempC * 1.8 + 32;
  const dpF = dewpointC * 1.8 + 32;

  return {
    value,
    explanation: {
      method: 'Heat + dewpoint pace adjustment',
      summary:
        'Hot and humid air slows everyone down. This estimates what your pace was really worth by crediting back the slowdown the conditions caused.',
      formula: 'effective pace = raw pace ÷ (1 + penalty%),  penalty = 0.75% per 10 pts of (T°F + DP°F) above 100',
      inputs: [
        { label: 'Raw pace', value: formatPace(rawPaceSPerKm) + '/km' },
        { label: 'Temperature', value: `${tempC.toFixed(0)}°C (${tF.toFixed(0)}°F)` },
        { label: 'Dewpoint', value: `${dewpointC.toFixed(0)}°C (${dpF.toFixed(0)}°F)` },
        { label: 'Combined T+DP', value: (tF + dpF).toFixed(0) },
        { label: 'Penalty applied', value: `${penaltyPct.toFixed(1)}%` },
      ],
      output: formatPace(value) + '/km effective',
      caveats: [
        'Reference condition is 60°F / 50% humidity.',
        'Individual heat tolerance varies widely around this population curve, and acclimation shifts it over two to three weeks.',
      ],
      source: 'Temp+dewpoint adjustment heuristic used in marathon pacing guidance',
    },
  };
}

export function formatPace(sPerKm: number): string {
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
