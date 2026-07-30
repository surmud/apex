import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useAppTheme } from '../../theme/useTheme';

/**
 * The Apex mark: three ascending bars on a deep navy tile. The bars are a
 * literal chart, which is the product: training data climbing toward a
 * peak. Colors are fixed (not themed) so the mark reads identically on
 * both light and dark surfaces, like an app icon does.
 */
export function Logo({ size = 34 }: { size?: number }) {
  const rx = 24; // corner radius in viewBox units, matches an iOS icon squircle roughly
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={0} y={0} width={100} height={100} rx={rx} fill="#101828" />
      <Rect x={21} y={57} width={14} height={18} rx={4} fill="#8494ab" />
      <Rect x={43} y={41} width={14} height={34} rx={4} fill="#c7d0dd" />
      <Rect x={65} y={23} width={14} height={52} rx={4} fill="#f7f9fc" />
    </Svg>
  );
}

/** Logo beside the wordmark, for screen headers. */
export function LogoLockup({ size = 30 }: { size?: number }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Logo size={size} />
      <Text
        style={{
          fontSize: size * 0.93,
          fontWeight: '800',
          color: theme.textPrimary,
          letterSpacing: -0.5,
        }}
      >
        Apex
      </Text>
    </View>
  );
}
