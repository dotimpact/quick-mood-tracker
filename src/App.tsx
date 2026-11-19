import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AppSettings,
  AppTab,
  MoodLevel,
  MoodLog,
  RoutineDayLog,
  RoutineItem,
} from './types';
import { MOOD_PRESETS } from './constants/presets';
import {
  deleteLog,
  getAllLogs,
  getAllRoutineLogs,
  getAllRoutines,
  getCalendarDayKey,
  importMoodistoryCsvOrJson,
  loadSettings,
  saveAllRoutines,
  saveLog,
  saveRoutine,
  saveRoutineDayLog,
  saveSettings,
  seedInitialLogsIfEmpty,
  seedInitialRoutinesIfEmpty,
  syncRoutineProgressToWidgetStorage,
} from './services/storage';
import { startNotificationScheduler } from './services/notification';
import {
  clearNativeSyncFolder,
  getNativeSyncStatus,
  getPendingSyncDates,
  NativeSyncStatus,
  pickNativeSyncFolder,
  syncAllDays,
  syncSpecificDates,
} from './services/dailySync';
import { MinimalIcon } from './components/MinimalIcon';
import { QuickEntrySheet } from './components/QuickEntrySheet';
import { LogTimeline } from './components/LogTimeline';
import { RoutineView } from './components/RoutineView';
import { PixelsView } from './components/PixelsView';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  const [logs, setLogs] = useState<MoodLog[]>([]);
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [routineLogs, setRoutineLogs] = useState<RoutineDayLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [selectedMoodFilter, setSelectedMoodFilter] = useState<MoodLevel | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('timeline');
  const [selectedRoutineDateKey, setSelectedRoutineDateKey] = useState<string>(() =>
    getCalendarDayKey(new Date())
  );

  // Quick Entry Sheet states
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [sheetInitialMood, setSheetInitialMood] = useState<MoodLevel>(4);
  const [sheetInitialImage, setSheetInitialImage] = useState<string | undefined>(undefined);
  const [editingLog, setEditingLog] = useState<MoodLog | null>(null);
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<NativeSyncStatus>(() => getNativeSyncStatus());
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [syncProgressText, setSyncProgressText] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const lastTodayKeyRef = useRef<string>(getCalendarDayKey(new Date()));
  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;
  const syncProgressTimerRef = useRef<number | null>(null);

  const runFullSync = useCallback(
    async (
      targetLogs: MoodLog[],
      targetRoutines: RoutineItem[],
      targetRoutineLogs: RoutineDayLog[]
    ) => {
      if (syncProgressTimerRef.current !== null) {
        window.clearTimeout(syncProgressTimerRef.current);
        syncProgressTimerRef.current = null;
      }
      setIsSyncingAll(true);
      setSyncProgressText('同期準備中...');
      try {
        const result = await syncAllDays(
          targetLogs,
          targetRoutines,
          targetRoutineLogs,
          (done, total) => {
            setSyncProgressText(`同期中 ${done}/${total}...`);
          }
        );
        setSyncStatus(result.status);
        if (result.ok) {
          setSyncProgressText(`完了 (${result.syncedDates.length}日分)`);
        } else {
          setSyncProgressText(result.error || '一部の同期に失敗しました');
        }
      } catch (err) {
        setSyncStatus(getNativeSyncStatus());
        setSyncProgressText(err instanceof Error ? err.message : '同期に失敗しました');
      } finally {
        setIsSyncingAll(false);
        syncProgressTimerRef.current = window.setTimeout(() => {
          setSyncProgressText(null);
          syncProgressTimerRef.current = null;
        }, 3000);
      }
    },
    []
  );

  const syncDatesIfEnabled = useCallback(
    async (
      dateKeys: string[],
      nextLogs: MoodLog[],
      nextRoutines: RoutineItem[],
      nextRoutineLogs: RoutineDayLog[],
      overrideEnabled?: boolean
    ) => {
      const enabled = overrideEnabled ?? settingsRef.current.dailySyncEnabled;
      if (!enabled) return;
      const status = getNativeSyncStatus();
      if (!status.supported || !status.configured || !status.hasPermission) {
        setSyncStatus(status);
        return;
      }
      try {
        const result = await syncSpecificDates(
          dateKeys,
          nextLogs,
          nextRoutines,
          nextRoutineLogs
        );
        setSyncStatus(result.status);
      } catch {
        setSyncStatus(getNativeSyncStatus());
      }
    },
    []
  );

  useEffect(() => {
    const checkTimeAndDateRollover = () => {
      const now = new Date();
      setNowTick(now.getTime());
      const currentTodayKey = getCalendarDayKey(now);
      if (currentTodayKey !== lastTodayKeyRef.current) {
        lastTodayKeyRef.current = currentTodayKey;
        setSelectedRoutineDateKey(currentTodayKey);
        void syncRoutineProgressToWidgetStorage();
      }
    };

    const timer = window.setInterval(checkTimeAndDateRollover, 30_000);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkTimeAndDateRollover();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', checkTimeAndDateRollover);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', checkTimeAndDateRollover);
    };
  }, []);

  // Load initial logs, routines, routineLogs & check deep-link query params from Android Widget
  useEffect(() => {
    Promise.all([
      seedInitialLogsIfEmpty(),
      seedInitialRoutinesIfEmpty(),
      getAllRoutineLogs(),
    ]).then(([loadedLogs, loadedRoutines, loadedRoutineLogs]) => {
      setLogs(loadedLogs);
      setRoutines(loadedRoutines);
      setRoutineLogs(loadedRoutineLogs);
      void syncRoutineProgressToWidgetStorage(loadedRoutines, loadedRoutineLogs);

      const currentStatus = getNativeSyncStatus();
      setSyncStatus(currentStatus);
      if (
        settingsRef.current.dailySyncEnabled &&
        currentStatus.supported &&
        currentStatus.configured &&
        currentStatus.hasPermission
      ) {
        const pendingDates = getPendingSyncDates();
        if (currentStatus.lastSyncedAt === 0) {
          void runFullSync(loadedLogs, loadedRoutines, loadedRoutineLogs);
        } else if (pendingDates.length > 0) {
          void syncDatesIfEnabled(
            pendingDates,
            loadedLogs,
            loadedRoutines,
            loadedRoutineLogs,
            true
          );
        }
      }
    });

    const params = new URLSearchParams(window.location.search);
    const moodParam = Number(params.get('mood'));
    const openSheetParam = params.get('openSheet');
    const tabParam = params.get('tab');
    if (tabParam === 'routines' || tabParam === 'timeline' || tabParam === 'pixels') {
      setActiveTab(tabParam);
      if (tabParam === 'routines') {
        setSelectedRoutineDateKey(getCalendarDayKey(new Date()));
      }
    }
    const clearQueryParams = () => {
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        // Ignore history restrictions on file:// URLs
      }
    };

    if (moodParam >= 1 && moodParam <= 5) {
      setSheetInitialMood(moodParam as MoodLevel);
      setIsSheetOpen(true);
      clearQueryParams();
    } else if (openSheetParam === '1') {
      setIsSheetOpen(true);
      clearQueryParams();
    } else if (tabParam) {
      clearQueryParams();
    }

    const handleNativeWidgetEvent = (e: Event) => {
      const custom = e as CustomEvent<{
        mood?: MoodLevel;
        openSheet?: boolean;
        tab?: AppTab;
      }>;
      const tab = custom.detail?.tab;
      if (tab === 'routines' || tab === 'timeline' || tab === 'pixels') {
        setActiveTab(tab);
        if (tab === 'routines') {
          setSelectedRoutineDateKey(getCalendarDayKey(new Date()));
        }
      }
      const m = custom.detail?.mood;
      if (m && m >= 1 && m <= 5) {
        setEditingLog(null);
        setSheetInitialMood(m);
        setIsSheetOpen(true);
      } else if (custom.detail?.openSheet) {
        setEditingLog(null);
        setIsSheetOpen(true);
      }
    };
    const handleCameraPhotoEvent = (e: Event) => {
      const custom = e as CustomEvent<{
        imageDataUrl?: string;
        openSheet?: boolean;
        isNewEntry?: boolean;
      }>;
      const dataUrl = custom.detail?.imageDataUrl;
      if (dataUrl) {
        if (custom.detail?.isNewEntry) {
          setEditingLog(null);
        }
        setSheetInitialImage(dataUrl);
        setIsSheetOpen(true);
      }
    };
    window.addEventListener('widget-quick-entry', handleNativeWidgetEvent);
    window.addEventListener('moodtracker:quick-entry', handleNativeWidgetEvent);
    window.addEventListener('moodtracker:camera-photo', handleCameraPhotoEvent);
    return () => {
      window.removeEventListener('widget-quick-entry', handleNativeWidgetEvent);
      window.removeEventListener('moodtracker:quick-entry', handleNativeWidgetEvent);
      window.removeEventListener('moodtracker:camera-photo', handleCameraPhotoEvent);
    };
  }, []);

  // Start notification scheduler
  useEffect(() => {
    const stop = startNotificationScheduler(
      () => settings,
      () => {
        setIsSheetOpen(true);
      }
    );
    return stop;
  }, [settings]);

  const handleOpenQuickEntry = useCallback((mood: MoodLevel = 4) => {
    setEditingLog(null);
    setSheetInitialImage(undefined);
    setSheetInitialMood(mood);
    setIsSheetOpen(true);
  }, []);

  const handleSaveEntry = async (
    entry: Omit<MoodLog, 'id' | 'timestamp'> & { id?: string; timestamp?: number }
  ) => {
    const previousEditingLog = editingLog;
    const newLog: MoodLog = {
      id: entry.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp || Date.now(),
      mood: entry.mood,
      weather: entry.weather,
      sensations: entry.sensations,
      activities: entry.activities,
      note: entry.note?.trim() || undefined,
      imageDataUrl: entry.imageDataUrl,
    };

    await saveLog(newLog);
    const refreshed = await getAllLogs();
    setLogs(refreshed);
    setNowTick(Date.now());
    setIsSheetOpen(false);
    setEditingLog(null);
    setSheetInitialImage(undefined);
    setHighlightedLogId(newLog.id);
    window.setTimeout(
      () => setHighlightedLogId((current) => (current === newLog.id ? null : current)),
      1500
    );

    const affectedDates = [getCalendarDayKey(new Date(newLog.timestamp))];
    if (previousEditingLog) {
      const prevDate = getCalendarDayKey(new Date(previousEditingLog.timestamp));
      if (!affectedDates.includes(prevDate)) {
        affectedDates.push(prevDate);
      }
    }
    void syncDatesIfEnabled(affectedDates, refreshed, routines, routineLogs);
  };

  const handleEditLog = (log: MoodLog) => {
    setEditingLog(log);
    setSheetInitialImage(undefined);
    setSheetInitialMood(log.mood);
    setIsSheetOpen(true);
  };

  const handleDeleteLog = async (id: string) => {
    const deletedLog = logs.find((l) => l.id === id);
    await deleteLog(id);
    const refreshed = await getAllLogs();
    setLogs(refreshed);
    setNowTick(Date.now());
    setIsSheetOpen(false);
    setEditingLog(null);
    setSheetInitialImage(undefined);

    if (deletedLog) {
      void syncDatesIfEnabled(
        [getCalendarDayKey(new Date(deletedLog.timestamp))],
        refreshed,
        routines,
        routineLogs
      );
    }
  };

  const handleToggleRoutine = async (dateKey: string, routineId: string) => {
    const id = `${dateKey}_${routineId}`;
    const existing = routineLogs.find((r) => r.id === id);
    const nextCompleted = !existing?.completed;
    const now = Date.now();
    const entry: RoutineDayLog = {
      id,
      dateKey,
      routineId,
      completed: nextCompleted,
      count: nextCompleted ? 1 : 0,
      comment: existing?.comment,
      completedAt: nextCompleted ? now : undefined,
      updatedAt: now,
    };
    await saveRoutineDayLog(entry);
    const refreshed = await getAllRoutineLogs();
    setRoutineLogs(refreshed);
    void syncDatesIfEnabled([dateKey], logs, routines, refreshed);
  };

  const handleUpdateRoutineComment = async (
    dateKey: string,
    routineId: string,
    comment: string
  ) => {
    const id = `${dateKey}_${routineId}`;
    const existing = routineLogs.find((r) => r.id === id);
    const entry: RoutineDayLog = {
      id,
      dateKey,
      routineId,
      completed: existing ? existing.completed : false,
      count: existing?.count ?? (existing?.completed ? 1 : 0),
      comment,
      completedAt: existing?.completedAt,
      updatedAt: Date.now(),
    };
    await saveRoutineDayLog(entry);
    const refreshed = await getAllRoutineLogs();
    setRoutineLogs(refreshed);
    void syncDatesIfEnabled([dateKey], logs, routines, refreshed);
  };

  const handleAddRoutine = async (title: string, icon: string) => {
    const maxOrder = routines.reduce((max, r) => Math.max(max, r.order), -1);
    const item: RoutineItem = {
      id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      icon,
      order: maxOrder + 1,
      createdAt: Date.now(),
      targetCount: 1,
    };
    await saveRoutine(item);
    const refreshed = await getAllRoutines();
    setRoutines(refreshed);
    void syncDatesIfEnabled(
      [selectedRoutineDateKey, getCalendarDayKey(new Date())],
      logs,
      refreshed,
      routineLogs
    );
  };

  const handleUpdateRoutine = async (item: RoutineItem) => {
    await saveRoutine(item);
    const refreshed = await getAllRoutines();
    setRoutines(refreshed);
    void syncDatesIfEnabled(
      [selectedRoutineDateKey, getCalendarDayKey(new Date())],
      logs,
      refreshed,
      routineLogs
    );
  };

  const handleReorderRoutines = async (items: RoutineItem[]) => {
    const updatedIds = new Set(items.map((item) => item.id));
    const preservedArchived = routines.filter((r) => r.archived && !updatedIds.has(r.id));
    await saveAllRoutines([...items, ...preservedArchived]);
    const refreshed = await getAllRoutines();
    setRoutines(refreshed);
    void syncDatesIfEnabled(
      [selectedRoutineDateKey, getCalendarDayKey(new Date())],
      logs,
      refreshed,
      routineLogs
    );
  };

  const handleDeleteRoutine = async (id: string) => {
    const target = routines.find((r) => r.id === id);
    if (!target) return;
    await saveRoutine({
      ...target,
      archived: true,
      archivedAt: Date.now(),
    });
    const refreshed = await getAllRoutines();
    setRoutines(refreshed);
    void syncDatesIfEnabled(
      [selectedRoutineDateKey, getCalendarDayKey(new Date())],
      logs,
      refreshed,
      routineLogs
    );
  };

  const handleOpenRoutineDate = (dateKey: string) => {
    setSelectedRoutineDateKey(dateKey);
    setActiveTab('routines');
  };

  const handleUpdateSettings = (next: AppSettings) => {
    const turnedSyncOn = !settings.dailySyncEnabled && next.dailySyncEnabled;
    setSettings(next);
    saveSettings(next);
    if (turnedSyncOn) {
      const pendingDates = getPendingSyncDates();
      if (pendingDates.length > 0) {
        void syncDatesIfEnabled(pendingDates, logs, routines, routineLogs, true);
      }
    }
  };

  const handlePickSyncFolder = async () => {
    const result = await pickNativeSyncFolder();
    setSyncStatus(result.status);
    if (!result.cancelled && result.status.configured && result.status.hasPermission) {
      if (!settingsRef.current.dailySyncEnabled) {
        const nextSettings: AppSettings = {
          ...settingsRef.current,
          dailySyncEnabled: true,
        };
        setSettings(nextSettings);
        saveSettings(nextSettings);
      }
      await runFullSync(logs, routines, routineLogs);
    }
  };

  const handleClearSyncFolder = () => {
    const nextStatus = clearNativeSyncFolder();
    setSyncStatus(nextStatus);
    setSyncProgressText(null);
  };

  const handleSyncAllDays = () => {
    void runFullSync(logs, routines, routineLogs);
  };

  const handleExportJson = () => {
    const payload = { logs, routines, routineLogs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mood-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File): Promise<number> => {
    const text = await file.text();
    const count = await importMoodistoryCsvOrJson(text);
    const [refreshedLogs, refreshedRoutines, refreshedRoutineLogs] = await Promise.all([
      getAllLogs(),
      getAllRoutines(),
      getAllRoutineLogs(),
    ]);
    setLogs(refreshedLogs);
    setRoutines(refreshedRoutines);
    setRoutineLogs(refreshedRoutineLogs);
    setNowTick(Date.now());

    const currentStatus = getNativeSyncStatus();
    if (
      settingsRef.current.dailySyncEnabled &&
      currentStatus.supported &&
      currentStatus.configured &&
      currentStatus.hasPermission
    ) {
      void runFullSync(refreshedLogs, refreshedRoutines, refreshedRoutineLogs);
    }
    return count;
  };

  const latestMood: MoodLevel = logs[0]?.mood || 4;
  const activeMoodPreset = MOOD_PRESETS[latestMood];
  const activeColor = activeMoodPreset.color;

  const latestTimestamp = logs[0]?.timestamp;
  const nudgeIntervalMs = Math.max(1, settings.nudgeIntervalMinutes || 60) * 60_000;
  const isPostNudgeActive =
    settings.nudgeEnabled !== false &&
    (!latestTimestamp || nowTick - latestTimestamp >= nudgeIntervalMs);

  return (
    <div className="min-h-screen bg-[#111214] text-zinc-200 flex flex-col items-center relative pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]">
      {/* Main Mobile Container */}
      <div className="w-full max-w-md px-5 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] flex flex-col gap-4 relative z-10">
        {activeTab === 'timeline' && (
          <LogTimeline
            logs={logs}
            selectedMoodFilter={selectedMoodFilter}
            onSelectMoodFilter={setSelectedMoodFilter}
            onEditLog={handleEditLog}
            onDeleteLog={handleDeleteLog}
            routines={routines}
            routineLogs={routineLogs}
            onSelectRoutineDate={handleOpenRoutineDate}
            highlightedLogId={highlightedLogId}
          />
        )}

        {activeTab === 'routines' && (
          <RoutineView
            routines={routines}
            routineLogs={routineLogs}
            selectedDateKey={selectedRoutineDateKey}
            onChangeDateKey={setSelectedRoutineDateKey}
            onToggleRoutine={handleToggleRoutine}
            onUpdateRoutineComment={handleUpdateRoutineComment}
            onAddRoutine={handleAddRoutine}
            onUpdateRoutine={handleUpdateRoutine}
            onReorderRoutines={handleReorderRoutines}
            onDeleteRoutine={handleDeleteRoutine}
            accentColor="#68B088"
          />
        )}

        {activeTab === 'pixels' && (
          <PixelsView
            logs={logs}
            routines={routines}
            routineLogs={routineLogs}
            selectedMoodFilter={selectedMoodFilter}
            onSelectMoodFilter={setSelectedMoodFilter}
            onEditLog={handleEditLog}
            onOpenRoutineDate={handleOpenRoutineDate}
          />
        )}
      </div>

      {/* Outline-Icon-Only Minimal Bottom Bar */}
      <nav
        aria-label="Primary Navigation"
        className="fixed bottom-0 inset-x-0 z-30 bg-[#131417]/95 backdrop-blur-md border-t border-zinc-800/80 pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="w-full max-w-md mx-auto h-[60px] px-4 flex items-center justify-around">
          {/* 1. Timeline */}
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            aria-label="Timeline"
            aria-current={activeTab === 'timeline' ? 'page' : undefined}
            className={`relative w-12 h-11 rounded-xl flex flex-col items-center justify-center transition-colors active:scale-95 ${
              activeTab === 'timeline'
                ? 'text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <MinimalIcon name="List" size={20} strokeWidth={1.9} />
            {activeTab === 'timeline' && (
              <span
                className="w-1 h-1 rounded-full absolute bottom-1"
                style={{ backgroundColor: activeColor }}
              />
            )}
          </button>

          {/* 2. Routines */}
          <button
            type="button"
            onClick={() => {
              const todayKey = getCalendarDayKey(new Date());
              lastTodayKeyRef.current = todayKey;
              setSelectedRoutineDateKey(todayKey);
              setActiveTab('routines');
            }}
            aria-label="Routines"
            aria-current={activeTab === 'routines' ? 'page' : undefined}
            className={`relative w-12 h-11 rounded-xl flex flex-col items-center justify-center transition-colors active:scale-95 ${
              activeTab === 'routines'
                ? 'text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <MinimalIcon name="ListChecks" size={20} strokeWidth={1.9} />
            {activeTab === 'routines' && (
              <span
                className="w-1 h-1 rounded-full absolute bottom-1"
                style={{ backgroundColor: '#68B088' }}
              />
            )}
          </button>

          {/* 3. New Mood Entry */}
          <button
            type="button"
            onClick={() => handleOpenQuickEntry(latestMood)}
            aria-label="New Mood Entry"
            data-nudge-active={isPostNudgeActive ? 'true' : 'false'}
            className="w-12 h-11 rounded-2xl border flex items-center justify-center transition-all duration-300 active:scale-95"
            style={
              isPostNudgeActive
                ? {
                    borderColor: 'rgba(255, 238, 195, 0.55)',
                    backgroundColor: '#E5A93C',
                    color: '#141417',
                    boxShadow: '0 0 14px rgba(229, 169, 60, 0.28)',
                  }
                : {
                    borderColor: activeMoodPreset.borderColor,
                    backgroundColor: activeMoodPreset.bgSoft,
                    color: activeColor,
                  }
            }
          >
            <MinimalIcon
              name="Plus"
              size={20}
              strokeWidth={2.2}
              color={isPostNudgeActive ? '#141417' : activeColor}
            />
          </button>

          {/* 4. Pixels */}
          <button
            type="button"
            onClick={() => setActiveTab('pixels')}
            aria-label="Pixels"
            aria-current={activeTab === 'pixels' ? 'page' : undefined}
            className={`relative w-12 h-11 rounded-xl flex flex-col items-center justify-center transition-colors active:scale-95 ${
              activeTab === 'pixels'
                ? 'text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <MinimalIcon name="LayoutGrid" size={20} strokeWidth={1.9} />
            {activeTab === 'pixels' && (
              <span
                className="w-1 h-1 rounded-full absolute bottom-1"
                style={{ backgroundColor: activeColor }}
              />
            )}
          </button>

          {/* 5. Settings */}
          <button
            type="button"
            onClick={() => {
              setSyncStatus(getNativeSyncStatus());
              setIsSettingsOpen(true);
            }}
            aria-label="Settings"
            className="w-12 h-11 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors active:scale-95"
          >
            <MinimalIcon
              name={settings.notificationsEnabled ? 'Bell' : 'SlidersHorizontal'}
              size={20}
              strokeWidth={1.9}
              color={settings.notificationsEnabled ? activeColor : undefined}
            />
          </button>
        </div>
      </nav>

      {/* 1-Sheet Quick Entry Modal */}
      <QuickEntrySheet
        isOpen={isSheetOpen}
        initialMood={sheetInitialMood}
        initialImageDataUrl={sheetInitialImage}
        editingLog={editingLog}
        onClose={() => {
          setIsSheetOpen(false);
          setEditingLog(null);
          setSheetInitialImage(undefined);
        }}
        onSave={handleSaveEntry}
        onDelete={handleDeleteLog}
      />

      {/* Notification & Data Settings Sheet */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onClose={() => setIsSettingsOpen(false)}
        onExportJson={handleExportJson}
        onImportFile={handleImportFile}
        syncStatus={syncStatus}
        isSyncingAll={isSyncingAll}
        syncProgressText={syncProgressText}
        onPickSyncFolder={handlePickSyncFolder}
        onClearSyncFolder={handleClearSyncFolder}
        onSyncAllDays={handleSyncAllDays}
      />
    </div>
  );
};

export default App;
