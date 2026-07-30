import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart } from '../../components/charts/BarChart';
import { MultiLine } from '../../components/charts/MultiLine';
import { FieldDate } from '../../components/ui/fields';
import { HowCalculated } from '../../components/HowCalculated';
import { Badge, Card, Segmented, statusColor } from '../../components/ui/primitives';
import { fmtPaceShort } from '../../lib/format';
import { raceBenchmarks, requiredRamp } from '../../lib/formulas/benchmarks';
import { paceTrendProjection } from '../../lib/formulas/pacetrend';
import { formatHms } from '../../lib/formulas/riegel';
import {
  courseTimePenaltyS,
  projectScenarios,
  RACE_DISTANCES,
  RaceDistanceKey,
  Scenario,
  splitProfile,
} from '../../lib/formulas/projections';
import { useAppState } from '../../lib/state/AppState';
import { radius, spacing } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

type HorizonKey = 'now' | '30' | '60' | '90' | '180' | 'custom' | 'race';

const SCENARIO_META: Record<Scenario, { label: string }> = {
  conservative: { label: 'Conservative' },
  target: { label: 'Target' },
  stretch: { label: 'Stretch' },
};

export default function Projections() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { engine, courses, activeCourseId, setActiveCourse, goal, trainingPlan, profile } = useAppState();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 640) - spacing.lg * 2;

  // Days until the saved goal race, when one exists and is in the future.
  const raceDays = useMemo(() => {
    if (!goal?.raceDate) return null;
    const t = new Date(goal.raceDate).getTime();
    if (isNaN(t)) return null;
    const d = Math.round((t - Date.now()) / 86400000);
    return d > 0 ? d : null;
  }, [goal?.raceDate]);

  // Default straight to the user's race when they have one saved.
  const [distance, setDistance] = useState<RaceDistanceKey>(goal?.distanceKey ?? 'Marathon');
  const [horizonKey, setHorizonKey] = useState<HorizonKey>(raceDays != null ? 'race' : '90');
  const [customDate, setCustomDate] = useState(goal?.raceDate ?? '');
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);

  const horizon = useMemo(() => {
    if (horizonKey === 'now') return 0;
    if (horizonKey === 'race') return raceDays ?? 90;
    if (horizonKey === 'custom') {
      const t = new Date(customDate).getTime();
      if (isNaN(t)) return 90;
      return Math.max(0, Math.round((t - Date.now()) / 86400000));
    }
    return Number(horizonKey);
  }, [horizonKey, customDate, raceDays]);

  const course = courses.find((c) => c.id === activeCourseId) ?? null;

  const projection = useMemo(
    () => projectScenarios(engine.bestEfforts, RACE_DISTANCES[distance], horizon, engine.currentMpw),
    [engine.bestEfforts, engine.currentMpw, distance, horizon],
  );

  const coursePenalty = useMemo(() => {
    if (!course || !projection) return null;
    const target = projection.bands.find((b) => b.scenario === 'target')!;
    const mid = (target.lowS + target.highS) / 2;
    return courseTimePenaltyS(mid, course.distanceM, course.elevationGainM, course.expectedTempC, course.expectedHumidityPct);
  }, [course, projection]);

  // cold start: < 3 weeks of history or < 12 runs
  const historySpanDays = useMemo(() => {
    if (engine.enriched.length === 0) return 0;
    const oldest = engine.enriched[engine.enriched.length - 1].activity.startTime;
    return (Date.now() - new Date(oldest).getTime()) / 86400000;
  }, [engine.enriched]);
  const coldStart = historySpanDays < 21 || engine.enriched.length < 12 || engine.bestEfforts.length === 0;

  const scenarioColors: Record<Scenario, string> = {
    conservative: theme.series.aqua,
    target: theme.accent,
    stretch: theme.series.violet,
  };

  // pre-race benchmark checkpoints
  const benchmarks = useMemo(() => {
    if (!projection) return [];
    const target = projection.bands.find((b) => b.scenario === 'target')!;
    const goalTimeS =
      goal && goal.distanceKey === distance && goal.targetTimeS
        ? goal.targetTimeS
        : (target.lowS + target.highS) / 2;
    const raceDate =
      goal && goal.distanceKey === distance && goal.raceDate
        ? goal.raceDate
        : horizonKey === 'custom' && !isNaN(new Date(customDate).getTime())
          ? customDate
          : null;
    const completed = engine.enriched
      .filter((e) => !e.excluded)
      .map((e) => ({
        dateISO: e.activity.startTime.slice(0, 10),
        distanceMi: e.activity.distanceM / 1609.344,
      }));
    return raceBenchmarks(
      distance,
      goalTimeS,
      raceDate,
      engine.hrZones,
      completed,
      new Date().toISOString().slice(0, 10),
    );
  }, [projection, goal, distance, horizonKey, customDate, engine.enriched, engine.hrZones]);

  // weekly mileage path: the active plan when there is one, else the ramp the target scenario implies
  const mileageBars = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    if (trainingPlan && trainingPlan.weeks.length > 0) {
      const currentWeekNum =
        trainingPlan.weeks.find((w) => w.runs.some((r) => r.dateISO >= todayISO))?.weekNumber ?? -1;
      return trainingPlan.weeks.map((w) => ({
        label: `W${w.weekNumber}`,
        value: Math.round(w.targetMileage),
        highlighted: w.weekNumber === currentWeekNum,
      }));
    }
    if (!projection || horizon < 21) return [];
    const target = projection.bands.find((b) => b.scenario === 'target')!;
    const peak = (target.peakMpw[0] + target.peakMpw[1]) / 2;
    const weeks = Math.min(24, Math.max(4, Math.round(horizon / 7)));
    return requiredRamp(engine.currentMpw, peak, weeks).map((w) => ({
      label: `W${w.week}`,
      value: w.mpw,
      highlighted: false,
    }));
  }, [trainingPlan, projection, horizon, engine.currentMpw]);

  // future pace projection from comparable (easy and long) runs
  const paceTrend = useMemo(() => {
    const cutoff = Date.now() - 180 * 86400000;
    const history = engine.enriched
      .filter(
        (e) =>
          !e.excluded &&
          (e.workoutType === 'easy' || e.workoutType === 'long') &&
          new Date(e.activity.startTime).getTime() >= cutoff,
      )
      .map((e) => ({
        x: new Date(e.activity.startTime).getTime(),
        y: e.adjustedPace?.value ?? e.rawPaceSPerKm,
      }));
    return paceTrendProjection(history, Math.max(30, horizon));
  }, [engine.enriched, horizon]);

  const splitSeries = useMemo(() => {
    if (!projection) return [];
    return projection.bands.map((b) => {
      const mid = (b.lowS + b.highS) / 2 + (coursePenalty ? (coursePenalty.lowS + coursePenalty.highS) / 2 : 0);
      const splits = splitProfile(mid, RACE_DISTANCES[distance], course?.keyFeatures ?? []);
      return {
        name: SCENARIO_META[b.scenario].label,
        color: scenarioColors[b.scenario],
        points: splits.map((s) => ({ x: s.mile, y: s.paceSPerMi })),
      };
    });
  }, [projection, coursePenalty, distance, course, theme]);

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
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.textPrimary, marginBottom: spacing.md }}>
        Race projections
      </Text>

      <Segmented
        options={(Object.keys(RACE_DISTANCES) as RaceDistanceKey[]).map((k) => ({ key: k, label: k }))}
        value={distance}
        onChange={setDistance}
      />
      <View style={{ height: spacing.sm }} />
      <Segmented
        options={[
          ...(raceDays != null
            ? [{ key: 'race' as HorizonKey, label: `Race ${raceDays}d` }]
            : []),
          { key: 'now' as HorizonKey, label: 'Now' },
          { key: '30' as HorizonKey, label: '30D' },
          { key: '90' as HorizonKey, label: '90D' },
          { key: '180' as HorizonKey, label: '180D' },
          { key: 'custom' as HorizonKey, label: 'Date' },
        ]}
        value={horizonKey}
        onChange={setHorizonKey}
      />
      {horizonKey === 'race' && goal?.raceDate && (
        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>
          Projecting to your goal race on{' '}
          {new Date(goal.raceDate + 'T12:00:00').toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
          , {raceDays} days away.
        </Text>
      )}
      {horizonKey === 'custom' && (
        <View style={{ marginTop: spacing.sm }}>
          <FieldDate value={customDate} onChange={setCustomDate} minimumDate={new Date()} placeholder="Pick a race date" />
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
            {isNaN(new Date(customDate).getTime())
              ? 'Pick a date to project to it.'
              : `Projecting ${horizon} days out.`}
          </Text>
        </View>
      )}

      {coldStart ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary }}>Not enough history yet</Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6, lineHeight: 19 }}>
            Projections need at least 3 weeks of history, 12 runs, and one quality effort (a race or tempo).
            We won't show a fake-confident number before that.
          </Text>
          <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 8 }}>
            So far you have {Math.floor(historySpanDays)} days of history, {engine.enriched.length} runs, and {engine.bestEfforts.length} quality efforts.
          </Text>
        </Card>
      ) : (
        projection && (
          <>
            {/* Scenario bands, side by side for comparison */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
              {projection.bands.map((b) => {
                const isTarget = b.scenario === 'target';
                const cp = coursePenalty;
                const lo = b.lowS + (cp?.lowS ?? 0);
                const hi = b.highS + (cp?.highS ?? 0);
                const miles = RACE_DISTANCES[distance] / 1609.344;
                const selected = selectedScenario === b.scenario;
                return (
                  <Pressable
                    key={b.scenario}
                    style={{ flex: 1 }}
                    onPress={() => setSelectedScenario(selected ? null : b.scenario)}
                  >
                    <Card
                      style={{
                        borderWidth: isTarget || selected ? 2 : 1,
                        borderColor: selected
                          ? scenarioColors[b.scenario]
                          : isTarget
                            ? theme.accent
                            : theme.border,
                        borderRadius: radius.lg,
                        padding: spacing.md,
                        alignItems: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: '100%',
                          height: 3,
                          borderRadius: 2,
                          backgroundColor: scenarioColors[b.scenario],
                          marginBottom: 8,
                        }}
                      />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: scenarioColors[b.scenario] }}>
                        {SCENARIO_META[b.scenario].label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '800',
                          color: theme.textPrimary,
                          marginTop: 4,
                          fontVariant: ['tabular-nums'],
                          textAlign: 'center',
                        }}
                      >
                        {formatHms(lo)}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>to {formatHms(hi)}</Text>
                      <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4, fontVariant: ['tabular-nums'] }}>
                        {formatHms(lo / miles)} to {formatHms(hi / miles)} per mi
                      </Text>
                      {engine.currentAcwrStatus === 'high_risk' && b.scenario === 'stretch' && (
                        <View style={{ marginTop: 6 }}>
                          <Badge label="load risk" color={statusColor('high_risk', theme)} />
                        </View>
                      )}
                    </Card>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>
              Tap a scenario to read what it takes.
            </Text>

            {/* Detail for the tapped (or target) scenario */}
            {(() => {
              const b =
                projection.bands.find((x) => x.scenario === (selectedScenario ?? 'target')) ??
                projection.bands[1];
              return (
                <Card style={{ marginTop: spacing.sm, borderColor: scenarioColors[b.scenario], borderWidth: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: scenarioColors[b.scenario] }}>
                    {SCENARIO_META[b.scenario].label}
                  </Text>
                  <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, lineHeight: 19 }}>
                    {b.rationale}
                  </Text>
                  <HowCalculated compact explanations={[b.explanation]} />
                </Card>
              );
            })()}

            {/* Guardrail note when stretch implies unsafe ramp */}
            {engine.currentAcwrStatus !== 'optimal' && engine.currentAcwrStatus !== 'insufficient' && (
              <Card style={{ marginTop: spacing.md, borderColor: statusColor(engine.currentAcwrStatus, theme) }}>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                  Your current load status is {engine.currentAcwrStatus.replace('_', ' ')}. Any plan that
                  raises mileage quickly should wait until load normalizes. A projection is never worth an
                  injury.
                </Text>
              </Card>
            )}

            {/* Course */}
            <Card style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>Course</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>
                    {course ? course.name : 'None. Flat and cool assumed.'}
                  </Text>
                  {course && coursePenalty && (
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                      The {Math.round(course.elevationGainM * 3.28)} ft of gain adds roughly{' '}
                      {formatHms(coursePenalty.lowS)} to {formatHms(coursePenalty.highS)}
                    </Text>
                  )}
                </View>
                <View style={{ gap: 6, alignItems: 'flex-end' }}>
                  <Pressable onPress={() => router.push('/course-builder')}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>
                      {course ? 'Add another' : 'Add course'}
                    </Text>
                  </Pressable>
                  {courses.length > 0 && (
                    <Pressable onPress={() => setActiveCourse(course ? null : courses[0].id)}>
                      <Text style={{ fontSize: 12, color: theme.textMuted }}>
                        {course ? 'Clear' : `Use ${courses[0].name}`}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
              {courses.length > 1 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm }}>
                  {courses.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setActiveCourse(c.id)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: c.id === activeCourseId ? theme.accent : theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: c.id === activeCourseId ? theme.accent : theme.textMuted }}>
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {coursePenalty && <HowCalculated compact explanations={[coursePenalty.explanation]} />}
            </Card>

            {/* Split profile */}
            <Card style={{ marginTop: spacing.md }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: spacing.sm }}>
                Projected pace by mile
              </Text>
              <MultiLine
                series={splitSeries}
                width={contentW - spacing.lg * 2}
                formatY={(v) => formatHms(v)}
                formatX={(v) => `mi ${Math.round(v)}`}
                invertY
              />
            </Card>

            {/* Training requirements */}
            <Card style={{ marginTop: spacing.md }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: spacing.sm }}>
                Training requirements to hit each goal
              </Text>
              <Row
                cells={['', 'Conservative', 'Target', 'Stretch']}
                header
                theme={theme}
                headerColors={[undefined, scenarioColors.conservative, scenarioColors.target, scenarioColors.stretch]}
              />
              <Row cells={['Peak miles per week', ...projection.bands.map((b) => `${b.peakMpw[0]} to ${b.peakMpw[1]}`)]} theme={theme} />
              <Row cells={['Speed sessions', ...projection.bands.map((b) => b.speedSessionsPerWk)]} theme={theme} />
              <Row cells={['Days per week', ...projection.bands.map((b) => String(b.daysPerWk))]} theme={theme} />
            </Card>

            {/* Pre-race benchmarks */}
            {benchmarks.length > 0 && (
              <Card style={{ marginTop: spacing.md }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>
                  Benchmarks on the way to race day
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: spacing.sm }}>
                  Hit these checkpoints and the projection holds. Paces come from the goal time, heart
                  rate windows from your own zones. A filled green circle means a run in your log
                  already covers that checkpoint (right distance, right week). An open circle is still
                  ahead of you.
                </Text>
                {benchmarks.map((b) => (
                  <View
                    key={b.weeksOut}
                    style={{
                      flexDirection: 'row',
                      gap: 10,
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: theme.border,
                    }}
                  >
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        marginTop: 2,
                        borderWidth: 2,
                        borderColor: b.achieved ? theme.status.good : theme.border,
                        backgroundColor: b.achieved ? theme.status.good : 'transparent',
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary }}>
                        {b.workout}
                        <Text style={{ color: theme.textMuted, fontWeight: '400' }}>
                          {'  '}
                          {b.weeksOut} weeks out
                          {b.dateISO
                            ? `, ${new Date(b.dateISO + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                            : ''}
                        </Text>
                        {b.achieved && (
                          <Text style={{ color: theme.status.good, fontWeight: '700', fontSize: 12 }}>
                            {'  '}Done
                          </Text>
                        )}
                      </Text>
                      {(b.targetPaceSPerMi || b.targetHrBpm) && (
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                          {b.targetPaceSPerMi
                            ? `${formatHms(b.targetPaceSPerMi[0])} to ${formatHms(b.targetPaceSPerMi[1])} per mile`
                            : ''}
                          {b.targetPaceSPerMi && b.targetHrBpm ? ' at ' : ''}
                          {b.targetHrBpm ? `${b.targetHrBpm[0]} to ${b.targetHrBpm[1]} bpm` : ''}
                        </Text>
                      )}
                      <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, lineHeight: 17 }}>
                        {b.detail}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}

            {/* Weekly mileage path */}
            {mileageBars.length > 0 && (
              <Card style={{ marginTop: spacing.md }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>
                  {trainingPlan ? 'Your plan, week by week' : 'The mileage this projection assumes'}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: spacing.sm }}>
                  {trainingPlan
                    ? 'Weekly target miles from your active training plan. The highlighted bar is this week.'
                    : 'A safe path from your current volume to the target scenario peak: 10 percent weekly growth, a cutback every fourth week, and a two week taper.'}
                </Text>
                <BarChart bars={mileageBars} width={contentW - spacing.lg * 2} formatValue={(v) => `${v} mi`} />
              </Card>
            )}

            {/* Future pace projection */}
            {paceTrend && (
              <Card style={{ marginTop: spacing.md }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>
                  Where your easy pace is heading
                </Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2, marginBottom: spacing.sm, lineHeight: 18 }}>
                  {paceTrend.value.slopePerWeekS < -0.3
                    ? `You are gaining about ${Math.abs(paceTrend.value.slopePerWeekS * 1.609).toFixed(1)} seconds per mile each week. If training continues like this, easy pace lands near ${fmtPaceShort(paceTrend.value.paceAtHorizonS, profile.units)} per ${profile.units === 'mi_f' ? 'mile' : 'km'} in ${Math.max(30, horizon)} days.`
                    : paceTrend.value.slopePerWeekS > 0.3
                      ? 'Your easy pace has been drifting slower recently, which usually reflects heat, fatigue, or reduced training rather than lost fitness.'
                      : 'Your easy pace has been holding steady over the recent block.'}
                </Text>
                <MultiLine
                  series={[
                    { name: 'Easy runs', color: theme.accent, points: paceTrend.value.history },
                    { name: 'Projected', color: theme.series.violet, points: paceTrend.value.projected },
                  ]}
                  width={contentW - spacing.lg * 2}
                  formatY={(v) => fmtPaceShort(v, profile.units)}
                  invertY
                />
                <HowCalculated compact explanations={[paceTrend.explanation]} />
              </Card>
            )}

            {/* Fitness inputs */}
            <Card style={{ marginTop: spacing.md }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 }}>
                Fitness inputs used in this model
              </Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19 }}>
                Your best recent effort is {projection.inputs.bestEffortLabel}. The endurance exponent is{' '}
                {projection.inputs.riegelK.toFixed(3)}
                {projection.inputs.kFitted ? ', fitted from your races.' : ', the population default.'} Your
                current volume is about {projection.inputs.currentMpw} miles per week.
              </Text>
            </Card>
          </>
        )
      )}
    </ScrollView>
  );
}

function Row({
  cells,
  header,
  theme,
  headerColors,
}: {
  cells: string[];
  header?: boolean;
  theme: any;
  headerColors?: (string | undefined)[];
}) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: header ? 0 : 1, borderTopColor: theme.border }}>
      {cells.map((c, i) => (
        <Text
          key={i}
          style={{
            flex: i === 0 ? 1.3 : 1,
            fontSize: header ? 12 : 13,
            fontWeight: header || i === 0 ? '700' : '400',
            color: header
              ? (headerColors?.[i] ?? theme.textMuted)
              : i === 0
                ? theme.textMuted
                : theme.textPrimary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {c}
        </Text>
      ))}
    </View>
  );
}
