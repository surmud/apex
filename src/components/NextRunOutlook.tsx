import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { fetchForecast, ForecastDay, ForecastHour, reverseGeocode } from '../lib/api/weather';
import { nextScheduledRun } from '../lib/ai/plans';
import { fmtTemp } from '../lib/format';
import { climateScore } from '../lib/formulas/climate';
import { useAppState } from '../lib/state/AppState';
import { spacing, type } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';
import { Card, Segmented } from './ui/primitives';

/**
 * Weather outlook for the next run. When a training plan has a scheduled
 * run coming up, the outlook targets that date. Otherwise it offers a
 * today / tomorrow toggle, defaulting to today until sunset has passed.
 * The location is the start point of the most recent outdoor run, and the
 * forecast hour is when this runner usually starts (median of history).
 *
 * Open-Meteo returns times local to the queried location, so hours are
 * read from the time string, never through Date (which would re-interpret
 * them in the device timezone).
 */

const hourOf = (timeISO: string) => Number(timeISO.slice(11, 13));
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

export function NextRunOutlook() {
  const theme = useAppTheme();
  const { engine, profile, trainingPlan } = useAppState();
  const [days, setDays] = useState<ForecastDay[] | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [dayChoice, setDayChoice] = useState<'today' | 'tomorrow' | null>(null);

  // Location preference: the device's current position (accurate to where
  // the runner is right now), falling back to the last outdoor run's start
  // point when permission is denied or unavailable.
  const [deviceLoc, setDeviceLoc] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Location = require('expo-location');
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return;
        const pos = await Location.getLastKnownPositionAsync()
          ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        if (alive && pos) setDeviceLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // fall back to run history location
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const runLoc = useMemo(() => {
    const withGps = engine.enriched.find((e) => e.activity.startLat != null);
    return withGps
      ? { lat: withGps.activity.startLat!, lng: withGps.activity.startLng! }
      : null;
  }, [engine.enriched]);
  const loc = deviceLoc ?? runLoc;

  /** The hour of day this runner usually starts (median of history). */
  const typicalHour = useMemo(() => {
    const hours = engine.enriched
      .map((e) => new Date(e.activity.startTime).getHours())
      .sort((a, b) => a - b);
    return hours.length ? hours[Math.floor(hours.length / 2)] : 7;
  }, [engine.enriched]);

  useEffect(() => {
    if (!loc) return;
    let alive = true;
    fetchForecast(loc.lat, loc.lng).then((d) => {
      if (!alive) return;
      if (d) setDays(d);
      else setFailed(true);
    });
    reverseGeocode(loc.lat, loc.lng).then((c) => {
      if (alive) setCity(c);
    });
    return () => {
      alive = false;
    };
  }, [loc]);

  if (!loc || failed) return null;

  const todayISO = new Date().toISOString().slice(0, 10);
  const nextRun = trainingPlan ? nextScheduledRun(trainingPlan, todayISO) : null;

  // Which day are we forecasting?
  let targetDate: string;
  let heading: string;
  let showToggle = false;
  if (nextRun && days?.some((d) => d.dateISO === nextRun.dateISO)) {
    targetDate = nextRun.dateISO;
    const label = new Date(nextRun.dateISO + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'long',
    });
    heading =
      nextRun.dateISO === todayISO
        ? `Today's ${nextRun.type} run`
        : `${label}'s ${nextRun.type} run`;
  } else {
    showToggle = true;
    const today = days?.find((d) => d.dateISO === todayISO);
    const sunsetPassed = today ? Date.now() > new Date(today.sunsetISO).getTime() : false;
    const choice = dayChoice ?? (sunsetPassed ? 'tomorrow' : 'today');
    targetDate =
      choice === 'today'
        ? todayISO
        : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    heading = 'Next run outlook';
  }

  const day = days?.find((d) => d.dateISO === targetDate);
  let hour: ForecastHour | null = null;
  if (day) {
    // The typical start hour, but never an hour that has already passed today.
    const minHour = targetDate === todayISO ? Math.min(23, new Date().getHours() + 1) : 0;
    const wanted = Math.max(typicalHour, minHour);
    hour =
      day.hours.find((h) => hourOf(h.timeISO) >= wanted) ??
      day.hours[day.hours.length - 1] ??
      null;
  }

  const climate = hour ? climateScore(hour.tempC, hour.dewpointC, hour.windMs) : null;

  const focus = (() => {
    if (!hour || !climate) return null;
    const bits: string[] = [];
    if (climate.value.pacePenaltyPct >= 3) {
      bits.push(
        `Heat will cost about ${climate.value.pacePenaltyPct.toFixed(0)} percent of pace, so start slower than feels necessary and judge the run by effort.`,
      );
    } else if (hour.tempC <= 0) {
      bits.push('Below freezing. Warm up indoors first and expect the first mile to feel stiff.');
    } else if (climate.value.score >= 80) {
      bits.push('Great conditions. If a quality session is on the schedule, this is the day for it.');
    } else {
      bits.push('Fair conditions. No weather adjustment needed.');
    }
    if (hour.precipProbPct >= 50) {
      bits.push(`There is a ${Math.round(hour.precipProbPct)} percent chance of rain at that hour.`);
    }
    if (hour.windMs >= 7) {
      bits.push('Wind is strong enough to matter. Head out into it and finish with it at your back.');
    }
    return bits.join(' ');
  })();

  if (!day || !hour || !climate) return null;

  const scoreColor =
    climate.value.score >= 70
      ? theme.status.good
      : climate.value.score >= 55
        ? theme.status.warning
        : theme.status.serious;

  const whenWhere = `${targetDate === todayISO ? 'Today' : new Date(targetDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })} around ${hourLabel(hourOf(hour.timeISO))}${city ? ` in ${city}` : ''}`;

  return (
    <Card style={{ marginTop: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.cardTitle, { color: theme.textPrimary }]}>{heading}</Text>
        {showToggle && (
          <View style={{ width: 150 }}>
            <Segmented
              options={[
                { key: 'today' as const, label: 'Today' },
                { key: 'tomorrow' as const, label: 'Tomorrow' },
              ]}
              value={
                dayChoice ??
                (targetDate === todayISO ? ('today' as const) : ('tomorrow' as const))
              }
              onChange={setDayChoice}
            />
          </View>
        )}
      </View>
      <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{whenWhere}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm }}>
        <View>
          <Text style={[type.stat, { color: theme.textPrimary }]}>
            {fmtTemp(hour.tempC, profile.units)}
          </Text>
          <Text style={{ fontSize: 12, color: theme.textMuted }}>forecast</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: scoreColor }} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary }}>
              Climate Score {climate.value.score} ({climate.value.label})
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
            Dew point {fmtTemp(hour.dewpointC, profile.units)}, wind{' '}
            {Math.round(hour.windMs * 2.237)} mph, rain {Math.round(hour.precipProbPct)}%
          </Text>
        </View>
      </View>

      {focus && (
        <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginTop: spacing.sm }}>
          {focus}
        </Text>
      )}
    </Card>
  );
}
