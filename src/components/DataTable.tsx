import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { spacing, type } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';

export interface DataRow {
  /** Left cell, usually a date */
  label: string;
  /** Right cell, the formatted value */
  value: string;
  /** Optional run to open on tap */
  runId?: string;
}

/**
 * The raw numbers behind a chart. Collapsed by default; expands to a
 * scrollable list so the exact data points can be read and each row can
 * jump to its run.
 */
export function DataTable({ rows, title = 'See the raw data' }: { rows: DataRow[]; title?: string }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(25);
  if (rows.length === 0) return null;

  return (
    <View style={{ marginTop: spacing.md }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>
          {open ? 'Hide the raw data' : title}
        </Text>
        <Text style={{ fontSize: 12, color: theme.textMuted }}>{rows.length} points</Text>
      </Pressable>

      {open && (
        <View
          style={{
            marginTop: spacing.xs,
            borderRadius: 10,
            backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}
        >
          {rows.slice(0, shown).map((r, i) => (
            <Pressable
              key={i}
              disabled={!r.runId}
              onPress={() => r.runId && router.push({ pathname: '/run/[id]', params: { id: r.runId } })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
                paddingHorizontal: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: theme.border,
                backgroundColor: pressed ? theme.surfaceRaised : 'transparent',
              })}
            >
              <Text style={{ fontSize: 13, color: theme.textMuted }}>{r.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary, fontVariant: ['tabular-nums'] }}>
                  {r.value}
                </Text>
                {r.runId && <Text style={{ fontSize: 12, color: theme.textMuted }}>{'>'}</Text>}
              </View>
            </Pressable>
          ))}
          {rows.length > shown && (
            <Pressable onPress={() => setShown(shown + 50)} style={{ padding: spacing.md, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>
                Show {Math.min(50, rows.length - shown)} more
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
