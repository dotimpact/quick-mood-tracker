import React, { useEffect, useState } from 'react';
import { AppSettings, NotificationSlot } from '../types';
import {
  requestNotificationPermission,
  sendTestNotification,
} from '../services/notification';
import { MinimalIcon } from './MinimalIcon';

export interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onClose: () => void;
  onExportJson: () => void;
  onImportFile?: (file: File) => Promise<number>;
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
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 ${
      checked
        ? 'border-emerald-500/50 bg-emerald-500/80'
        : 'border-zinc-700 bg-zinc-800'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-150 ${
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

  const handleToggleWidget = () => {
    onUpdateSettings({
      ...settings,
      showWidgetPreview: !settings.showWidgetPreview,
    });
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
        className="w-full max-w-md rounded-t-3xl border border-zinc-800/90 bg-zinc-950 p-5 pb-7 shadow-2xl sm:rounded-3xl sm:pb-5"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-300">
            <MinimalIcon name="SlidersHorizontal" size={18} strokeWidth={1.75} />
            <span className="text-sm font-medium tracking-wide">設定</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <MinimalIcon name="X" size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Master Reminder Toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-zinc-900 bg-zinc-900/55 px-4 py-3">
            <div className="flex items-center gap-3 text-zinc-200">
              <MinimalIcon
                name={settings.notificationsEnabled ? 'Bell' : 'BellOff'}
                size={18}
                strokeWidth={1.75}
                className={
                  settings.notificationsEnabled ? 'text-emerald-400' : 'text-zinc-500'
                }
              />
              <span className="text-xs tracking-wide text-zinc-300">リマインダー</span>
            </div>
            <ToggleSwitch
              checked={settings.notificationsEnabled}
              onChange={handleToggleNotifications}
              ariaLabel="Toggle reminders"
            />
          </div>

          {/* Notification Time Slots */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/40 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-wider text-zinc-500">
                NOTIFICATION SLOTS
              </span>
              <button
                type="button"
                onClick={handleAddSlot}
                aria-label="Add reminder slot"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
              >
                <MinimalIcon name="Plus" size={14} strokeWidth={2} />
              </button>
            </div>

            {settings.slots.length > 0 && (
              <div className="space-y-2">
                {settings.slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-3 py-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <MinimalIcon
                        name="Clock"
                        size={15}
                        strokeWidth={1.75}
                        className="text-zinc-500"
                      />
                      <input
                        type="time"
                        value={slot.time}
                        onChange={(e) => handleChangeSlotTime(slot.id, e.target.value)}
                        className="bg-transparent font-mono text-sm text-zinc-200 [color-scheme:dark] focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <ToggleSwitch
                        checked={slot.enabled}
                        onChange={() => handleToggleSlot(slot.id)}
                        ariaLabel={`Toggle slot ${slot.time}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(slot.id)}
                        aria-label={`Delete slot ${slot.time}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
                      >
                        <MinimalIcon name="X" size={14} strokeWidth={1.75} />
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 py-2 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
            >
              <MinimalIcon
                name={testFeedback === 'sent' ? 'Check' : 'Bell'}
                size={14}
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

          {/* Android Home Widget Bar Simulator Toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-zinc-900 bg-zinc-900/55 px-4 py-3">
            <div className="flex items-center gap-3 text-zinc-200">
              <MinimalIcon
                name="Smartphone"
                size={18}
                strokeWidth={1.75}
                className={
                  settings.showWidgetPreview ? 'text-sky-400' : 'text-zinc-500'
                }
              />
              <span className="text-xs tracking-wide text-zinc-300">
                Android ウィジェットバー
              </span>
            </div>
            <ToggleSwitch
              checked={settings.showWidgetPreview}
              onChange={handleToggleWidget}
              ariaLabel="Toggle Android home widget bar preview"
            />
          </div>

          {/* Import & Export Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            {onImportFile && (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/75 py-3 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800">
                <MinimalIcon name="Upload" size={16} strokeWidth={1.75} />
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
              className={`flex items-center justify-center gap-2 rounded-2xl border border-zinc-800/90 bg-zinc-900/75 py-3 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 ${
                onImportFile ? '' : 'col-span-2'
              }`}
            >
              <MinimalIcon name="Download" size={16} strokeWidth={1.75} />
              <span>JSON 書き出し</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
