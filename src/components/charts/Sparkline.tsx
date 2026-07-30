import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAppTheme } from '../../theme/useTheme';
import { extent, scale, smoothPath, XY } from './common';

interface Props {
  data: XY[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ data, width = 96, height = 28, color }: Props) {
  const theme = useAppTheme();
  const stroke = color ?? theme.accent;
  if (data.length < 2) return <Svg width={width} height={height} />;

  const xs = scale(extent(data.map((d) => d.x), 0), [2, width - 6]);
  const ys = scale(extent(data.map((d) => d.y)), [height - 3, 3]);
  const pts = data.map((d) => ({ px: xs(d.x), py: ys(d.y) }));
  const last = pts[pts.length - 1];

  return (
    <Svg width={width} height={height}>
      <Path d={smoothPath(pts)} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Circle cx={last.px} cy={last.py} r={2.5} fill={stroke} />
    </Svg>
  );
}
