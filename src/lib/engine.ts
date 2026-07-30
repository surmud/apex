/**
 * The derivation engine: raw activities + profile → everything the UI shows.
 * Pure function of its inputs, recomputed via useMemo in the data provider.
 */
import { acwrStatus, computeDailyLoads, isoDate } from './formulas/acwr';
import { ClassificationResult, classifyWorkout } from './formulas/classifier';
import { ClimateScore, climateScore } from './formulas/climate';
import { computeZones, HrZones } from './formulas/zones';
import { efficiencyFactor } from './formulas/efficiency';
import { FitnessPoint, fitnessFatigueSeries } from './formulas/fitnessFatigue';
import { detectQualityFlags, isExcludedFromAnalysis } from './formulas/quality';
import { recoveryWindow, suggestNextWorkout } from './formulas/recovery';
import { BestEffort } from './formulas/riegel';
import { trimp } from './formulas/trimp';
import {
  Activity,
  ActivityWeather,
  Explained,
  QualityFlag,
  UserProfile,
  WorkoutType,
  WorkoutTypeSource,
} from './formulas/types';
import { rollingVo2max, vo2maxEstimate } from './formulas/vdot';
import { adjustedPace } from './formulas/weatherAdjust';

export interface EnrichedActivity {
  activity: Activity;
  weather: ActivityWeather | null;
  flags: QualityFlag[];
  excluded: boolean;
  trimp: Explained<number> | null;
  efficiency: Explained<number> | null;
  vo2max: Explained<number> | null;
  adjustedPace: Explained<number> | null;
  climate: Explained<ClimateScore> | null;
  rawPaceSPerKm: number;
  classification: ClassificationResult;
  workoutType: WorkoutType; // after user correction
  workoutTypeSource: WorkoutTypeSource;
}

export interface EngineOutput {
  enriched: EnrichedActivity[]; // newest first
  dailyLoads: ReturnType<typeof computeDailyLoads>;
  fitnessSeries: FitnessPoint[];
  currentAcwr: number | null;
  currentAcwrStatus: ReturnType<typeof acwrStatus>;
  currentVo2max: number | null;
  vo2maxDelta30d: number | null;
  bestEfforts: BestEffort[];
  currentMpw: number;
  medianDurationS: number;
  medianDistanceM: number;
  totals: {
    distanceM: number;
    runs: number;
    movingTimeS: number;
    elevationGainM: number;
    longestM: number;
    races: number;
  };
  /** Effective HR zones: user-calculated if set, else Karvonen from profile */
  hrZones: HrZones;
  latest: EnrichedActivity | null;
  latestExtras: {
    recovery: ReturnType<typeof recoveryWindow>;
    nextWorkout: ReturnType<typeof suggestNextWorkout>;
    strainPercentile: number; // 0-100, vs last 30 runs
  } | null;
}

export function runEngine(
  raw: { activity: Activity; weather: ActivityWeather | null }[],
  profile: UserProfile,
  corrections: Record<string, WorkoutType>,
  now = new Date(),
): EngineOutput {
  const sorted = [...raw].sort((a, b) => a.activity.startTime.localeCompare(b.activity.startTime));

  const durations = sorted.map((r) => r.activity.movingTimeS).sort((a, b) => a - b);
  const distances = sorted.map((r) => r.activity.distanceM).sort((a, b) => a - b);
  const medianDurationS = durations[Math.floor(durations.length / 2)] ?? 2700;
  const medianDistanceM = distances[Math.floor(distances.length / 2)] ?? 8000;
  const ctx = { medianDurationS, medianDistanceM };

  const enriched: EnrichedActivity[] = sorted.map(({ activity, weather: rawWeather }) => {
    const flags = detectQualityFlags(activity);
    const excluded = isExcludedFromAnalysis(flags);
    const hasHr = activity.avgHr != null;
    // Treadmill and other indoor runs never get weather effects, even if
    // a lookup attached conditions from a nearby start point.
    const weather = activity.isTreadmill ? null : rawWeather;

    const t = hasHr && !excluded ? trimp(activity.movingTimeS, activity.avgHr!, profile) : null;
    const ef = hasHr && !excluded ? efficiencyFactor(activity.avgSpeedMs, activity.avgHr!) : null;
    const v =
      hasHr && !excluded
        ? vo2maxEstimate(
            activity.distanceM,
            activity.movingTimeS,
            activity.elevationGainM,
            activity.avgHr!,
            profile,
          )
        : null;
    const rawPace = activity.avgSpeedMs > 0 ? 1000 / activity.avgSpeedMs : 0;
    const adj =
      weather != null && !excluded ? adjustedPace(rawPace, weather.tempC, weather.dewpointC) : null;
    const climate =
      weather != null ? climateScore(weather.tempC, weather.dewpointC, weather.windMs) : null;

    const classification = classifyWorkout(activity, profile, ctx);
    const corrected = corrections[activity.id];

    return {
      activity,
      weather,
      flags,
      excluded,
      trimp: t,
      efficiency: ef,
      vo2max: v,
      adjustedPace: adj,
      climate,
      rawPaceSPerKm: rawPace,
      classification,
      workoutType: corrected ?? classification.type,
      workoutTypeSource: corrected ? 'user_corrected' : 'auto_detected',
    };
  });

  // daily TRIMP map
  const trimpByDate = new Map<string, number>();
  for (const e of enriched) {
    if (!e.trimp) continue;
    const d = e.activity.startTime.slice(0, 10);
    trimpByDate.set(d, (trimpByDate.get(d) ?? 0) + e.trimp.value);
  }

  // Series span the full history (min 120 days) so the ALL range on
  // charts actually shows all data.
  const oldestT = sorted.length
    ? new Date(sorted[0].activity.startTime).getTime()
    : now.getTime();
  const seriesDays = Math.min(
    1100,
    Math.max(120, Math.ceil((now.getTime() - oldestT) / 86400000) + 7),
  );
  const dailyLoads = computeDailyLoads(trimpByDate, now, seriesDays);
  const fitnessSeries = fitnessFatigueSeries(trimpByDate, now, seriesDays);
  const lastLoad = dailyLoads[dailyLoads.length - 1];
  const currentAcwr = lastLoad?.acwr ?? null;

  // VO2max: rolling median of estimates; delta vs 30 days ago
  const vo2Series = enriched
    .filter((e) => e.vo2max)
    .map((e) => ({ date: e.activity.startTime.slice(0, 10), v: e.vo2max!.value }));
  const currentVo2max = rollingVo2max(vo2Series.map((x) => x.v));
  const cutoff = isoDate(new Date(now.getTime() - 30 * 86400000));
  const olderSeries = vo2Series.filter((x) => x.date <= cutoff);
  const olderVo2max = rollingVo2max(olderSeries.map((x) => x.v));
  const vo2maxDelta30d =
    currentVo2max != null && olderVo2max != null ? currentVo2max - olderVo2max : null;

  // best efforts: races + fastest non-excluded efforts near standard distances
  const bestEfforts: BestEffort[] = [];
  for (const e of enriched) {
    if (e.excluded) continue;
    const isQuality = e.activity.isRaceTagged || e.workoutType === 'tempo' || e.workoutType === 'race';
    if (isQuality && e.activity.distanceM >= 3000) {
      bestEfforts.push({
        distanceM: e.activity.distanceM,
        timeS: e.activity.movingTimeS,
        date: e.activity.startTime.slice(0, 10),
      });
    }
  }

  // current weekly mileage: avg of last 4 weeks
  const fourWeeksAgo = now.getTime() - 28 * 86400000;
  const recentM = enriched
    .filter((e) => new Date(e.activity.startTime).getTime() >= fourWeeksAgo)
    .reduce((s, e) => s + e.activity.distanceM, 0);
  const currentMpw = recentM / 1609.344 / 4;

  const totals = {
    distanceM: enriched.reduce((s, e) => s + e.activity.distanceM, 0),
    runs: enriched.length,
    movingTimeS: enriched.reduce((s, e) => s + e.activity.movingTimeS, 0),
    elevationGainM: enriched.reduce((s, e) => s + e.activity.elevationGainM, 0),
    longestM: Math.max(0, ...enriched.map((e) => e.activity.distanceM)),
    races: enriched.filter((e) => e.workoutType === 'race').length,
  };

  const newestFirst = [...enriched].reverse();
  const latest = newestFirst.find((e) => !e.excluded) ?? newestFirst[0] ?? null;

  let latestExtras: EngineOutput['latestExtras'] = null;
  if (latest?.trimp) {
    const last30 = newestFirst.filter((e) => e.trimp).slice(0, 30);
    const below = last30.filter((e) => e.trimp!.value < latest.trimp!.value).length;
    const recentSummaries = newestFirst
      .filter((e) => !e.excluded)
      .slice(0, 10)
      .map((e) => ({
        type: e.workoutType,
        trimp: e.trimp?.value ?? null,
        distanceM: e.activity.distanceM,
        daysAgo: Math.round(
          (now.getTime() - new Date(e.activity.startTime).getTime()) / 86400000,
        ),
      }));
    latestExtras = {
      recovery: recoveryWindow(latest.trimp.value),
      nextWorkout: suggestNextWorkout(recentSummaries, acwrStatus(currentAcwr), medianDistanceM),
      strainPercentile: last30.length > 0 ? Math.round((below / last30.length) * 100) : 50,
    };
  }

  return {
    enriched: newestFirst,
    dailyLoads,
    fitnessSeries,
    hrZones: profile.hrZones ?? computeZones(profile.restingHr, profile.maxHr).value,
    currentAcwr,
    currentAcwrStatus: acwrStatus(currentAcwr),
    currentVo2max,
    vo2maxDelta30d,
    bestEfforts,
    currentMpw,
    medianDurationS,
    medianDistanceM,
    totals,
    latest,
    latestExtras,
  };
}
