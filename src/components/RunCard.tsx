import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { EnrichedActivity } from '../lib/engine';
import { fmtDateTime, fmtDistance, fmtPaceSPerKm } from '../lib/format';
import { label as typeLabel } from '../lib/formulas/classifier';
import { UserProfile } from '../lib/formulas/types';
import { spacing, workoutTypeColor } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';
import { QualityFlags } from './QualityFlags';
import { Badge, Card } from './ui/primitives';

export function RunCard({ run, profile }: { run: EnrichedActivity; profile: UserProfile }) {
  const theme = useAppTheme();
  const tColor = workoutTypeColor(run.workoutType, theme);

  return (
    <Pressable onPress={() => router.push({ pathname: '/run/[id]', params: { id: run.activity.id } })}>
      <Card style={{ marginBottom: spacing.md, opacity: run.excluded ? 0.6 : 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>{run.activity.name}</Text>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
              {fmtDistance(run.activity.distanceM, profile.units)} · {fmtDateTime(run.activity.startTime)}
            </Text>
          </View>
          <Badge label={typeLabel(run.workoutType)} color={tColor} subtle />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>
            {fmtPaceSPerKm(run.rawPaceSPerKm, profile.units)}
          </Text>
          {run.activity.avgHr != null && (
            <Text style={{ fontSize: 13, color: theme.textSecondary }}>{Math.round(run.activity.avgHr)} bpm</Text>
          )}
          {run.trimp && (
            <Text style={{ fontSize: 13, color: theme.textSecondary }}>strain {run.trimp.value.toFixed(0)}</Text>
          )}
        </View>
        <QualityFlags flags={run.flags} />
      </Card>
    </Pressable>
  );
}
