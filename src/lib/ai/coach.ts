import { EngineOutput } from '../engine';
import { fmtPaceShort } from '../format';
import { formatHms } from '../formulas/riegel';
import { UserProfile } from '../formulas/types';
import { claudeStructured } from './client';

/**
 * AI Insight. One structured model call turns the deterministic engine
 * output into a readable assessment: how the workout went, whether the
 * runner is on track for their goal, and what to do next.
 *
 * The model never invents numbers. Every figure it sees comes from the
 * formula engine, and the schema forces it to cite which inputs it used.
 * Transport and model selection live in ./client.
 */

export interface RaceGoal {
  distanceKey: '5K' | '10K' | 'Half' | 'Marathon';
  targetTimeS: number | null;
  raceDate: string | null; // ISO date
  courseName: string | null;
}

export interface CoachInsight {
  headline: string;
  workoutRead: string;
  goalAssessment: {
    status: 'on_track' | 'ahead' | 'behind' | 'no_goal' | 'insufficient_data';
    narrative: string;
    oddsPct: number | null;
  };
  actionItems: { title: string; detail: string; timeframe: string }[];
  watchouts: string[];
  dataUsed: string[];
}

const INSIGHT_SCHEMA = {
  type: 'object' as const,
  properties: {
    headline: {
      type: 'string',
      description: 'One sentence, plain language, on how this workout went in context. No hype.',
    },
    workoutRead: {
      type: 'string',
      description:
        'Two to four sentences reading the workout against recent training, weather, and recovery state.',
    },
    goalAssessment: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['on_track', 'ahead', 'behind', 'no_goal', 'insufficient_data'],
        },
        narrative: {
          type: 'string',
          description:
            'Two to three sentences on progress toward the stated race goal, referencing the projection numbers provided.',
        },
        oddsPct: {
          type: ['number', 'null'],
          description:
            'Rough probability (0-100) of hitting the goal time on current trajectory. Null when no goal or not enough data. Be honest and calibrated, not encouraging.',
        },
      },
      required: ['status', 'narrative', 'oddsPct'],
      additionalProperties: false,
    },
    actionItems: {
      type: 'array',
      description: 'Two to four concrete next steps, most important first.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative, e.g. "Keep Thursday easy"' },
          detail: { type: 'string', description: 'One or two sentences of specifics.' },
          timeframe: { type: 'string', description: 'When, e.g. "next 48 hours", "this week"' },
        },
        required: ['title', 'detail', 'timeframe'],
        additionalProperties: false,
      },
    },
    watchouts: {
      type: 'array',
      description:
        'Zero to two genuine concerns visible in the data (load spikes, efficiency decline, pace/HR drift). Empty if nothing real.',
      items: { type: 'string' },
    },
    dataUsed: {
      type: 'array',
      description: 'Short labels of the inputs that drove this assessment.',
      items: { type: 'string' },
    },
  },
  required: ['headline', 'workoutRead', 'goalAssessment', 'actionItems', 'watchouts', 'dataUsed'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are the analysis layer of Apex, a running analytics app. You read structured training data computed by a deterministic sports-science engine and translate it into an honest assessment.

Rules:
- Never invent numbers. Only reference figures present in the data you are given.
- Be calibrated, not encouraging. If the runner is behind their goal, say so and say why.
- Recovery and injury risk take priority over chasing goal times. If the load ratio indicates elevated risk, your action items must respect that before anything else.
- Write in plain, complete sentences. Do not use em dashes or semicolons. No exclamation marks, no motivational filler, no emoji.
- These are statistical estimates, not medical advice. The app displays that disclaimer elsewhere, so do not repeat it.`;

export function buildCoachContext(
  engine: EngineOutput,
  profile: UserProfile,
  goal: RaceGoal | null,
  projectionSummary: string | null,
): string {
  const latest = engine.latest;
  const extras = engine.latestExtras;
  const lines: string[] = [];

  lines.push('## Runner profile');
  lines.push(
    `Sex ${profile.sex}, resting HR ${profile.restingHr}, max HR ${profile.maxHr}${profile.maxHrIsEstimated ? ' (age-estimated)' : ''}.`,
  );
  lines.push(`Current weekly volume: about ${Math.round(engine.currentMpw)} miles per week.`);

  if (goal && goal.targetTimeS) {
    lines.push('## Goal');
    lines.push(
      `${goal.distanceKey} in ${formatHms(goal.targetTimeS)}${goal.raceDate ? ` on ${goal.raceDate}` : ''}${goal.courseName ? ` (${goal.courseName})` : ''}.`,
    );
  } else {
    lines.push('## Goal');
    lines.push('No race goal set.');
  }

  if (latest) {
    const a = latest.activity;
    lines.push('## Latest workout');
    lines.push(
      `${a.name}: ${(a.distanceM / 1609.344).toFixed(1)} mi in ${Math.round(a.movingTimeS / 60)} min, ` +
        `pace ${fmtPaceShort(latest.rawPaceSPerKm, 'mi_f')}/mi, avg HR ${a.avgHr ?? 'n/a'}, ` +
        `detected type: ${latest.workoutType}${latest.workoutTypeSource === 'user_corrected' ? ' (user-corrected)' : ''}.`,
    );
    if (latest.weather) {
      lines.push(
        `Conditions: ${Math.round(latest.weather.tempC * 1.8 + 32)}F, ${Math.round(latest.weather.humidityPct)}% humidity, dewpoint ${Math.round(latest.weather.dewpointC * 1.8 + 32)}F.`,
      );
    }
    if (latest.adjustedPace && latest.adjustedPace.value < latest.rawPaceSPerKm - 2) {
      lines.push(
        `Heat-adjusted pace: ${fmtPaceShort(latest.adjustedPace.value, 'mi_f')}/mi (conditions cost roughly ${Math.round(latest.rawPaceSPerKm - latest.adjustedPace.value)} sec/km).`,
      );
    }
    if (latest.trimp) lines.push(`Session strain (TRIMP): ${latest.trimp.value.toFixed(0)}.`);
    if (extras) {
      lines.push(`Strain percentile vs last 30 runs: ${extras.strainPercentile}.`);
      lines.push(
        `Formula-based recovery window: ${extras.recovery.value.minHours}-${extras.recovery.value.maxHours} hours.`,
      );
      lines.push(`Formula-based next workout suggestion: ${extras.nextWorkout.description} (${extras.nextWorkout.reason})`);
    }
    if (latest.flags.length > 0) lines.push(`Data quality flags: ${latest.flags.join(', ')}.`);
  }

  lines.push('## Training state');
  lines.push(
    `ACWR (acute:chronic load ratio): ${engine.currentAcwr?.toFixed(2) ?? 'insufficient data'} (${engine.currentAcwrStatus}).`,
  );
  if (engine.currentVo2max != null) {
    lines.push(
      `VO2max estimate: ${engine.currentVo2max.toFixed(1)}${engine.vo2maxDelta30d != null ? ` (${engine.vo2maxDelta30d >= 0 ? '+' : ''}${engine.vo2maxDelta30d.toFixed(1)} vs 30 days ago)` : ''}.`,
    );
  }
  const ff = engine.fitnessSeries[engine.fitnessSeries.length - 1];
  if (ff) {
    lines.push(`Fitness-fatigue model: fitness ${ff.fitness.toFixed(0)}, fatigue ${ff.fatigue.toFixed(0)}, form ${ff.form.toFixed(0)}.`);
  }

  // recent 14 runs, compact
  lines.push('## Last 14 runs (newest first)');
  for (const e of engine.enriched.slice(0, 14)) {
    lines.push(
      `${e.activity.startTime.slice(0, 10)} ${e.workoutType} ${(e.activity.distanceM / 1609.344).toFixed(1)}mi ` +
        `${fmtPaceShort(e.rawPaceSPerKm, 'mi_f')}/mi hr:${e.activity.avgHr ?? '-'} trimp:${e.trimp?.value.toFixed(0) ?? '-'}${e.excluded ? ' [excluded]' : ''}`,
    );
  }

  if (projectionSummary) {
    lines.push('## Current race projection (formula engine)');
    lines.push(projectionSummary);
  }

  return lines.join('\n');
}

export async function getCoachInsight(
  userApiKey: string | null,
  context: string,
): Promise<CoachInsight> {
  return claudeStructured<CoachInsight>(userApiKey, {
    system: SYSTEM_PROMPT,
    user: `Here is the runner's current data. Produce your assessment.\n\n${context}`,
    schema: INSIGHT_SCHEMA,
    maxTokens: 2000,
  });
}
