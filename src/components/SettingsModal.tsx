import React, { useEffect, useState } from 'react';
import { AppSettings, NotificationSlot } from '../types';
import {
  requestNotificationPermission,
  sendTestNotification,
} from '../services/notification';
import { NativeSyncStatus } from '../services/dailySync';
import { MinimalIcon } from './MinimalIcon';

declare const __BUILD_VERSION__: string;

export interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onClose: () => void;
  onExportJson: () => void;
  onImportFile?: (file: File) => Promise<number>;
  syncStatus: NativeSyncStatus;
  isSyncingAll: boolean;
  syncProgressText: string | null;
  onPickSyncFolder: () => void;
  onClearSyncFolder: () => void;
  onSyncAllDays: () => void;
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  ariaLabel,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={onChange}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 ${
      checked
        ? 'border-emerald-500/50 bg-emerald-500/80'
        : 'border-zinc-700 bg-zinc-800'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-150 ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onUpdateSettings,
  onClose,
  onExportJson,
  onImportFile,
  syncStatus,
  isSyncingAll,
  syncProgressText,
  onPickSyncFolder,
  onClearSyncFolder,
  onSyncAllDays,
}) => {
  const [testFeedback, setTestFeedback] = useState<'idle' | 'sent' | 'denied'>('idle');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTestFeedback('idle');
    }
  }, [isOpen]);

  useEffect(() => {
    if (testFeedback === 'idle') return;
    const timer = window.setTimeout(() => setTestFeedback('idle'), 2200);
    return () => window.clearTimeout(timer);
  }, [testFeedback]);

  if (!isOpen) {
    return null;
  }

  const handleToggleNotifications = async () => {
    const nextEnabled = !settings.notificationsEnabled;
    if (nextEnabled) {
      await requestNotificationPermission();
    }
    onUpdateSettings({
      ...settings,
      notificationsEnabled: nextEnabled,
    });
  };

  const handleToggleSlot = (id: string) => {
    let turnedOn = false;
    const nextSlots = settings.slots.map((slot) => {
      if (slot.id === id) {
        turnedOn = !slot.enabled;
        return { ...slot, enabled: !slot.enabled };
      }
      return slot;
    });
    if (turnedOn) {
      void requestNotificationPermission();
    }
    onUpdateSettings({
      ...settings,
      notificationsEnabled: turnedOn ? true : settings.notificationsEnabled,
      slots: nextSlots,
    });
  };

  const handleChangeSlotTime = (id: string, time: string) => {
    if (!time) return;
    void requestNotificationPermission();
    const nextSlots = settings.slots.map((slot) =>
      slot.id === id ? { ...slot, time, enabled: true } : slot
    );
    onUpdateSettings({
      ...settings,
      notificationsEnabled: true,
      slots: nextSlots,
    });
  };

  const handleDeleteSlot = (id: string) => {
    const nextSlots = settings.slots.filter((slot) => slot.id !== id);
    onUpdateSettings({ ...settings, slots: nextSlots });
  };

  const handleAddSlot = () => {
    void requestNotificationPermission();
    const newSlot: NotificationSlot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: '12:00',
      enabled: true,
    };
    onUpdateSettings({
      ...settings,
      notificationsEnabled: true,
      slots: [...settings.slots, newSlot],
    });
  };

  const handleSendTest = async () => {
    const ok = await sendTestNotification();
    setTestFeedback(ok ? 'sent' : 'denied');
  };

  const nudgeEnabled = settings.nudgeEnabled !== false;
  const nudgeIntervalMinutes = settings.nudgeIntervalMinutes || 60;
  const dailySyncEnabled = settings.dailySyncEnabled !== false;
  const isSyncReady = syncStatus.supported && syncStatus.configured && syncStatus.hasPermission;

  const formatLastSynced = (timestampMs: number): string => {
    if (!timestampMs) return '';
    try {
      return new Date(timestampMs).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const handleToggleNudge = () => {
    onUpdateSettings({
      ...settings,
      nudgeEnabled: !nudgeEnabled,
    });
  };

  const handleSelectNudgeInterval = (minutes: number) => {
    const clamped = Math.min(720, Math.max(15, Math.round(minutes)));
    onUpdateSettings({
      ...settings,
      nudgeEnabled: true,
      nudgeIntervalMinutes: clamped,
    });
  };

  const NUDGE_PRESETS = [
    { minutes: 30, label: '30分' },
    { minutes: 60, label: '1時間' },
    { minutes: 120, label: '2時間' },
    { minutes: 180, label: '3時間' },
    { minutes: 360, label: '6時間' },
  ];

  const formatIntervalLabel = (minutes: number): string => {
    if (minutes < 60) return `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem === 0 ? `${hours}時間` : `${hours}時間${rem}分`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl border border-zinc-800/90 bg-zinc-950 p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.75rem)] shadow-2xl sm:rounded-3xl sm:pb-5"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-zinc-200">
            <MinimalIcon name="SlidersHorizontal" size={20} strokeWidth={1.85} />
            <span className="text-base font-medium tracking-wide">設定</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:text-zinc-100 active:scale-95"
          >
            <MinimalIcon name="X" size={20} strokeWidth={1.85} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Master Reminder Toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-zinc-900 bg-zinc-900/55 px-4 py-3.5 min-h-[54px]">
            <div className="flex items-center gap-3 text-zinc-200">
              <MinimalIcon
                name={settings.notificationsEnabled ? 'Bell' : 'BellOff'}
                size={20}
                strokeWidth={1.85}
                className={
                  settings.notificationsEnabled ? 'text-emerald-400' : 'text-zinc-500'
                }
              />
              <span className="text-sm tracking-wide text-zinc-200">リマインダー</span>
            </div>
            <ToggleSwitch
              checked={settings.notificationsEnabled}
              onChange={handleToggleNotifications}
              ariaLabel="Toggle reminders"
            />
          </div>

          {/* Notification Time Slots */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs tracking-wider text-zinc-400">
                NOTIFICATION SLOTS
              </span>
              <button
                type="button"
                onClick={handleAddSlot}
                aria-label="Add reminder slot"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white active:scale-95"
              >
                <MinimalIcon name="Plus" size={18} strokeWidth={2} />
              </button>
            </div>

            {settings.slots.length > 0 && (
              <div className="space-y-2.5">
                {settings.slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-3.5 py-2.5 min-h-[52px]"
                  >
                    <div className="flex items-center gap-3">
                      <MinimalIcon
                        name="Clock"
                        size={18}
                        strokeWidth={1.85}
                        className="text-zinc-500"
                      />
                      <input
                        type="time"
                        value={slot.time}
                        onChange={(e) => handleChangeSlotTime(slot.id, e.target.value)}
                        className="bg-transparent font-mono text-base text-zinc-200 [color-scheme:dark] focus:outline-none py-1"
                      />
                    </div>

                    <div className="flex items-center gap-2.5">
                      <ToggleSwitch
                        checked={slot.enabled}
                        onChange={() => handleToggleSlot(slot.id)}
                        ariaLabel={`Toggle slot ${slot.time}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(slot.id)}
                        aria-label={`Delete slot ${slot.time}`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-rose-400 active:scale-95"
                      >
                        <MinimalIcon name="X" size={18} strokeWidth={1.85} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Test Notification Button */}
            <button
              type="button"
              onClick={handleSendTest}
              className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 active:scale-[0.99]"
            >
              <MinimalIcon
                name={testFeedback === 'sent' ? 'Check' : 'Bell'}
                size={18}
                strokeWidth={1.85}
                className={
                  testFeedback === 'sent'
                    ? 'text-emerald-400'
                    : testFeedback === 'denied'
                    ? 'text-rose-400'
                    : 'text-zinc-400'
                }
              />
              <span>
                {testFeedback === 'sent'
                  ? '送信しました'
                  : testFeedback === 'denied'
                  ? '通知が許可されていません'
                  : 'テスト通知を送信'}
              </span>
            </button>
          </div>

          {/* Post Interval Gentle Nudge (Widget & Add Button Color) */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <MinimalIcon
                  name="Clock"
                  size={18}
                  strokeWidth={1.85}
                  className={nudgeEnabled ? 'text-[#E5A93C]' : 'text-zinc-500'}
                />
                <div className="min-w-0">
                  <div className="text-sm tracking-wide text-zinc-200">
                    未投稿の気づきサイン
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    最後の投稿から一定時間経過で追加ボタンを色変化
                  </div>
                </div>
              </div>
              <ToggleSwitch
                checked={nudgeEnabled}
                onChange={handleToggleNudge}
                ariaLabel="Toggle post elapsed nudge"
              />
            </div>

            {nudgeEnabled && (
              <div className="space-y-2.5 pt-0.5">
                <div className="grid grid-cols-5 gap-1.5">
                  {NUDGE_PRESETS.map((preset) => {
                    const isSelected = nudgeIntervalMinutes === preset.minutes;
                    return (
                      <button
                        key={preset.minutes}
                        type="button"
                        onClick={() => handleSelectNudgeInterval(preset.minutes)}
                        aria-pressed={isSelected}
                        className={`min-h-[38px] rounded-xl border text-xs font-medium transition-colors active:scale-95 ${
                          isSelected
                            ? 'border-[#E5A93C]/70 bg-[#E5A93C]/20 text-[#E5A93C]'
                            : 'border-zinc-800/80 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-3 py-2">
                  <span className="text-xs text-zinc-400">経過時間</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={nudgeIntervalMinutes <= 15}
                      onClick={() => handleSelectNudgeInterval(nudgeIntervalMinutes - 15)}
                      aria-label="Decrease nudge interval"
                      className="h-7 w-7 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-300 hover:text-white disabled:opacity-30 active:scale-95"
                    >
                      -
                    </button>
                    <span className="min-w-[68px] text-center font-mono text-xs text-[#E5A93C]">
                      {formatIntervalLabel(nudgeIntervalMinutes)}
                    </span>
                    <button
                      type="button"
                      disabled={nudgeIntervalMinutes >= 720}
                      onClick={() => handleSelectNudgeInterval(nudgeIntervalMinutes + 15)}
                      aria-label="Increase nudge interval"
                      className="h-7 w-7 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-300 hover:text-white disabled:opacity-30 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Daily Folder Sync (JSON + Images for Syncthing / FolderSync) */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <MinimalIcon
                  name={isSyncReady ? 'FolderOpen' : 'Folder'}
                  size={18}
                  strokeWidth={1.85}
                  className={isSyncReady && dailySyncEnabled ? 'text-emerald-400' : 'text-zinc-500'}
                />
                <div className="min-w-0">
                  <div className="text-sm tracking-wide text-zinc-200">
                    日次ファイル同期
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    daily/YYYY-MM-DD.json と images/ へ自動保存
                  </div>
                </div>
              </div>
              {syncStatus.supported && (
                <ToggleSwitch
                  checked={dailySyncEnabled}
                  onChange={() =>
                    onUpdateSettings({
                      ...settings,
                      dailySyncEnabled: !dailySyncEnabled,
                    })
                  }
                  ariaLabel="Toggle daily file sync"
                />
              )}
            </div>

            {syncStatus.supported ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-zinc-500">出力先フォルダ</div>
                    <div className="truncate font-mono text-xs text-zinc-200">
                      {syncStatus.configured
                        ? syncStatus.label || '選択済みフォルダ'
                        : '同期フォルダ未選択'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={onPickSyncFolder}
                      className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800 active:scale-95"
                    >
                      {syncStatus.configured ? '変更' : 'フォルダを選択'}
                    </button>
                    {syncStatus.configured && (
                      <button
                        type="button"
                        onClick={onClearSyncFolder}
                        aria-label="Clear sync folder"
                        className="rounded-xl border border-zinc-800/80 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:text-rose-400 active:scale-95"
                      >
                        解除
                      </button>
                    )}
                  </div>
                </div>

                {syncStatus.configured && !syncStatus.hasPermission && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    フォルダへのアクセス権限が失われています。「変更」から再度フォルダを選択してください。
                  </div>
                )}

                {isSyncReady && (
                  <>
                    <button
                      type="button"
                      disabled={isSyncingAll}
                      onClick={onSyncAllDays}
                      className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 disabled:opacity-50 active:scale-[0.99]"
                    >
                      <MinimalIcon
                        name="RefreshCw"
                        size={16}
                        strokeWidth={1.85}
                        className={isSyncingAll ? 'animate-spin text-emerald-400' : 'text-zinc-400'}
                      />
                      <span>{syncProgressText || '今すぐ全件同期'}</span>
                    </button>

                    {(syncStatus.lastSyncedAt > 0 || syncStatus.lastError) && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px]">
                        {syncStatus.lastSyncedAt > 0 && (
                          <span className="text-zinc-500 font-mono">
                            最終同期: {formatLastSynced(syncStatus.lastSyncedAt)}
                          </span>
                        )}
                        {syncStatus.lastError && (
                          <span className="text-rose-400 truncate max-w-full">
                            {syncStatus.lastError}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2 text-xs leading-relaxed text-zinc-500">
                Android アプリ版では、指定フォルダへ{' '}
                <span className="font-mono text-zinc-400">daily/YYYY-MM-DD.json</span> と{' '}
                <span className="font-mono text-zinc-400">images/</span> を自動保存し、Syncthing や FolderSync で同期できます。
              </div>
            )}
          </div>

          {/* Import & Export Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {onImportFile && (
              <label className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/75 py-3 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 active:scale-[0.99]">
                <MinimalIcon name="Upload" size={18} strokeWidth={1.85} />
                <span>{importStatus || 'CSV/JSON 読込'}</span>
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const count = await onImportFile(file);
                    setImportStatus(`${count}件を追加`);
                    setTimeout(() => setImportStatus(null), 2500);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={onExportJson}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/75 py-3 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 active:scale-[0.99] ${
                onImportFile ? '' : 'col-span-2'
              }`}
            >
              <MinimalIcon name="Download" size={18} strokeWidth={1.85} />
              <span>JSON 書き出し</span>
            </button>
          </div>

          <p className="text-center text-[11px] text-zinc-600">ビルド {__BUILD_VERSION__}</p>
        </div>
      </div>
    </div>
  );
};
