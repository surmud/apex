import { DailyLoad, Explained } from './types';

export type AcwrStatus = 'insufficient' | 'undertraining' | 'optimal' | 'caution' | 'high_risk';

export interface AcwrResult {
  acwr: number | null;
  status: AcwrStatus;
}

/**
 * Acute:Chronic Workload Ratio — 7-day acute load vs 28-day chronic load,
 * both as rolling daily averages of TRIMP.
 */
export function computeDailyLoads(
  trimpByDate: Map<string, number>,
  endDate: Date,
  days: number,
): DailyLoad[] {
  const out: DailyLoad[] = [];
  const dayMs = 86400000;
  const end = startOfDayUtc(endDate).getTime();

  for (let i = days - 1; i >= 0; i--) {
    const t = end - i * dayMs;
    const date = isoDate(new Date(t));
    const dayTrimp = trimpByDate.get(date) ?? 0;

    let acute = 0;
    for (let d = 0; d < 7; d++) acute += trimpByDate.get(isoDate(new Date(t - d * dayMs))) ?? 0;
    acute /= 7;

    let chronic = 0;
    for (let d = 0; d < 28; d++) chronic += trimpByDate.get(isoDate(new Date(t - d * dayMs))) ?? 0;
    chronic /= 28;

    out.push({
      date,
      dayTrimp,
      acute7d: acute,
      chronic28d: chronic,
      acwr: chronic > 1 ? acute / chronic : null,
    });
  }
  return out;
}

export function acwrStatus(acwr: number | null): AcwrStatus {
  if (acwr == null) return 'insufficient';
  if (acwr < 0.8) return 'undertraining';
  if (acwr <= 1.3) return 'optimal';
  if (acwr <= 1.5) return 'caution';
  return 'high_risk';
}

export const ACWR_STATUS_LABEL: Record<AcwrStatus, string> = {
  insufficient: 'Not enough data',
  undertraining: 'Detraining',
  optimal: 'Optimal',
  caution: 'Caution',
  high_risk: 'High risk',
};

export function explainAcwr(load: DailyLoad): Explained<AcwrResult> {
  const status = acwrStatus(load.acwr);
  return {
    value: { acwr: load.acwr, status },
    explanation: {
      method: 'Acute:Chronic Workload Ratio (ACWR)',
      summary:
        'This compares how much you trained in the last week to what your body is used to over the last month. Near 1.0 means you are training in line with your base. Well above it means you are ramping faster than your body adapts.',
      formula: 'ACWR = mean(TRIMP, last 7 days) ÷ mean(TRIMP, last 28 days)',
      inputs: [
        { label: 'Acute load (7d avg)', value: load.acute7d.toFixed(1) },
        { label: 'Chronic load (28d avg)', value: load.chronic28d.toFixed(1) },
      ],
      output: load.acwr == null ? 'n/a' : `${load.acwr.toFixed(2)} (${ACWR_STATUS_LABEL[status]})`,
      caveats: [
        'The sweet spot is 0.8 to 1.3. Above 1.5, injury risk rises sharply.',
        'The ratio needs at least four weeks of history to be meaningful.',
      ],
      source: 'Gabbett (2016), British Journal of Sports Medicine, the training-injury prevention paradox',
    },
  };
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
