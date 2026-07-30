import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState as RNAppState } from 'react-native';
import { CoachInsight, RaceGoal } from '../ai/coach';
import { TrainingPlan } from '../ai/plans';
import {
  connectAppleHealth as hkRequestAuth,
  fetchHealthRuns,
  healthKitSupported,
  mergeHealthRuns,
} from '../api/health';
import {
  enrichWeather,
  fetchActivities,
  StravaTokens,
} from '../api/strava';
import { DEMO_PROFILE, generateDemoData } from '../demo/generator';
import { EngineOutput, runEngine } from '../engine';
import { Activity, ActivityWeather, UserProfile, WorkoutType } from '../formulas/types';
import { sendWorkoutRecap } from '../notifications';

export type DataSource = 'demo' | 'strava' | 'health';

export interface Course {
  id: string;
  name: string;
  distanceM: number;
  elevationGainM: number;
  raceDate: string | null;
  expectedTempC: number | null;
  expectedHumidityPct: number | null;
  keyFeatures: { mile: number; label: string }[];
}

export type SyncState =
  | { phase: 'idle'; lastSyncedAt: string | null }
  | { phase: 'backfill'; count: number }
  | { phase: 'weather'; done: number; total: number }
  | { phase: 'error'; message: string; lastSyncedAt: string | null };

interface PersistedState {
  onboarded: boolean;
  source: DataSource;
  profile: UserProfile;
  activities: Activity[];
  weather: Record<string, ActivityWeather | null>;
  corrections: Record<string, WorkoutType>;
  courses: Course[];
  activeCourseId: string | null;
  stravaTokens: StravaTokens | null;
  lastSyncedAt: string | null;
  healthConnected: boolean;
  lastHealthSyncedAt: string | null;
  recapNotifications: boolean;
  anthropicApiKey: string | null;
  goal: RaceGoal | null;
  coachCache: { activityId: string; insight: CoachInsight; fetchedAt: string } | null;
  trainingPlan: TrainingPlan | null;
}

const DEFAULTS: PersistedState = {
  onboarded: false,
  source: 'demo',
  profile: { ...DEMO_PROFILE },
  activities: [],
  weather: {},
  corrections: {},
  courses: [],
  activeCourseId: null,
  stravaTokens: null,
  lastSyncedAt: null,
  healthConnected: false,
  lastHealthSyncedAt: null,
  recapNotifications: true,
  anthropicApiKey: null,
  goal: null,
  coachCache: null,
  trainingPlan: null,
};

const KEY = 'apex-state-v1';

interface AppStateValue {
  ready: boolean;
  onboarded: boolean;
  source: DataSource;
  profile: UserProfile;
  courses: Course[];
  activeCourseId: string | null;
  sync: SyncState;
  engine: EngineOutput;
  stravaConnected: boolean;
  healthConnected: boolean;
  healthAvailable: boolean;
  recapNotifications: boolean;
  setRecapNotifications: (on: boolean) => void;
  connectHealth: () => Promise<void>;
  reimportHealth: () => Promise<void>;
  anthropicApiKey: string | null;
  goal: RaceGoal | null;
  coachCache: { activityId: string; insight: CoachInsight; fetchedAt: string } | null;
  setAnthropicApiKey: (key: string | null) => void;
  setGoal: (goal: RaceGoal | null) => void;
  setCoachCache: (activityId: string, insight: CoachInsight) => void;
  trainingPlan: TrainingPlan | null;
  setTrainingPlan: (plan: TrainingPlan | null) => void;
  completeOnboarding: (profile: UserProfile, source: DataSource) => void;
  setProfile: (p: UserProfile) => void;
  correctWorkoutType: (activityId: string, type: WorkoutType) => void;
  addCourse: (c: Omit<Course, 'id'>) => void;
  updateCourse: (c: Course) => void;
  deleteCourse: (id: string) => void;
  setActiveCourse: (id: string | null) => void;
  connectStrava: (tokens: StravaTokens) => Promise<void>;
  syncNow: () => Promise<void>;
  loadDemoData: () => void;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>({ phase: 'idle', lastSyncedAt: null });
  const stateRef = useRef(state);
  stateRef.current = state;

  // hydrate
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((json) => {
        if (json) {
          const parsed = { ...DEFAULTS, ...JSON.parse(json) };
          setState(parsed);
          setSync({ phase: 'idle', lastSyncedAt: parsed.lastSyncedAt });
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // persist (debounced)
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [state, ready]);

  const engine = useMemo(() => {
    const raw = state.activities.map((a) => ({ activity: a, weather: state.weather[a.id] ?? null }));
    return runEngine(raw, state.profile, state.corrections);
  }, [state.activities, state.weather, state.profile, state.corrections]);

  const patch = useCallback((p: Partial<PersistedState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  const loadDemoData = useCallback(() => {
    const demo = generateDemoData();
    patch({
      source: 'demo',
      activities: demo.map((d) => d.activity),
      weather: Object.fromEntries(demo.map((d) => [d.activity.id, d.weather])),
      lastSyncedAt: new Date().toISOString(),
    });
    setSync({ phase: 'idle', lastSyncedAt: new Date().toISOString() });
  }, [patch]);

  /**
   * Recap notification for freshly synced runs. Skipped on the first big
   * backfill (no prior activities), otherwise fires once for the newest
   * new run using the engine state that includes it.
   */
  const maybeRecap = useCallback(
    (prevIds: Set<string>, merged: Activity[], weather: Record<string, ActivityWeather | null>) => {
      const s = stateRef.current;
      if (!s.recapNotifications || prevIds.size === 0) return;
      const fresh = merged.filter((a) => !prevIds.has(a.id));
      if (fresh.length === 0) return;
      const newest = fresh.reduce((a, b) => (a.startTime > b.startTime ? a : b));
      const out = runEngine(
        merged.map((a) => ({ activity: a, weather: weather[a.id] ?? null })),
        s.profile,
        s.corrections,
      );
      const enriched = out.enriched.find((e) => e.activity.id === newest.id);
      if (enriched) void sendWorkoutRecap(enriched, out, s.profile);
    },
    [],
  );

  const doHealthSync = useCallback(
    async (fullBackfill: boolean, baseOverride?: Activity[]) => {
      try {
        setSync({ phase: 'backfill', count: 0 });
        const s = stateRef.current;
        const after =
          fullBackfill || !s.lastHealthSyncedAt
            ? undefined
            : new Date(new Date(s.lastHealthSyncedAt).getTime() - 3600_000).toISOString();
        const runs = await fetchHealthRuns(after, (count) => setSync({ phase: 'backfill', count }));
        // A real source replaces demo data entirely; mixing the two makes
        // every trend chart lie.
        const existing = (baseOverride ?? s.activities).filter((a) => !a.id.startsWith('demo-'));
        const prevIds = new Set(existing.map((a) => a.id));
        const merged = mergeHealthRuns(existing, runs);

        setSync({ phase: 'weather', done: 0, total: 0 });
        const weather = await enrichWeather(merged, s.weather, (done, total) =>
          setSync({ phase: 'weather', done, total }),
        );

        const now = new Date().toISOString();
        patch({
          activities: merged,
          weather,
          healthConnected: true,
          lastHealthSyncedAt: now,
          lastSyncedAt: now,
          ...(s.source === 'demo' ? { source: 'health' as DataSource } : {}),
        });
        setSync({ phase: 'idle', lastSyncedAt: now });
        maybeRecap(prevIds, merged, weather);
      } catch (e: any) {
        setSync({
          phase: 'error',
          message: e?.message ?? 'Apple Health sync failed',
          lastSyncedAt: stateRef.current.lastSyncedAt,
        });
      }
    },
    [patch, maybeRecap],
  );

  const connectHealth = useCallback(async () => {
    const granted = await hkRequestAuth();
    if (!granted) throw new Error('Apple Health permission was not granted.');
    await doHealthSync(true);
  }, [doHealthSync]);

  /** Drop everything Health-sourced and pull it fresh (fixes past bad imports). */
  const reimportHealth = useCallback(async () => {
    const s = stateRef.current;
    const kept = s.activities.filter((a) => !a.id.startsWith('health-'));
    const keptWeather: typeof s.weather = {};
    for (const a of kept) if (s.weather[a.id] !== undefined) keptWeather[a.id] = s.weather[a.id];
    patch({ activities: kept, weather: keptWeather, lastHealthSyncedAt: null });
    await doHealthSync(true, kept);
  }, [doHealthSync, patch]);

  // Auto-sync newly recorded Apple Watch workouts when the app comes to
  // the foreground (throttled to once per 5 minutes).
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (st) => {
      const s = stateRef.current;
      if (st !== 'active' || !s.healthConnected) return;
      const last = s.lastHealthSyncedAt ? new Date(s.lastHealthSyncedAt).getTime() : 0;
      if (Date.now() - last > 5 * 60 * 1000) void doHealthSync(false);
    });
    return () => sub.remove();
  }, [doHealthSync]);

  const doSync = useCallback(
    async (tokens: StravaTokens, fullBackfill: boolean) => {
      try {
        setSync({ phase: 'backfill', count: 0 });
        const s = stateRef.current;
        const after = fullBackfill
          ? undefined
          : s.lastSyncedAt
            ? Math.floor(new Date(s.lastSyncedAt).getTime() / 1000) - 3600
            : undefined;
        const { activities, tokens: freshTokens } = await fetchActivities(tokens, {
          after,
          onProgress: (count) => setSync({ phase: 'backfill', count }),
        });

        // merge (dedupe by id); demo data never mixes with a real source
        const existing = s.activities.filter((a) => !a.id.startsWith('demo-'));
        const prevIds = new Set(existing.map((a) => a.id));
        const byId = new Map(existing.map((a) => [a.id, a]));
        for (const a of activities) byId.set(a.id, a);
        const merged = [...byId.values()];

        setSync({ phase: 'weather', done: 0, total: 0 });
        const weather = await enrichWeather(merged, s.weather, (done, total) =>
          setSync({ phase: 'weather', done, total }),
        );

        const now = new Date().toISOString();
        patch({
          source: 'strava',
          activities: merged,
          weather,
          stravaTokens: freshTokens,
          lastSyncedAt: now,
        });
        setSync({ phase: 'idle', lastSyncedAt: now });
        maybeRecap(prevIds, merged, weather);
      } catch (e: any) {
        setSync({
          phase: 'error',
          message: e?.message ?? 'Sync failed',
          lastSyncedAt: stateRef.current.lastSyncedAt,
        });
      }
    },
    [patch, maybeRecap],
  );

  const connectStrava = useCallback(
    async (tokens: StravaTokens) => {
      patch({ stravaTokens: tokens, source: 'strava' });
      await doSync(tokens, true);
    },
    [doSync, patch],
  );

  const syncNow = useCallback(async () => {
    const s = stateRef.current;
    if (s.source === 'demo' && !s.healthConnected && !s.stravaTokens) {
      loadDemoData();
      return;
    }
    if (s.stravaTokens) await doSync(s.stravaTokens, false);
    if (s.healthConnected) await doHealthSync(false);
  }, [doSync, doHealthSync, loadDemoData]);

  const value: AppStateValue = {
    ready,
    onboarded: state.onboarded,
    source: state.source,
    profile: state.profile,
    courses: state.courses,
    activeCourseId: state.activeCourseId,
    sync,
    engine,
    stravaConnected: state.stravaTokens != null,
    healthConnected: state.healthConnected,
    healthAvailable: healthKitSupported(),
    recapNotifications: state.recapNotifications,
    setRecapNotifications: (on) => patch({ recapNotifications: on }),
    connectHealth,
    reimportHealth,
    anthropicApiKey: state.anthropicApiKey,
    goal: state.goal,
    coachCache: state.coachCache,
    setAnthropicApiKey: (key) => patch({ anthropicApiKey: key }),
    setGoal: (goal) => patch({ goal }),
    setCoachCache: (activityId, insight) =>
      patch({ coachCache: { activityId, insight, fetchedAt: new Date().toISOString() } }),
    trainingPlan: state.trainingPlan,
    setTrainingPlan: (trainingPlan) => patch({ trainingPlan }),
    completeOnboarding: (profile, source) => patch({ onboarded: true, profile, source }),
    setProfile: (profile) => patch({ profile }),
    correctWorkoutType: (activityId, type) =>
      patch({ corrections: { ...stateRef.current.corrections, [activityId]: type } }),
    addCourse: (c) => {
      const id = `course-${Date.now()}`;
      patch({
        courses: [...stateRef.current.courses, { ...c, id }],
        activeCourseId: id,
      });
    },
    updateCourse: (c) =>
      patch({ courses: stateRef.current.courses.map((x) => (x.id === c.id ? c : x)) }),
    deleteCourse: (id) =>
      patch({
        courses: stateRef.current.courses.filter((x) => x.id !== id),
        activeCourseId: stateRef.current.activeCourseId === id ? null : stateRef.current.activeCourseId,
      }),
    setActiveCourse: (id) => patch({ activeCourseId: id }),
    connectStrava,
    syncNow,
    loadDemoData,
    resetAll: async () => {
      await AsyncStorage.removeItem(KEY);
      setState(DEFAULTS);
      setSync({ phase: 'idle', lastSyncedAt: null });
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState outside provider');
  return v;
}
