import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { buildCoachContext, getCoachInsight } from '../lib/ai/coach';
import { projectScenarios, RACE_DISTANCES } from '../lib/formulas/projections';
import { formatHms } from '../lib/formulas/riegel';
import { useAppState } from '../lib/state/AppState';
import { radius, spacing, type } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';
import { Card } from './ui/primitives';

/**
 * AI Insight: a model-written read of the latest workout, goal tracking
 * with honest odds, and prioritized action items. Runs through the app's
 * server proxy by default, or the user's own API key when one is set in
 * Settings. Results are cached per run.
 */
export function AIInsightCard() {
  const theme = useAppTheme();
  const { engine, profile, goal, anthropicApiKey, coachCache, setCoachCache } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = engine.latest;
  if (!latest) return null;

  const cached = coachCache?.activityId === latest.activity.id ? coachCache.insight : null;

  async function analyze() {
    if (!latest) return;
    setLoading(true);
    setError(null);
    try {
      let projectionSummary: string | null = null;
      if (goal) {
        const p = projectScenarios(
          engine.bestEfforts,
          RACE_DISTANCES[goal.distanceKey],
          goal.raceDate
            ? Math.max(7, Math.round((new Date(goal.raceDate).getTime() - Date.now()) / 86400000))
            : 90,
          engine.currentMpw,
        );
        if (p) {
          projectionSummary = p.bands
            .map((b) => `${b.scenario}: ${formatHms(b.lowS)} to ${formatHms(b.highS)}`)
            .join('; ');
        }
      }
      const context = buildCoachContext(engine, profile, goal, projectionSummary);
      const insight = await getCoachInsight(anthropicApiKey, context);
      setCoachCache(latest.activity.id, insight);
    } catch (e: any) {
      setError(e?.message ?? 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  const statusColorFor = (s: string) =>
    s === 'ahead' || s === 'on_track' ? theme.status.good : s === 'behind' ? theme.status.serious : theme.textMuted;

  return (
    <Card style={{ marginTop: spacing.md, borderColor: theme.accent, borderWidth: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.cardTitle, { color: theme.textPrimary }]}>AI Insight</Text>
        {cached && !loading && (
          <Pressable onPress={analyze}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.accent }}>Refresh</Text>
          </Pressable>
        )}
      </View>

      {!cached && !loading && (
        <View style={{ marginTop: spacing.sm }}>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19 }}>
            {goal
              ? 'How did this run go, and are you still on track for your race?'
              : 'How did this run go, and what should you do next?'}
          </Text>
          <Pressable
            onPress={analyze}
            style={{
              marginTop: spacing.sm,
              backgroundColor: theme.accent,
              borderRadius: radius.sm,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>What does this run mean?</Text>
          </Pressable>
        </View>
      )}

      {loading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md }}>
          <ActivityIndicator color={theme.accent} />
          <Text style={{ fontSize: 13, color: theme.textMuted }}>Reading your training data</Text>
        </View>
      )}

      {error && (
        <Text style={{ fontSize: 12, color: theme.status.critical, marginTop: spacing.sm }}>{error}</Text>
      )}

      {cached && !loading && (
        <View style={{ marginTop: spacing.sm, gap: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textPrimary, lineHeight: 21 }}>
            {cached.headline}
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19 }}>{cached.workoutRead}</Text>

          {cached.goalAssessment.status !== 'no_goal' && (
            <View
              style={{
                backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderRadius: radius.md,
                padding: spacing.md,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[type.microLabel, { color: theme.textMuted }]}>Goal tracking</Text>
                {cached.goalAssessment.oddsPct != null && (
                  <Text style={{ fontSize: 16, fontWeight: '800', color: statusColorFor(cached.goalAssessment.status) }}>
                    {Math.round(cached.goalAssessment.oddsPct)}% odds
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginTop: 4 }}>
                {cached.goalAssessment.narrative}
              </Text>
            </View>
          )}

          {cached.actionItems.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.microLabel, { color: theme.textMuted }]}>Action items</Text>
              {cached.actionItems.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.accent, width: 16 }}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary }}>{item.title}</Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>{item.timeframe}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 17 }}>{item.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {cached.watchouts.length > 0 && (
            <View style={{ gap: 4 }}>
              {cached.watchouts.map((w, i) => (
                <Text key={i} style={{ fontSize: 12, color: theme.status.serious }}>
                  Watch: {w}
                </Text>
              ))}
            </View>
          )}

          <Text style={{ fontSize: 10, color: theme.textMuted }}>
            Written by Claude from: {cached.dataUsed.join(', ')}
          </Text>
        </View>
      )}
    </Card>
  );
}
