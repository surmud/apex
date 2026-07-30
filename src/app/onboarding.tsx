import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Logo } from '../components/ui/Logo';
import { FieldDate, FieldHeight, FieldStepper } from '../components/ui/fields';
import { Card, GhostButton, Pill, PrimaryButton, Segmented } from '../components/ui/primitives';
import { exchangeCode, STRAVA_CLIENT_ID, stravaAuthUrl } from '../lib/api/strava';
import { RaceDistanceKey } from '../lib/formulas/projections';
import { DataSource, useAppState } from '../lib/state/AppState';
import { spacing } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';

WebBrowser.maybeCompleteAuthSession();

type Step = 'welcome' | 'connecting' | 'profile' | 'goal';

export default function Onboarding() {
  const theme = useAppTheme();
  const { completeOnboarding, connectStrava, connectHealth, healthAvailable, loadDemoData, sync, setGoal } =
    useAppState();
  const [step, setStep] = useState<Step>('welcome');
  const [source, setSource] = useState<DataSource>('demo');
  const [error, setError] = useState<string | null>(null);

  // goal fields
  const [goalDistance, setGoalDistance] = useState<RaceDistanceKey>('Marathon');
  const [goalTime, setGoalTime] = useState('');
  const [goalDate, setGoalDate] = useState('');

  // profile fields
  const [sex, setSex] = useState<'M' | 'F'>('M');
  const [dob, setDob] = useState('1990-01-01');
  const [weight, setWeight] = useState(154); // in display units (lb or kg)
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [restingHr, setRestingHr] = useState(55);
  const [maxHr, setMaxHr] = useState('');
  const [units, setUnits] = useState<'mi_f' | 'km_c'>('mi_f');

  const age = Math.max(15, Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)));
  const estimatedMax = 220 - age;

  async function handleStravaConnect() {
    setError(null);
    if (!STRAVA_CLIENT_ID) {
      setError('Strava client ID missing. Set EXPO_PUBLIC_STRAVA_CLIENT_ID in .env and restart.');
      return;
    }
    try {
      const redirectUri =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}/onboarding`
          : 'apex://onboarding';

      if (Platform.OS === 'web') {
        // full-page redirect; we read ?code= on return
        (window as any).location.href = stravaAuthUrl(redirectUri);
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(stravaAuthUrl(redirectUri), redirectUri);
      if (result.type === 'success' && result.url) {
        const code = new URL(result.url).searchParams.get('code');
        if (code) {
          setStep('connecting');
          setSource('strava');
          const tokens = await exchangeCode(code);
          connectStrava(tokens); // kicks off backfill in background
          setStep('profile');
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Strava connection failed');
    }
  }

  // web OAuth return: pick up ?code= from URL
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const oauthError = new URLSearchParams(window.location.search).get('error');
    if (oauthError) {
      window.history.replaceState({}, '', window.location.pathname);
      setError(`Strava said: ${oauthError}. Check that the callback domain in strava.com/settings/api is your Supabase project host.`);
      return;
    }
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      setStep('connecting');
      setSource('strava');
      exchangeCode(code)
        .then((tokens) => {
          connectStrava(tokens);
          setStep('profile');
        })
        .catch((e) => {
          setError(e?.message ?? 'Strava connection failed');
          setStep('welcome');
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDemoStart() {
    setSource('demo');
    loadDemoData();
    setStep('profile');
  }

  function finishProfile() {
    setStep('goal');
  }

  function finish(skipGoal: boolean) {
    if (!skipGoal) {
      const parts = goalTime.trim().split(':').map(Number);
      let targetTimeS: number | null = null;
      if (!parts.some(isNaN) && parts.length >= 2 && parts.length <= 3) {
        targetTimeS = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
      }
      setGoal({ distanceKey: goalDistance, targetTimeS, raceDate: goalDate || null, courseName: null });
    }
    completeOnboarding(
      {
        sex,
        dob,
        heightCm,
        weightKg: units === 'mi_f' ? weight / 2.20462 : weight,
        restingHr: restingHr || 55,
        maxHr: maxHr ? Number(maxHr) : estimatedMax,
        maxHrIsEstimated: !maxHr,
        units,
      },
      source,
    );
    router.replace('/(tabs)/postrun');
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.textPrimary,
    backgroundColor: theme.surface,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.page }}
      contentContainerStyle={{ padding: spacing.xl, paddingTop: 80, maxWidth: 520, width: '100%', alignSelf: 'center' }}
    >
      {step === 'welcome' && (
        <View style={{ gap: spacing.xl }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Logo size={52} />
              <Text style={{ fontSize: 40, fontWeight: '800', color: theme.textPrimary, letterSpacing: -1 }}>
                Apex
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: theme.textSecondary, marginTop: spacing.md, lineHeight: 26 }}>
              Training analytics for runners who want to know what is actually working.
            </Text>
          </View>

          <View style={{ gap: spacing.md }}>
            {healthAvailable && (
              <PrimaryButton
                title="Connect Apple Health"
                onPress={async () => {
                  setError(null);
                  try {
                    setStep('connecting');
                    setSource('health');
                    await connectHealth();
                    setStep('profile');
                  } catch (e: any) {
                    setError(e?.message ?? 'Apple Health connection failed');
                    setStep('welcome');
                  }
                }}
              />
            )}
            <PrimaryButton title="Connect Strava" onPress={handleStravaConnect} />
            <GhostButton title="Explore with demo data" onPress={handleDemoStart} />
            <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center' }}>
              {healthAvailable
                ? 'Apple Health imports your Apple Watch runs, including running dynamics, and new workouts sync automatically. '
                : ''}
              Demo mode generates 10 months of realistic training data. You can connect sources later in
              Settings.
            </Text>
          </View>
          {error && (
            <Card>
              <Text style={{ color: theme.status.critical, fontSize: 13 }}>{error}</Text>
            </Card>
          )}
          <Text
            style={{ fontSize: 12, color: theme.textMuted, textDecorationLine: 'underline', textAlign: 'center' }}
            onPress={() => Linking.openURL('https://www.strava.com/settings/api')}
          >
            Strava setup: the Authorization Callback Domain at strava.com/settings/api must be your
            Supabase project host (the domain in EXPO_PUBLIC_SUPABASE_URL).
          </Text>
        </View>
      )}

      {step === 'connecting' && (
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingTop: 60 }}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '600' }}>
            Importing your history…
          </Text>
          {sync.phase === 'backfill' && (
            <Text style={{ color: theme.textSecondary }}>{sync.count} activities so far (runs only)</Text>
          )}
          {sync.phase === 'weather' && (
            <Text style={{ color: theme.textSecondary }}>
              Attaching weather: {sync.done} / {sync.total}
            </Text>
          )}
        </View>
      )}

      {step === 'profile' && (
        <View style={{ gap: spacing.lg }}>
          <View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: theme.textPrimary }}>A little about you</Text>
            <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 4 }}>
              These four numbers drive the strain and fitness calculations. You can change them any time in
              Settings.
            </Text>
          </View>

          {sync.phase === 'backfill' && (
            <Card>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Importing in the background: {sync.count} activities so far
              </Text>
            </Card>
          )}

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Sex (for the TRIMP coefficient)</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pill label="Male" selected={sex === 'M'} onPress={() => setSex('M')} />
              <Pill label="Female" selected={sex === 'F'} onPress={() => setSex('F')} />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Date of birth</Text>
            <FieldDate
              value={dob}
              onChange={setDob}
              maximumDate={new Date()}
              minimumDate={new Date('1920-01-01')}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>
                Weight ({units === 'mi_f' ? 'lb' : 'kg'})
              </Text>
              <FieldStepper
                value={weight}
                onChange={setWeight}
                min={units === 'mi_f' ? 66 : 30}
                max={units === 'mi_f' ? 400 : 180}
              />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Resting HR</Text>
              <FieldStepper value={restingHr} onChange={setRestingHr} min={30} max={100} unit="bpm" />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Height (optional)</Text>
            <FieldHeight heightCm={heightCm} onChange={setHeightCm} metric={units === 'km_c'} />
            <Text style={{ fontSize: 12, color: theme.textMuted }}>
              Used to compare your cadence and stride to runners of your height.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Max HR</Text>
            <TextInput
              style={inputStyle}
              value={maxHr}
              onChangeText={setMaxHr}
              keyboardType="numeric"
              placeholder={`~${estimatedMax} estimated from age`}
              placeholderTextColor={theme.textMuted}
            />
            <Text style={{ fontSize: 12, color: theme.textMuted }}>
              Leave blank to use an age-based estimate. A measured max makes the numbers tighter.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Units</Text>
            <Segmented
              options={[
                { key: 'mi_f', label: 'miles / °F' },
                { key: 'km_c', label: 'km / °C' },
              ]}
              value={units}
              onChange={setUnits}
            />
          </View>

          <PrimaryButton title="Continue" onPress={finishProfile} />
        </View>
      )}

      {step === 'goal' && (
        <View style={{ gap: spacing.lg }}>
          <View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: theme.textPrimary }}>
              Training toward anything?
            </Text>
            <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 4 }}>
              Set a goal race and Apex will track your progress toward it after every workout.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Distance</Text>
            <Segmented
              options={(['5K', '10K', 'Half', 'Marathon'] as RaceDistanceKey[]).map((k) => ({ key: k, label: k }))}
              value={goalDistance}
              onChange={setGoalDistance}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Target time</Text>
              <TextInput
                style={inputStyle}
                value={goalTime}
                onChangeText={setGoalTime}
                placeholder="3:45:00"
                placeholderTextColor={theme.textMuted}
              />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary }}>Race date</Text>
              <FieldDate value={goalDate} onChange={setGoalDate} minimumDate={new Date()} />
            </View>
          </View>

          <PrimaryButton title="Set goal and finish" onPress={() => finish(false)} />
          <GhostButton title="Skip for now" onPress={() => finish(true)} />
        </View>
      )}
    </ScrollView>
  );
}
