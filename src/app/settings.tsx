import React, { useState } from 'react';
import { Alert, Platform, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { FieldDate, FieldHeight, FieldStepper } from '../components/ui/fields';
import { Card, GhostButton, Pill, PrimaryButton, Segmented } from '../components/ui/primitives';
import { RaceGoal } from '../lib/ai/coach';
import { fmtRelativeTime } from '../lib/format';
import { RaceDistanceKey } from '../lib/formulas/projections';
import { computeZones, observedMaxHr, ZONE_NAMES } from '../lib/formulas/zones';
import { useAppState } from '../lib/state/AppState';
import { spacing, zoneColors } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';

export default function Settings() {
  const theme = useAppTheme();
  const {
    profile, setProfile, sync, syncNow, source, stravaConnected, loadDemoData, resetAll, engine,
    anthropicApiKey, setAnthropicApiKey, goal, setGoal,
    healthAvailable, healthConnected, connectHealth, reimportHealth,
    recapNotifications, setRecapNotifications,
  } = useAppState();

  const mi = profile.units === 'mi_f';
  const [weight, setWeight] = useState(Math.round(mi ? profile.weightKg * 2.20462 : profile.weightKg));
  const [restingHr, setRestingHr] = useState(profile.restingHr);
  const [maxHr, setMaxHr] = useState(profile.maxHrIsEstimated ? '' : String(profile.maxHr));
  const [dob, setDob] = useState(profile.dob);
  const [heightCm, setHeightCm] = useState<number | null>(profile.heightCm ?? null);
  const [saved, setSaved] = useState(false);
  const [healthMsg, setHealthMsg] = useState<string | null>(null);

  const [apiKeyDraft, setApiKeyDraft] = useState(anthropicApiKey ?? '');
  const [goalDistance, setGoalDistance] = useState<RaceDistanceKey>(goal?.distanceKey ?? 'Marathon');
  const [goalTime, setGoalTime] = useState(goal?.targetTimeS ? hms(goal.targetTimeS) : '');
  const [goalDate, setGoalDate] = useState(goal?.raceDate ?? '');
  const [goalSaved, setGoalSaved] = useState(false);

  const age = Math.max(15, Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)));
  const [zonesMsg, setZonesMsg] = useState<string | null>(null);

  function calculateZonesFromData() {
    const measuredMax = observedMaxHr(engine.enriched.map((e) => e.activity));
    if (measuredMax == null) {
      setZonesMsg('No heart rate data found in your runs yet.');
      return;
    }
    const maxToUse = Math.max(measuredMax, profile.maxHr);
    const zones = computeZones(profile.restingHr, maxToUse).value;
    setProfile({ ...profile, maxHr: maxToUse, maxHrIsEstimated: false, hrZones: zones });
    setMaxHr(String(maxToUse));
    setZonesMsg(
      `Zones set from a measured max of ${maxToUse} bpm and your resting rate of ${profile.restingHr} bpm.`,
    );
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
  } as const;

  const Label = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>{children}</Text>
  );

  function save() {
    setProfile({
      ...profile,
      dob,
      heightCm,
      weightKg: mi ? weight / 2.20462 : weight,
      restingHr: restingHr || profile.restingHr,
      maxHr: maxHr ? Number(maxHr) : 220 - age,
      maxHrIsEstimated: !maxHr,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function saveGoal() {
    const targetTimeS = parseHms(goalTime);
    setGoal({
      distanceKey: goalDistance,
      targetTimeS,
      raceDate: goalDate || null,
      courseName: null,
    } satisfies RaceGoal);
    setGoalSaved(true);
    setTimeout(() => setGoalSaved(false), 2000);
  }

  async function exportData() {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile,
        goal,
        activities: engine.enriched.map((e) => ({
          ...e.activity,
          weather: e.weather,
          workoutType: e.workoutType,
          workoutTypeSource: e.workoutTypeSource,
          trimp: e.trimp?.value ?? null,
          vo2max: e.vo2max?.value ?? null,
          qualityFlags: e.flags,
        })),
      },
      null,
      2,
    );
    if (Platform.OS === 'web') {
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = url;
      el.download = 'apex-export.json';
      el.click();
      URL.revokeObjectURL(url);
    } else {
      await Share.share({ message: payload });
    }
  }

  function confirmReset() {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm('Delete all local data and start over?')) resetAll();
    } else {
      Alert.alert('Delete everything?', 'This wipes all local data and returns to onboarding.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => resetAll() },
      ]);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.page }}
      contentContainerStyle={{ padding: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center', gap: spacing.lg, paddingBottom: 60 }}
    >
      {/* Race goal */}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 }}>
          Race goal
        </Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.md }}>
          Projections and the coach track your progress against this.
        </Text>
        <View style={{ gap: spacing.md }}>
          <Segmented
            options={(['5K', '10K', 'Half', 'Marathon'] as RaceDistanceKey[]).map((k) => ({ key: k, label: k }))}
            value={goalDistance}
            onChange={setGoalDistance}
          />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Label>Target time (h:mm:ss)</Label>
              <TextInput style={inputStyle} value={goalTime} onChangeText={setGoalTime} placeholder="3:45:00" placeholderTextColor={theme.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Race date (optional)</Label>
              <FieldDate value={goalDate} onChange={setGoalDate} minimumDate={new Date()} />
            </View>
          </View>
          <PrimaryButton title={goalSaved ? 'Saved' : 'Save goal'} onPress={saveGoal} />
          {goal && (
            <GhostButton title="Clear goal" onPress={() => { setGoal(null); setGoalTime(''); setGoalDate(''); }} />
          )}
        </View>
      </Card>

      {/* AI Insight */}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 }}>
          AI Insight
        </Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.md }}>
          Workout reads, goal odds, and training plans are written by an AI model from your data. By
          default this runs through Apex's own service with nothing to set up. If you prefer, you can use
          your own Anthropic API key instead. It stays on this device and requests then go directly to
          Anthropic.
        </Text>
        <Label>Your own Anthropic API key (optional)</Label>
        <TextInput
          style={inputStyle}
          value={apiKeyDraft}
          onChangeText={setApiKeyDraft}
          placeholder="sk-ant-..."
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={{ marginTop: spacing.sm }}>
          <PrimaryButton
            title={anthropicApiKey ? 'Update key' : 'Save key'}
            onPress={() => setAnthropicApiKey(apiKeyDraft.trim() || null)}
          />
        </View>
        {anthropicApiKey && (
          <Text style={{ fontSize: 12, color: theme.status.good, marginTop: 6 }}>
            Using your key for all AI features.
          </Text>
        )}
      </Card>

      {/* Heart rate zones */}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 }}>
          Heart rate zones
        </Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.md }}>
          Zones use the Karvonen method, which anchors to both your resting and max heart rate. The most
          accurate zones come from your own data: the highest heart rate ever recorded on a run is a
          measured max, which beats the age formula.
        </Text>
        <View style={{ gap: 4, marginBottom: spacing.md }}>
          {engine.hrZones.slice(0, 5).map((lo, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: zoneColors(theme)[i] }} />
              <Text style={{ fontSize: 13, color: theme.textSecondary, width: 110 }}>
                Z{i + 1} {ZONE_NAMES[i]}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary, fontVariant: ['tabular-nums'] }}>
                {lo} to {i < 4 ? engine.hrZones[i + 1] - 1 : engine.hrZones[5]} bpm
              </Text>
            </View>
          ))}
        </View>
        <PrimaryButton title="Calculate zones from my data" onPress={calculateZonesFromData} />
        {zonesMsg && <Text style={{ fontSize: 12, color: theme.status.good, marginTop: 6 }}>{zonesMsg}</Text>}
        {profile.hrZones && (
          <View style={{ marginTop: spacing.sm }}>
            <GhostButton
              title="Reset to formula zones"
              onPress={() => {
                setProfile({ ...profile, hrZones: null });
                setZonesMsg('Back to formula zones from your profile numbers.');
              }}
            />
          </View>
        )}
      </Card>

      {/* Connected accounts */}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: spacing.sm }}>
          Data source
        </Text>
        <Text style={{ fontSize: 13, color: theme.textSecondary }}>
          {[
            source === 'demo' ? 'Demo data (generated)' : null,
            stravaConnected ? 'Strava connected' : null,
            healthConnected ? 'Apple Health connected' : null,
          ]
            .filter(Boolean)
            .join('. ') || 'No source connected yet'}
        </Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
          Synced {fmtRelativeTime(sync.phase === 'idle' || sync.phase === 'error' ? sync.lastSyncedAt : null)}
          {sync.phase === 'backfill' && `. Syncing (${sync.count})`}
          {sync.phase === 'weather' && `. Weather ${sync.done}/${sync.total}`}
        </Text>
        {sync.phase === 'error' && (
          <Text style={{ fontSize: 12, color: theme.status.critical, marginTop: 4 }}>{sync.message}</Text>
        )}
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {healthAvailable && !healthConnected && (
            <PrimaryButton
              title="Connect Apple Health"
              onPress={async () => {
                setHealthMsg(null);
                try {
                  await connectHealth();
                  setHealthMsg('Apple Health connected. New Apple Watch runs will sync automatically.');
                } catch (e: any) {
                  setHealthMsg(e?.message ?? 'Apple Health connection failed.');
                }
              }}
            />
          )}
          {healthConnected && (
            <GhostButton
              title="Re-import from Apple Health"
              onPress={async () => {
                setHealthMsg(null);
                try {
                  await reimportHealth();
                  setHealthMsg('Re-imported. Only running workouts are kept, and duplicates are removed.');
                } catch (e: any) {
                  setHealthMsg(e?.message ?? 'Re-import failed.');
                }
              }}
            />
          )}
          {healthMsg && <Text style={{ fontSize: 12, color: theme.textSecondary }}>{healthMsg}</Text>}
          <GhostButton title="Sync now" onPress={syncNow} />
          {source !== 'demo' && <GhostButton title="Load demo data instead" onPress={loadDemoData} />}
        </View>
      </Card>

      {/* Notifications */}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 }}>
          Workout recap notifications
        </Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.md }}>
          When a new workout syncs in, Apex sends one notification recapping what mattered most about
          it: unusual strain, tough weather handled, a distance milestone, or your optimal next step.
        </Text>
        <Segmented
          options={[
            { key: 'on', label: 'On' },
            { key: 'off', label: 'Off' },
          ]}
          value={recapNotifications ? 'on' : 'off'}
          onChange={(v) => setRecapNotifications(v === 'on')}
        />
      </Card>

      {/* Profile */}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: spacing.md }}>
          Profile
        </Text>
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 0 }}>
            <Label>Sex</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pill label="Male" selected={profile.sex === 'M'} onPress={() => setProfile({ ...profile, sex: 'M' })} />
              <Pill label="Female" selected={profile.sex === 'F'} onPress={() => setProfile({ ...profile, sex: 'F' })} />
            </View>
          </View>
          <View>
            <Label>Date of birth</Label>
            <FieldDate value={dob} onChange={setDob} maximumDate={new Date()} minimumDate={new Date('1920-01-01')} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Label>{`Weight (${mi ? 'lb' : 'kg'})`}</Label>
              <FieldStepper value={weight} onChange={setWeight} min={mi ? 66 : 30} max={mi ? 400 : 180} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Resting HR</Label>
              <FieldStepper value={restingHr} onChange={setRestingHr} min={30} max={100} unit="bpm" />
            </View>
          </View>
          <View>
            <Label>Height (optional)</Label>
            <FieldHeight heightCm={heightCm} onChange={setHeightCm} metric={!mi} />
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
              Used to compare cadence and stride to runners of your height.
            </Text>
          </View>
          <View>
            <Label>Max HR</Label>
            <TextInput
              style={inputStyle}
              value={maxHr}
              onChangeText={setMaxHr}
              keyboardType="numeric"
              placeholder={`About ${220 - age}, estimated from age`}
              placeholderTextColor={theme.textMuted}
            />
            {profile.maxHrIsEstimated && !maxHr && (
              <Text style={{ fontSize: 12, color: theme.status.warning, marginTop: 4 }}>
                Currently estimated. Metrics that use it carry this caveat until you set a measured value.
              </Text>
            )}
          </View>
          <View>
            <Label>Units</Label>
            <Segmented
              options={[
                { key: 'mi_f', label: 'miles and °F' },
                { key: 'km_c', label: 'km and °C' },
              ]}
              value={profile.units}
              onChange={(u) => setProfile({ ...profile, units: u })}
            />
          </View>
          <PrimaryButton title={saved ? 'Saved' : 'Save profile'} onPress={save} />
        </View>
      </Card>

      {/* Data controls */}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: spacing.sm }}>
          Your data
        </Text>
        <View style={{ gap: spacing.sm }}>
          <GhostButton title="Export my data (JSON)" onPress={exportData} />
          <GhostButton title="Delete all data" onPress={confirmReset} />
        </View>
        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: spacing.sm }}>
          Analysis runs on this device. The export includes activities, weather, and computed metrics.
        </Text>
      </Card>

      <Text style={{ fontSize: 11, color: theme.textMuted, textAlign: 'center' }}>
        Estimates are statistical, not medical advice.
      </Text>
    </ScrollView>
  );
}

function hms(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function parseHms(v: string): number | null {
  const parts = v.trim().split(':').map(Number);
  if (parts.some(isNaN) || parts.length === 0 || parts.length > 3) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 60;
}
