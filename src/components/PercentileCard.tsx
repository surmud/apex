import React from 'react';
import { Text, View } from 'react-native';
import { HowCalculated } from './HowCalculated';
import { PercentileResult } from '../lib/formulas/percentiles';
import { spacing, type } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';
import { Card } from './ui/primitives';

/**
 * Where the runner's form metrics sit in the general running population.
 * Deliberately neutral: these are mechanics, not a fitness grade.
 */
export function PercentileCard({ results, title }: { results: PercentileResult[]; title?: string }) {
  const theme = useAppTheme();
  if (results.length === 0) return null;

  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text style={[type.cardTitle, { color: theme.textPrimary }]}>
        {title ?? 'How your form compares'}
      </Text>
      <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: spacing.sm }}>
        Against the general recreational running population. Form varies naturally with build, so
        watch your own trend before comparing with anyone else.
      </Text>
      {results.map((r) => (
        <View key={r.metric} style={{ marginTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>{r.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary, fontVariant: ['tabular-nums'] }}>
              {r.valueLabel}
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
              marginTop: 6,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.max(3, Math.min(100, r.percentile))}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: theme.accent,
              }}
            />
          </View>
          <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, lineHeight: 17 }}>
            {r.phrasing}
          </Text>
        </View>
      ))}
      <HowCalculated compact explanations={results.map((r) => r.explanation)} />
    </Card>
  );
}
