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
        className="w-full max-w-md rounded-t-3xl border border-zinc-800/90 bg-zinc-950 p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.75rem)] shadow-2xl sm:rounded-3xl sm:pb-5"
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
        </div>
      </div>
    </div>
  );
};
