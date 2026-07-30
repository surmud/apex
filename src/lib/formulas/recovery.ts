import { AcwrStatus } from './acwr';
import { Explained, WorkoutType } from './types';

export interface RecoveryWindow {
  minHours: number;
  maxHours: number;
}

/** TRIMP-banded recovery window. */
export function recoveryWindow(trimpValue: number): Explained<RecoveryWindow> {
  let win: RecoveryWindow;
  if (trimpValue < 50) win = { minHours: 12, maxHours: 24 };
  else if (trimpValue < 100) win = { minHours: 24, maxHours: 36 };
  else if (trimpValue < 150) win = { minHours: 36, maxHours: 48 };
  else win = { minHours: 48, maxHours: 72 };

  return {
    value: win,
    explanation: {
      method: 'TRIMP-banded recovery window',
      summary:
        'The harder the session scored, the longer the body needs before quality work pays off again. This window is when the next hard run should wait until.',
      formula: 'TRIMP under 50 means 12 to 24 hours. 50 to 100 means 24 to 36. 100 to 150 means 36 to 48. Above 150 means 48 to 72.',
      inputs: [{ label: 'Session TRIMP', value: trimpValue.toFixed(0) }],
      output: `${win.minHours}–${win.maxHours} hours easy or rest`,
      caveats: [
        'This is a range, not a rule. Sleep, life stress, and age all shift how much recovery you actually need.',
        'Easy means conversational pace, not zero activity.',
      ],
    },
  };
}

export interface NextWorkoutSuggestion {
  type: WorkoutType;
  description: string;
  reason: string;
}

export interface RecentRunSummary {
  type: WorkoutType;
  trimp: number | null;
  distanceM: number;
  daysAgo: number;
}

/**
 * Suggest the next workout from the shape of the recent block, not just
 * the last run: how long since quality, how long since a long run, how
 * hard the last session was, and where the load ratio sits. The output
 * pairs the immediate step (rest or easy miles) with what should follow,
 * so "rest for 24 hours" always comes with a what-next.
 */
export function suggestNextWorkout(
  recent: RecentRunSummary[],
  acwrStatus: AcwrStatus,
  medianDistanceM: number,
): NextWorkoutSuggestion {
  const easyMi = Math.max(3, Math.round((medianDistanceM / 1609) * 0.75));
  const last = recent[0];
  const lastTrimp = last?.trimp ?? 0;

  const daysSinceQuality = recent.find(
    (r) => r.type === 'tempo' || r.type === 'interval' || r.type === 'race',
  )?.daysAgo;
  const daysSinceLong = recent.find((r) => r.type === 'long')?.daysAgo;
  const easyStreak = (() => {
    let n = 0;
    for (const r of recent) {
      if (r.type === 'easy') n++;
      else break;
    }
    return n;
  })();

  if (acwrStatus === 'high_risk') {
    return {
      type: 'easy',
      description: 'Rest today, then 20 to 30 min very easy tomorrow',
      reason: `Your 7 day load is well above your 28 day base, which is where injury risk climbs fastest. Two genuinely easy days brings the ratio back down, and quality can resume after that.`,
    };
  }

  if (lastTrimp >= 130) {
    const followUp =
      daysSinceQuality != null && daysSinceQuality <= 2
        ? 'an easy run the day after as well, since that strain takes about 48 hours to absorb'
        : `a quality session in about 48 hours if the legs come around`;
    return {
      type: 'easy',
      description: `Easy ${easyMi} mi shakeout, then reassess`,
      reason: `Your last run scored ${lastTrimp.toFixed(0)} strain points, which is a big session by your standards. Keep today conversational, with ${followUp}.`,
    };
  }

  if (acwrStatus === 'caution') {
    return {
      type: 'easy',
      description: `Easy ${easyMi} mi, no faster`,
      reason: 'Your load is creeping above the safe ramp. One more easy day keeps the buildup, drops the risk, and costs you nothing by the weekend.',
    };
  }

  if (acwrStatus === 'undertraining') {
    return {
      type: 'tempo',
      description: `${easyMi + 2} mi with 20 min at tempo effort`,
      reason: `Your load has dropped below your chronic base${daysSinceQuality != null ? ` and your last quality session was ${daysSinceQuality} days ago` : ''}. A controlled tempo rebuilds fitness without spiking risk.`,
    };
  }

  // Load optimal: pick the most overdue stimulus.
  if (daysSinceLong == null || daysSinceLong >= 8) {
    const longMi = Math.max(easyMi + 3, Math.round((medianDistanceM / 1609) * 1.6));
    return {
      type: 'long',
      description: `Long run, ${longMi} mi easy`,
      reason:
        daysSinceLong == null
          ? 'There is no long run in your recent block, and the long run is the single biggest endurance stimulus. Load is optimal, so today is the day.'
          : `Your last long run was ${daysSinceLong} days ago. Load is optimal, so bank the endurance stimulus before adding more speed.`,
    };
  }

  if (daysSinceQuality == null || daysSinceQuality >= 4 || easyStreak >= 3) {
    return {
      type: 'tempo',
      description: `${easyMi + 1} mi with 3 by 8 min at tempo`,
      reason:
        easyStreak >= 3
          ? `Your last ${easyStreak} runs were all easy and your load is in the optimal band. You are fresh, which is exactly when quality pays.`
          : 'You are recovered, load is optimal, and quality is overdue. Tempo at a comfortably hard effort is the highest-value session from here.',
    };
  }

  return {
    type: 'easy',
    description: `Easy ${easyMi} mi`,
    reason: `Quality was ${daysSinceQuality} day${daysSinceQuality === 1 ? '' : 's'} ago and the long run ${daysSinceLong} days ago, so today consolidates. Hard days only work when the easy days between them are actually easy.`,
  };
}
