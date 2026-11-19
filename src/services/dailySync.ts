import { MoodLevel, MoodLog, RoutineDayLog, RoutineItem } from '../types';
import {
  ACTIVITY_PRESETS,
  MOOD_PRESETS,
  SENSATION_PRESETS,
  WEATHER_PRESETS,
} from '../constants/presets';
import {
  getCalendarDayKey,
  getRoutineDayProgress,
  isRoutineActiveOnDate,
} from './storage';

export interface NativeSyncStatus {
  supported: boolean;
  configured: boolean;
  hasPermission: boolean;
  label: string;
  lastSyncedAt: number;
  lastError: string | null;
}

export interface DailyExportImage {
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface DailyDateStats {
  date: string;
  file: string;
  entryCount: number;
  avgMood: number | null;
  minMood: MoodLevel | null;
  maxMood: MoodLevel | null;
  imageCount: number;
  routinesCompleted: number;
  routinesTotal: number;
}

export interface DailySyncSummary {
  ok: boolean;
  syncedDates: string[];
  failedDates: string[];
  error?: string;
  status: NativeSyncStatus;
}

interface AndroidDailySyncBridge {
  getDailySyncStatus?: () => string;
  pickSyncFolder?: () => boolean;
  clearSyncFolder?: () => string;
  syncDayToFolder?: (
    requestId: string,
    dateKey: string,
    dailyJson: string,
    imagesJson: string,
    pruneOrphanImages: boolean
  ) => boolean;
  writeSyncIndexToFolder?: (requestId: string, indexJson: string) => boolean;
}

interface NativeSyncResultEventDetail {
  requestId?: string;
  kind?: 'day' | 'index';
  ok?: boolean;
  dateKey?: string;
  error?: string;
  status?: NativeSyncStatus;
}

const PENDING_DATES_KEY = 'daily_sync_pending_dates_v1';
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const WEATHER_LABEL_MAP = new Map(WEATHER_PRESETS.map((p) => [p.id, p.hint]));
const SENSATION_LABEL_MAP = new Map(SENSATION_PRESETS.map((p) => [p.id, p.hint]));
const ACTIVITY_LABEL_MAP = new Map(ACTIVITY_PRESETS.map((p) => [p.id, p.hint]));

const DEFAULT_NATIVE_STATUS: NativeSyncStatus = {
  supported: false,
  configured: false,
  hasPermission: false,
  label: '',
  lastSyncedAt: 0,
  lastError: null,
};

let syncOperationQueue: Promise<unknown> = Promise.resolve();

function getBridge(): AndroidDailySyncBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { AndroidBridge?: AndroidDailySyncBridge }).AndroidBridge;
}

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseStatusJson(raw: string | undefined): NativeSyncStatus {
  if (!raw) return { ...DEFAULT_NATIVE_STATUS };
  try {
    const parsed = JSON.parse(raw) as Partial<NativeSyncStatus>;
    return {
      supported: Boolean(parsed.supported),
      configured: Boolean(parsed.configured),
      hasPermission: Boolean(parsed.hasPermission),
      label: typeof parsed.label === 'string' ? parsed.label : '',
      lastSyncedAt: typeof parsed.lastSyncedAt === 'number' ? parsed.lastSyncedAt : 0,
      lastError: typeof parsed.lastError === 'string' && parsed.lastError ? parsed.lastError : null,
    };
  } catch {
    return { ...DEFAULT_NATIVE_STATUS };
  }
}

export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  } catch {
    return 'Asia/Tokyo';
  }
}

export function formatLocalIsoTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offMins = String(absOffset % 60).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offHours}:${offMins}`;
}

export function formatLocalTimeHHmm(timestampMs: number): string {
  const date = new Date(timestampMs);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function parseImageDataUrlMeta(
  dataUrl: string
): { mimeType: string; ext: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,/i.exec(dataUrl.trim());
  if (!match) return null;

  const rawMime = match[1].toLowerCase();
  switch (rawMime) {
    case 'image/jpeg':
    case 'image/jpg':
      return { mimeType: 'image/jpeg', ext: 'jpg' };
    case 'image/png':
      return { mimeType: 'image/png', ext: 'png' };
    case 'image/webp':
      return { mimeType: 'image/webp', ext: 'webp' };
    case 'image/gif':
      return { mimeType: 'image/gif', ext: 'gif' };
    case 'image/svg+xml':
      return { mimeType: 'image/svg+xml', ext: 'svg' };
    default:
      return null;
  }
}

export function buildSafeImageFileName(
  dateKey: string,
  logId: string,
  ext: string,
  usedNames: Set<string>
): string {
  const sanitizedId =
    logId
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'log';

  const baseName = `${dateKey}_${sanitizedId}`;
  let candidate = `${baseName}.${ext}`;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}_${suffix}.${ext}`;
    suffix++;
  }
  usedNames.add(candidate);
  return candidate;
}

export function collectActiveDateKeys(
  logs: MoodLog[],
  routineLogs: RoutineDayLog[]
): string[] {
  const dateSet = new Set<string>();
  for (const log of logs) {
    const key = getCalendarDayKey(new Date(log.timestamp));
    if (DATE_KEY_REGEX.test(key)) {
      dateSet.add(key);
    }
  }
  for (const entry of routineLogs) {
    if (
      DATE_KEY_REGEX.test(entry.dateKey) &&
      (entry.completed || Boolean(entry.comment && entry.comment.trim().length > 0))
    ) {
      dateSet.add(entry.dateKey);
    }
  }
  return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
}

function buildDailyExportSnapshot(
  dateKey: string,
  allLogs: MoodLog[],
  routines: RoutineItem[],
  routineLogs: RoutineDayLog[]
) {
  const dayLogs = allLogs
    .filter((log) => getCalendarDayKey(new Date(log.timestamp)) === dateKey)
    .sort((a, b) => a.timestamp - b.timestamp);

  const usedImageNames = new Set<string>();
  const images: DailyExportImage[] = [];

  const moodDistribution: Record<'1' | '2' | '3' | '4' | '5', number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };

  let moodSum = 0;
  let minMood: MoodLevel | null = null;
  let maxMood: MoodLevel | null = null;

  const serializedMoodLogs = dayLogs.map((log) => {
    const distKey = String(log.mood) as '1' | '2' | '3' | '4' | '5';
    if (distKey in moodDistribution) {
      moodDistribution[distKey] += 1;
    }
    moodSum += log.mood;
    minMood = minMood === null || log.mood < minMood ? log.mood : minMood;
    maxMood = maxMood === null || log.mood > maxMood ? log.mood : maxMood;

    const imageMeta = log.imageDataUrl ? parseImageDataUrlMeta(log.imageDataUrl) : null;
    let imageObj: {
      fileName: string;
      path: string;
      relativePath: string;
      mimeType: string;
    } | null = null;

    if (log.imageDataUrl && imageMeta) {
      const fileName = buildSafeImageFileName(dateKey, log.id, imageMeta.ext, usedImageNames);
      images.push({
        fileName,
        mimeType: imageMeta.mimeType,
        dataUrl: log.imageDataUrl,
      });
      imageObj = {
        fileName,
        path: `images/${fileName}`,
        relativePath: `../images/${fileName}`,
        mimeType: imageMeta.mimeType,
      };
    }

    const trimmedNote = log.note?.trim() || null;

    return {
      id: log.id,
      timestamp: log.timestamp,
      recordedAt: formatLocalIsoTimestamp(log.timestamp),
      time: formatLocalTimeHHmm(log.timestamp),
      mood: log.mood,
      moodLabel: MOOD_PRESETS[log.mood]?.hint ?? String(log.mood),
      weather: log.weather
        ? {
            id: log.weather,
            label: WEATHER_LABEL_MAP.get(log.weather) ?? log.weather,
          }
        : null,
      sensations: (log.sensations ?? []).map((id) => ({
        id,
        label: SENSATION_LABEL_MAP.get(id) ?? id,
      })),
      activities: (log.activities ?? []).map((id) => ({
        id,
        label: ACTIVITY_LABEL_MAP.get(id) ?? id,
      })),
      note: trimmedNote,
      hasImage: imageObj !== null,
      image: imageObj,
    };
  });

  const dayRoutineLogMap = new Map<string, RoutineDayLog>();
  for (const entry of routineLogs) {
    if (entry.dateKey === dateKey) {
      dayRoutineLogMap.set(entry.routineId, entry);
    }
  }

  const exportedRoutines = [...routines]
    .filter((r) => isRoutineActiveOnDate(r, dateKey) || dayRoutineLogMap.has(r.id))
    .sort((a, b) => a.order - b.order)
    .map((r) => {
      const dayLog = dayRoutineLogMap.get(r.id);
      const completed = Boolean(dayLog?.completed);
      const count = typeof dayLog?.count === 'number' ? dayLog.count : completed ? 1 : 0;
      const comment = dayLog?.comment?.trim() || null;
      return {
        routineId: r.id,
        title: r.title,
        archived: Boolean(r.archived),
        completed,
        count,
        comment,
        completedAt:
          typeof dayLog?.completedAt === 'number'
            ? formatLocalIsoTimestamp(dayLog.completedAt)
            : null,
        updatedAt:
          typeof dayLog?.updatedAt === 'number'
            ? formatLocalIsoTimestamp(dayLog.updatedAt)
            : null,
      };
    });

  const entryCount = dayLogs.length;
  const avgMood = entryCount > 0 ? Math.round((moodSum / entryCount) * 100) / 100 : null;
  const { completed: routinesCompleted, total: routinesTotal } = getRoutineDayProgress(
    dateKey,
    routines,
    routineLogs
  );

  const summary = {
    entryCount,
    avgMood,
    minMood,
    maxMood,
    moodDistribution,
    imageCount: images.length,
    routinesCompleted,
    routinesTotal,
  };

  const stats: DailyDateStats = {
    date: dateKey,
    file: `daily/${dateKey}.json`,
    entryCount,
    avgMood,
    minMood,
    maxMood,
    imageCount: images.length,
    routinesCompleted,
    routinesTotal,
  };

  const payload = {
    schemaVersion: 1,
    date: dateKey,
    timezone: getLocalTimeZone(),
    updatedAt: formatLocalIsoTimestamp(Date.now()),
    summary,
    moodLogs: serializedMoodLogs,
    routines: exportedRoutines,
  };

  return { payload, images, stats };
}

export function buildDailyExportPayload(
  dateKey: string,
  allLogs: MoodLog[],
  routines: RoutineItem[],
  routineLogs: RoutineDayLog[]
): { dailyJson: string; images: DailyExportImage[]; stats: DailyDateStats } {
  const { payload, images, stats } = buildDailyExportSnapshot(
    dateKey,
    allLogs,
    routines,
    routineLogs
  );
  return {
    dailyJson: JSON.stringify(payload, null, 2),
    images,
    stats,
  };
}

export function buildSyncIndexPayload(
  allLogs: MoodLog[],
  routines: RoutineItem[],
  routineLogs: RoutineDayLog[]
): string {
  const activeDates = collectActiveDateKeys(allLogs, routineLogs);
  const dates: DailyDateStats[] = activeDates.map(
    (dateKey) => buildDailyExportSnapshot(dateKey, allLogs, routines, routineLogs).stats
  );

  const indexPayload = {
    schemaVersion: 1,
    app: 'quick-mood-tracker',
    timezone: getLocalTimeZone(),
    updatedAt: formatLocalIsoTimestamp(Date.now()),
    latestDate: dates.length > 0 ? dates[0].date : null,
    totalMoodLogs: allLogs.length,
    totalDays: dates.length,
    dates,
    routines: [...routines]
      .sort((a, b) => a.order - b.order)
      .map((r) => ({
        id: r.id,
        title: r.title,
        archived: Boolean(r.archived),
      })),
  };

  return JSON.stringify(indexPayload, null, 2);
}

export function getPendingSyncDates(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(PENDING_DATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && DATE_KEY_REGEX.test(item));
  } catch {
    return [];
  }
}

function savePendingSyncDates(dates: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const unique = Array.from(new Set(dates.filter((d) => DATE_KEY_REGEX.test(d))));
    if (unique.length === 0) {
      localStorage.removeItem(PENDING_DATES_KEY);
    } else {
      localStorage.setItem(PENDING_DATES_KEY, JSON.stringify(unique));
    }
  } catch {
    // Ignore storage errors
  }
}

function addPendingSyncDates(dates: string[]): void {
  savePendingSyncDates([...getPendingSyncDates(), ...dates]);
}

function removePendingSyncDates(dates: string[]): void {
  if (dates.length === 0) return;
  const toRemove = new Set(dates);
  savePendingSyncDates(getPendingSyncDates().filter((d) => !toRemove.has(d)));
}

export function getNativeSyncStatus(): NativeSyncStatus {
  try {
    const bridge = getBridge();
    if (!bridge || typeof bridge.getDailySyncStatus !== 'function') {
      return { ...DEFAULT_NATIVE_STATUS };
    }
    return parseStatusJson(bridge.getDailySyncStatus());
  } catch {
    return { ...DEFAULT_NATIVE_STATUS };
  }
}

export async function pickNativeSyncFolder(): Promise<{
  cancelled: boolean;
  status: NativeSyncStatus;
}> {
  const bridge = getBridge();
  if (!bridge || typeof bridge.pickSyncFolder !== 'function') {
    return { cancelled: true, status: { ...DEFAULT_NATIVE_STATUS } };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (cancelled: boolean, status?: NativeSyncStatus) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('moodtracker:sync-folder-changed', onChanged);
      resolve({
        cancelled,
        status: status ?? getNativeSyncStatus(),
      });
    };

    const onChanged = (event: Event) => {
      const custom = event as CustomEvent<{
        cancelled?: boolean;
        status?: NativeSyncStatus;
      }>;
      finish(Boolean(custom.detail?.cancelled), custom.detail?.status);
    };

    const timer = window.setTimeout(() => {
      finish(true);
    }, 180_000);

    window.addEventListener('moodtracker:sync-folder-changed', onChanged);

    try {
      const started = bridge.pickSyncFolder?.();
      if (!started) {
        finish(true);
      }
    } catch {
      finish(true);
    }
  });
}

export function clearNativeSyncFolder(): NativeSyncStatus {
  savePendingSyncDates([]);
  try {
    const bridge = getBridge();
    if (!bridge || typeof bridge.clearSyncFolder !== 'function') {
      return { ...DEFAULT_NATIVE_STATUS };
    }
    return parseStatusJson(bridge.clearSyncFolder());
  } catch {
    return { ...DEFAULT_NATIVE_STATUS };
  }
}

function enqueueSyncOperation<T>(task: () => Promise<T>): Promise<T> {
  const run = syncOperationQueue.then(task, task);
  syncOperationQueue = run.catch(() => undefined);
  return run;
}

function waitForNativeSyncResult(
  requestId: string,
  invoke: () => boolean,
  timeoutMs = 30_000
): Promise<NativeSyncResultEventDetail> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ ok: false, error: 'Window unavailable' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (detail: NativeSyncResultEventDetail) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('moodtracker:sync-result', onResult);
      resolve(detail);
    };

    const onResult = (event: Event) => {
      const custom = event as CustomEvent<NativeSyncResultEventDetail>;
      if (custom.detail?.requestId === requestId) {
        finish(custom.detail);
      }
    };

    const timer = window.setTimeout(() => {
      finish({
        requestId,
        ok: false,
        error: '同期処理がタイムアウトしました',
        status: getNativeSyncStatus(),
      });
    }, timeoutMs);

    window.addEventListener('moodtracker:sync-result', onResult);

    try {
      const dispatched = invoke();
      if (!dispatched) {
        finish({
          requestId,
          ok: false,
          error: 'ネイティブ同期ブリッジを呼び出せませんでした',
          status: getNativeSyncStatus(),
        });
      }
    } catch (error) {
      finish({
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        status: getNativeSyncStatus(),
      });
    }
  });
}

async function runDateBatchSync(
  targetDates: string[],
  logs: MoodLog[],
  routines: RoutineItem[],
  routineLogs: RoutineDayLog[],
  onProgress?: (done: number, total: number) => void
): Promise<DailySyncSummary> {
  const bridge = getBridge();
  const status = getNativeSyncStatus();

  if (!status.supported || !bridge?.syncDayToFolder || !bridge?.writeSyncIndexToFolder) {
    return {
      ok: false,
      syncedDates: [],
      failedDates: targetDates,
      error: 'Androidアプリ環境でのみ利用できます',
      status,
    };
  }

  if (!status.configured || !status.hasPermission) {
    if (status.configured) {
      addPendingSyncDates(targetDates);
    }
    return {
      ok: false,
      syncedDates: [],
      failedDates: targetDates,
      error: status.configured
        ? '同期フォルダへのアクセス権限がありません'
        : '同期フォルダが選択されていません',
      status,
    };
  }

  const syncedDates: string[] = [];
  const failedDates: string[] = [];
  let lastError: string | undefined;
  let latestStatus = status;

  const total = targetDates.length;
  for (let i = 0; i < total; i++) {
    const dateKey = targetDates[i];
    const { dailyJson, images } = buildDailyExportPayload(dateKey, logs, routines, routineLogs);
    const requestId = createRequestId(`day-${dateKey}`);
    const result = await waitForNativeSyncResult(requestId, () =>
      Boolean(
        bridge.syncDayToFolder?.(
          requestId,
          dateKey,
          dailyJson,
          JSON.stringify(images),
          true
        )
      )
    );

    if (result.status) {
      latestStatus = result.status;
    }

    if (result.ok) {
      syncedDates.push(dateKey);
      removePendingSyncDates([dateKey]);
    } else {
      failedDates.push(dateKey);
      addPendingSyncDates([dateKey]);
      if (result.error) {
        lastError = result.error;
      }
    }

    onProgress?.(i + 1, total);
  }

  if (syncedDates.length > 0 || total === 0) {
    const indexJson = buildSyncIndexPayload(logs, routines, routineLogs);
    const indexReqId = createRequestId('index');
    const indexResult = await waitForNativeSyncResult(indexReqId, () =>
      Boolean(bridge.writeSyncIndexToFolder?.(indexReqId, indexJson))
    );
    if (indexResult.status) {
      latestStatus = indexResult.status;
    }
    if (!indexResult.ok) {
      lastError = indexResult.error || lastError || 'index.json の書き込みに失敗しました';
    }
  }

  latestStatus = getNativeSyncStatus();

  return {
    ok: failedDates.length === 0 && !lastError,
    syncedDates,
    failedDates,
    error: lastError,
    status: latestStatus,
  };
}

export function syncSpecificDates(
  dateKeys: string[],
  logs: MoodLog[],
  routines: RoutineItem[],
  routineLogs: RoutineDayLog[]
): Promise<DailySyncSummary> {
  return enqueueSyncOperation(async () => {
    const validInput = dateKeys.filter((d) => DATE_KEY_REGEX.test(d));
    const pending = getPendingSyncDates();
    const targetDates = Array.from(new Set([...validInput, ...pending]));

    if (targetDates.length === 0) {
      return {
        ok: true,
        syncedDates: [],
        failedDates: [],
        status: getNativeSyncStatus(),
      };
    }

    return runDateBatchSync(targetDates, logs, routines, routineLogs);
  });
}

export function syncAllDays(
  logs: MoodLog[],
  routines: RoutineItem[],
  routineLogs: RoutineDayLog[],
  onProgress?: (done: number, total: number) => void
): Promise<DailySyncSummary> {
  return enqueueSyncOperation(async () => {
    const activeDates = collectActiveDateKeys(logs, routineLogs);
    const pendingDates = getPendingSyncDates();
    const combined = Array.from(new Set([...activeDates, ...pendingDates])).sort((a, b) =>
      b.localeCompare(a)
    );
    const targetDates =
      combined.length > 0 ? combined : [getCalendarDayKey(new Date())];

    return runDateBatchSync(targetDates, logs, routines, routineLogs, onProgress);
  });
}
