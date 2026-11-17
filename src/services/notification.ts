import { AppSettings } from '../types';

const NOTIFICATION_TITLE = 'Mood';
const NOTIFICATION_BODY = '今の気分・体感をワンタップで記録';

interface AndroidNativeBridge {
  syncWidget?: (mood: number, ts: number, photo: string) => void;
  syncNotifications?: (enabled: boolean, timesCsv: string) => void;
  requestNotificationPermission?: () => boolean;
  hasNotificationPermission?: () => boolean;
  sendTestNotification?: () => boolean;
}

function getAndroidBridge(): AndroidNativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { AndroidBridge?: AndroidNativeBridge }).AndroidBridge;
}

export function syncNativeNotifications(settings: AppSettings): void {
  try {
    const bridge = getAndroidBridge();
    if (bridge && typeof bridge.syncNotifications === 'function') {
      const enabledTimesCsv = settings.slots
        .filter((s) => s.enabled && /^\d{2}:\d{2}$/.test(s.time))
        .map((s) => s.time)
        .join(',');
      bridge.syncNotifications(settings.notificationsEnabled, enabledTimesCsv);
    }
  } catch {
    // Ignore when not in Android WebView
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const bridge = getAndroidBridge();
  if (bridge && typeof bridge.requestNotificationPermission === 'function') {
    try {
      if (bridge.hasNotificationPermission?.()) {
        return 'granted';
      }
      return await new Promise<NotificationPermission>((resolve) => {
        let settled = false;
        const finish = (granted: boolean) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('moodtracker:notification-permission', onEvent);
          resolve(granted ? 'granted' : 'denied');
        };
        const onEvent = (e: Event) => {
          const custom = e as CustomEvent<{ granted?: boolean }>;
          finish(Boolean(custom.detail?.granted));
        };
        window.addEventListener('moodtracker:notification-permission', onEvent);
        const immediate = bridge.requestNotificationPermission?.() ?? false;
        if (immediate) {
          finish(true);
          return;
        }
        window.setTimeout(() => {
          finish(Boolean(bridge.hasNotificationPermission?.()));
        }, 15000);
      });
    } catch {
      return 'denied';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function sendTestNotification(): Promise<boolean> {
  const bridge = getAndroidBridge();
  if (bridge && typeof bridge.sendTestNotification === 'function') {
    try {
      if (bridge.hasNotificationPermission?.()) {
        return Boolean(bridge.sendTestNotification());
      }
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('moodtracker:notification-permission', onEvent);
          resolve(ok);
        };
        const onEvent = (e: Event) => {
          const custom = e as CustomEvent<{ granted?: boolean; testSent?: boolean }>;
          if (custom.detail?.testSent) {
            finish(true);
          } else if (custom.detail?.granted) {
            finish(Boolean(bridge.sendTestNotification?.()));
          } else {
            finish(false);
          }
        };
        window.addEventListener('moodtracker:notification-permission', onEvent);
        const immediate = bridge.sendTestNotification?.() ?? false;
        if (immediate) {
          finish(true);
          return;
        }
        window.setTimeout(() => {
          finish(false);
        }, 15000);
      });
    } catch {
      return false;
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      return false;
    }
  }
  try {
    new Notification(NOTIFICATION_TITLE, {
      body: NOTIFICATION_BODY,
      silent: false,
    });
    return true;
  } catch {
    return false;
  }
}

function formatCurrentTimeSlot(date: Date): { hhmm: string; minuteKey: string } {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hhmm = `${hours}:${minutes}`;
  const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    hhmm,
    minuteKey: `${datePart} ${hhmm}`,
  };
}

export function startNotificationScheduler(
  getSettings: () => AppSettings,
  onTriggerInApp?: () => void
): () => void {
  let lastTriggeredMinute = '';

  // Ensure Android native AlarmManager is synced with current settings
  syncNativeNotifications(getSettings());

  const checkAndTrigger = () => {
    const settings = getSettings();
    if (!settings.notificationsEnabled) {
      return;
    }

    const now = new Date();
    const { hhmm, minuteKey } = formatCurrentTimeSlot(now);

    if (lastTriggeredMinute === minuteKey) {
      return;
    }

    const hasMatchingSlot = settings.slots.some(
      (slot) => slot.enabled && slot.time === hhmm
    );

    if (!hasMatchingSlot) {
      return;
    }

    lastTriggeredMinute = minuteKey;

    const bridge = getAndroidBridge();
    const hasNativeScheduler = Boolean(bridge && typeof bridge.syncNotifications === 'function');

    if (
      !hasNativeScheduler &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(NOTIFICATION_TITLE, {
          body: NOTIFICATION_BODY,
          silent: false,
        });
      } catch {
        // Ignore platform Notification constructor errors when falling back to in-app callback
      }
    }

    onTriggerInApp?.();
  };

  checkAndTrigger();
  const intervalId = window.setInterval(checkAndTrigger, 10_000);
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      checkAndTrigger();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
