import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Logo } from '../components/ui/Logo';
import { useAppState } from '../lib/state/AppState';
import { spacing } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';

export default function Index() {
  const { ready, onboarded } = useAppState();
  const theme = useAppTheme();

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.page,
          gap: spacing.lg,
          padding: spacing.xl,
        }}
      >
        <Logo size={72} />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: theme.textPrimary, letterSpacing: -0.5 }}>
            Apex
          </Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 }}>
            A data driven training insights app{'\n'}by Surmud Jamil
          </Text>
        </View>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  return <Redirect href={onboarded ? '/(tabs)/postrun' : '/onboarding'} />;
}
