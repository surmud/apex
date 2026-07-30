import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { TrendChart } from '../../components/charts/TrendChart';
import { DataTable } from '../../components/DataTable';
import { HowCalculated } from '../../components/HowCalculated';
import { PercentileCard } from '../../components/PercentileCard';
import { Card, Segmented } from '../../components/ui/primitives';
import { EngineOutput } from '../../lib/engine';
import { fmtPaceShort, fmtTemp } from '../../lib/format';
import { PercentileMetric, recentAveragePercentiles } from '../../lib/formulas/percentiles';
import { Explanation, UserProfile } from '../../lib/formulas/types';
import { useAppState } from '../../lib/state/AppState';
import { spacing, Theme, type } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

type Range = '30D' | '90D' | '180D' | 'ALL';
const RANGE_DAYS: Record<Range, number> = { '30D': 30, '90D': 90, '180D': 180, ALL: 10000 };

interface SeriesPoint {
  x: number;
  y: number;
  runId?: string;
}

interface MetricDef {
  title: string;
  unit: string;
  description: string;
  invertY?: boolean;
  color: (t: Theme) => string;
  formatY: (v: number, units: UserProfile['units']) => string;
  series: (engine: EngineOutput, cutoff: number) => SeriesPoint[];
  current: (engine: EngineOutput, units: UserProfile['units']) => string;
  explanation: (engine: EngineOutput) => Explanation | null | undefined;
}

const fromRuns = (
  engine: EngineOutput,
  cutoff: number,
  get: (e: EngineOutput['enriched'][number]) => number | null,
): SeriesPoint[] => {
  const out: SeriesPoint[] = [];
  for (const e of engine.enriched) {
    if (e.excluded || new Date(e.activity.startTime).getTime() < cutoff) continue;
    const y = get(e);
    if (y == null) continue;
    out.push({ x: new Date(e.activity.startTime).getTime(), y, runId: e.activity.id });
  }
  return out.reverse();
};

const METRICS: Record<string, MetricDef> = {
  pace: {
    title: 'Pace',
    unit: 'min/mi',
    description:
      'Your average pace for each run. Lower on the chart means faster. Pace naturally varies with the type of run, the terrain, and the weather, so look at the overall drift rather than any single day. A slow downward trend across easy runs is one of the clearest signs of improving fitness.',
    invertY: true,
    color: (t) => t.accent,
    formatY: (v, u) => fmtPaceShort(v, u),
    series: (e, c) => fromRuns(e, c, (r) => r.rawPaceSPerKm),
    current: (e, u) => (e.latest ? fmtPaceShort(e.latest.rawPaceSPerKm, u) : 'n/a'),
    explanation: (e) => e.latest?.adjustedPace?.explanation,
  },
  hr: {
    title: 'Heart rate',
    unit: 'bpm',
    description:
      'Your average heart rate for each run, in beats per minute. Read it together with pace: the same pace at a lower heart rate over time means your aerobic system is getting stronger. A rising heart rate at your usual easy pace can signal accumulated fatigue, heat, dehydration, or oncoming illness.',
    color: (t) => t.series.red,
    formatY: (v) => `${Math.round(v)}`,
    series: (e, c) => fromRuns(e, c, (r) => r.activity.avgHr),
    current: (e) => (e.latest?.activity.avgHr != null ? `${Math.round(e.latest.activity.avgHr)}` : 'n/a'),
    explanation: () => null,
  },
  cadence: {
    title: 'Cadence',
    unit: 'steps/min',
    description:
      'How many steps you take per minute, counting both feet. Most efficient recreational runners land between about 165 and 185. Cadence rises naturally as you run faster. A very low cadence at easy pace often means overstriding, which increases impact on every step.',
    color: (t) => t.series.violet,
    formatY: (v) => `${Math.round(v)}`,
    series: (e, c) => fromRuns(e, c, (r) => r.activity.avgCadence),
    current: (e) =>
      e.latest?.activity.avgCadence != null ? `${Math.round(e.latest.activity.avgCadence)}` : 'n/a',
    explanation: () => null,
  },
  temp: {
    title: 'Temperature',
    unit: '°F',
    description:
      'The air temperature at the start of each outdoor run. Performance research puts the ideal racing range around 40 to 55 F. Everything above that costs some pace, which is why Apex also computes a heat-adjusted pace for warm days.',
    color: (t) => t.series.orange,
    formatY: (v, u) => fmtTemp(v, u),
    series: (e, c) => fromRuns(e, c, (r) => r.weather?.tempC ?? null),
    current: (e, u) => (e.latest?.weather ? fmtTemp(e.latest.weather.tempC, u) : 'n/a'),
    explanation: () => null,
  },
  humidity: {
    title: 'Humidity',
    unit: '%',
    description:
      'Relative humidity at the start of each outdoor run. Humidity matters because it controls how well sweat evaporates, which is how your body sheds heat. The dew point captures this even better, which is why the Climate Score leans on it.',
    color: (t) => t.series.aqua,
    formatY: (v) => `${Math.round(v)}%`,
    series: (e, c) => fromRuns(e, c, (r) => r.weather?.humidityPct ?? null),
    current: (e) => (e.latest?.weather ? `${Math.round(e.latest.weather.humidityPct)}%` : 'n/a'),
    explanation: () => null,
  },
  climate: {
    title: 'Climate Score',
    unit: 'out of 100',
    description:
      'One number for how friendly the conditions were for running, from 0 to 100. It combines temperature and dew point, the two variables running research uses to predict slowdown, along with wind and cold. A score above 85 is ideal racing weather. Below about 55, the weather itself is costing you noticeable pace, so judge your splits accordingly.',
    color: (t) => t.series.aqua,
    formatY: (v) => `${Math.round(v)}`,
    series: (e, c) => fromRuns(e, c, (r) => r.climate?.value.score ?? null),
    current: (e) => {
      const latest = e.enriched.find((r) => r.climate);
      return latest?.climate ? `${latest.climate.value.score}` : 'n/a';
    },
    explanation: (e) => e.enriched.find((r) => r.climate)?.climate?.explanation,
  },
  vo2max: {
    title: 'VO2max estimate',
    unit: 'ml/kg/min',
    description:
      'An estimate of your aerobic engine size: how much oxygen your body can use per kilogram of body weight per minute. It is estimated from how fast you run at a given heart rate, so each dot is one run and the headline number is a rolling median of the last ten. Single-run values bounce around. The trend over months is the signal.',
    color: (t) => t.accent,
    formatY: (v) => v.toFixed(1),
    series: (e, c) => fromRuns(e, c, (r) => r.vo2max?.value ?? null),
    current: (e) => (e.currentVo2max != null ? e.currentVo2max.toFixed(1) : 'n/a'),
    explanation: (e) => e.enriched.find((r) => r.vo2max)?.vo2max?.explanation,
  },
  strain: {
    title: 'Session strain',
    unit: 'TRIMP points',
    description:
      'How much training stress each run produced, measured in TRIMP points. The score grows with both duration and intensity, so a short hard interval session and a long easy run can score similarly. It is the raw ingredient behind your load ratio and recovery windows.',
    color: (t) => t.series.magenta,
    formatY: (v) => v.toFixed(0),
    series: (e, c) => fromRuns(e, c, (r) => r.trimp?.value ?? null),
    current: (e) => (e.latest?.trimp ? e.latest.trimp.value.toFixed(0) : 'n/a'),
    explanation: (e) => e.latest?.trimp?.explanation,
  },
  efficiency: {
    title: 'Aerobic efficiency',
    unit: 'speed per heartbeat',
    description:
      'How much forward speed you get out of every heartbeat. It divides your speed by your heart rate, so the number climbs when you run faster at the same effort or hold the same pace at a lower heart rate. Compare like with like: easy runs against easy runs. Hot or hilly days will read low without meaning you lost fitness. A rising trend over weeks is one of the most reliable signs your aerobic base is improving.',
    color: (t) => t.series.aqua,
    formatY: (v) => v.toFixed(1),
    series: (e, c) => fromRuns(e, c, (r) => r.efficiency?.value ?? null),
    current: (e) => {
      const latest = e.enriched.find((r) => r.efficiency);
      return latest?.efficiency ? latest.efficiency.value.toFixed(1) : 'n/a';
    },
    explanation: (e) => e.enriched.find((r) => r.efficiency)?.efficiency?.explanation,
  },
  acwr: {
    title: 'Load ratio',
    unit: 'acute / chronic',
    description:
      'Your training load over the last 7 days divided by your average over the last 28. A ratio near 1.0 means you are training in line with what your body is used to. The research sweet spot is roughly 0.8 to 1.3. Above 1.5, injury risk rises sharply because you are stacking load faster than your body adapts. Below 0.8 for long stretches means you are detraining.',
    color: (t) => t.series.yellow,
    formatY: (v) => v.toFixed(2),
    series: (e, c) =>
      e.dailyLoads
        .filter((d) => d.acwr != null && new Date(d.date).getTime() >= c)
        .map((d) => ({ x: new Date(d.date).getTime(), y: d.acwr! })),
    current: (e) => (e.currentAcwr != null ? e.currentAcwr.toFixed(2) : 'n/a'),
    explanation: () => null,
  },
  form: {
    title: 'Form',
    unit: 'pts (fitness minus fatigue)',
    description:
      'A modeled readiness number: your long-term fitness minus your short-term fatigue, the same balance most platforms call training stress balance. Both sides are rolling averages of your daily strain, fitness over 42 days and fatigue over 7. Right after a hard block, form goes negative even though fitness is up, which is exactly why tapers work: fatigue drains away faster than fitness does, and form peaks on race day. Slightly negative is normal during training. Persistently below about minus 15 means you are digging a hole.',
    color: (t) => t.series.violet,
    formatY: (v) => `${v.toFixed(0)} pts`,
    series: (e, c) =>
      e.fitnessSeries
        .filter((d) => new Date(d.date).getTime() >= c)
        .map((d) => ({ x: new Date(d.date).getTime(), y: d.form })),
    current: (e) => {
      const last = e.fitnessSeries[e.fitnessSeries.length - 1];
      return last ? last.form.toFixed(0) : 'n/a';
    },
    explanation: () => null,
  },
  vertosc: {
    title: 'Vertical oscillation',
    unit: 'cm',
    description:
      'How much your torso bounces up and down with each stride, in centimeters. Less bounce generally means more of your energy goes forward instead of up. Elite runners typically sit around 6 to 8 cm. This metric comes from watches with running dynamics support.',
    invertY: true,
    color: (t) => t.series.orange,
    formatY: (v) => v.toFixed(1),
    series: (e, c) => fromRuns(e, c, (r) => r.activity.verticalOscillationCm),
    current: (e) => {
      const r = e.enriched.find((x) => x.activity.verticalOscillationCm != null);
      return r ? `${r.activity.verticalOscillationCm!.toFixed(1)}` : 'n/a';
    },
    explanation: () => null,
  },
  gct: {
    title: 'Ground contact time',
    unit: 'ms',
    description:
      'How long each foot stays on the ground per step, in milliseconds. Shorter contact usually accompanies faster, more elastic running. Recreational runners typically land between 240 and 300 ms, and the number drops as pace rises. Watch the trend at similar paces rather than the absolute value.',
    invertY: true,
    color: (t) => t.series.magenta,
    formatY: (v) => `${Math.round(v)}`,
    series: (e, c) => fromRuns(e, c, (r) => r.activity.groundContactMs),
    current: (e) => {
      const r = e.enriched.find((x) => x.activity.groundContactMs != null);
      return r ? `${Math.round(r.activity.groundContactMs!)}` : 'n/a';
    },
    explanation: () => null,
  },
  stride: {
    title: 'Stride length',
    unit: 'm',
    description:
      'The distance you cover with each step, in meters. Stride length times cadence equals your speed, so it rises with pace. Meaningful gains in stride length at the same effort usually come from improved strength and elasticity rather than consciously reaching further forward, which tends to cause overstriding.',
    color: (t) => t.series.blue,
    formatY: (v) => v.toFixed(2),
    series: (e, c) => fromRuns(e, c, (r) => r.activity.strideLengthM),
    current: (e) => {
      const r = e.enriched.find((x) => x.activity.strideLengthM != null);
      return r ? r.activity.strideLengthM!.toFixed(2) : 'n/a';
    },
    explanation: () => null,
  },
  power: {
    title: 'Running power',
    unit: 'W',
    description:
      'The mechanical work rate of your running, in watts. Unlike pace, power responds instantly to hills and wind, so it is a steadier measure of effort across varied terrain. Comparing power to pace over time also hints at running economy: more speed from the same watts means you are getting more efficient.',
    color: (t) => t.series.yellow,
    formatY: (v) => `${Math.round(v)}`,
    series: (e, c) => fromRuns(e, c, (r) => r.activity.runningPowerW),
    current: (e) => {
      const r = e.enriched.find((x) => x.activity.runningPowerW != null);
      return r ? `${Math.round(r.activity.runningPowerW!)}` : 'n/a';
    },
    explanation: () => null,
  },
  mileage: {
    title: 'Weekly mileage',
    unit: 'mi/week',
    description:
      'Total distance per calendar week. Volume is the single biggest driver of endurance adaptation, and also the variable most tied to injury when it jumps too fast. The common guideline is to grow it no more than about 10 percent per week, with a lighter cutback week every third or fourth week.',
    color: (t) => t.accent,
    formatY: (v, u) => (u === 'mi_f' ? `${v.toFixed(0)}` : `${(v * 1.609).toFixed(0)}`),
    series: (e, c) => {
      const byWeek = new Map<string, number>();
      for (const r of e.enriched) {
        const t = new Date(r.activity.startTime).getTime();
        if (t < c) continue;
        const d = new Date(t);
        const monday = new Date(d);
        monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        const key = monday.toISOString().slice(0, 10);
        byWeek.set(key, (byWeek.get(key) ?? 0) + r.activity.distanceM / 1609.344);
      }
      return [...byWeek.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => ({ x: new Date(k).getTime(), y: v }));
    },
    current: (e) => `${Math.round(e.currentMpw)}`,
    explanation: () => null,
  },
};

export default function MetricDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const theme = useAppTheme();
  const { engine, profile } = useAppState();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 640) - spacing.lg * 2;
  const [range, setRange] = useState<Range>('90D');

  const def = METRICS[key ?? ''];
  const series = useMemo(() => {
    if (!def) return [];
    const cutoff = Date.now() - RANGE_DAYS[range] * 86400000;
    return def.series(engine, cutoff);
  }, [def, engine, range]);

  if (!def) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.textSecondary }}>Unknown metric</Text>
      </View>
    );
  }

  const avg = series.length ? series.reduce((s, p) => s + p.y, 0) / series.length : null;
  const explanation = def.explanation(engine);
  const tableRows = [...series].reverse().map((p) => ({
    label: new Date(p.x).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }),
    value: def.formatY(p.y, profile.units),
    runId: p.runId,
  }));

  return (
    <>
      <Stack.Screen options={{ title: def.title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.page }}
        contentContainerStyle={{ padding: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 40 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing.md }}>
          <View>
            <Text style={[type.microLabel, { color: theme.textMuted }]}>Current ({def.unit})</Text>
            <Text style={[type.hero, { color: theme.textPrimary }]}>{def.current(engine, profile.units)}</Text>
          </View>
          {avg != null && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.microLabel, { color: theme.textMuted }]}>{range} average</Text>
              <Text style={[type.stat, { color: theme.textSecondary }]}>{def.formatY(avg, profile.units)}</Text>
            </View>
          )}
        </View>

        <Segmented
          options={(['30D', '90D', '180D', 'ALL'] as Range[]).map((r) => ({ key: r, label: r }))}
          value={range}
          onChange={setRange}
        />

        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm }}>
            Touch or drag on the chart to inspect a point.
          </Text>
          <TrendChart
            data={series}
            width={contentW - spacing.lg * 2}
            height={260}
            color={def.color(theme)}
            formatY={(v) => def.formatY(v, profile.units)}
            invertY={def.invertY}
          />
          <DataTable rows={tableRows} />
        </Card>

        {(['cadence', 'vertosc', 'gct', 'stride'] as string[]).includes(key ?? '') && (
          <PercentileCard
            results={recentAveragePercentiles(
              engine.enriched.filter((e) => !e.excluded).map((e) => e.activity),
              profile,
            ).filter((r) => r.metric === (key as PercentileMetric))}
            title="You vs the running population"
          />
        )}

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[type.microLabel, { color: theme.textMuted, marginBottom: 6 }]}>
            What this measures
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 20 }}>{def.description}</Text>
          {explanation && <HowCalculated compact explanations={[explanation]} />}
        </Card>
      </ScrollView>
    </>
  );
}
