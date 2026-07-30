import { Tabs } from 'expo-router';
import React, { useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useTheme';

/**
 * Custom bottom tab bar with a sliding active indicator. Swiping
 * horizontally across the bar shifts to the previous or next tab, in the
 * style of recent iOS apps.
 */
function SwipeableTabBar({ state, descriptors, navigation }: any) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const startX = useRef(0);
  const barWidth = useRef(1);
  const indicator = useRef(new Animated.Value(state.index)).current;

  React.useEffect(() => {
    Animated.spring(indicator, {
      toValue: state.index,
      useNativeDriver: false,
      tension: 160,
      friction: 18,
    }).start();
  }, [state.index, indicator]);

  const go = (index: number) => {
    const clamped = Math.max(0, Math.min(state.routes.length - 1, index));
    if (clamped !== state.index) navigation.navigate(state.routes[clamped].name as never);
  };

  const n = state.routes.length;

  return (
    <View
      onLayout={(e) => (barWidth.current = e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={(e) => Math.abs(e.nativeEvent.locationX - startX.current) > 12}
      onResponderGrant={(e) => (startX.current = e.nativeEvent.locationX)}
      onResponderRelease={(e) => {
        const dx = e.nativeEvent.locationX - startX.current;
        const threshold = 48;
        if (dx <= -threshold) go(state.index + 1);
        else if (dx >= threshold) go(state.index - 1);
        else {
          // treat as a tap on whichever tab is under the finger
          const idx = Math.floor((e.nativeEvent.locationX / barWidth.current) * n);
          go(idx);
        }
      }}
      style={{
        backgroundColor: theme.surface,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingTop: 6,
      }}
    >
      {/* sliding indicator */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          height: 3,
          borderRadius: 2,
          backgroundColor: theme.accent,
          width: `${100 / n - 4}%`,
          left: indicator.interpolate({
            inputRange: [0, n - 1],
            outputRange: [`${2}%`, `${100 - 100 / n + 2}%`],
          }),
        }}
      />
      <View style={{ flexDirection: 'row' }}>
        {state.routes.map((route: any, i: number) => {
          const { options } = descriptors[route.key];
          const label = (options.title ?? route.name) as string;
          const active = state.index === i;
          return (
            <Pressable
              key={route.key}
              onPress={() => go(i)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: active ? '800' : '600',
                  color: active ? theme.accent : theme.textMuted,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const theme = useAppTheme();
  return (
    <Tabs
      initialRouteName="postrun"
      tabBar={(props) => <SwipeableTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.page },
      }}
    >
      <Tabs.Screen name="postrun" options={{ title: 'Post-run' }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="training" options={{ title: 'Training' }} />
      <Tabs.Screen name="projections" options={{ title: 'Projections' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
    </Tabs>
  );
}
