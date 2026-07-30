import { Explained } from './types';

/**
 * Aerobic efficiency factor: speed per heartbeat.
 * EF = avg speed (m/s) ÷ avg HR × 1000 (scaled ×1000 for a readable number)
 * Rising EF at the same effort = improving aerobic fitness.
 */
export function efficiencyFactor(avgSpeedMs: number, avgHr: number): Explained<number> {
  const value = (avgSpeedMs / avgHr) * 1000;
  return {
    value,
    explanation: {
      method: 'Efficiency factor (speed ÷ heart rate)',
      summary:
        'How much forward speed each heartbeat buys you. When this rises over weeks at the same effort, your aerobic engine is getting stronger.',
      formula: 'EF = (avg speed m/s ÷ avg HR) × 1000',
      inputs: [
        { label: 'Avg speed', value: `${avgSpeedMs.toFixed(2)} m/s` },
        { label: 'Avg HR', value: `${Math.round(avgHr)} bpm` },
      ],
      output: value.toFixed(1),
      caveats: [
        'This is only comparable across runs of similar effort, so compare easy runs to easy runs.',
        'Heat and hills lower the number without meaning you got less fit. Check the weather-adjusted trend on those days.',
      ],
    },
  };
}
