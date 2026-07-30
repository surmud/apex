import { Activity, ActivityWeather } from '../formulas/types';

/**
 * Deterministic demo dataset: ~10 months of realistic training for a
 * mid-pack marathoner in the New York area. Seeded PRNG so every demo
 * session looks identical — useful for screenshots and debugging.
 */

export interface DemoActivity {
  activity: Activity;
  weather: ActivityWeather | null;
}

// mulberry32 seeded PRNG
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PlanType = 'easy' | 'tempo' | 'interval' | 'long' | 'race';

/** Weekly template: Tue quality, Thu easy, Sat long, Sun easy, + Mon/Wed easy in higher-volume weeks */
const WEEK_TEMPLATE: { dow: number; type: PlanType; chance: number }[] = [
  { dow: 1, type: 'easy', chance: 0.6 },
  { dow: 2, type: 'tempo', chance: 0.95 },
  { dow: 3, type: 'easy', chance: 0.5 },
  { dow: 4, type: 'easy', chance: 0.9 },
  { dow: 6, type: 'long', chance: 0.95 },
  { dow: 0, type: 'easy', chance: 0.75 },
];

export function generateDemoData(endDate = new Date()): DemoActivity[] {
  const rand = rng(42);
  const out: DemoActivity[] = [];
  const weeks = 42;
  const dayMs = 86400000;
  const end = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
  );

  // fitness arc: base pace improves from 6:05/km to ~5:25/km over the period, with a mid-block dip
  const basePaceStart = 365; // s/km easy pace
  const basePaceEnd = 325;

  let raceCount = 0;
  for (let w = 0; w < weeks; w++) {
    const weekProgress = w / (weeks - 1);
    // seasonal periodization: volume builds, cutback every 4th week
    const cutback = w % 4 === 3 ? 0.7 : 1;
    const volumeScale = (0.75 + weekProgress * 0.5) * cutback;
    const easyPace =
      basePaceStart +
      (basePaceEnd - basePaceStart) * weekProgress +
      Math.sin(weekProgress * Math.PI * 3) * 6; // gentle wobble

    for (const slot of WEEK_TEMPLATE) {
      if (rand() > slot.chance * (slot.type === 'easy' ? volumeScale + 0.2 : 1)) continue;

      const weekStart = end.getTime() - (weeks - w) * 7 * dayMs;
      const dayOffset = ((slot.dow - 1 + 7) % 7) * dayMs;
      const date = new Date(weekStart + dayOffset);
      if (date.getTime() > end.getTime()) continue;

      // every ~10 weeks, the Saturday long run becomes a race
      let type: PlanType = slot.type;
      if (slot.type === 'long' && (w === 12 || w === 24 || w === 36)) {
        type = 'race';
        raceCount++;
      }

      const a = makeRun(type, date, easyPace, volumeScale, rand, raceCount);
      out.push(a);
    }
  }
  return out.sort((x, y) => x.activity.startTime.localeCompare(y.activity.startTime));
}

function makeRun(
  type: PlanType,
  date: Date,
  easyPaceSPerKm: number,
  volumeScale: number,
  rand: () => number,
  raceIdx: number,
): DemoActivity {
  const jitter = (spread: number) => (rand() - 0.5) * 2 * spread;

  let distanceKm: number;
  let paceSPerKm: number;
  let hrFrac: number;
  let paceCv: number;
  let name: string;

  switch (type) {
    case 'easy':
      distanceKm = 6 + rand() * 4 * volumeScale;
      paceSPerKm = easyPaceSPerKm + jitter(10);
      hrFrac = 0.7 + jitter(0.03);
      paceCv = 0.03 + rand() * 0.03;
      name = ['Easy miles', 'Morning shakeout', 'Recovery jog', 'Neighborhood loop'][
        Math.floor(rand() * 4)
      ];
      break;
    case 'tempo':
      distanceKm = 9 + rand() * 4 * volumeScale;
      paceSPerKm = easyPaceSPerKm * 0.86 + jitter(8);
      hrFrac = 0.87 + jitter(0.025);
      paceCv = 0.05 + rand() * 0.03;
      name = ['Tempo Tuesday', 'Threshold session', 'Steady state'][Math.floor(rand() * 3)];
      break;
    case 'interval':
      distanceKm = 8 + rand() * 3;
      paceSPerKm = easyPaceSPerKm * 0.9 + jitter(10);
      hrFrac = 0.84 + jitter(0.03);
      paceCv = 0.16 + rand() * 0.08;
      name = ['6×800s', 'Mile repeats', 'Track work'][Math.floor(rand() * 3)];
      break;
    case 'long':
      distanceKm = 16 + rand() * 8 * volumeScale;
      paceSPerKm = easyPaceSPerKm * 1.04 + jitter(8);
      hrFrac = 0.73 + jitter(0.03);
      paceCv = 0.04 + rand() * 0.03;
      name = ['Long run', 'Weekend long', 'Marathon pace finish long'][Math.floor(rand() * 3)];
      break;
    case 'race': {
      const raceDist = [5, 10, 21.0975][raceIdx % 3];
      distanceKm = raceDist;
      paceSPerKm = easyPaceSPerKm * (raceDist <= 5 ? 0.76 : raceDist <= 10 ? 0.8 : 0.85);
      hrFrac = 0.94 + jitter(0.01);
      paceCv = 0.03;
      name = raceDist <= 5 ? 'Park 5K — race' : raceDist <= 10 ? 'Club 10K — race' : 'Half marathon — race';
      break;
    }
  }

  const distanceM = distanceKm * 1000;
  const movingTimeS = distanceKm * paceSPerKm;
  const maxHr = 190;
  const restingHr = 50;
  const avgHr = restingHr + hrFrac * (maxHr - restingHr);

  // ~7% of runs are treadmill (winter), ~4% missing HR
  const treadmill = rand() < 0.06;
  const missingHr = rand() < 0.04;

  // NYC seasonal weather by month
  const month = date.getUTCMonth();
  const seasonalTempC = [-1, 1, 6, 12, 18, 23, 27, 26, 21, 14, 8, 2][month];
  const tempC = seasonalTempC + jitter(4) + 2; // morning runs slightly above daily min
  const humidity = 45 + rand() * 40;
  const dewpointC = tempC - (100 - humidity) / 5;

  const startHour = 6 + Math.floor(rand() * 3);
  const start = new Date(date.getTime() + startHour * 3600000);

  // running dynamics: faster paces mean longer strides, lower ground contact,
  // slightly lower vertical oscillation for efficient runners
  const speedMs = distanceM / movingTimeS;
  const cadence = Math.round(168 + rand() * 10);
  const strideLengthM = Math.round((speedMs / (cadence / 60)) * 100) / 100;
  const missingDynamics = rand() < 0.15; // some devices lack the sensors

  const activity: Activity = {
    id: `demo-${start.getTime()}`,
    startTime: start.toISOString(),
    distanceM,
    movingTimeS: Math.round(movingTimeS),
    elapsedTimeS: Math.round(movingTimeS * (1 + rand() * 0.04)),
    elevationGainM: Math.round(distanceKm * (3 + rand() * 9)),
    avgSpeedMs: speedMs,
    avgHr: missingHr ? null : Math.round(avgHr),
    maxHr: missingHr ? null : Math.round(avgHr + 10 + rand() * 12),
    avgCadence: cadence,
    paceCv,
    verticalOscillationCm: missingDynamics ? null : Math.round((9.5 - speedMs * 0.5 + jitter(0.6)) * 10) / 10,
    groundContactMs: missingDynamics ? null : Math.round(300 - speedMs * 18 + jitter(10)),
    strideLengthM: missingDynamics ? null : strideLengthM,
    runningPowerW: missingDynamics ? null : Math.round(72 * speedMs * 1.04 + jitter(12)),
    isTreadmill: treadmill,
    startLat: treadmill ? null : 40.72 + jitter(0.05),
    startLng: treadmill ? null : -73.98 + jitter(0.05),
    name,
    isRaceTagged: type === 'race',
  };

  const weather: ActivityWeather | null = treadmill
    ? null
    : {
        tempC: Math.round(tempC * 10) / 10,
        humidityPct: Math.round(humidity),
        dewpointC: Math.round(dewpointC * 10) / 10,
        windMs: Math.round(rand() * 60) / 10,
      };

  return { activity, weather };
}

export const DEMO_PROFILE = {
  sex: 'M' as const,
  dob: '1992-04-15',
  weightKg: 72,
  heightCm: 178,
  restingHr: 50,
  maxHr: 190,
  maxHrIsEstimated: false,
  units: 'mi_f' as const,
};
