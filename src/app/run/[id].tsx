import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { HowCalculated } from '../../components/HowCalculated';
import { PercentileCard } from '../../components/PercentileCard';
import { QualityFlags } from '../../components/QualityFlags';
import { Badge, Card, Pill } from '../../components/ui/primitives';
import { fmtDateTime, fmtDistance, fmtDuration, fmtElevation, fmtPaceSPerKm, fmtTemp } from '../../lib/format';
import { label as typeLabel } from '../../lib/formulas/classifier';
import { populationPercentiles } from '../../lib/formulas/percentiles';
import { WorkoutType } from '../../lib/formulas/types';
import { useAppState } from '../../lib/state/AppState';
import { spacing, workoutTypeColor } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

const ALL_TYPES: WorkoutType[] = ['easy', 'tempo', 'interval', 'long', 'race'];

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useAppTheme();
  const { engine, profile, correctWorkoutType } = useAppState();
  const [editing, setEditing] = useState(false);

  const run = engine.enriched.find((e) => e.activity.id === id);
  if (!run) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.textSecondary }}>Run not found</Text>
      </View>
    );
  }

  const a = run.activity;
  const rows: [string, string][] = [
    ['Distance', fmtDistance(a.distanceM, profile.units)],
    ['Moving time', fmtDuration(a.movingTimeS)],
    ['Pace', fmtPaceSPerKm(run.rawPaceSPerKm, profile.units)],
    ['Elevation gain', fmtElevation(a.elevationGainM, profile.units)],
    ['Avg HR', a.avgHr != null ? `${Math.round(a.avgHr)} bpm` : 'n/a'],
    ['Max HR', a.maxHr != null ? `${Math.round(a.maxHr)} bpm` : 'n/a'],
    ['Cadence', a.avgCadence != null ? `${Math.round(a.avgCadence)} spm` : 'n/a'],
  ];
  if (run.weather) {
    rows.push(
      ['Temperature', fmtTemp(run.weather.tempC, profile.units)],
      ['Humidity', `${Math.round(run.weather.humidityPct)}%`],
      ['Dewpoint', fmtTemp(run.weather.dewpointC, profile.units)],
      ['Wind', `${(run.weather.windMs * 2.237).toFixed(0)} mph`],
    );
  }
  if (run.climate) rows.push(['Climate Score', `${run.climate.value.score} of 100 (${run.climate.value.label})`]);
  if (a.verticalOscillationCm != null) rows.push(['Vertical oscillation', `${a.verticalOscillationCm.toFixed(1)} cm`]);
  if (a.groundContactMs != null) rows.push(['Ground contact time', `${Math.round(a.groundContactMs)} ms`]);
  if (a.strideLengthM != null) rows.push(['Stride length', `${a.strideLengthM.toFixed(2)} m`]);
  if (a.runningPowerW != null) rows.push(['Running power', `${Math.round(a.runningPowerW)} W`]);
  if (run.trimp) rows.push(['Strain (TRIMP)', `${run.trimp.value.toFixed(0)} pts`]);
  if (run.efficiency) rows.push(['Efficiency factor', run.efficiency.value.toFixed(1)]);
  if (run.vo2max) rows.push(['VO2max estimate', `${run.vo2max.value.toFixed(1)} ml/kg/min`]);
  if (run.adjustedPace) rows.push(['Heat-adjusted pace', fmtPaceSPerKm(run.adjustedPace.value, profile.units)]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.page }}
      contentContainerStyle={{ padding: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 40 }}
    >
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.textPrimary }}>{a.name}</Text>
      <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 2, marginBottom: spacing.md }}>
        {fmtDateTime(a.startTime)}
      </Text>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Badge label={typeLabel(run.workoutType)} color={workoutTypeColor(run.workoutType, theme)} />
          <Pressable onPress={() => setEditing(!editing)}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>{editing ? 'Done' : 'Edit type'}</Text>
          </Pressable>
        </View>
        {editing && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md }}>
            {ALL_TYPES.map((t) => (
              <Pill
                key={t}
                label={typeLabel(t)}
                selected={run.workoutType === t}
                color={workoutTypeColor(t, theme)}
                onPress={() => {
                  correctWorkoutType(a.id, t);
                  setEditing(false);
                }}
              />
            ))}
          </View>
        )}
        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>{run.classification.rationale}</Text>
      </Card>

      <QualityFlags flags={run.flags} detailed />

      <PercentileCard results={populationPercentiles(a, profile)} title="This run vs the running population" />

      <Card style={{ marginTop: spacing.md }}>
        {rows.map(([k, v], i) => (
          <View
            key={k}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 8,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: theme.border,
            }}
          >
            <Text style={{ fontSize: 14, color: theme.textMuted }}>{k}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary, fontVariant: ['tabular-nums'] }}>{v}</Text>
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <HowCalculated
          compact
          explanations={[
            run.trimp?.explanation,
            run.vo2max?.explanation,
            run.efficiency?.explanation,
            run.adjustedPace?.explanation,
            run.climate?.explanation,
            run.classification.explanation,
          ]}
        />
      </Card>
    </ScrollView>
  );
}
