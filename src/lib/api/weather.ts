import { ActivityWeather } from '../formulas/types';

/**
 * Open-Meteo historical weather lookup (free, no key, CORS-enabled).
 * One call per activity, cached by the caller — never re-fetched.
 */
export interface ForecastHour {
  /** Local ISO time from Open-Meteo, e.g. 2026-07-14T07:00 */
  timeISO: string;
  tempC: number;
  dewpointC: number;
  humidityPct: number;
  windMs: number;
  precipProbPct: number;
}

export interface ForecastDay {
  dateISO: string; // yyyy-mm-dd, local
  sunriseISO: string;
  sunsetISO: string;
  hours: ForecastHour[];
}

/**
 * Open-Meteo forecast (free, no key, CORS-enabled), local timezone.
 * Used by the next-run outlook. Cached in-module for 30 minutes.
 */
const forecastCache = new Map<string, { at: number; days: ForecastDay[] }>();

export async function fetchForecast(
  lat: number,
  lng: number,
  forecastDays = 8,
): Promise<ForecastDay[] | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${forecastDays}`;
  const hit = forecastCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.days;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,precipitation_probability` +
    `&daily=sunrise,sunset&forecast_days=${forecastDays}&timezone=auto`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const h = data?.hourly;
    const d = data?.daily;
    if (!h?.time?.length || !d?.time?.length) return null;

    const hoursByDate = new Map<string, ForecastHour[]>();
    for (let i = 0; i < h.time.length; i++) {
      const date = String(h.time[i]).slice(0, 10);
      const arr = hoursByDate.get(date) ?? [];
      arr.push({
        timeISO: h.time[i],
        tempC: h.temperature_2m[i],
        dewpointC: h.dew_point_2m[i],
        humidityPct: h.relative_humidity_2m[i],
        windMs: (h.wind_speed_10m[i] ?? 0) / 3.6,
        precipProbPct: h.precipitation_probability?.[i] ?? 0,
      });
      hoursByDate.set(date, arr);
    }

    const days: ForecastDay[] = d.time.map((date: string, i: number) => ({
      dateISO: date,
      sunriseISO: d.sunrise[i],
      sunsetISO: d.sunset[i],
      hours: hoursByDate.get(date) ?? [],
    }));
    forecastCache.set(key, { at: Date.now(), days });
    return days;
  } catch {
    return null;
  }
}

/** City name for coordinates, via BigDataCloud's free keyless endpoint. */
const geoCache = new Map<string, string | null>();

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (geoCache.has(key)) return geoCache.get(key) ?? null;
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&localityLanguage=en`,
    );
    if (!res.ok) return null;
    const d = await res.json();
    const city = d?.city || d?.locality || d?.principalSubdivision || null;
    geoCache.set(key, city);
    return city;
  } catch {
    return null;
  }
}

export async function fetchHistoricalWeather(
  lat: number,
  lng: number,
  startTimeIso: string,
): Promise<ActivityWeather | null> {
  const date = startTimeIso.slice(0, 10);
  const hour = new Date(startTimeIso).getUTCHours();
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&start_date=${date}&end_date=${date}` +
    `&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m&timezone=UTC`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const h = data?.hourly;
    if (!h?.temperature_2m?.length) return null;
    const i = Math.min(hour, h.temperature_2m.length - 1);
    return {
      tempC: h.temperature_2m[i],
      humidityPct: h.relative_humidity_2m[i],
      dewpointC: h.dew_point_2m[i],
      windMs: (h.wind_speed_10m[i] ?? 0) / 3.6, // km/h → m/s
    };
  } catch {
    return null;
  }
}
