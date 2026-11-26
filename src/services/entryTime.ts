const DAY_MS = 24 * 60 * 60 * 1000;

export const RECENT_DAY_LABELS = ['今日', '昨日', '一昨日'];

function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function calendarDaysAgo(ts: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
}

export function formatClock(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDay(ts: number, now: number): string {
  const date = new Date(ts);
  return RECENT_DAY_LABELS[calendarDaysAgo(ts, now)] ?? `${date.getMonth() + 1}/${date.getDate()}`;
}

export function moveToDaysAgo(ts: number, daysAgo: number, now: number): number {
  const date = new Date(ts);
  const today = new Date(now);
  date.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
  return date.getTime();
}

export function moveToDateKey(ts: number, dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(ts);
  date.setFullYear(year, month - 1, day);
  return date.getTime();
}

export function moveToClock(ts: number, clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  const date = new Date(ts);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}
