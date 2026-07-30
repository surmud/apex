import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { configureNotificationHandler } from '../lib/notifications';
import { AppStateProvider } from '../lib/state/AppState';
import { useAppTheme } from '../theme/useTheme';

configureNotificationHandler();

export default function RootLayout() {
  return (
    <AppStateProvider>
      <RootStack />
    </AppStateProvider>
  );
}

function RootStack() {
  const theme = useAppTheme();
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.page },
          headerTintColor: theme.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.page },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        <Stack.Screen name="course-builder" options={{ title: 'Add a course', presentation: 'modal' }} />
        <Stack.Screen name="run/[id]" options={{ title: 'Run detail' }} />
        <Stack.Screen name="metric/[key]" options={{ title: 'Metric' }} />
      </Stack>
    </>
  );
}
