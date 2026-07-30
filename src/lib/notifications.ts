import { Platform } from 'react-native';
import { EngineOutput, EnrichedActivity } from './engine';
import { fmtDistance, fmtPaceSPerKm } from './format';
import { UserProfile } from './formulas/types';

/**
 * Workout recap notifications. When a sync brings in a new run, the app
 * composes a one-off local notification that leads with whatever was most
 * significant about that run: unusual strain, a fitness signal, tough
 * weather, or a distance milestone. Every recap is different because it is
 * built from the run's own numbers.
 */

export function notificationsSupported(): boolean {
  return Platform.OS !== 'web';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const Notifications = require('expo-notifications');
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    const res = await Notifications.requestPermissionsAsync();
    return !!res.granted;
  } catch {
    return false;
  }
}

/** Pick the most significant angle for this run and write the recap. */
export function composeRecap(
  run: EnrichedActivity,
  engine: EngineOutput,
  profile: UserProfile,
): { title: string; body: string } {
  const a = run.activity;
  const dist = fmtDistance(a.distanceM, profile.units);
  const pace = fmtPaceSPerKm(run.rawPaceSPerKm, profile.units);
  const extras = engine.latestExtras;

  // 1. Longest run on record
  const isLongest = a.distanceM >= engine.totals.longestM && engine.totals.runs > 5;
  if (isLongest) {
    return {
      title: `New longest run: ${dist}`,
      body: `That is the farthest run in your history. Recovery matters most after a milestone, so plan ${extras?.recovery.value.minHours ?? 24} plus hours easy before the next hard session.`,
    };
  }

  // 2. Unusually high strain
  if (extras && extras.strainPercentile >= 88 && run.trimp) {
    return {
      title: 'That run carried serious strain',
      body: `Harder than ${extras.strainPercentile} percent of your recent runs at ${run.trimp.value.toFixed(0)} strain points. Great work. Your optimal next step is ${extras.nextWorkout.description.toLowerCase()}.`,
    };
  }

  // 3. Rough climate handled
  if (run.climate && run.climate.value.score < 55) {
    return {
      title: `${dist} in ${run.climate.value.label.toLowerCase()} conditions`,
      body: `Climate Score ${run.climate.value.score} of 100, which costs about ${run.climate.value.pacePenaltyPct.toFixed(1)} percent of pace. Your ${pace} was worth more than it looks on paper.`,
    };
  }

  // 4. Load ratio drifting out of the safe band
  if (engine.currentAcwrStatus === 'high_risk' || engine.currentAcwrStatus === 'caution') {
    return {
      title: `${dist} logged. Watch your load`,
      body: `Your 7 day load is running ${engine.currentAcwr?.toFixed(2) ?? 'high'} times your 28 day base. The next few days decide whether this becomes fitness or fatigue, so favor easy running.`,
    };
  }

  // 5. Default: clean recap with the suggested next step
  return {
    title: `${dist} at ${pace}`,
    body: extras
      ? `Solid ${run.workoutType} run in the books. Your optimal next step is ${extras.nextWorkout.description.toLowerCase()}.`
      : `Solid ${run.workoutType} run in the books.`,
  };
}

/** Fire the recap immediately as a local notification. */
export async function sendWorkoutRecap(
  run: EnrichedActivity,
  engine: EngineOutput,
  profile: UserProfile,
): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    const Notifications = require('expo-notifications');
    const granted = await requestNotificationPermission();
    if (!granted) return;
    const { title, body } = composeRecap(run, engine, profile);
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: null,
    });
  } catch {
    // notifications are best-effort
  }
}

/** Global handler so recaps show as banners while the app is foregrounded. */
export function configureNotificationHandler(): void {
  if (!notificationsSupported()) return;
  try {
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // best-effort
  }
}
