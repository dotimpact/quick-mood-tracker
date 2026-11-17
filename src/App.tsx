import React, { useEffect, useState, useCallback } from 'react';
import { MoodLevel, MoodLog, AppSettings } from './types';
import { MOOD_PRESETS } from './constants/presets';
import {
  getAllLogs,
  saveLog,
  deleteLog,
  seedInitialLogsIfEmpty,
  loadSettings,
  saveSettings,
  importMoodistoryCsvOrJson,
} from './services/storage';
import { startNotificationScheduler } from './services/notification';
import { MinimalIcon } from './components/MinimalIcon';
import { QuickEntrySheet } from './components/QuickEntrySheet';
import { LogTimeline } from './components/LogTimeline';
import { WidgetBarSimulator } from './components/WidgetBarSimulator';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  const [logs, setLogs] = useState<MoodLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const loaded = loadSettings();
    // Ensure clean default without top widget simulator clutter unless explicitly toggled in session
    return loaded;
  });
  const [selectedMoodFilter, setSelectedMoodFilter] = useState<MoodLevel | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'pixels'>('timeline');

  // Quick Entry Sheet states
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [sheetInitialMood, setSheetInitialMood] = useState<MoodLevel>(4);
  const [editingLog, setEditingLog] = useState<MoodLog | null>(null);

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Load initial logs & check deep-link query params from Android Widget
  useEffect(() => {
    seedInitialLogsIfEmpty().then((loaded) => {
      setLogs(loaded);
    });

    const params = new URLSearchParams(window.location.search);
    const moodParam = Number(params.get('mood'));
    const openSheetParam = params.get('openSheet');
    if (moodParam >= 1 && moodParam <= 5) {
      setSheetInitialMood(moodParam as MoodLevel);
      setIsSheetOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (openSheetParam === '1') {
      setIsSheetOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const handleNativeWidgetEvent = (e: Event) => {
      const custom = e as CustomEvent<{ mood?: MoodLevel; openSheet?: boolean }>;
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
    window.addEventListener('widget-quick-entry', handleNativeWidgetEvent);
    window.addEventListener('moodtracker:quick-entry', handleNativeWidgetEvent);
    return () => {
      window.removeEventListener('widget-quick-entry', handleNativeWidgetEvent);
      window.removeEventListener('moodtracker:quick-entry', handleNativeWidgetEvent);
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
    setSheetInitialMood(mood);
    setIsSheetOpen(true);
  }, []);

  const handleSaveEntry = async (
    entry: Omit<MoodLog, 'id' | 'timestamp'> & { id?: string; timestamp?: number }
  ) => {
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
    setIsSheetOpen(false);
    setEditingLog(null);
  };

  const handleEditLog = (log: MoodLog) => {
    setEditingLog(log);
    setSheetInitialMood(log.mood);
    setIsSheetOpen(true);
  };

  const handleDeleteLog = async (id: string) => {
    await deleteLog(id);
    const refreshed = await getAllLogs();
    setLogs(refreshed);
    setIsSheetOpen(false);
    setEditingLog(null);
  };

  const handleUpdateSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
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
    const refreshed = await getAllLogs();
    setLogs(refreshed);
    return count;
  };

  const latestMood: MoodLevel = logs[0]?.mood || 4;
  const activeColor = MOOD_PRESETS[latestMood].color;

  return (
    <div className="min-h-screen bg-[#111214] text-zinc-200 flex flex-col items-center relative pb-28">
      {/* Main Mobile Container */}
      <div className="w-full max-w-md px-5 pt-5 flex flex-col gap-5 relative z-10">
        {/* Quiet, Uncluttered Top Bar: View Toggle (Timeline / Pixels) + Settings */}
        <header className="flex items-center justify-between">
          {/* Segmented View Switcher (Timeline vs Pixels Calendar) */}
          <div className="flex items-center bg-zinc-900/70 p-0.5 rounded-lg">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2.5 py-1.5 rounded-md flex items-center justify-center transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-zinc-800/90 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              aria-label="Timeline View"
              title="タイムライン"
            >
              <MinimalIcon name="List" size={16} />
            </button>
            <button
              onClick={() => setViewMode('pixels')}
              className={`px-2.5 py-1.5 rounded-md flex items-center justify-center transition-colors ${
                viewMode === 'pixels'
                  ? 'bg-zinc-800/90 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              aria-label="Pixels Calendar View"
              title="ピクセル・ヒストリー"
            >
              <MinimalIcon name="LayoutGrid" size={16} />
            </button>
            <button
              onClick={() =>
                handleUpdateSettings({
                  ...settings,
                  showWidgetPreview: !settings.showWidgetPreview,
                })
              }
              className={`px-2.5 py-1.5 rounded-md flex items-center justify-center transition-colors ${
                settings.showWidgetPreview
                  ? 'bg-zinc-800/90 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              aria-label="Toggle Photo Widget Preview"
              title="フォトウィジェット表示切替"
            >
              <MinimalIcon name="Smartphone" size={16} />
            </button>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60 transition-colors"
            aria-label="Settings"
          >
            <MinimalIcon
              name={settings.notificationsEnabled ? 'Bell' : 'SlidersHorizontal'}
              size={16}
              color={settings.notificationsEnabled ? activeColor : undefined}
            />
          </button>
        </header>

        {/* Moodistory-style Photo + Quick Add Widget Preview */}
        {settings.showWidgetPreview && (
          <WidgetBarSimulator
            logs={logs}
            onQuickMoodTap={(mood) => handleOpenQuickEntry(mood)}
            onEditLog={handleEditLog}
            lastMood={latestMood}
          />
        )}

        {/* Moodistory-inspired Timeline & Pixels History */}
        <LogTimeline
          logs={logs}
          selectedMoodFilter={selectedMoodFilter}
          onSelectMoodFilter={setSelectedMoodFilter}
          onEditLog={handleEditLog}
          onDeleteLog={handleDeleteLog}
          viewMode={viewMode}
        />
      </div>

      {/* Calm Floating [+] Button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <button
          onClick={() => handleOpenQuickEntry(latestMood)}
          className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-200 active:scale-95 hover:scale-105 shadow-lg shadow-black/40"
          style={{
            backgroundColor: activeColor,
            color: '#111214',
          }}
          aria-label="New Log"
        >
          <MinimalIcon name="Plus" size={22} strokeWidth={2.25} color="#111214" />
        </button>
      </div>

      {/* 1-Sheet Quick Entry Modal */}
      <QuickEntrySheet
        isOpen={isSheetOpen}
        initialMood={sheetInitialMood}
        editingLog={editingLog}
        onClose={() => {
          setIsSheetOpen(false);
          setEditingLog(null);
        }}
        onSave={handleSaveEntry}
        onDelete={handleDeleteLog}
      />

      {/* Notification & Widget Settings Sheet */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onClose={() => setIsSettingsOpen(false)}
        onExportJson={handleExportJson}
        onImportFile={handleImportFile}
      />
    </div>
  );
};

export default App;
