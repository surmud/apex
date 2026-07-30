import { Platform } from 'react-native';
import { Activity } from '../formulas/types';

/**
 * Apple Health integration. Running workouts recorded by Apple Watch (or
 * any app that writes to HealthKit) become Apex activities, including the
 * running dynamics metrics the Watch measures: vertical oscillation,
 * ground contact time, stride length, and running power.
 *
 * Everything is read-only and stays on the device. Requires a development
 * or release build (HealthKit is a native capability, so Expo Go and the
 * web build report unavailable).
 *
 * The library is loaded lazily inside each function rather than imported
 * at module scope. A static import registers the Nitro native module at
 * bundle evaluation, which crashes the whole app on first launch if the
 * installed binary predates the HealthKit dependency. Lazy loading turns
 * that worst case into "Apple Health unavailable" instead.
 */

// HKWorkoutActivityType.running. Held as a literal so the enum import is
// not needed at module scope; verified against Apple's headers.
const ACTIVITY_TYPE_RUNNING = 37;

const READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierRunningPower',
  'HKQuantityTypeIdentifierRunningVerticalOscillation',
  'HKQuantityTypeIdentifierRunningGroundContactTime',
  'HKQuantityTypeIdentifierRunningStrideLength',
  'HKWorkoutRouteTypeIdentifier',
] as const;

function hk(): any | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@kingstinct/react-native-healthkit');
  } catch {
    return null;
  }
}

export function healthKitSupported(): boolean {
  const mod = hk();
  if (!mod) return false;
  try {
    return mod.isHealthDataAvailable();
  } catch {
    return false;
  }
}

/** Prompts the HealthKit permission sheet. Resolves true when granted. */
export async function connectAppleHealth(): Promise<boolean> {
  const mod = hk();
  if (!mod || !healthKitSupported()) {
    throw new Error('Apple Health is only available on an iOS build of Apex.');
  }
  return mod.requestAuthorization({ toRead: READ_TYPES });
}

interface Quantityish {
  unit?: string;
  quantity?: number;
}

function meters(q: Quantityish | undefined): number | null {
  if (q?.quantity == null) return null;
  switch (q.unit) {
    case 'km': return q.quantity * 1000;
    case 'mi': return q.quantity * 1609.344;
    case 'cm': return q.quantity / 100;
    case 'm': default: return q.quantity;
  }
}

function seconds(q: Quantityish | undefined): number | null {
  if (q?.quantity == null) return null;
  switch (q.unit) {
    case 'min': return q.quantity * 60;
    case 'hr': return q.quantity * 3600;
    case 'ms': return q.quantity / 1000;
    case 's': default: return q.quantity;
  }
}

function statAvg(stats: Record<string, any>, key: string): Quantityish | undefined {
  return stats?.[key]?.averageQuantity;
}

/**
 * Average and max heart rate for a time window. Tries the workout's own
 * statistics first (cheap), then falls back to an explicit statistics
 * query over the workout's time range, which is what actually works for
 * most Watch recordings.
 */
async function heartRateForWindow(
  mod: any,
  stats: Record<string, any>,
  start: Date,
  end: Date,
): Promise<{ avg: number | null; max: number | null }> {
  const own = stats?.['HKQuantityTypeIdentifierHeartRate'];
  if (own?.averageQuantity?.quantity != null) {
    return {
      avg: own.averageQuantity.quantity,
      max: own.maximumQuantity?.quantity ?? null,
    };
  }
  try {
    const res = await mod.queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierHeartRate',
      ['discreteAverage', 'discreteMax'],
      { unit: 'count/min', filter: { date: { startDate: start, endDate: end } } },
    );
    return {
      avg: res?.averageQuantity?.quantity ?? null,
      max: res?.maximumQuantity?.quantity ?? null,
    };
  } catch {
    return { avg: null, max: null };
  }
}

/**
 * Fetch running workouts from HealthKit, newest first, optionally only
 * those starting after `afterISO`. Strictly running: the query filters by
 * activity type AND each result is re-checked, so Watch-detected walks
 * and hikes never slip in.
 */
export async function fetchHealthRuns(
  afterISO?: string,
  onProgress?: (count: number) => void,
): Promise<Activity[]> {
  const mod = hk();
  if (!mod || !healthKitSupported()) return [];

  const workouts = await mod.queryWorkoutSamples({
    filter: {
      workoutActivityType: ACTIVITY_TYPE_RUNNING,
      ...(afterISO ? { date: { startDate: new Date(afterISO) } } : {}),
    },
    limit: -1,
    ascending: false,
  });

  const out: Activity[] = [];
  for (const w of workouts) {
    try {
      // Defense in depth: never trust the filter alone.
      if (w.workoutActivityType !== ACTIVITY_TYPE_RUNNING) continue;

      const start = new Date(w.startDate);
      const end = new Date(w.endDate);
      const elapsedS = Math.max(1, (end.getTime() - start.getTime()) / 1000);
      const movingS = seconds(w.duration as Quantityish) ?? elapsedS;
      const distanceM = meters(w.totalDistance as Quantityish);
      if (distanceM == null || distanceM < 400 || movingS < 120) continue;

      // Walking pace guard: anything slower than 16 min/km is not a run
      // Apex can analyze, even if it was labeled running.
      if (distanceM / movingS < 1.04) continue;

      let stats: Record<string, any> = {};
      try {
        stats = await w.getAllStatistics();
      } catch {
        // statistics are optional; the workout still counts
      }

      const hr = await heartRateForWindow(mod, stats, start, end);
      const stepsSum =
        (stats['HKQuantityTypeIdentifierStepCount']?.sumQuantity as Quantityish | undefined)
          ?.quantity ?? null;
      const cadence = stepsSum != null && movingS > 0 ? (stepsSum / movingS) * 60 : null;

      const voQ = statAvg(stats, 'HKQuantityTypeIdentifierRunningVerticalOscillation');
      const vo = voQ?.quantity != null ? (voQ.unit === 'm' ? voQ.quantity * 100 : voQ.quantity) : null;
      const gctQ = statAvg(stats, 'HKQuantityTypeIdentifierRunningGroundContactTime');
      const gct = gctQ?.quantity != null ? (gctQ.unit === 's' ? gctQ.quantity * 1000 : gctQ.quantity) : null;
      const stride = meters(statAvg(stats, 'HKQuantityTypeIdentifierRunningStrideLength'));
      const power = statAvg(stats, 'HKQuantityTypeIdentifierRunningPower')?.quantity ?? null;

      const indoor = Boolean(w.metadata?.HKIndoorWorkout);

      let startLat: number | null = null;
      let startLng: number | null = null;
      if (!indoor) {
        try {
          const routes = await w.getWorkoutRoutes();
          const loc = routes?.[0]?.locations?.[0];
          if (loc) {
            startLat = loc.latitude;
            startLng = loc.longitude;
          }
        } catch {
          // no route recorded
        }
      }

      out.push({
        id: `health-${w.uuid}`,
        startTime: start.toISOString(),
        distanceM,
        movingTimeS: Math.round(movingS),
        elapsedTimeS: Math.round(elapsedS),
        elevationGainM:
          (w.metadata?.HKElevationAscended as any)?.quantity ??
          (typeof w.metadata?.HKElevationAscended === 'number' ? w.metadata.HKElevationAscended : 0) ??
          0,
        avgSpeedMs: distanceM / movingS,
        avgHr: hr.avg,
        maxHr: hr.max,
        avgCadence: cadence,
        paceCv: null,
        verticalOscillationCm: vo,
        groundContactMs: gct,
        strideLengthM: stride,
        runningPowerW: power,
        isTreadmill: indoor,
        startLat,
        startLng,
        name: indoor ? 'Indoor run' : 'Run',
        isRaceTagged: false,
      });
      onProgress?.(out.length);
    } catch {
      // one malformed workout should never sink the sync
    }
  }
  return out;
}

/** Two activities whose time windows overlap are the same workout twice. */
function overlaps(a: Activity, b: Activity): boolean {
  const aStart = new Date(a.startTime).getTime();
  const aEnd = aStart + a.elapsedTimeS * 1000;
  const bStart = new Date(b.startTime).getTime();
  const bEnd = bStart + b.elapsedTimeS * 1000;
  const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  const shorter = Math.min(aEnd - aStart, bEnd - bStart);
  return shorter > 0 && overlap > shorter * 0.5;
}

/**
 * Merge Health runs into an existing activity list, dropping duplicates a
 * second source (Strava) already covers: overlapping time windows, or the
 * same start within 3 minutes at a similar distance.
 */
export function mergeHealthRuns(existing: Activity[], healthRuns: Activity[]): Activity[] {
  const merged = [...existing];
  for (const h of healthRuns) {
    const ht = new Date(h.startTime).getTime();
    const dup = merged.some((a) => {
      if (a.id === h.id) return true;
      if (overlaps(a, h)) return true;
      const dt = Math.abs(new Date(a.startTime).getTime() - ht);
      return dt < 3 * 60 * 1000 && Math.abs(a.distanceM - h.distanceM) < h.distanceM * 0.1;
    });
    if (!dup) merged.push(h);
  }
  return merged;
}

export interface WorkoutSeries {
  /** Heart rate over the workout: elapsed seconds → bpm */
  hr: { t: number; bpm: number }[];
  /** Route trace as raw lat/lng points, in recorded order */
  route: { lat: number; lng: number }[];
}

/**
 * Per-second detail for one Health workout (HR trace and GPS route), for
 * the post-run charts. Returns null when the activity is not a Health
 * workout or the data is unavailable.
 */
export async function fetchWorkoutSeries(activityId: string): Promise<WorkoutSeries | null> {
  const mod = hk();
  if (!mod || !activityId.startsWith('health-')) return null;
  const uuid = activityId.slice('health-'.length);
  try {
    const workouts = await mod.queryWorkoutSamples({ limit: 1, filter: { uuids: [uuid] } });
    const w = workouts?.[0];
    if (!w) return null;
    const start = new Date(w.startDate);
    const end = new Date(w.endDate);

    let hr: WorkoutSeries['hr'] = [];
    try {
      const samples = await mod.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
        limit: -1,
        ascending: true,
        unit: 'count/min',
        filter: { date: { startDate: start, endDate: end } },
      });
      hr = (samples ?? []).map((s: any) => ({
        t: (new Date(s.startDate).getTime() - start.getTime()) / 1000,
        bpm: s.quantity,
      }));
    } catch {
      // HR trace optional
    }

    let route: WorkoutSeries['route'] = [];
    try {
      const routes = await w.getWorkoutRoutes();
      route = (routes ?? []).flatMap((r: any) =>
        (r.locations ?? []).map((l: any) => ({ lat: l.latitude, lng: l.longitude })),
      );
    } catch {
      // route optional
    }

    if (hr.length === 0 && route.length === 0) return null;
    return { hr, route };
  } catch {
    return null;
  }
}
