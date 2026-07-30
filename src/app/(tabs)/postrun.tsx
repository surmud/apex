import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIInsightCard } from '../../components/AIInsightCard';
import { HowCalculated } from '../../components/HowCalculated';
import { LastRunCharts } from '../../components/LastRunCharts';
import { NextRunOutlook } from '../../components/NextRunOutlook';
import { PercentileCard } from '../../components/PercentileCard';
import { QualityFlags } from '../../components/QualityFlags';
import { RunCard } from '../../components/RunCard';
import { Badge, Card, Pill, SectionTitle, statusColor } from '../../components/ui/primitives';
import { fmtDateTime, fmtDistance, fmtElevation, fmtPaceSPerKm, fmtTemp } from '../../lib/format';
import { label as typeLabel } from '../../lib/formulas/classifier';
import { populationPercentiles } from '../../lib/formulas/percentiles';
import { WorkoutType } from '../../lib/formulas/types';
import { useAppState } from '../../lib/state/AppState';
import { spacing, type, workoutTypeColor } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

const ALL_TYPES: WorkoutType[] = ['easy', 'tempo', 'interval', 'long', 'race'];

export default function PostRun() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { engine, profile, correctWorkoutType } = useAppState();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 640) - spacing.lg * 2;
  const [editing, setEditing] = useState(false);

  const latest = engine.latest;
  const extras = engine.latestExtras;

  if (!latest) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 16, textAlign: 'center' }}>
          No runs yet. Connect Strava or load demo data from Settings.
        </Text>
      </View>
    );
  }

  const a = latest.activity;
  const tColor = workoutTypeColor(latest.workoutType, theme);
  const sColor = statusColor(engine.currentAcwrStatus, theme);

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
      {/* Header */}
      <View style={{ marginBottom: spacing.md }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          Your last run
        </Text>
        <Text style={[type.title, { color: theme.textPrimary }]}>{a.name}</Text>
        <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
          {fmtDistance(a.distanceM, profile.units)} on {fmtDateTime(a.startTime)}
          {latest.weather
            ? `, ${fmtTemp(latest.weather.tempC, profile.units)} and ${Math.round(latest.weather.humidityPct)}% humidity`
            : ''}
        </Text>
        {latest.climate && (
          <Pressable
            onPress={() => router.push({ pathname: '/metric/[key]', params: { key: 'climate' } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor:
                  latest.climate.value.score >= 70
                    ? theme.status.good
                    : latest.climate.value.score >= 55
                      ? theme.status.warning
                      : theme.status.serious,
              }}
            />
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>
              Climate Score {latest.climate.value.score} ({latest.climate.value.label})
              {latest.climate.value.pacePenaltyPct > 0
                ? `, about ${latest.climate.value.pacePenaltyPct.toFixed(1)}% pace cost`
                : ''}
            </Text>
          </Pressable>
        )}
      </View>

      {/* AI Insight */}
      <AIInsightCard />

      {/* Detected type + correction */}
      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.microLabel, { color: theme.textMuted }]}>
              Detected workout type{latest.workoutTypeSource === 'user_corrected' ? ' (corrected by you)' : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Badge label={typeLabel(latest.workoutType)} color={tColor} />
            </View>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6 }}>
              {latest.classification.rationale}
            </Text>
          </View>
          <Pressable onPress={() => setEditing(!editing)} hitSlop={8}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>
        {editing && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md }}>
            {ALL_TYPES.map((t) => (
              <Pill
                key={t}
                label={typeLabel(t)}
                selected={latest.workoutType === t}
                color={workoutTypeColor(t, theme)}
                onPress={() => {
                  correctWorkoutType(a.id, t);
                  setEditing(false);
                }}
              />
            ))}
          </View>
        )}
        <HowCalculated compact explanations={[latest.classification.explanation]} />
      </Card>

      {/* Summary stats */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <Card style={{ flex: 1 }}>
          <Text style={[type.microLabel, { color: theme.textMuted }]}>Avg pace</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: theme.textPrimary, fontVariant: ['tabular-nums'] }}>
            {fmtPaceSPerKm(latest.rawPaceSPerKm, profile.units)}
          </Text>
          {latest.adjustedPace && latest.adjustedPace.value < latest.rawPaceSPerKm - 2 && (
            <Text style={{ fontSize: 11, color: theme.textMuted }}>
              {fmtPaceSPerKm(latest.adjustedPace.value, profile.units)} heat-adjusted
            </Text>
          )}
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={[type.microLabel, { color: theme.textMuted }]}>Avg HR</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: theme.textPrimary, fontVariant: ['tabular-nums'] }}>
            {a.avgHr != null ? `${Math.round(a.avgHr)}` : 'n/a'}
          </Text>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>
            {fmtElevation(a.elevationGainM, profile.units)} gain
          </Text>
        </Card>
      </View>

      {/* Per-second detail: heart rate trace and route shape (Apple Health runs) */}
      <LastRunCharts activityId={a.id} width={contentW - spacing.lg * 2} />

      <QualityFlags flags={latest.flags} detailed />

      {/* Population comparison for this run's form metrics */}
      <PercentileCard results={populationPercentiles(a, profile)} title="This run vs the running population" />

      {/* Strain */}
      {latest.trimp && extras && (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Session strain</Text>
          <Text style={[type.hero, { color: theme.textPrimary }]}>{latest.trimp.value.toFixed(0)}</Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>
            {strainLabel(extras.strainPercentile)}. Harder than {extras.strainPercentile} percent of your
            last 30 runs.
          </Text>
          <HowCalculated compact explanations={[latest.trimp.explanation]} />
        </Card>
      )}

      {/* Recovery */}
      {extras && (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Recommended recovery</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: theme.textPrimary, marginTop: 4 }}>
            {extras.recovery.value.minHours} to {extras.recovery.value.maxHours} hours easy or rest
          </Text>
          <HowCalculated compact explanations={[extras.recovery.explanation]} />
        </Card>
      )}

      {/* ---- Looking ahead ---- */}
      <SectionTitle>Looking ahead</SectionTitle>

      {/* Weather outlook for the next run */}
      <NextRunOutlook />

      {/* Next workout */}
      {extras && (
        <Card style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Suggested next workout</Text>
            <Badge
              label={engine.currentAcwrStatus === 'optimal' ? 'load optimal' : engine.currentAcwrStatus.replace('_', ' ')}
              color={sColor}
              subtle
            />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginTop: 4 }}>
            {extras.nextWorkout.description}
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>{extras.nextWorkout.reason}</Text>
        </Card>
      )}

      {/* Recent runs */}
      <SectionTitle>Recent runs</SectionTitle>
      {engine.enriched.slice(1, 8).map((run) => (
        <RunCard key={run.activity.id} run={run} profile={profile} />
      ))}
    </ScrollView>
  );
}

function strainLabel(pctile: number): string {
  if (pctile >= 90) return 'Very hard';
  if (pctile >= 70) return 'Moderately hard';
  if (pctile >= 40) return 'Moderate';
  return 'Light';
}
