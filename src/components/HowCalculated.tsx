import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Explanation } from '../lib/formulas/types';
import { radius, spacing } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';

/**
 * "How was this calculated?" — the expandable transparency panel attached
 * to every insight (T0-5). Shows method, formula, actual inputs, output,
 * and caveats. Core differentiator, present on every number.
 */
export function HowCalculated({ explanations, compact }: { explanations: (Explanation | undefined | null)[]; compact?: boolean }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const items = explanations.filter((e): e is Explanation => e != null);
  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: compact ? spacing.sm : spacing.md }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
        accessibilityRole="button"
        accessibilityLabel="How was this calculated?"
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>
          How was this calculated?
        </Text>
        <Text style={{ fontSize: 11, color: theme.accent }}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open && (
        <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
          {items.map((e, i) => (
            <View
              key={i}
              style={{
                backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderRadius: radius.md,
                padding: spacing.md,
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary }}>{e.method}</Text>
              {e.summary && (
                <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 17 }}>
                  {e.summary}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 12,
                  color: theme.textSecondary,
                  fontFamily: 'monospace' as any,
                }}
              >
                {e.formula}
              </Text>
              <View style={{ marginTop: 4, gap: 3 }}>
                {e.inputs.map((inp, j) => (
                  <View key={j} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: theme.textMuted }}>{inp.label}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, fontVariant: ['tabular-nums'] }}>
                      {inp.value}
                    </Text>
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                    paddingTop: 4,
                    marginTop: 2,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary }}>Result</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary }}>{e.output}</Text>
                </View>
              </View>
              {e.caveats.map((c, j) => (
                <Text key={j} style={{ fontSize: 11, color: theme.textMuted, fontStyle: 'italic' }}>
                  ⚠︎ {c}
                </Text>
              ))}
              {e.source && (
                <Text style={{ fontSize: 10, color: theme.textMuted }}>Source: {e.source}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
