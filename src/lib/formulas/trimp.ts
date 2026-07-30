import { Explained, UserProfile } from './types';

/**
 * Banister TRIMP (training impulse).
 * TRIMP = duration_min × HRr × a × e^(k × HRr)
 * where HRr = (HRavg − HRrest) / (HRmax − HRrest),
 * male a = 0.64, k = 1.92; female a = 0.86, k = 1.67
 * (Banister's sex-specific lactate response curves)
 */
export function trimp(
  durationS: number,
  avgHr: number,
  profile: Pick<UserProfile, 'sex' | 'restingHr' | 'maxHr' | 'maxHrIsEstimated'>,
): Explained<number> {
  const k = profile.sex === 'F' ? 1.67 : 1.92;
  const a = profile.sex === 'F' ? 0.86 : 0.64;
  const hrr = Math.min(
    1,
    Math.max(0, (avgHr - profile.restingHr) / (profile.maxHr - profile.restingHr)),
  );
  const minutes = durationS / 60;
  const value = minutes * hrr * a * Math.exp(k * hrr);

  const caveats = [
    'This assumes your average heart rate represents the whole session, so interval workouts are slightly underestimated.',
  ];
  if (profile.maxHrIsEstimated) {
    caveats.push('Your max HR is estimated from age. Set a measured max in Settings for a more accurate score.');
  }

  return {
    value,
    explanation: {
      method: 'Banister TRIMP',
      summary:
        'A strain score for the whole workout. It grows with both how long you ran and how close your heart rate sat to maximum, so a short hard session and a long easy one can score similarly.',
      formula: 'TRIMP = min × HRr × a × e^(k·HRr),  HRr = (HRavg − HRrest)/(HRmax − HRrest)',
      inputs: [
        { label: 'Duration', value: `${minutes.toFixed(1)} min` },
        { label: 'Avg HR', value: `${Math.round(avgHr)} bpm` },
        { label: 'Resting HR', value: `${profile.restingHr} bpm` },
        { label: 'Max HR', value: `${profile.maxHr} bpm${profile.maxHrIsEstimated ? ' (estimated)' : ''}` },
        { label: 'Sex coefficients (a, k)', value: `${a}, ${k}` },
        { label: 'HRr', value: hrr.toFixed(3) },
      ],
      output: value.toFixed(0),
      caveats,
      source: 'Banister (1991) impulse-response training model',
    },
  };
}
