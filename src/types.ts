export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export interface MoodPreset {
  level: MoodLevel;
  icon: string;
  color: string;       // Primary hex color (e.g. '#F59E0B')
  bgSoft: string;      // Soft background rgba/hex
  borderColor: string; // Border hex/rgba
  glowShadow: string;  // Subtle box-shadow glow
  hint: string;        // Tooltip-only minimal hint (not displayed by default)
}

export interface IconPreset {
  id: string;
  icon: string;
  hint: string;        // Tooltip/aria-label only
}

export interface MoodLog {
  id: string;
  timestamp: number;   // Epoch ms
  mood: MoodLevel;
  weather?: string;    // Single weather preset id
  sensations: string[]; // Multiple sensation preset ids
  activities: string[]; // Multiple activity preset ids
  note?: string;       // Optional short free text
  imageDataUrl?: string; // Optional compressed image data URL
}

export interface NotificationSlot {
  id: string;
  time: string;        // "HH:mm" e.g. "09:00", "21:00"
  enabled: boolean;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  slots: NotificationSlot[];
  showWidgetPreview: boolean; // Toggle in-app Android home widget bar preview
}
