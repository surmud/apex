import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MultiLine } from '../../components/charts/MultiLine';
import { Sparkline } from '../../components/charts/Sparkline';
import { TrendChart } from '../../components/charts/TrendChart';
import { CountUp } from '../../components/ui/CountUp';
import { LogoLockup } from '../../components/ui/Logo';
import { Badge, Card, Segmented, statusColor } from '../../components/ui/primitives';
import { EnrichedActivity } from '../../lib/engine';
import { fmtPaceShort, fmtRelativeTime, fmtTemp } from '../../lib/format';
import { ACWR_STATUS_LABEL } from '../../lib/formulas/acwr';
import { useAppState } from '../../lib/state/AppState';
import { spacing, type } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

type Range = '7D' | '30D' | '90D' | 'ALL';
const RANGE_DAYS: Record<Range, number> = { '7D': 7, '30D': 30, '90D': 90, ALL: 10000 };

export default function Dashboard() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { engine, profile, sync, syncNow, source } = useAppState();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 640) - spacing.lg * 2;
  const [range, setRange] = useState<Range>('30D');

  const inRange = useMemo(() => {
    const cutoff = Date.now() - RANGE_DAYS[range] * 86400000;
    return engine.enriched
      .filter((e) => new Date(e.activity.startTime).getTime() >= cutoff && !e.excluded)
      .reverse(); // oldest first for charts
  }, [engine.enriched, range]);

  const paceSeries = inRange.map((e) => ({
    x: new Date(e.activity.startTime).getTime(),
    y: e.rawPaceSPerKm,
  }));

  const mini = (get: (e: EnrichedActivity) => number | null) =>
    inRange
      .map((e) => ({ x: new Date(e.activity.startTime).getTime(), y: get(e) }))
      .filter((p): p is { x: number; y: number } => p.y != null);

  const hrSeries = mini((e) => e.activity.avgHr);
  const cadSeries = mini((e) => e.activity.avgCadence);
  const tempSeries = mini((e) => e.weather?.tempC ?? null);
  const climateSeries = mini((e) => e.climate?.value.score ?? null);

  const sColor = statusColor(engine.currentAcwrStatus, theme);
  const avg = (pts: { y: number }[]) =>
    pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : null;

  const miniCards = [
    { key: 'climate', title: 'Climate Score', pts: climateSeries, fmt: (v: number) => `${Math.round(v)} / 100`, color: theme.series.aqua },
    { key: 'hr', title: 'Heart rate', pts: hrSeries, fmt: (v: number) => `${Math.round(v)} bpm`, color: theme.series.red },
    { key: 'cadence', title: 'Cadence', pts: cadSeries, fmt: (v: number) => `${Math.round(v)} spm`, color: theme.series.violet },
    { key: 'temp', title: 'Temperature', pts: tempSeries, fmt: (v: number) => fmtTemp(v, profile.units), color: theme.series.orange },
  ] as const;

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
      refreshControl={
        <RefreshControl refreshing={sync.phase !== 'idle' && sync.phase !== 'error'} onRefresh={syncNow} tintColor={theme.accent} />
      }
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <View>
          <LogoLockup size={30} />
          <Pressable onPress={syncNow}>
            <Text style={{ fontSize: 12, color: theme.textMuted }}>
              {sync.phase === 'idle' && `${source === 'demo' ? 'Demo data. ' : ''}Synced ${fmtRelativeTime(sync.lastSyncedAt)}. Tap to sync.`}
              {sync.phase === 'backfill' && `Syncing, ${sync.count} activities so far`}
              {sync.phase === 'weather' && `Attaching weather, ${sync.done} of ${sync.total}`}
              {sync.phase === 'error' && `Sync problem: ${sync.message}. Tap to retry.`}
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>Settings</Text>
        </Pressable>
      </View>

      <Segmented
        options={(['7D', '30D', '90D', 'ALL'] as Range[]).map((r) => ({ key: r, label: r }))}
        value={range}
        onChange={setRange}
      />

      {/* Headline cards */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/metric/[key]', params: { key: 'vo2max' } })}>
          <Card>
            <Text style={[type.microLabel, { color: theme.textMuted }]}>VO2max (ml/kg/min)</Text>
            {engine.currentVo2max != null ? (
              <CountUp
                value={engine.currentVo2max}
                format={(v) => v.toFixed(1)}
                style={[type.stat, { color: theme.textPrimary, marginTop: 2 }] as any}
              />
            ) : (
              <Text style={[type.stat, { color: theme.textPrimary, marginTop: 2 }]}>n/a</Text>
            )}
            {engine.vo2maxDelta30d != null ? (
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: engine.vo2maxDelta30d >= 0 ? theme.deltaGood : theme.textMuted,
                }}
              >
                {engine.vo2maxDelta30d >= 0 ? '+' : ''}
                {engine.vo2maxDelta30d.toFixed(1)} vs 30 days ago
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: theme.textMuted }}>History builds over time</Text>
            )}
          </Card>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/metric/[key]', params: { key: 'acwr' } })}>
          <Card>
            <Text style={[type.microLabel, { color: theme.textMuted }]}>Load ratio (7d / 28d)</Text>
            {engine.currentAcwr != null ? (
              <CountUp
                value={engine.currentAcwr}
                format={(v) => v.toFixed(2)}
                style={[type.stat, { color: theme.textPrimary, marginTop: 2 }] as any}
              />
            ) : (
              <Text style={[type.stat, { color: theme.textPrimary, marginTop: 2 }]}>n/a</Text>
            )}
            <Badge label={ACWR_STATUS_LABEL[engine.currentAcwrStatus]} color={sColor} subtle />
          </Card>
        </Pressable>
      </View>

      {/* Pace trend */}
      <Pressable onPress={() => router.push({ pathname: '/metric/[key]', params: { key: 'pace' } })}>
        <Card style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Where is your pace heading?</Text>
            <Text style={{ fontSize: 12, color: theme.accent, fontWeight: '600' }}>Expand</Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm }}>
            Lower is faster. Drag on the chart to inspect a run.
          </Text>
          <TrendChart
            data={paceSeries}
            width={contentW - spacing.lg * 2}
            formatY={(v) => fmtPaceShort(v, profile.units)}
            invertY
          />
        </Card>
      </Pressable>

      {/* Fitness, fatigue, form: the classic training load picture */}
      {engine.fitnessSeries.length > 7 && (
        <Pressable onPress={() => router.push({ pathname: '/metric/[key]', params: { key: 'form' } })}>
          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Fitness, fatigue, and form</Text>
              <Text style={{ fontSize: 12, color: theme.accent, fontWeight: '600' }}>Expand</Text>
            </View>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm }}>
              Fitness builds slowly and decays slowly. Fatigue spikes and clears. Form is the gap
              between them, and it peaks when fatigue drains during a taper.
            </Text>
            <MultiLine
              series={(() => {
                const cutoff = Date.now() - Math.min(RANGE_DAYS[range], 120) * 86400000;
                const pts = engine.fitnessSeries.filter((d) => new Date(d.date).getTime() >= cutoff);
                return [
                  { name: 'Fitness', color: theme.series.blue, points: pts.map((d) => ({ x: new Date(d.date).getTime(), y: d.fitness })) },
                  { name: 'Fatigue', color: theme.series.orange, points: pts.map((d) => ({ x: new Date(d.date).getTime(), y: d.fatigue })) },
                  { name: 'Form', color: theme.series.violet, points: pts.map((d) => ({ x: new Date(d.date).getTime(), y: d.form })) },
                ];
              })()}
              width={contentW - spacing.lg * 2}
              formatY={(v) => v.toFixed(0)}
              invertY={false}
            />
          </Card>
        </Pressable>
      )}

      {/* Mini trend grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }}>
        {miniCards.map((c) => {
          const a = avg(c.pts);
          return (
            <Pressable
              key={c.key}
              style={{ width: (contentW - spacing.md) / 2 - 0.5 }}
              onPress={() => router.push({ pathname: '/metric/[key]', params: { key: c.key } })}
            >
              <Card>
                <Text style={[type.microLabel, { color: theme.textMuted }]}>{c.title}</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginVertical: 4, fontVariant: ['tabular-nums'] }}>
                  {a != null ? c.fmt(a) : 'n/a'}
                </Text>
                <Sparkline data={c.pts} width={(contentW - spacing.md) / 2 - spacing.lg * 2} color={c.color} />
              </Card>
            </Pressable>
          );
        })}
      </View>

      {/* Secondary metrics row */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        {(
          [
            { key: 'strain', label: 'Strain history' },
            { key: 'efficiency', label: 'Efficiency' },
            { key: 'mileage', label: 'Mileage' },
          ] as const
        ).map((m) => (
          <Pressable
            key={m.key}
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/metric/[key]', params: { key: m.key } })}
          >
            <Card style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>{m.label}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
