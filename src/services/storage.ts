import { MoodLog, AppSettings, MoodLevel } from '../types';
import { syncNativeNotifications } from './notification';

const DB_NAME = 'MinimalMoodTrackerDB';
const DB_VERSION = 1;
const STORE_LOGS = 'logs';
const SETTINGS_KEY = 'minimal_mood_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: true,
  slots: [
    { id: 'morning', time: '09:00', enabled: true },
    { id: 'noon', time: '13:00', enabled: false },
    { id: 'night', time: '21:30', enabled: true },
  ],
  showWidgetPreview: true,
};

function createSampleCafeSunsetSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2c2a4a"/>
      <stop offset="42%" stop-color="#7c4d6b"/>
      <stop offset="74%" stop-color="#d8825b"/>
      <stop offset="100%" stop-color="#f2be7e"/>
    </linearGradient>
    <radialGradient id="sunGlow" cx="62%" cy="60%" r="42%">
      <stop offset="0%" stop-color="#ffe7b3" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="#f4a261" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#f4a261" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lampGlow" cx="28%" cy="48%" r="28%">
      <stop offset="0%" stop-color="#ffd99a" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffd99a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" fill="url(#sky)"/>
  <rect width="400" height="400" fill="url(#sunGlow)"/>
  <circle cx="248" cy="236" r="34" fill="#fff0c9" opacity="0.9"/>
  <path d="M0 282 Q95 256 190 272 T400 264 L400 400 L0 400 Z" fill="#3a2838" opacity="0.72"/>
  <path d="M0 302 Q130 285 260 298 T400 292 L400 400 L0 400 Z" fill="#231924"/>
  <rect x="0" y="0" width="24" height="400" fill="#18151c"/>
  <rect x="376" y="0" width="24" height="400" fill="#18151c"/>
  <rect x="0" y="0" width="400" height="22" fill="#18151c"/>
  <rect x="194" y="0" width="10" height="320" fill="#18151c" opacity="0.88"/>
  <rect x="0" y="316" width="400" height="84" fill="#16141a"/>
  <rect width="400" height="400" fill="url(#lampGlow)"/>
  <path d="M105 22 L105 92" stroke="#18151c" stroke-width="4"/>
  <path d="M78 118 Q105 84 132 118 Z" fill="#241f29"/>
  <ellipse cx="105" cy="120" rx="16" ry="5" fill="#ffe1a8" opacity="0.9"/>
  <rect x="258" y="286" width="44" height="30" rx="6" fill="#2c242b"/>
  <path d="M302 293 C316 293 316 310 302 310" fill="none" stroke="#2c242b" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="280" cy="317" rx="34" ry="4" fill="#0e0c11" opacity="0.8"/>
  <path d="M272 276 Q268 264 275 254" fill="none" stroke="#ffdcb4" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>
  <path d="M286 274 Q292 260 284 248" fill="none" stroke="#ffdcb4" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>
  <path d="M52 316 L60 264 L82 264 L90 316 Z" fill="#252028"/>
  <path d="M70 264 Q54 236 42 246 Q58 258 66 264 Z" fill="#324036"/>
  <path d="M72 264 Q88 232 102 244 Q86 256 76 264 Z" fill="#3a4c3e"/>
  <path d="M71 264 Q72 226 70 218" fill="none" stroke="#3a4c3e" stroke-width="3" stroke-linecap="round"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function mirrorLogToWidgetStorage(log: MoodLog): void {
  localStorage.setItem('widget_last_mood', String(log.mood));
  localStorage.setItem('widget_last_timestamp', String(log.timestamp));
  if (log.imageDataUrl) {
    localStorage.setItem('widget_last_photo_data', log.imageDataUrl);
    localStorage.setItem('widget_last_photo_mood', String(log.mood));
    localStorage.setItem('widget_last_photo_timestamp', String(log.timestamp));
  }
  try {
    const bridge = (window as unknown as { AndroidBridge?: { syncWidget: (mood: number, ts: number, photo: string) => void } }).AndroidBridge;
    if (bridge && typeof bridge.syncWidget === 'function') {
      bridge.syncWidget(log.mood, log.timestamp, log.imageDataUrl || '');
    }
  } catch {
    // Ignore when not in Android WebView
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        const store = db.createObjectStore(STORE_LOGS, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllLogs(): Promise<MoodLog[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_LOGS, 'readonly');
      const store = tx.objectStore(STORE_LOGS);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as MoodLog[]) || [];
        items.sort((a, b) => b.timestamp - a.timestamp);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    const raw = localStorage.getItem('fallback_mood_logs');
    return raw ? JSON.parse(raw) : [];
  }
}

export async function saveLog(log: MoodLog): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOGS, 'readwrite');
      tx.objectStore(STORE_LOGS).put(log);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Also mirror latest mood & photo to SharedPreferences/localStorage bridge for Android Widget
    mirrorLogToWidgetStorage(log);
  } catch {
    const existing = await getAllLogs();
    const filtered = existing.filter((i) => i.id !== log.id);
    const updated = [log, ...filtered].sort((a, b) => b.timestamp - a.timestamp);
    localStorage.setItem('fallback_mood_logs', JSON.stringify(updated));
    mirrorLogToWidgetStorage(log);
  }
}

export async function deleteLog(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOGS, 'readwrite');
      tx.objectStore(STORE_LOGS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await getAllLogs();
    localStorage.setItem(
      'fallback_mood_logs',
      JSON.stringify(existing.filter((i) => i.id !== id))
    );
  }
}

export async function seedInitialLogsIfEmpty(): Promise<MoodLog[]> {
  const existing = await getAllLogs();
  if (existing.length > 0) {
    const latestWithPhoto = existing.find((l) => l.imageDataUrl);
    if (latestWithPhoto) mirrorLogToWidgetStorage(latestWithPhoto);
    if (existing[0]) mirrorLogToWidgetStorage(existing[0]);
    return existing;
  }

  const now = Date.now();
  const sampleLogs: MoodLog[] = [
    {
      id: 'sample-1',
      timestamp: now - 1000 * 60 * 95,
      mood: 4,
      weather: 'sunny',
      sensations: ['fresh', 'relaxed'],
      activities: ['work', 'music'],
      note: '',
    },
    {
      id: 'sample-2',
      timestamp: now - 1000 * 60 * 320,
      mood: 4,
      weather: 'partly',
      sensations: ['relaxed'],
      activities: ['transit', 'meal'],
      note: 'カフェで一息',
      imageDataUrl: createSampleCafeSunsetSvg(),
    },
    {
      id: 'sample-3',
      timestamp: now - 1000 * 60 * 60 * 20,
      mood: 5,
      weather: 'sunny',
      sensations: ['fresh'],
      activities: ['exercise', 'bath', 'rest'],
      note: '',
    },
  ];

  for (const item of sampleLogs) {
    await saveLog(item);
  }
  return getAllLogs();
}

function mapMoodistoryEventsAndNotes(
  eventsStr: string,
  noteText: string
): { weather?: string; sensations: string[]; activities: string[] } {
  const sensations = new Set<string>();
  const activities = new Set<string>();
  let weather: string | undefined;

  const combined = `${eventsStr} ${noteText}`;
  if (combined.includes('コーヒー') || combined.includes('お茶')) sensations.add('relaxed');
  if (
    combined.includes('朝食') ||
    combined.includes('昼食') ||
    combined.includes('夕食') ||
    combined.includes('スープ') ||
    combined.includes('甘い物')
  ) {
    activities.add('meal');
  }
  if (combined.includes('運動') || combined.includes('ウォーキング')) activities.add('exercise');
  if (combined.includes('お風呂')) activities.add('bath');
  if (combined.includes('掃除機') || combined.includes('家事')) activities.add('home');
  if (combined.includes('読む') || combined.includes('読書')) activities.add('study');
  if (combined.includes('TVを見る') || combined.includes('音楽')) activities.add('music');
  if (combined.includes('美術館') || combined.includes('写真')) activities.add('game');

  if (noteText.includes('お腹すいた') || noteText.includes('腹減った')) sensations.add('hungry');
  if (noteText.includes('疲れた')) sensations.add('tired');
  if (noteText.includes('暑い')) sensations.add('hot');
  if (noteText.includes('寒い')) sensations.add('cold');
  if (noteText.includes('眠い')) sensations.add('sleepy');
  if (noteText.includes('どんより天気') || noteText.includes('曇')) weather = 'cloudy';
  if (noteText.includes('雨')) weather = 'rainy';
  if (noteText.includes('晴')) weather = 'sunny';

  return {
    weather,
    sensations: Array.from(sensations),
    activities: Array.from(activities),
  };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export async function importMoodistoryCsvOrJson(rawContent: string): Promise<number> {
  const trimmed = rawContent.trim();
  if (!trimmed) return 0;

  let importedCount = 0;

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (typeof item.timestamp === 'number' && typeof item.mood === 'number') {
        // Native MoodLog format
        await saveLog({
          id: item.id || `import-${item.timestamp}-${i}`,
          timestamp: item.timestamp,
          mood: Math.min(5, Math.max(1, Math.round(item.mood))) as MoodLevel,
          weather: item.weather,
          sensations: Array.isArray(item.sensations) ? item.sensations : [],
          activities: Array.isArray(item.activities) ? item.activities : [],
          note: item.note,
          imageDataUrl: item.imageDataUrl,
        });
        importedCount++;
      } else if (typeof item.date === 'number' && typeof item.mood === 'number') {
        // Moodistory JSON export format stores wall-clock time as UTC epoch ms
        const correctedTs = item.date - 9 * 60 * 60 * 1000;
        const evNames = Array.isArray(item.events)
          ? item.events.map((e: { name?: string }) => e.name || '').join('|')
          : '';
        const note = (item.notes || '').trim();
        const mapped = mapMoodistoryEventsAndNotes(evNames, note);
        await saveLog({
          id: `moodistory-v2-${correctedTs}-${i}`,
          timestamp: correctedTs,
          mood: Math.min(5, Math.max(1, Math.round(item.mood))) as MoodLevel,
          weather: mapped.weather,
          sensations: mapped.sensations,
          activities: mapped.activities,
          note: note || undefined,
        });
        importedCount++;
      }
    }
    return importedCount;
  }

  // Moodistory CSV format: date,mood,events,notesAndThoughts,locationName,locationLatitude,locationLongitude,hasImage
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.toLowerCase().startsWith('date,mood')) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 2) continue;
    const dateStr = cols[0].trim();
    const moodVal = Number(cols[1].trim());
    if (!dateStr || isNaN(moodVal)) continue;

    const ts = new Date(dateStr.replace(' ', 'T')).getTime();
    if (isNaN(ts)) continue;

    const eventsStr = (cols[2] || '').trim();
    const noteText = (cols[3] || '').replace(/#$/, '').trim();
    const mapped = mapMoodistoryEventsAndNotes(eventsStr, noteText);

    await saveLog({
      id: `moodistory-${ts}-${i}`,
      timestamp: ts,
      mood: Math.min(5, Math.max(1, Math.round(moodVal))) as MoodLevel,
      weather: mapped.weather,
      sensations: mapped.sensations,
      activities: mapped.activities,
      note: noteText || undefined,
    });
    importedCount++;
  }

  return importedCount;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  syncNativeNotifications(settings);
}
