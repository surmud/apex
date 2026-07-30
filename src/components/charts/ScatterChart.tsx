import React from 'react';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '../../theme/useTheme';
import { extent, scale, trendline, XY } from './common';

interface Props {
  data: XY[]; // x = timestamp by default, or any numeric axis with formatX
  width: number;
  height?: number;
  formatY: (v: number) => string;
  formatX?: (v: number) => string;
  trendLabel?: (slopePerX: number) => string;
  invertY?: boolean;
}

/** Scatter + least-squares trendline. */
export function ScatterChart({ data, width, height = 180, formatY, formatX, trendLabel, invertY }: Props) {
  const theme = useAppTheme();
  const pad = { l: 8, r: 46, t: 14, b: 20 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;

  if (data.length < 3) return null;

  const xd = extent(data.map((d) => d.x), 0.02);
  const yd = extent(data.map((d) => d.y), 0.15);
  const xs = scale(xd, [pad.l, pad.l + iw]);
  const ys = scale(yd, invertY ? [pad.t, pad.t + ih] : [pad.t + ih, pad.t]);
  const t = trendline(data);
  const fx = formatX ?? ((v: number) => new Date(v).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));

  return (
    <Svg width={width} height={height}>
      {[0.25, 0.75].map((f, i) => {
        const v = yd[0] + (yd[1] - yd[0]) * f;
        return (
          <React.Fragment key={i}>
            <Line x1={pad.l} x2={pad.l + iw} y1={ys(v)} y2={ys(v)} stroke={theme.grid} strokeWidth={1} />
            <SvgText x={pad.l + iw + 4} y={ys(v) + 3} fontSize={10} fill={theme.textMuted}>
              {formatY(v)}
            </SvgText>
          </React.Fragment>
        );
      })}
      {data.map((d, i) => (
        <Circle key={i} cx={xs(d.x)} cy={ys(d.y)} r={3} fill={theme.accent} opacity={0.55} />
      ))}
      {t && (
        <Line
          x1={xs(xd[0])}
          y1={ys(t.intercept + t.slope * xd[0])}
          x2={xs(xd[1])}
          y2={ys(t.intercept + t.slope * xd[1])}
          stroke={theme.series.orange}
          strokeWidth={2}
        />
      )}
      {t && trendLabel && (
        <SvgText x={pad.l + 2} y={pad.t - 2} fontSize={10} fill={theme.textSecondary}>
          {trendLabel(formatX ? t.slope : t.slope * 86400000)}
        </SvgText>
      )}
      <SvgText x={pad.l} y={height - 6} fontSize={10} fill={theme.textMuted}>
        {fx(xd[0])}
      </SvgText>
      <SvgText x={pad.l + iw} y={height - 6} fontSize={10} fill={theme.textMuted} textAnchor="end">
        {fx(xd[1])}
      </SvgText>
    </Svg>
  );
}
