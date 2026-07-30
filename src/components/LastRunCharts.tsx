import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { fetchWorkoutSeries, WorkoutSeries } from '../lib/api/health';
import { zoneForHr } from '../lib/formulas/zones';
import { useAppState } from '../lib/state/AppState';
import { spacing, type, zoneColors } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';
import { TrendChart } from './charts/TrendChart';
import { Card } from './ui/primitives';

/**
 * Detail visuals for a single run, in the style of Apple Fitness and
 * Strava: the heart rate trace over the workout and the GPS route shape.
 * Data comes from HealthKit samples, so these render for Apple Health
 * workouts; other sources fall back to nothing (summary data has no
 * per-second streams).
 */
export function LastRunCharts({ activityId, width }: { activityId: string; width: number }) {
  const theme = useAppTheme();
  const { engine } = useAppState();
  const [series, setSeries] = useState<WorkoutSeries | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setSeries(null);
    fetchWorkoutSeries(activityId).then((s) => {
      if (!alive) return;
      setSeries(s);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [activityId]);

  if (!loaded || !series) return null;

  const zones = engine.hrZones;
  const avgBpm =
    series.hr.length > 0 ? series.hr.reduce((s, p) => s + p.bpm, 0) / series.hr.length : null;
  const zoneIdx = avgBpm != null ? zoneForHr(avgBpm, zones) : null;

  return (
    <>
      {series.hr.length >= 10 && (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Heart rate during the run</Text>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: spacing.sm }}>
            Beats per minute across the workout. Drag to inspect a moment.
            {avgBpm != null && zoneIdx != null
              ? ` The average of ${Math.round(avgBpm)} bpm sits in zone ${zoneIdx + 1}.`
              : ''}
          </Text>
          <TrendChart
            data={series.hr.map((p) => ({ x: p.t, y: p.bpm }))}
            width={width}
            height={160}
            color={zoneIdx != null ? zoneColors(theme)[zoneIdx] : theme.series.red}
            formatY={(v) => `${Math.round(v)} bpm`}
            formatX={(v) => `${Math.floor(v / 60)} min`}
            invertY={false}
          />
        </Card>
      )}

      {series.route.length >= 10 && (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Route</Text>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: spacing.sm }}>
            The shape of the run from GPS.
          </Text>
          <RouteShape route={series.route} width={width} color={theme.accent} />
        </Card>
      )}
    </>
  );
}

function RouteShape({
  route,
  width,
  color,
}: {
  route: { lat: number; lng: number }[];
  width: number;
  color: string;
}) {
  const theme = useAppTheme();
  const height = 200;
  const pad = 10;

  const lats = route.map((p) => p.lat);
  const lngs = route.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // meters-per-degree correction so the shape is not stretched
  const latScale = 1;
  const lngScale = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanLat = Math.max(1e-6, (maxLat - minLat) * latScale);
  const spanLng = Math.max(1e-6, (maxLng - minLng) * lngScale);
  const scale = Math.min((width - pad * 2) / spanLng, (height - pad * 2) / spanLat);
  const drawW = spanLng * scale;
  const drawH = spanLat * scale;
  const ox = (width - drawW) / 2;
  const oy = (height - drawH) / 2;

  // thin the polyline to ~300 points for render performance
  const step = Math.max(1, Math.floor(route.length / 300));
  const pts = route
    .filter((_, i) => i % step === 0)
    .map((p) => {
      const x = ox + (p.lng - minLng) * lngScale * scale;
      const y = oy + (maxLat - p.lat) * latScale * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const start = route[0];
  const sx = ox + (start.lng - minLng) * lngScale * scale;
  const sy = oy + (maxLat - start.lat) * latScale * scale;

  return (
    <View>
      <Svg width={width} height={height}>
        <Polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Polyline
          points={`${sx},${sy} ${sx},${sy}`}
          stroke={theme.status.good}
          strokeWidth={9}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
