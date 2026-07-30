import React from 'react';
import { Text, View } from 'react-native';
import { QUALITY_FLAG_LABEL } from '../lib/formulas/quality';
import { QualityFlag } from '../lib/formulas/types';
import { spacing } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';

/** Visible data-quality flags (T0-6) — bad data is flagged, never silent. */
export function QualityFlags({ flags, detailed }: { flags: QualityFlag[]; detailed?: boolean }) {
  const theme = useAppTheme();
  if (flags.length === 0) return null;

  return (
    <View style={{ gap: 4, marginTop: detailed ? spacing.sm : 4 }}>
      {flags.map((f) => {
        const info = QUALITY_FLAG_LABEL[f];
        const color = info.excludes ? theme.status.serious : theme.status.warning;
        return (
          <View key={f} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color }}>
                {info.title}
                {info.excludes ? '. Excluded from analysis.' : ''}
              </Text>
              {detailed && <Text style={{ fontSize: 11, color: theme.textMuted }}>{info.detail}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}
