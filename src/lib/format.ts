import { UserProfile } from './formulas/types';

export function fmtDistance(m: number, units: UserProfile['units']): string {
  return units === 'mi_f' ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;
}

export function fmtPaceSPerKm(sPerKm: number, units: UserProfile['units']): string {
  const s = units === 'mi_f' ? sPerKm * 1.609344 : sPerKm;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}/${units === 'mi_f' ? 'mi' : 'km'}`;
}

export function fmtPaceShort(sPerKm: number, units: UserProfile['units']): string {
  const s = units === 'mi_f' ? sPerKm * 1.609344 : sPerKm;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtTemp(c: number, units: UserProfile['units']): string {
  return units === 'mi_f' ? `${Math.round(c * 1.8 + 32)}°F` : `${Math.round(c)}°C`;
}

export function fmtElevation(m: number, units: UserProfile['units']): string {
  return units === 'mi_f' ? `${Math.round(m * 3.28084).toLocaleString()} ft` : `${Math.round(m).toLocaleString()} m`;
}

export function fmtDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.round((totalS % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function fmtRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today, ${time}` : `${fmtDate(iso)}, ${time}`;
}
