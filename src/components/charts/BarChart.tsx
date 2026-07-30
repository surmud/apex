import React from 'react';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '../../theme/useTheme';
import { scale } from './common';

export interface Bar {
  label: string;
  value: number;
  highlighted?: boolean;
}

interface Props {
  bars: Bar[];
  width: number;
  height?: number;
  formatValue?: (v: number) => string;
}

/** Vertical bars, 4px rounded data ends anchored to baseline, 2px gaps. */
export function BarChart({ bars, width, height = 150, formatValue }: Props) {
  const theme = useAppTheme();
  const pad = { l: 4, r: 4, t: 18, b: 20 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ys = scale([0, max], [0, ih]);
  const bw = Math.max(4, iw / bars.length - 3);

  const maxIdx = bars.findIndex((b) => b.value === Math.max(...bars.map((x) => x.value)));

  return (
    <Svg width={width} height={height}>
      <Line x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} stroke={theme.axis} strokeWidth={1} />
      {bars.map((b, i) => {
        const h = Math.max(2, ys(b.value));
        const x = pad.l + (i * iw) / bars.length + 1.5;
        const fill = b.highlighted ? theme.series.magenta : theme.accent;
        return (
          <React.Fragment key={i}>
            {/* squared base + rounded top: draw rounded rect, then square off the bottom */}
            <Rect x={x} y={pad.t + ih - h} width={bw} height={h} rx={4} fill={fill} />
            {h > 8 && <Rect x={x} y={pad.t + ih - Math.min(4, h / 2)} width={bw} height={Math.min(4, h / 2)} fill={fill} />}
            {i === maxIdx && formatValue && (
              <SvgText x={x + bw / 2} y={pad.t + ih - h - 5} fontSize={10} fill={theme.textSecondary} textAnchor="middle">
                {formatValue(b.value)}
              </SvgText>
            )}
            {(bars.length <= 8 || i % Math.ceil(bars.length / 8) === 0) && (
              <SvgText x={x + bw / 2} y={height - 6} fontSize={9} fill={theme.textMuted} textAnchor="middle">
                {b.label}
              </SvgText>
            )}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
