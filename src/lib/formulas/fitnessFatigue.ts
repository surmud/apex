/**
 * Fitness-fatigue model in the training-stress-balance form most
 * platforms display (TrainingPeaks CTL/ATL/TSB):
 *
 *   fitness(t) = EWMA of daily TRIMP, time constant τ1 = 42 days  (CTL)
 *   fatigue(t) = EWMA of daily TRIMP, time constant τ2 = 7 days   (ATL)
 *   form(t)    = fitness − fatigue                                (TSB)
 *
 * Both are exponentially weighted moving averages of daily load, so the
 * numbers read as "sustainable daily training load". Fatigue reacts fast
 * and decays fast; fitness moves slowly. After a hard spell fatigue
 * overtakes fitness and form goes negative; through a taper fatigue
 * drains faster than fitness and form climbs, which is why races are run
 * on positive form. This is the display-friendly descendant of Banister's
 * impulse-response model (Banister 1975; Coggan's CTL/ATL formulation).
 */

export interface FitnessPoint {
  date: string;
  fitness: number;
  fatigue: number;
  form: number;
}

const TAU_FITNESS = 42;
const TAU_FATIGUE = 7;

export function fitnessFatigueSeries(
  trimpByDate: Map<string, number>,
  endDate: Date,
  days: number,
): FitnessPoint[] {
  const dayMs = 86400000;
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  const start = end - (days - 1) * dayMs;

  // incremental EWMA: F(t) = F(t-1)·λ + TRIMP(t)·(1−λ)
  // warm up 60 days before window start so the window begins converged
  const warmStart = start - 60 * dayMs;
  let fitness = 0;
  let fatigue = 0;
  const decayFit = Math.exp(-1 / TAU_FITNESS);
  const decayFat = Math.exp(-1 / TAU_FATIGUE);
  const out: FitnessPoint[] = [];

  for (let t = warmStart; t <= end; t += dayMs) {
    const date = new Date(t).toISOString().slice(0, 10);
    const w = trimpByDate.get(date) ?? 0;
    fitness = fitness * decayFit + w * (1 - decayFit);
    fatigue = fatigue * decayFat + w * (1 - decayFat);
    if (t >= start) {
      out.push({ date, fitness, fatigue, form: fitness - fatigue });
    }
  }
  return out;
}

/**
 * Project fitness forward `horizonDays` under a weekly TRIMP load,
 * returning the end-state values. Used by scenario generation.
 */
export function projectFitness(
  currentFitness: number,
  currentFatigue: number,
  weeklyTrimp: number,
  horizonDays: number,
): { fitness: number; fatigue: number; form: number } {
  const daily = weeklyTrimp / 7;
  let fitness = currentFitness;
  let fatigue = currentFatigue;
  const decayFit = Math.exp(-1 / TAU_FITNESS);
  const decayFat = Math.exp(-1 / TAU_FATIGUE);
  for (let d = 0; d < horizonDays; d++) {
    fitness = fitness * decayFit + daily * (1 - decayFit);
    fatigue = fatigue * decayFat + daily * (1 - decayFat);
  }
  return { fitness, fatigue, form: fitness - fatigue };
}
