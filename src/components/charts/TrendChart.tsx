import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '../../theme/useTheme';
import { extent, linePath, scale, smoothPath, XY } from './common';

interface Props {
  data: XY[];
  width: number;
  height?: number;
  color?: string;
  /** format a y value for labels/tooltip */
  formatY: (v: number) => string;
  formatX?: (x: number) => string;
  /** invert = smaller is better (pace charts grow downward visually) */
  invertY?: boolean;
  smooth?: boolean;
  yTicks?: number;
}

/**
 * Single-series trend chart: hairline grid, 2px line, soft area fill,
 * direct end label. Touch or drag anywhere on the plot to scrub a
 * crosshair; the value for the nearest point is shown in a tooltip.
 */
export function TrendChart({
  data,
  width,
  height = 180,
  color,
  formatY,
  formatX = defaultFormatX,
  invertY = false,
  smooth = true,
  yTicks = 3,
}: Props) {
  const theme = useAppTheme();
  const stroke = color ?? theme.accent;
  const [sel, setSel] = useState<number | null>(null);

  const pad = { l: 8, r: 54, t: 12, b: 22 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;

  const { pts, ticks, ys } = useMemo(() => {
    const xd = extent(data.map((d) => d.x), 0);
    const yd = extent(data.map((d) => d.y));
    const xs = scale(xd, [pad.l, pad.l + iw]);
    const ys = scale(yd, invertY ? [pad.t, pad.t + ih] : [pad.t + ih, pad.t]);
    const pts = data.map((d) => ({ px: xs(d.x), py: ys(d.y), ...d }));
    const ticks = Array.from({ length: yTicks }, (_, i) => yd[0] + ((yd[1] - yd[0]) * (i + 0.5)) / yTicks);
    return { pts, ticks, ys };
  }, [data, iw, ih, invertY, yTicks]);

  if (data.length < 2) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>Not enough data in this range</Text>
      </View>
    );
  }

  const selectNearest = (x: number) => {
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.px - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setSel(best);
  };

  const path = smooth ? smoothPath(pts) : linePath(pts);
  const areaPath = `${path} L${pts[pts.length - 1].px},${pad.t + ih} L${pts[0].px},${pad.t + ih} Z`;
  const last = pts[pts.length - 1];
  const selected = sel != null ? pts[sel] : null;
  const gradId = `grad-${stroke.replace('#', '')}`;

  return (
    <View
      style={{ width, height }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => selectNearest(e.nativeEvent.locationX)}
      onResponderMove={(e) => selectNearest(e.nativeEvent.locationX)}
      onResponderRelease={() => {}}
    >
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.18} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        {ticks.map((t, i) => (
          <React.Fragment key={i}>
            <Line x1={pad.l} x2={pad.l + iw} y1={ys(t)} y2={ys(t)} stroke={theme.grid} strokeWidth={1} />
            <SvgText x={pad.l + iw + 4} y={ys(t) + 4} fontSize={10} fill={theme.textMuted}>
              {formatY(t)}
            </SvgText>
          </React.Fragment>
        ))}
        <Line x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} stroke={theme.axis} strokeWidth={1} />
        <Path d={areaPath} fill={`url(#${gradId})`} />
        <Path d={path} stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Circle cx={last.px} cy={last.py} r={3.5} fill={stroke} stroke={theme.surface} strokeWidth={2} />

        {/* x labels: first + last */}
        <SvgText x={pts[0].px} y={height - 6} fontSize={10} fill={theme.textMuted}>
          {formatX(data[0].x)}
        </SvgText>
        <SvgText x={last.px} y={height - 6} fontSize={10} fill={theme.textMuted} textAnchor="end">
          {formatX(data[data.length - 1].x)}
        </SvgText>

        {selected && (
          <>
            <Line x1={selected.px} x2={selected.px} y1={pad.t} y2={pad.t + ih} stroke={theme.textMuted} strokeWidth={1} strokeDasharray="3,3" />
            <Circle cx={selected.px} cy={selected.py} r={4.5} fill={stroke} stroke={theme.surface} strokeWidth={2} />
            <Rect
              x={Math.min(Math.max(selected.px - 46, 2), width - 96)}
              y={Math.max(selected.py - 40, 2)}
              width={92}
              height={30}
              rx={6}
              fill={theme.surfaceRaised}
              stroke={theme.border}
            />
            <SvgText
              x={Math.min(Math.max(selected.px - 46, 2), width - 96) + 46}
              y={Math.max(selected.py - 40, 2) + 13}
              fontSize={11}
              fontWeight="600"
              fill={theme.textPrimary}
              textAnchor="middle"
            >
              {formatY(selected.y)}
            </SvgText>
            <SvgText
              x={Math.min(Math.max(selected.px - 46, 2), width - 96) + 46}
              y={Math.max(selected.py - 40, 2) + 25}
              fontSize={9}
              fill={theme.textMuted}
              textAnchor="middle"
            >
              {formatX(selected.x)}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

function defaultFormatX(x: number): string {
  const d = new Date(x);
  // Show the year whenever the point is not from the current year, so a
  // long ALL range never leaves "Oct 12" ambiguous.
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(
    undefined,
    sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: '2-digit' },
  );
}
