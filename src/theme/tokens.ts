/**
 * Apex design tokens. Chart colors follow the dataviz reference palette
 * (validated for CVD separation and surface contrast in both modes).
 */

export interface Theme {
  mode: 'light' | 'dark';
  page: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  grid: string;
  axis: string;
  accent: string; // series-1 blue — primary data color
  series: { blue: string; aqua: string; yellow: string; violet: string; red: string; magenta: string; orange: string; green: string };
  status: { good: string; warning: string; serious: string; critical: string };
  deltaGood: string;
  targetHighlight: string;
}

export const lightTheme: Theme = {
  mode: 'light',
  page: '#f9f9f7',
  surface: '#fcfcfb',
  surfaceRaised: '#ffffff',
  border: 'rgba(11,11,11,0.10)',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  accent: '#2a78d6',
  series: {
    blue: '#2a78d6',
    aqua: '#1baf7a',
    yellow: '#eda100',
    violet: '#4a3aa7',
    red: '#e34948',
    magenta: '#e87ba4',
    orange: '#eb6834',
    green: '#008300',
  },
  status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
  deltaGood: '#006300',
  targetHighlight: '#2a78d6',
};

export const darkTheme: Theme = {
  mode: 'dark',
  page: '#0a0d12',
  surface: '#12161d',
  surfaceRaised: '#1a2029',
  border: 'rgba(148,170,200,0.14)',
  textPrimary: '#f2f5f9',
  textSecondary: '#b9c2cf',
  textMuted: '#7d8794',
  grid: '#232a34',
  axis: '#2f3844',
  accent: '#3987e5',
  series: {
    blue: '#3987e5',
    aqua: '#199e70',
    yellow: '#c98500',
    violet: '#9085e9',
    red: '#e66767',
    magenta: '#d55181',
    orange: '#d95926',
    green: '#008300',
  },
  status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
  deltaGood: '#0ca30c',
  targetHighlight: '#3987e5',
};

/**
 * HR zone colors, easy to hard: recovery blue, aerobic green, tempo
 * yellow, threshold orange, max red. All five come from the validated
 * categorical palette so contrast holds in both modes.
 */
export function zoneColors(theme: Theme): [string, string, string, string, string] {
  return theme.mode === 'dark'
    ? ['#5598e7', '#199e70', '#c98500', '#d95926', '#e66767']
    : ['#6da7ec', '#1baf7a', '#eda100', '#eb6834', '#e34948'];
}

/** Workout-type → categorical slot (fixed assignment, never re-ordered) */
export function workoutTypeColor(t: string, theme: Theme): string {
  switch (t) {
    case 'easy': return theme.series.aqua;
    case 'tempo': return theme.series.orange;
    case 'interval': return theme.series.violet;
    case 'long': return theme.series.blue;
    case 'race': return theme.series.magenta;
    default: return theme.textMuted;
  }
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;

/** Shared type scale. Hero numerals are the visual signature of the app. */
export const type = {
  hero: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.2, fontVariant: ['tabular-nums'] as any },
  stat: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6, fontVariant: ['tabular-nums'] as any },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },
  cardTitle: { fontSize: 15, fontWeight: '700' as const },
  microLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.1,
  },
  body: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 17 },
} as const;
