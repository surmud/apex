import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useAppTheme } from '../../theme/useTheme';

interface Props {
  /** each row: fractions per segment (sum ≤ 1), oldest → newest */
  rows: { fractions: number[] }[];
  segmentLabels: string[];
  width: number;
  height?: number;
  /** Segment colors, one per label. Defaults to a single-hue ramp. */
  colors?: string[];
}

/**
 * Stacked-column distribution chart: one thin column per run, 2px surface
 * gaps between segments.
 */
export function StackedBars({ rows, segmentLabels, width, height = 140, colors }: Props) {
  const theme = useAppTheme();
  const ramp =
    colors ??
    (theme.mode === 'dark'
      ? ['#86b6ef', '#5598e7', '#3987e5', '#256abf', '#184f95']
      : ['#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#1c5cab']);

  const shown = rows.slice(-40);
  const bw = Math.max(3, width / shown.length - 2);

  return (
    <View>
      <Svg width={width} height={height}>
        {shown.map((row, i) => {
          const x = (i * width) / shown.length;
          let yCursor = height;
          return row.fractions.map((f, z) => {
            const h = Math.max(0, f * (height - 4) - 2);
            yCursor -= h + 2;
            return <Rect key={`${i}-${z}`} x={x} y={yCursor + 2} width={bw} height={h} rx={1.5} fill={ramp[z]} />;
          });
        })}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        {segmentLabels.map((l, z) => (
          <View key={z} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: ramp[z] }} />
            <Text style={{ fontSize: 11, color: theme.textSecondary }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
