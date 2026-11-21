import { PRESET_CATEGORIES } from '../constants/presets';
import { MoodLog, PresetCategoryKey } from '../types';

export interface PresetRef {
  category: PresetCategoryKey;
  id: string;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const NEAR_HOUR_RANGE = 2;
const NEAR_HOUR_WEIGHT = 3;

const PICKABLE_ORDER = new Map(
  PRESET_CATEGORIES.flatMap((category) =>
    category.presets.map((preset) => `${category.key}:${preset.id}`),
  ).map((key, index) => [key, index]),
);

function hourDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 24 - diff);
}

function selectedIds(log: MoodLog, category: PresetCategoryKey): string[] {
  if (category === 'weather') return log.weather ? [log.weather] : [];
  return log[category];
}

export function rankFrequentPresets(logs: MoodLog[], now: number, limit = 8): PresetRef[] {
  const nowHour = new Date(now).getHours();
  const scores = new Map<string, number>();

  for (const log of logs) {
    if (log.timestamp < now - WINDOW_MS || log.timestamp > now) continue;
    const weight =
      hourDistance(new Date(log.timestamp).getHours(), nowHour) <= NEAR_HOUR_RANGE ? NEAR_HOUR_WEIGHT : 1;
    for (const { key: category } of PRESET_CATEGORIES) {
      for (const id of selectedIds(log, category)) {
        const key = `${category}:${id}`;
        if (!PICKABLE_ORDER.has(key)) continue;
        scores.set(key, (scores.get(key) ?? 0) + weight);
      }
    }
  }

  return [...scores]
    .sort(([keyA, scoreA], [keyB, scoreB]) => scoreB - scoreA || PICKABLE_ORDER.get(keyA)! - PICKABLE_ORDER.get(keyB)!)
    .slice(0, limit)
    .map(([key]) => {
      const [category, id] = key.split(':') as [PresetCategoryKey, string];
      return { category, id };
    });
}
