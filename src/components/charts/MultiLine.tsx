import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '../../theme/useTheme';
import { extent, scale, smoothPath } from './common';

export interface Series {
  name: string;
  color: string;
  points: { x: number; y: number }[];
}

interface Props {
  series: Series[];
  width: number;
  height?: number;
  formatY: (v: number) => string;
  formatX?: (v: number) => string;
  invertY?: boolean;
}

/** Multi-series line chart with legend + direct end labels (≤4 series). */
export function MultiLine({ series, width, height = 190, formatY, formatX, invertY = true }: Props) {
  const theme = useAppTheme();
  const pad = { l: 8, r: 60, t: 10, b: 20 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;

  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  if (allX.length === 0) return null;

  const xs = scale(extent(allX, 0), [pad.l, pad.l + iw]);
  const ys = scale(extent(allY, 0.1), invertY ? [pad.t, pad.t + ih] : [pad.t + ih, pad.t]);

  return (
    <View>
      <Svg width={width} height={height}>
        {[0.25, 0.5, 0.75].map((f, i) => {
          const [y0, y1] = extent(allY, 0.1);
          const v = y0 + (y1 - y0) * f;
          return (
            <Line key={i} x1={pad.l} x2={pad.l + iw} y1={ys(v)} y2={ys(v)} stroke={theme.grid} strokeWidth={1} />
          );
        })}
        {series.map((s) => {
          const pts = s.points.map((p) => ({ px: xs(p.x), py: ys(p.y) }));
          const last = pts[pts.length - 1];
          return (
            <React.Fragment key={s.name}>
              <Path d={smoothPath(pts)} stroke={s.color} strokeWidth={2} fill="none" strokeLinecap="round" />
              {last && (
                <SvgText x={last.px + 5} y={last.py + 4} fontSize={10} fontWeight="600" fill={s.color}>
                  {formatY(s.points[s.points.length - 1].y)}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
        {formatX && (
          <>
            <SvgText x={pad.l} y={height - 5} fontSize={10} fill={theme.textMuted}>
              {formatX(Math.min(...allX))}
            </SvgText>
            <SvgText x={pad.l + iw} y={height - 5} fontSize={10} fill={theme.textMuted} textAnchor="end">
              {formatX(Math.max(...allX))}
            </SvgText>
          </>
        )}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: s.color }} />
            <Text style={{ fontSize: 11, color: theme.textSecondary }}>{s.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
