import { Activity, Explanation, UserProfile, WorkoutType } from './types';

export interface ClassifierContext {
  /** Median moving time of the user's recent runs (seconds) */
  medianDurationS: number;
  /** Median distance of recent runs (m) */
  medianDistanceM: number;
}

export interface ClassificationResult {
  type: WorkoutType;
  rationale: string;
  explanation: Explanation;
}

/**
 * Workout type detection (T0-7). Deliberately simple and explainable.
 * Every label ships with the observation that produced it, phrased in
 * terms of the runner's own effort, not the mechanics of the detector.
 *
 * Order matters: race, then interval, then long, then tempo, then easy.
 */
export function classifyWorkout(
  a: Activity,
  profile: Pick<UserProfile, 'restingHr' | 'maxHr'>,
  ctx: ClassifierContext,
): ClassificationResult {
  const hrFrac = a.avgHr != null ? a.avgHr / profile.maxHr : null;
  const hrPct = hrFrac != null ? Math.round(hrFrac * 100) : null;
  const inputs = [
    { label: 'Avg HR', value: a.avgHr != null ? `${Math.round(a.avgHr)} bpm (${hrPct}% of max)` : 'missing' },
    { label: 'Pace variability', value: a.paceCv != null ? `${(a.paceCv * 100).toFixed(0)}%` : 'no splits' },
    { label: 'Duration vs your median', value: `${(a.movingTimeS / ctx.medianDurationS).toFixed(1)}x` },
    { label: 'Distance vs your median', value: `${(a.distanceM / ctx.medianDistanceM).toFixed(1)}x` },
  ];

  const make = (type: WorkoutType, rationale: string, basis: string): ClassificationResult => ({
    type,
    rationale,
    explanation: {
      method: 'Workout type detection',
      formula: basis,
      inputs,
      output: label(type),
      caveats: [
        'If the label is wrong, tap Edit to correct it. Corrections are saved and improve future detection.',
      ],
    },
  });

  if (a.isRaceTagged) {
    return make('race', 'You tagged this as a race on Strava.', 'The activity carries a race tag.');
  }

  if (a.paceCv != null && a.paceCv > 0.12 && hrFrac != null && hrFrac > 0.8) {
    return make(
      'interval',
      `Your pace swung by ${(a.paceCv * 100).toFixed(0)}% while holding ${hrPct}% of your max heart rate, the signature of repeats with recovery between them.`,
      'Pace varied by more than 12% while average heart rate stayed above 80% of max.',
    );
  }

  const durRatio = a.movingTimeS / ctx.medianDurationS;
  const distRatio = a.distanceM / ctx.medianDistanceM;
  if ((durRatio >= 1.5 || distRatio >= 1.5) && a.movingTimeS >= 70 * 60) {
    return make(
      'long',
      `At ${(a.distanceM / 1609).toFixed(1)} miles this run was well beyond your typical distance.`,
      'The run lasted at least 70 minutes and was at least 1.5 times your median duration or distance.',
    );
  }

  if (hrFrac != null && hrFrac >= 0.84 && hrFrac <= 0.93 && (a.paceCv == null || a.paceCv < 0.1)) {
    return make(
      'tempo',
      `You held ${hrPct}% of your max heart rate at a steady pace, which is sustained tempo effort.`,
      'Average heart rate sat between 84% and 93% of max while pace stayed steady.',
    );
  }

  if (hrFrac != null && hrFrac > 0.93) {
    return make(
      'interval',
      `You sustained ${hrPct}% of your max heart rate, which is very hard effort.`,
      'Average heart rate exceeded 93% of max.',
    );
  }

  return make(
    'easy',
    hrPct != null
      ? `You stayed at a comfortable ${hrPct}% of your max heart rate.`
      : 'Effort signals were low or missing, so this reads as an easy run.',
    'No higher-intensity pattern appeared in the pace or heart rate data.',
  );
}

export function label(t: WorkoutType): string {
  return { easy: 'Easy run', tempo: 'Tempo run', interval: 'Intervals', long: 'Long run', race: 'Race' }[t];
}
