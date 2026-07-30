import { Explained } from './types';
import { heatPacePenaltyPct } from './weatherAdjust';

/**
 * Climate Score: one 0 to 100 number for how friendly the conditions are
 * for running. 100 is a crisp, dry day. Low scores mean the weather itself
 * will slow you down no matter how fit you are.
 *
 * The score blends the two signals the running literature leans on most:
 *
 * 1. Temperature plus dew point, the pace-adjustment heuristic popularized
 *    by coaching charts. A combined value at or below 100 (Fahrenheit)
 *    needs no adjustment. Each point above 100 costs pace.
 * 2. Dew point on its own, because it measures whether sweat can actually
 *    evaporate. Above roughly 65 F cooling gets hard. Above 75 F most
 *    guidance says to take the run indoors.
 *
 * Cold and wind are minor modifiers: sub-freezing air costs a little, and
 * wind helps on a hot day.
 */

export type ClimateLabel = 'Ideal' | 'Good' | 'Fair' | 'Tough' | 'Severe';

export interface ClimateScore {
  score: number; // 0-100, higher is better
  label: ClimateLabel;
  pacePenaltyPct: number; // expected slowdown at this score
}

export function climateLabel(score: number): ClimateLabel {
  if (score >= 85) return 'Ideal';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  if (score >= 40) return 'Tough';
  return 'Severe';
}

export function climateScore(
  tempC: number,
  dewpointC: number,
  windMs = 0,
): Explained<ClimateScore> {
  const tF = tempC * 1.8 + 32;
  const dpF = dewpointC * 1.8 + 32;
  const combined = tF + dpF;

  // Heat: the combined temp + dew point sum above 100 is the main driver.
  const heatPenalty = Math.max(0, combined - 100) * 1.1;

  // Humidity stress: extra cost once dew point passes 65 F, where sweat
  // stops evaporating efficiently.
  const dewPenalty = Math.max(0, dpF - 65) * 1.5;

  // Cold: mild cost below freezing (layers, footing, airway discomfort).
  const coldPenalty = tF < 32 ? (32 - tF) * 0.7 : 0;

  // Wind: a breeze helps when it is hot, up to a small cap.
  const windMph = windMs * 2.237;
  const windRelief = tF > 70 ? Math.min(6, windMph * 0.6) : 0;

  const raw = 100 - heatPenalty - dewPenalty - coldPenalty + windRelief;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const label = climateLabel(score);
  const pacePenaltyPct = heatPacePenaltyPct(tempC, dewpointC);

  return {
    value: { score, label, pacePenaltyPct },
    explanation: {
      method: 'Apex Climate Score',
      summary:
        'One number for how friendly the weather was for running. It starts at 100 and loses points for heat, humidity measured by the dew point, bitter cold, and gains a little back for a cooling breeze on hot days.',
      formula:
        'score = 100 minus heat penalty (1.1 points per degree of temp + dew point above 100 F) minus humidity penalty (1.5 points per degree of dew point above 65 F) minus cold penalty (0.7 points per degree below 32 F) plus wind relief on hot days',
      inputs: [
        { label: 'Temperature', value: `${tF.toFixed(0)} F (${tempC.toFixed(0)} C)` },
        { label: 'Dew point', value: `${dpF.toFixed(0)} F (${dewpointC.toFixed(0)} C)` },
        { label: 'Combined temp + dew point', value: combined.toFixed(0) },
        { label: 'Wind', value: `${windMph.toFixed(0)} mph` },
      ],
      output: `${score} out of 100 (${label}), expected slowdown about ${pacePenaltyPct.toFixed(1)}%`,
      caveats: [
        'Dew point matters more than humidity percentage. It measures whether sweat can evaporate at all.',
        'Individual heat tolerance varies widely, and acclimation over two to three weeks shifts it.',
        'A dew point above 75 F is a signal to move the run indoors regardless of the score.',
      ],
      source: 'Temperature plus dew point pace charts used in marathon coaching, and National Weather Service dew point comfort guidance',
    },
  };
}
