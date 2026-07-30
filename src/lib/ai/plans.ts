import { EngineOutput } from '../engine';
import { fmtPaceShort } from '../format';
import { RaceDistanceKey } from '../formulas/projections';
import { formatHms } from '../formulas/riegel';
import { WorkoutType } from '../formulas/types';
import { claudeStructured } from './client';
import { RaceGoal } from './coach';

/**
 * Training plans. Two ways in:
 * 1. Generated: the model drafts a plan from the runner's own history and
 *    goal, then the formula engine validates the mileage ramp for safety
 *    and the plan is annotated with any adjustments.
 * 2. Imported: the runner pastes text or uploads a photo of an existing
 *    plan and the model parses it into the same structure.
 */

export interface PlanRun {
  dateISO: string; // yyyy-mm-dd
  type: WorkoutType;
  distanceMi: number;
  description: string;
}

export interface PlanWeek {
  weekNumber: number;
  focus: string;
  targetMileage: number;
  runs: PlanRun[];
}

export interface TrainingPlan {
  name: string;
  source: 'generated' | 'imported';
  raceDistanceKey: RaceDistanceKey | null;
  raceDate: string | null;
  startDate: string;
  goalTimeS: number | null;
  weeks: PlanWeek[];
  notes: string[];
}

const PLAN_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', description: 'Short plan name, e.g. "Marathon build, 16 weeks"' },
    raceDate: { type: ['string', 'null'], description: 'yyyy-mm-dd or null' },
    startDate: { type: 'string', description: 'yyyy-mm-dd of the first day of week 1' },
    weeks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          weekNumber: { type: 'integer' },
          focus: { type: 'string', description: 'One short sentence, e.g. "Base building with one tempo."' },
          targetMileage: { type: 'number' },
          runs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                dateISO: { type: 'string', description: 'yyyy-mm-dd, concrete calendar date' },
                type: { type: 'string', enum: ['easy', 'tempo', 'interval', 'long', 'race'] },
                distanceMi: { type: 'number' },
                description: { type: 'string', description: 'One sentence of specifics.' },
              },
              required: ['dateISO', 'type', 'distanceMi', 'description'],
              additionalProperties: false,
            },
          },
        },
        required: ['weekNumber', 'focus', 'targetMileage', 'runs'],
        additionalProperties: false,
      },
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to three short notes about assumptions or things the runner should know.',
    },
  },
  required: ['name', 'raceDate', 'startDate', 'weeks', 'notes'],
  additionalProperties: false,
};

const GENERATE_SYSTEM = `You are the plan builder inside Apex, a running analytics app. You write personalized training plans grounded in the runner's actual training history, which a deterministic engine has computed for you.

Rules:
- Respect the runner's current volume. Week 1 must start at or slightly below their current weekly mileage. Weekly mileage may not increase more than 10 percent from one week to the next, and every fourth week should be a cutback week around 75 percent of the prior week.
- Include a taper: the final two weeks before a race drop volume substantially, and race week is very light.
- Use the runner's requested number of running days per week. The long run anchors the week.
- All dates must be real calendar dates. The plan runs from the start date to the race date.
- Write descriptions in plain complete sentences without em dashes or semicolons.`;

export async function generateTrainingPlan(
  userApiKey: string | null,
  goal: RaceGoal,
  daysPerWeek: number,
  engine: EngineOutput,
  todayISO: string,
): Promise<TrainingPlan> {
  const context = [
    `Today is ${todayISO}.`,
    `Race: ${goal.distanceKey}${goal.raceDate ? ` on ${goal.raceDate}` : ''}${goal.targetTimeS ? `, goal time ${formatHms(goal.targetTimeS)}` : ''}.`,
    `Runner wants to run ${daysPerWeek} days per week.`,
    `Current weekly volume: about ${Math.round(engine.currentMpw)} miles per week.`,
    `Load status: ${engine.currentAcwrStatus} (ratio ${engine.currentAcwr?.toFixed(2) ?? 'unknown'}).`,
    engine.currentVo2max != null ? `VO2max estimate: ${engine.currentVo2max.toFixed(1)}.` : '',
    engine.bestEfforts.length > 0
      ? `Recent best efforts: ${engine.bestEfforts
          .slice(-4)
          .map((e) => `${(e.distanceM / 1609.344).toFixed(1)} mi in ${formatHms(e.timeS)}`)
          .join(', ')}.`
      : 'No recent quality efforts recorded.',
    `Typical recent runs: ${engine.enriched
      .slice(0, 8)
      .map((e) => `${(e.activity.distanceM / 1609.344).toFixed(1)}mi ${e.workoutType} at ${fmtPaceShort(e.rawPaceSPerKm, 'mi_f')}/mi`)
      .join('; ')}.`,
    'Build the full week-by-week plan from next Monday through the race.',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await claudeStructured<Omit<TrainingPlan, 'source' | 'raceDistanceKey' | 'goalTimeS'>>(
    userApiKey,
    { system: GENERATE_SYSTEM, user: context, schema: PLAN_SCHEMA, maxTokens: 6000 },
  );

  const plan: TrainingPlan = {
    ...raw,
    source: 'generated',
    raceDistanceKey: goal.distanceKey,
    goalTimeS: goal.targetTimeS,
  };
  return validateRamp(plan, engine.currentMpw);
}

const PARSE_SYSTEM = `You are the plan importer inside Apex, a running analytics app. The runner gives you a training plan as pasted text or a photo. Convert it faithfully into the structured format. Do not invent workouts that are not present. If the plan uses weekdays without dates, anchor week 1 to the given start date and assign real calendar dates. Write descriptions in plain complete sentences.`;

export async function parseTrainingPlan(
  userApiKey: string | null,
  input: { text?: string; imageBase64?: string; imageMediaType?: string },
  startDateISO: string,
): Promise<TrainingPlan> {
  const content: any[] = [];
  if (input.imageBase64 && input.imageMediaType) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: input.imageMediaType, data: input.imageBase64 },
    });
  }
  content.push({
    type: 'text',
    text: `Start date for week 1: ${startDateISO}.\n${input.text ? `Plan text:\n${input.text}` : 'The plan is in the attached image.'}`,
  });

  const raw = await claudeStructured<Omit<TrainingPlan, 'source' | 'raceDistanceKey' | 'goalTimeS'>>(
    userApiKey,
    { system: PARSE_SYSTEM, user: content, schema: PLAN_SCHEMA, maxTokens: 6000 },
  );
  return { ...raw, source: 'imported', raceDistanceKey: null, goalTimeS: null };
}

/**
 * Engine-side safety check on a generated or imported plan: flag weekly
 * mileage jumps above 10 percent (15 for imported plans, since those are
 * the runner's own choice) and note them on the plan.
 */
export function validateRamp(plan: TrainingPlan, currentMpw: number): TrainingPlan {
  const notes = [...plan.notes];
  if (plan.weeks.length > 0 && currentMpw > 5) {
    const w1 = plan.weeks[0].targetMileage;
    if (w1 > currentMpw * 1.2) {
      notes.push(
        `Week 1 calls for ${Math.round(w1)} miles but your recent volume is about ${Math.round(currentMpw)}. Treat the first two weeks as flexible and build gradually.`,
      );
    }
  }
  for (let i = 1; i < plan.weeks.length; i++) {
    const prev = plan.weeks[i - 1].targetMileage;
    const cur = plan.weeks[i].targetMileage;
    if (prev > 10 && cur > prev * 1.18) {
      notes.push(
        `Week ${plan.weeks[i].weekNumber} jumps from ${Math.round(prev)} to ${Math.round(cur)} miles, which is a faster ramp than the 10 percent guideline. Watch how your body responds that week.`,
      );
    }
  }
  return { ...plan, notes: notes.slice(0, 6) };
}

/** Reconciliation: what to do about the next scheduled run given current fatigue. */
export interface RunReconciliation {
  verdict: 'go_as_planned' | 'modify' | 'swap_or_rest';
  headline: string;
  reasoning: string;
  adjustedWorkout: string | null;
}

const RECONCILE_SCHEMA = {
  type: 'object' as const,
  properties: {
    verdict: { type: 'string', enum: ['go_as_planned', 'modify', 'swap_or_rest'] },
    headline: { type: 'string', description: 'One sentence answer.' },
    reasoning: { type: 'string', description: 'Two or three sentences referencing the data provided.' },
    adjustedWorkout: {
      type: ['string', 'null'],
      description: 'If modifying, the concrete replacement workout. Null when going as planned.',
    },
  },
  required: ['verdict', 'headline', 'reasoning', 'adjustedWorkout'],
  additionalProperties: false,
};

export async function reconcileNextRun(
  userApiKey: string | null,
  nextRun: PlanRun,
  engine: EngineOutput,
): Promise<RunReconciliation> {
  const latest = engine.latest;
  const context = [
    `Scheduled next: ${nextRun.dateISO}, ${nextRun.type}, ${nextRun.distanceMi} miles. ${nextRun.description}`,
    `Load status: ${engine.currentAcwrStatus} (ratio ${engine.currentAcwr?.toFixed(2) ?? 'unknown'}).`,
    latest?.trimp ? `Latest run strain: ${latest.trimp.value.toFixed(0)} TRIMP.` : '',
    engine.latestExtras
      ? `Formula recovery window after the latest run: ${engine.latestExtras.recovery.value.minHours} to ${engine.latestExtras.recovery.value.maxHours} hours.`
      : '',
    (() => {
      const ff = engine.fitnessSeries[engine.fitnessSeries.length - 1];
      return ff ? `Fitness ${ff.fitness.toFixed(0)}, fatigue ${ff.fatigue.toFixed(0)}, form ${ff.form.toFixed(0)}.` : '';
    })(),
  ]
    .filter(Boolean)
    .join('\n');

  return claudeStructured<RunReconciliation>(userApiKey, {
    system: `You advise a runner on whether to do their next scheduled workout given their current fatigue. Be practical. Protecting the runner from overload beats hitting the plan. Plain sentences, no em dashes, no semicolons.`,
    user: context,
    schema: RECONCILE_SCHEMA,
    maxTokens: 800,
  });
}

/**
 * A deterministic sample plan so the Training tab is never blank: a
 * 10-week half marathon build at 5 days per week, starting next Monday.
 * The runner can adopt it as-is or use it as a preview of what a
 * generated plan looks like.
 */
export function samplePlan(todayISO: string): TrainingPlan {
  const today = new Date(todayISO + 'T00:00:00Z');
  const dow = today.getUTCDay();
  const daysToMonday = ((8 - dow) % 7) || 7;
  const start = new Date(today.getTime() + daysToMonday * 86400000);
  const day = (weekIdx: number, offset: number) =>
    new Date(start.getTime() + (weekIdx * 7 + offset) * 86400000).toISOString().slice(0, 10);

  // [weekly mileage, long run] with a cutback in week 4 and 8 and a two-week taper
  const weeks: [number, number][] = [
    [24, 8], [26, 9], [29, 10], [22, 7], [31, 11], [33, 12], [35, 12], [26, 8], [22, 10], [16, 13.1],
  ];

  const built: PlanWeek[] = weeks.map(([mpw, long], i) => {
    const isRaceWeek = i === 9;
    const isTaper = i >= 8;
    const rem = mpw - long;
    const easy = Math.round((rem * 0.3) * 10) / 10;
    const tempo = Math.round((rem * 0.25) * 10) / 10;
    const mid = Math.round((rem - easy * 2 - tempo) * 10) / 10;
    const runs: PlanRun[] = [
      { dateISO: day(i, 0), type: 'easy', distanceMi: easy, description: 'Easy run at a fully conversational effort.' },
      { dateISO: day(i, 2), type: 'tempo', distanceMi: tempo, description: 'Warm up, then hold a comfortably hard tempo for the middle miles.' },
      { dateISO: day(i, 3), type: 'easy', distanceMi: mid, description: 'Relaxed midweek run. Keep the heart rate low.' },
      { dateISO: day(i, 4), type: 'easy', distanceMi: easy, description: 'Short shakeout ahead of the weekend long run.' },
      isRaceWeek
        ? { dateISO: day(i, 5), type: 'race', distanceMi: 13.1, description: 'Race day. Start controlled and work the second half.' }
        : { dateISO: day(i, 5), type: 'long', distanceMi: long, description: 'Long run at an easy effort. Practice fueling on anything past 90 minutes.' },
    ];
    return {
      weekNumber: i + 1,
      focus: isRaceWeek
        ? 'Race week. Short, sharp, and rested.'
        : isTaper
          ? 'Taper. Volume drops so fatigue drains while fitness holds.'
          : i === 3 || i === 7
            ? 'Cutback week to absorb the training.'
            : 'Aerobic base with one tempo and a weekend long run.',
      targetMileage: mpw,
      runs,
    };
  });

  return {
    name: 'Sample plan: 10 week half marathon build',
    source: 'generated',
    raceDistanceKey: 'Half',
    raceDate: day(9, 5),
    startDate: day(0, 0),
    goalTimeS: null,
    weeks: built,
    notes: [
      'This is a sample. Build a personalized plan and Apex will start from your own weekly volume and goal race instead.',
    ],
  };
}

/** The next run on or after today. */
export function nextScheduledRun(plan: TrainingPlan, todayISO: string): PlanRun | null {
  const all = plan.weeks.flatMap((w) => w.runs).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return all.find((r) => r.dateISO >= todayISO) ?? null;
}

/** Fraction of planned runs in the last 14 days that were actually run. */
export function planAdherence(
  plan: TrainingPlan,
  completedDates: Set<string>,
  todayISO: string,
): { done: number; planned: number } {
  const cutoff = new Date(new Date(todayISO).getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const windowRuns = plan.weeks
    .flatMap((w) => w.runs)
    .filter((r) => r.dateISO >= cutoff && r.dateISO <= todayISO);
  const done = windowRuns.filter((r) => completedDates.has(r.dateISO)).length;
  return { done, planned: windowRuns.length };
}
