import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart } from '../../components/charts/BarChart';
import { FieldDate } from '../../components/ui/fields';
import { MultiLine } from '../../components/charts/MultiLine';
import { TrendChart } from '../../components/charts/TrendChart';
import { NextRunOutlook } from '../../components/NextRunOutlook';
import { CountUp } from '../../components/ui/CountUp';
import { Badge, Card, GhostButton, PrimaryButton, Segmented, statusColor } from '../../components/ui/primitives';
import {
  generateTrainingPlan,
  nextScheduledRun,
  parseTrainingPlan,
  planAdherence,
  PlanRun,
  reconcileNextRun,
  RunReconciliation,
  samplePlan,
} from '../../lib/ai/plans';
import { fmtPaceShort } from '../../lib/format';
import { label as typeLabel } from '../../lib/formulas/classifier';
import { RaceDistanceKey } from '../../lib/formulas/projections';
import { useAppState } from '../../lib/state/AppState';
import { radius, spacing, type, workoutTypeColor } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

export default function Training() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { engine, profile, goal, anthropicApiKey, trainingPlan, setTrainingPlan, setGoal } = useAppState();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 640) - spacing.lg * 2;

  const [mode, setMode] = useState<'home' | 'generate' | 'import'>('home');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // generate form
  const [genDistance, setGenDistance] = useState<RaceDistanceKey>(goal?.distanceKey ?? 'Marathon');
  const [genDate, setGenDate] = useState(goal?.raceDate ?? '');
  const [genTime, setGenTime] = useState('');
  const [genDays, setGenDays] = useState('5');

  // import form
  const [importText, setImportText] = useState('');
  const [importImage, setImportImage] = useState<{ base64: string; mediaType: string } | null>(null);

  const [reconciliation, setReconciliation] = useState<RunReconciliation | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  const todayISO = new Date().toISOString().slice(0, 10);
  const completedDates = useMemo(
    () => new Set(engine.enriched.map((e) => e.activity.startTime.slice(0, 10))),
    [engine.enriched],
  );

  const nextRun = trainingPlan ? nextScheduledRun(trainingPlan, todayISO) : null;
  const daysToRace = trainingPlan?.raceDate
    ? Math.max(0, Math.round((new Date(trainingPlan.raceDate).getTime() - Date.now()) / 86400000))
    : null;

  const sincePlanPace = useMemo(() => {
    if (!trainingPlan) return [];
    const start = new Date(trainingPlan.startDate).getTime();
    return engine.enriched
      .filter((e) => !e.excluded && new Date(e.activity.startTime).getTime() >= start)
      .map((e) => ({ x: new Date(e.activity.startTime).getTime(), y: e.rawPaceSPerKm }))
      .reverse();
  }, [trainingPlan, engine.enriched]);

  const adherence = trainingPlan ? planAdherence(trainingPlan, completedDates, todayISO) : null;

  const preview = useMemo(() => samplePlan(todayISO), [todayISO]);

  /** Plan target vs actually run, per plan week. */
  const weeklySeries = useMemo(() => {
    if (!trainingPlan || trainingPlan.weeks.length < 2) return null;
    const weekStart = (w: { runs: PlanRun[] }) => w.runs[0]?.dateISO ?? trainingPlan.startDate;
    const target = trainingPlan.weeks.map((w) => ({
      x: new Date(weekStart(w)).getTime(),
      y: w.targetMileage,
    }));
    const actual = trainingPlan.weeks
      .map((w) => {
        const start = new Date(weekStart(w)).getTime();
        const end = start + 7 * 86400000;
        const mi = engine.enriched
          .filter((e) => {
            const t = new Date(e.activity.startTime).getTime();
            return t >= start && t < end;
          })
          .reduce((s, e) => s + e.activity.distanceM / 1609.344, 0);
        return { x: start, y: Math.round(mi * 10) / 10 };
      })
      .filter((p) => p.x <= Date.now());
    if (actual.length === 0) return null;
    return { target, actual };
  }, [trainingPlan, engine.enriched]);
  const currentWeek = useMemo(() => {
    if (!trainingPlan) return null;
    return (
      trainingPlan.weeks.find((w) => w.runs.some((r) => r.dateISO >= todayISO)) ??
      trainingPlan.weeks[trainingPlan.weeks.length - 1] ??
      null
    );
  }, [trainingPlan, todayISO]);

  async function handleGenerate() {
    setError(null);
    if (!genDate || isNaN(new Date(genDate).getTime())) {
      setError('Enter a race date, for example 2026-11-01.');
      return;
    }
    setBusy('Building your plan from your training history');
    try {
      const parts = genTime.trim().split(':').map(Number);
      const targetTimeS =
        !parts.some(isNaN) && parts.length >= 2
          ? parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts[0] * 60 + parts[1]
          : null;
      const g = { distanceKey: genDistance, targetTimeS, raceDate: genDate, courseName: null };
      const plan = await generateTrainingPlan(
        anthropicApiKey,
        g,
        Math.min(7, Math.max(3, Number(genDays) || 5)),
        engine,
        todayISO,
      );
      setTrainingPlan(plan);
      setGoal(g);
      setMode('home');
    } catch (e: any) {
      setError(e?.message ?? 'Plan generation failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setError(null);
    if (!importText.trim() && !importImage) {
      setError('Paste your plan text or choose an image of it.');
      return;
    }
    setBusy('Reading your plan');
    try {
      const plan = await parseTrainingPlan(
        anthropicApiKey,
        {
          text: importText.trim() || undefined,
          imageBase64: importImage?.base64,
          imageMediaType: importImage?.mediaType,
        },
        todayISO,
      );
      setTrainingPlan(plan);
      setMode('home');
    } catch (e: any) {
      setError(e?.message ?? 'Could not read the plan');
    } finally {
      setBusy(null);
    }
  }

  function pickImage() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const [head, base64] = dataUrl.split(',');
        const mediaType = head.match(/data:(.*?);/)?.[1] ?? 'image/png';
        setImportImage({ base64, mediaType });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function handleReconcile() {
    if (!nextRun) return;
    setBusy('Weighing the plan against your current fatigue');
    setError(null);
    try {
      setReconciliation(await reconcileNextRun(anthropicApiKey, nextRun, engine));
    } catch (e: any) {
      setError(e?.message ?? 'Check failed');
    } finally {
      setBusy(null);
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.textPrimary,
    backgroundColor: theme.surface,
  } as const;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.page }}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingTop: insets.top + spacing.md,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
        paddingBottom: 40,
      }}
    >
      <Text style={[type.title, { color: theme.textPrimary, marginBottom: spacing.md }]}>Training</Text>

      {busy && (
        <Card style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={theme.accent} />
            <Text style={{ fontSize: 13, color: theme.textSecondary }}>{busy}</Text>
          </View>
        </Card>
      )}
      {error && (
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={{ fontSize: 13, color: theme.status.critical }}>{error}</Text>
        </Card>
      )}

      {/* ---------- No plan ---------- */}
      {!trainingPlan && mode === 'home' && (
        <View style={{ gap: spacing.md }}>
          <Card style={{ borderColor: theme.accent, borderWidth: 1 }}>
            <Text style={[type.cardTitle, { color: theme.textPrimary }]}>
              What could you run with the right plan?
            </Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginTop: 6 }}>
              Apex builds a week-by-week plan around your actual training history. It starts from your
              current volume, ramps safely, and tapers into race day.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <PrimaryButton title="Build my plan" onPress={() => setMode('generate')} />
            </View>
          </Card>

          <Card>
            <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Already following a plan?</Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginTop: 6 }}>
              Paste it as text or upload a photo and Apex will track your progress against it.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <GhostButton title="Import my plan" onPress={() => setMode('import')} />
            </View>
          </Card>

          {/* Sample plan preview so the page is never blank */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[type.cardTitle, { color: theme.textPrimary }]}>What a plan looks like</Text>
              <Badge label="sample" color={theme.textMuted} subtle />
            </View>
            <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginTop: 6 }}>
              A 10 week half marathon build at 5 days per week. Volume climbs gently, cuts back every
              fourth week to absorb the work, and tapers into race day.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <BarChart
                bars={preview.weeks.map((w) => ({
                  label: `W${w.weekNumber}`,
                  value: Math.round(w.targetMileage),
                }))}
                width={contentW - spacing.lg * 2}
                formatValue={(v) => `${v} mi`}
              />
            </View>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: spacing.sm, marginBottom: 4 }}>
              Week 1 would look like this:
            </Text>
            {preview.weeks[0].runs.map((r, i) => (
              <PlanRunRow key={i} run={r} done={false} past={false} />
            ))}
            <View style={{ marginTop: spacing.md }}>
              <GhostButton title="Start with this sample plan" onPress={() => setTrainingPlan(preview)} />
            </View>
          </Card>
        </View>
      )}

      {/* ---------- Generate form ---------- */}
      {!trainingPlan && mode === 'generate' && (
        <View style={{ gap: spacing.md }}>
          <Card>
            <Text style={[type.cardTitle, { color: theme.textPrimary, marginBottom: spacing.md }]}>
              Tell us about the race
            </Text>
            <View style={{ gap: spacing.md }}>
              <Segmented
                options={(['5K', '10K', 'Half', 'Marathon'] as RaceDistanceKey[]).map((k) => ({ key: k, label: k }))}
                value={genDistance}
                onChange={setGenDistance}
              />
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>
                  Race date
                </Text>
                <FieldDate value={genDate} onChange={setGenDate} minimumDate={new Date()} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>
                  Goal time (optional)
                </Text>
                <TextInput style={inputStyle} value={genTime} onChangeText={setGenTime} placeholder="3:45:00" placeholderTextColor={theme.textMuted} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>
                  Running days per week
                </Text>
                <Segmented
                  options={['3', '4', '5', '6'].map((d) => ({ key: d, label: d }))}
                  value={genDays}
                  onChange={setGenDays}
                />
              </View>
              <Text style={{ fontSize: 12, color: theme.textMuted }}>
                The plan is drafted by Claude from your history (about {Math.round(engine.currentMpw)} miles
                per week right now) and then checked against the 10 percent ramp guideline by the formula
                engine.
              </Text>
              <PrimaryButton title="Build the plan" onPress={handleGenerate} />
              <GhostButton title="Back" onPress={() => setMode('home')} />
            </View>
          </Card>
        </View>
      )}

      {/* ---------- Import form ---------- */}
      {!trainingPlan && mode === 'import' && (
        <Card>
          <Text style={[type.cardTitle, { color: theme.textPrimary, marginBottom: spacing.sm }]}>
            Import a plan
          </Text>
          <TextInput
            style={[inputStyle, { minHeight: 120, textAlignVertical: 'top' }]}
            value={importText}
            onChangeText={setImportText}
            multiline
            placeholder={'Paste the plan here. For example:\nWeek 1: Mon easy 4, Wed tempo 5, Sat long 8...'}
            placeholderTextColor={theme.textMuted}
          />
          {Platform.OS === 'web' && (
            <View style={{ marginTop: spacing.sm }}>
              <GhostButton
                title={importImage ? 'Image attached. Choose a different one' : 'Or upload a photo of the plan'}
                onPress={pickImage}
              />
            </View>
          )}
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <PrimaryButton title="Read my plan" onPress={handleImport} />
            <GhostButton title="Back" onPress={() => setMode('home')} />
          </View>
        </Card>
      )}

      {/* ---------- Active plan ---------- */}
      {trainingPlan && (
        <View style={{ gap: spacing.md }}>
          {/* Header stats */}
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {daysToRace != null && (
              <Card style={{ flex: 1, alignItems: 'center' }}>
                <CountUp
                  value={daysToRace}
                  format={(v) => `${Math.round(v)}`}
                  style={[type.hero, { color: theme.textPrimary }] as any}
                />
                <Text style={[type.microLabel, { color: theme.textMuted }]}>days to race</Text>
              </Card>
            )}
            {adherence && adherence.planned > 0 && (
              <Card style={{ flex: 1, alignItems: 'center' }}>
                <CountUp
                  value={(adherence.done / adherence.planned) * 100}
                  format={(v) => `${Math.round(v)}%`}
                  style={[type.hero, { color: theme.textPrimary }] as any}
                />
                <Text style={[type.microLabel, { color: theme.textMuted }]}>plan kept, last 14 days</Text>
              </Card>
            )}
          </View>

          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[type.cardTitle, { color: theme.textPrimary }]}>{trainingPlan.name}</Text>
              <Badge
                label={trainingPlan.source === 'generated' ? 'built for you' : 'imported'}
                color={theme.accent}
                subtle
              />
            </View>
            {trainingPlan.notes.map((n, i) => (
              <Text key={i} style={{ fontSize: 12, color: theme.textMuted, marginTop: 6, lineHeight: 17 }}>
                {n}
              </Text>
            ))}
          </Card>

          {/* Weather outlook for the next scheduled run */}
          <NextRunOutlook />

          {/* Next run + reconciliation */}
          {nextRun && (
            <Card style={{ borderColor: theme.accent, borderWidth: 1 }}>
              <Text style={[type.microLabel, { color: theme.textMuted }]}>Next scheduled run</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Badge label={typeLabel(nextRun.type)} color={workoutTypeColor(nextRun.type, theme)} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary }}>
                  {nextRun.distanceMi} mi on{' '}
                  {new Date(nextRun.dateISO).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, lineHeight: 18 }}>
                {nextRun.description}
              </Text>

              {!reconciliation && (
                <Pressable
                  onPress={handleReconcile}
                  style={{
                    marginTop: spacing.md,
                    backgroundColor: theme.accent,
                    borderRadius: radius.sm,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    Am I ready for this run?
                  </Text>
                </Pressable>
              )}

              {reconciliation && (
                <View
                  style={{
                    marginTop: spacing.md,
                    backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    borderRadius: radius.md,
                    padding: spacing.md,
                    gap: 6,
                  }}
                >
                  <Badge
                    label={
                      reconciliation.verdict === 'go_as_planned'
                        ? 'Go as planned'
                        : reconciliation.verdict === 'modify'
                          ? 'Modify it'
                          : 'Swap or rest'
                    }
                    color={
                      reconciliation.verdict === 'go_as_planned'
                        ? theme.status.good
                        : reconciliation.verdict === 'modify'
                          ? theme.status.warning
                          : theme.status.serious
                    }
                  />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>
                    {reconciliation.headline}
                  </Text>
                  <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
                    {reconciliation.reasoning}
                  </Text>
                  {reconciliation.adjustedWorkout && (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>
                      Instead: {reconciliation.adjustedWorkout}
                    </Text>
                  )}
                </View>
              )}
            </Card>
          )}

          {/* This week */}
          {currentWeek && (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[type.cardTitle, { color: theme.textPrimary }]}>
                  Week {currentWeek.weekNumber} of {trainingPlan.weeks.length}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted }}>
                  target {Math.round(currentWeek.targetMileage)} mi
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{currentWeek.focus}</Text>
              <View style={{ marginTop: spacing.sm }}>
                {currentWeek.runs.map((r, i) => (
                  <PlanRunRow key={i} run={r} done={completedDates.has(r.dateISO)} past={r.dateISO < todayISO} />
                ))}
              </View>
            </Card>
          )}

          {/* Weekly mileage: plan vs reality */}
          {weeklySeries && (
            <Card>
              <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Weekly miles, plan vs run</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: spacing.sm }}>
                The plan's weekly targets against what you have actually logged each plan week.
              </Text>
              <MultiLine
                series={[
                  { name: 'Plan', color: theme.textMuted, points: weeklySeries.target },
                  { name: 'You', color: theme.accent, points: weeklySeries.actual },
                ]}
                width={contentW - spacing.lg * 2}
                formatY={(v) => `${Math.round(v)}`}
                invertY={false}
              />
            </Card>
          )}

          {/* Pace since plan start */}
          {sincePlanPace.length >= 3 && (
            <Pressable onPress={() => router.push({ pathname: '/metric/[key]', params: { key: 'pace' } })}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={[type.cardTitle, { color: theme.textPrimary }]}>Pace since the plan started</Text>
                  <Text style={{ fontSize: 12, color: theme.accent, fontWeight: '600' }}>Expand</Text>
                </View>
                <TrendChart
                  data={sincePlanPace}
                  width={contentW - spacing.lg * 2}
                  formatY={(v) => fmtPaceShort(v, profile.units)}
                  invertY
                />
              </Card>
            </Pressable>
          )}

          {/* Load status shortcut */}
          <Pressable onPress={() => router.push({ pathname: '/metric/[key]', params: { key: 'acwr' } })}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={[type.microLabel, { color: theme.textMuted }]}>Training load</Text>
                  <Text style={[type.stat, { color: theme.textPrimary }]}>
                    {engine.currentAcwr?.toFixed(2) ?? 'n/a'}
                  </Text>
                </View>
                <Badge
                  label={engine.currentAcwrStatus.replace('_', ' ')}
                  color={statusColor(engine.currentAcwrStatus, theme)}
                  subtle
                />
              </View>
            </Card>
          </Pressable>

          {/* Full plan */}
          <Card>
            <Text style={[type.cardTitle, { color: theme.textPrimary, marginBottom: spacing.sm }]}>
              The full plan
            </Text>
            {trainingPlan.weeks.map((w) => (
              <View key={w.weekNumber}>
                <Pressable
                  onPress={() => setExpandedWeek(expandedWeek === w.weekNumber ? null : w.weekNumber)}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    borderTopWidth: w.weekNumber === trainingPlan.weeks[0].weekNumber ? 0 : 1,
                    borderTopColor: theme.border,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>
                    Week {w.weekNumber}
                  </Text>
                  <Text style={{ fontSize: 13, color: theme.textMuted }}>
                    {Math.round(w.targetMileage)} mi {expandedWeek === w.weekNumber ? 'hide' : 'show'}
                  </Text>
                </Pressable>
                {expandedWeek === w.weekNumber && (
                  <View style={{ paddingBottom: spacing.sm }}>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>{w.focus}</Text>
                    {w.runs.map((r, i) => (
                      <PlanRunRow key={i} run={r} done={completedDates.has(r.dateISO)} past={r.dateISO < todayISO} />
                    ))}
                  </View>
                )}
              </View>
            ))}
          </Card>

          <GhostButton title="Remove this plan" onPress={() => setTrainingPlan(null)} />
        </View>
      )}
    </ScrollView>
  );
}

function PlanRunRow({ run, done, past }: { run: PlanRun; done: boolean; past: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: done ? theme.status.good : past ? theme.status.serious : theme.border,
          backgroundColor: done ? theme.status.good : 'transparent',
        }}
      />
      <Text style={{ fontSize: 12, color: theme.textMuted, width: 64 }}>
        {new Date(run.dateISO).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
      </Text>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: workoutTypeColor(run.type, theme) }} />
      <Text style={{ flex: 1, fontSize: 13, color: theme.textSecondary }} numberOfLines={1}>
        {run.distanceMi} mi {typeLabel(run.type).toLowerCase()}
      </Text>
    </View>
  );
}
