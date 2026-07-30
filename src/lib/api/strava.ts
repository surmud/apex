import { Activity, ActivityWeather } from '../formulas/types';
import { fetchHistoricalWeather } from './weather';

/**
 * Strava integration. All Strava HTTP goes through Supabase Edge Functions
 * (strava-oauth, strava-activities) because Strava's API has no CORS headers
 * and the client secret must stay server-side.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '';

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
  athleteId: number | null;
  athleteName: string | null;
}

async function callFn(fn: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? data?.message ?? `Edge function ${fn} failed (${res.status})`);
  return data;
}

export async function exchangeCode(code: string): Promise<StravaTokens> {
  const d = await callFn('strava-oauth', { action: 'exchange', code });
  if (!d.access_token) throw new Error(d.message ?? 'Strava token exchange failed');
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: d.expires_at,
    athleteId: d.athlete?.id ?? null,
    athleteName: d.athlete ? `${d.athlete.firstname ?? ''} ${d.athlete.lastname ?? ''}`.trim() : null,
  };
}

export async function refreshTokens(refreshToken: string): Promise<StravaTokens> {
  const d = await callFn('strava-oauth', { action: 'refresh', refresh_token: refreshToken });
  if (!d.access_token) throw new Error('Strava token refresh failed — reconnect in Settings');
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: d.expires_at,
    athleteId: null,
    athleteName: null,
  };
}

/** Ensure tokens are fresh; returns possibly-rotated tokens. */
export async function ensureFresh(tokens: StravaTokens): Promise<StravaTokens> {
  if (tokens.expiresAt * 1000 - Date.now() > 5 * 60 * 1000) return tokens;
  const next = await refreshTokens(tokens.refreshToken);
  return { ...tokens, ...next, athleteId: tokens.athleteId, athleteName: tokens.athleteName };
}

interface StravaSummaryActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  start_latlng?: [number, number] | null;
  workout_type?: number | null; // 1 = race (runs)
  trainer?: boolean;
}

/**
 * Backfill/sync runs. Pulls pages until exhausted (or `after` cutoff),
 * filters to runs, normalizes to the canonical Activity shape.
 */
export async function fetchActivities(
  tokens: StravaTokens,
  opts: { after?: number; onProgress?: (count: number) => void } = {},
): Promise<{ activities: Activity[]; tokens: StravaTokens }> {
  let fresh = await ensureFresh(tokens);
  const all: Activity[] = [];
  let page = 1;

  for (;;) {
    const batch: StravaSummaryActivity[] = await callFn('strava-activities', {
      access_token: fresh.accessToken,
      page,
      per_page: 100,
      after: opts.after,
    });
    if (!Array.isArray(batch)) {
      throw new Error((batch as any)?.message ?? 'Strava returned an unexpected response');
    }
    if (batch.length === 0) break;

    for (const s of batch) {
      const isRun = s.type === 'Run' || s.sport_type === 'Run' || s.sport_type === 'TrailRun';
      if (!isRun || !s.distance || !s.moving_time) continue;
      all.push({
        id: `strava-${s.id}`,
        startTime: s.start_date,
        distanceM: s.distance,
        movingTimeS: s.moving_time,
        elapsedTimeS: s.elapsed_time,
        elevationGainM: s.total_elevation_gain ?? 0,
        avgSpeedMs: s.average_speed || s.distance / s.moving_time,
        avgHr: s.average_heartrate ?? null,
        maxHr: s.max_heartrate ?? null,
        avgCadence: s.average_cadence != null ? s.average_cadence * 2 : null, // Strava reports single-leg
        paceCv: null, // splits not in summary payload; classifier falls back to HR rules
        verticalOscillationCm: null, // running dynamics arrive with the HealthKit source
        groundContactMs: null,
        strideLengthM: null,
        runningPowerW: null,
        isTreadmill: !!s.trainer,
        startLat: s.start_latlng?.[0] ?? null,
        startLng: s.start_latlng?.[1] ?? null,
        name: s.name,
        isRaceTagged: s.workout_type === 1,
      });
    }
    opts.onProgress?.(all.length);
    if (batch.length < 100) break;
    page++;
    if (page > 40) break; // safety: 4,000 activities
  }
  return { activities: all, tokens: fresh };
}

/**
 * Weather enrichment for a set of activities, with progress + throttling.
 * Open-Meteo free tier: 600 calls/min — we stay well under.
 */
export async function enrichWeather(
  activities: Activity[],
  existing: Record<string, ActivityWeather | null>,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, ActivityWeather | null>> {
  const out = { ...existing };
  const todo = activities.filter((a) => out[a.id] === undefined && a.startLat != null);
  let done = 0;
  for (const a of todo) {
    out[a.id] = await fetchHistoricalWeather(a.startLat!, a.startLng!, a.startTime);
    done++;
    onProgress?.(done, todo.length);
    if (done % 50 === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  // mark indoor/no-GPS as null (looked up, nothing to attach)
  for (const a of activities) if (out[a.id] === undefined) out[a.id] = null;
  return out;
}

/**
 * Build the Strava authorize URL. Strava only accepts redirect URIs on the
 * registered Authorization Callback Domain, which must be this project's
 * Supabase host (e.g. <ref>.supabase.co). The strava-callback edge function
 * receives the code and bounces the browser back to `returnUri` (the app's
 * custom scheme on device, or the web origin's /onboarding page), carried
 * through OAuth `state`.
 */
export function stravaAuthUrl(returnUri: string): string {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: `${SUPABASE_URL}/functions/v1/strava-callback`,
    response_type: 'code',
    scope: 'activity:read_all',
    approval_prompt: 'auto',
    state: returnUri,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}
