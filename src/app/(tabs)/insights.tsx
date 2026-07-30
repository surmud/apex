import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart } from '../../components/charts/BarChart';
import { ScatterChart } from '../../components/charts/ScatterChart';
import { StackedBars } from '../../components/charts/StackedBars';
import { DataTable } from '../../components/DataTable';
import { PercentileCard } from '../../components/PercentileCard';
import { CountUp } from '../../components/ui/CountUp';
import { Card, SectionTitle, StatValue } from '../../components/ui/primitives';
import { fmtDistance, fmtElevation } from '../../lib/format';
import { recentAveragePercentiles } from '../../lib/formulas/percentiles';
import { fitRiegelExponent } from '../../lib/formulas/riegel';
import { zoneForHr } from '../../lib/formulas/zones';
import { useAppState } from '../../lib/state/AppState';
import { spacing, workoutTypeColor, zoneColors } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

function ExpandableChart({ metricKey, children }: { metricKey: string; children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={() => router.push({ pathname: '/metric/[key]', params: { key: metricKey } })}>
      <Card>
        <View style={{ alignItems: 'flex-end', marginBottom: 2 }}>
          <Text style={{ fontSize: 12, color: theme.accent, fontWeight: '600' }}>Expand</Text>
        </View>
        {children}
      </Card>
    </Pressable>
  );
}

export default function Insights() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { engine, profile, courses } = useAppState();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 640) - spacing.lg * 2;
  const chartW = contentW - spacing.lg * 2;

  const formPercentiles = useMemo(
    () =>
      recentAveragePercentiles(
        engine.enriched.filter((e) => !e.excluded).map((e) => e.activity),
        profile,
      ),
    [engine.enriched, profile],
  );

  // monthly mileage, last 12 months
  const monthly = useMemo(() => {
    const byMonth = new Map<string, { m: number; hasRace: boolean }>();
    for (const e of engine.enriched) {
      const key = e.activity.startTime.slice(0, 7);
      const cur = byMonth.get(key) ?? { m: 0, hasRace: false };
      cur.m += e.activity.distanceM;
      if (e.workoutType === 'race') cur.hasRace = true;
      byMonth.set(key, cur);
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([k, v]) => ({
        label: new Date(`${k}-15`).toLocaleDateString(undefined, { month: 'narrow' }),
        value: profile.units === 'mi_f' ? v.m / 1609.344 : v.m / 1000,
        highlighted: v.hasRace,
      }));
  }, [engine.enriched, profile.units]);

  // efficiency scatter
  const effPoints = useMemo(
    () =>
      engine.enriched
        .filter((e) => e.efficiency && !e.excluded)
        .map((e) => ({ x: new Date(e.activity.startTime).getTime(), y: e.efficiency!.value }))
        .reverse(),
    [engine.enriched],
  );

  // HR zone distribution per run, using the runner's actual zone boundaries
  const zoneRuns = useMemo(
    () => engine.enriched.filter((e) => e.activity.avgHr != null && !e.excluded).slice(0, 40).reverse(),
    [engine.enriched],
  );
  const zoneRows = useMemo(
    () =>
      zoneRuns.map((e) => {
        const zoneCenter = Math.max(0, zoneForHr(e.activity.avgHr!, engine.hrZones) - 1);
        const fr = [0.05, 0.05, 0.05, 0.05, 0.05];
        fr[zoneCenter] += 0.55;
        if (zoneCenter > 0) fr[zoneCenter - 1] += 0.15;
        if (zoneCenter < 4) fr[zoneCenter + 1] += 0.1;
        return { fractions: fr };
      }),
    [zoneRuns, engine.hrZones],
  );

  const races = engine.enriched.filter((e) => e.workoutType === 'race');

  // Heat impact: easy runs only (comparable effort), pace vs temp+dewpoint
  const heatPoints = useMemo(
    () =>
      engine.enriched
        .filter((e) => !e.excluded && e.workoutType === 'easy' && e.weather)
        .map((e) => ({
          x: e.weather!.tempC * 1.8 + 32 + (e.weather!.dewpointC * 1.8 + 32),
          y: e.rawPaceSPerKm * (profile.units === 'mi_f' ? 1.609344 : 1),
        })),
    [engine.enriched, profile.units],
  );

  // Distance fade: pace vs distance across all clean runs, log-x view
  const fadePoints = useMemo(
    () =>
      engine.enriched
        .filter((e) => !e.excluded && e.activity.distanceM >= 2000)
        .map((e) => ({
          x: e.activity.distanceM / 1609.344,
          y: e.rawPaceSPerKm * (profile.units === 'mi_f' ? 1.609344 : 1),
        })),
    [engine.enriched, profile.units],
  );
  const fadeK = useMemo(() => fitRiegelExponent(engine.bestEfforts), [engine.bestEfforts]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.page }}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingTop: insets.top + spacing.md,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
        paddingBottom: 40,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.textPrimary, marginBottom: spacing.md }}>
        Insights
      </Text>

      <Card>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
          All time, since your first synced run
        </Text>
        <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
          <AnimatedStat label="Total distance (mi)" value={engine.totals.distanceM / 1609.344} format={(v) => Math.round(v).toLocaleString()} />
          <AnimatedStat label="Total runs" value={engine.totals.runs} format={(v) => `${Math.round(v)}`} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          <AnimatedStat label="Moving time (hr)" value={engine.totals.movingTimeS / 3600} format={(v) => Math.round(v).toLocaleString()} />
          <AnimatedStat label="Elevation (ft)" value={engine.totals.elevationGainM * 3.28084} format={(v) => Math.round(v).toLocaleString()} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
          <StatValue label="Longest run" value={fmtDistance(engine.totals.longestM, profile.units)} />
          <AnimatedStat label="Races" value={engine.totals.races} format={(v) => `${Math.round(v)}`} />
        </View>
      </Card>

      <SectionTitle>How much are you running?</SectionTitle>
      <ExpandableChart metricKey="mileage">
        <BarChart bars={monthly} width={chartW} formatValue={(v) => `${Math.round(v)}`} />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
          <LegendDot color={theme.accent} label={profile.units === 'mi_f' ? 'miles per month' : 'km per month'} theme={theme} />
          <LegendDot color={theme.series.magenta} label="race month" theme={theme} />
        </View>
      </ExpandableChart>

      <SectionTitle>Is your engine getting stronger?</SectionTitle>
      <ExpandableChart metricKey="efficiency">
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
          Each dot is one run's aerobic efficiency, the speed you got out of every heartbeat. When the
          trend line climbs, you are covering more ground for the same cardiac effort, which is the
          textbook signature of a growing aerobic base.
        </Text>
        <ScatterChart
          data={effPoints}
          width={chartW}
          formatY={(v) => v.toFixed(1)}
          trendLabel={(slopePerDay) =>
            `${slopePerDay >= 0 ? '+' : ''}${((slopePerDay * 30) ).toFixed(2)} per month`
          }
        />
      </ExpandableChart>

      <SectionTitle>Where does your effort go?</SectionTitle>
      <Card>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm }}>
          Your last 40 runs, oldest to newest, colored by heart rate zone. Most healthy training is
          bottom-heavy: lots of blue and green with occasional orange and red. Zones use your boundaries of{' '}
          {engine.hrZones.slice(0, 5).join(', ')} and {engine.hrZones[5]} bpm. You can recalculate them from
          your own data in Settings.
        </Text>
        <StackedBars
          rows={zoneRows}
          segmentLabels={['Z1 recovery', 'Z2 aerobic', 'Z3 tempo', 'Z4 threshold', 'Z5 max']}
          colors={[...zoneColors(theme)]}
          width={chartW}
        />
        <DataTable
          rows={zoneRuns
            .slice()
            .reverse()
            .map((e) => ({
              label: new Date(e.activity.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
              value: `${Math.round(e.activity.avgHr!)} bpm, zone ${Math.max(1, zoneForHr(e.activity.avgHr!, engine.hrZones))}`,
              runId: e.activity.id,
            }))}
        />
      </Card>

      <SectionTitle>How much does weather cost you?</SectionTitle>
      <ExpandableChart metricKey="climate">
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
          Easy runs only, so effort is comparable across days. The x axis adds temperature and dew point
          in Fahrenheit, the combination running research uses to predict slowdown. Above about 100
          combined, heat starts costing pace. The slope of the fitted line is your personal heat
          sensitivity, and the Climate Score on the dashboard is built from the same inputs.
        </Text>
        <ScatterChart
          data={heatPoints}
          width={chartW}
          formatY={(v) => fmtPaceMin(v)}
          formatX={(v) => `${Math.round(v)}`}
          trendLabel={(slope) => `${slope >= 0 ? '+' : ''}${(slope * 10).toFixed(0)} sec per 10 pts`}
          invertY
        />
      </ExpandableChart>

      <SectionTitle>How does your pace hold up with distance?</SectionTitle>
      <Card>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
          Every clean run, plotted as pace against distance. Everyone slows down as the distance grows.
          The question is how steeply. Your fitted endurance exponent is {fadeK.k.toFixed(3)}
          {fadeK.fitted
            ? ', measured from your own race history. Values near 1.05 mean your pace holds up well as distance grows. Higher values mean a steeper fade and usually point to more long-run volume as the fix.'
            : '. That is the population default. Race at two different distances and Apex will measure your personal fade.'}
        </Text>
        <ScatterChart
          data={fadePoints}
          width={chartW}
          formatY={(v) => fmtPaceMin(v)}
          formatX={(v) => `${v.toFixed(0)} mi`}
          invertY
        />
        <DataTable
          rows={[...fadePoints]
            .sort((a, b) => a.x - b.x)
            .map((pt) => ({ label: `${pt.x.toFixed(1)} mi`, value: `${fmtPaceMin(pt.y)}/mi` }))}
        />
      </Card>

      {formPercentiles.length > 0 && (
        <>
          <SectionTitle>How does your form compare?</SectionTitle>
          <PercentileCard
            results={formPercentiles}
            title="Your recent averages vs the running population"
          />
        </>
      )}

      <SectionTitle>Race calendar</SectionTitle>
      <Card>
        {courses.filter((c) => c.raceDate).length === 0 && races.length === 0 ? (
          <Text style={{ fontSize: 13, color: theme.textMuted }}>
            No races yet. Add a course with a race date in Projections.
          </Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {courses
              .filter((c) => c.raceDate)
              .map((c) => (
                <Text key={c.id} style={{ fontSize: 14, color: theme.textPrimary }}>
                  <Text style={{ fontWeight: '700' }}>{c.name}</Text>,{' '}
                  {new Date(c.raceDate!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              ))}
            {races.slice(0, 6).map((r) => (
              <Text key={r.activity.id} style={{ fontSize: 13, color: theme.textSecondary }}>
                <Text style={{ color: workoutTypeColor('race', theme) }}>●</Text> {r.activity.name} ·{' '}
                {new Date(r.activity.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
                {fmtDistance(r.activity.distanceM, profile.units)}
              </Text>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

function AnimatedStat({ label, value, format }: { label: string; value: number; format: (v: number) => string }) {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>{label}</Text>
      <CountUp
        value={value}
        format={format}
        style={{ fontSize: 24, fontWeight: '700', color: theme.textPrimary, fontVariant: ['tabular-nums'] } as any}
      />
    </View>
  );
}

function fmtPaceMin(sPerUnit: number): string {
  const m = Math.floor(sPerUnit / 60);
  const s = Math.round(sPerUnit % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function LegendDot({ color, label, theme }: { color: string; label: string; theme: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: theme.textSecondary }}>{label}</Text>
    </View>
  );
}
