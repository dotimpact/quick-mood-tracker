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
  hidden?: boolean;    // Still resolvable for old logs, but not offered in the picker
}

export type PresetCategoryKey = 'sensations' | 'weather' | 'activities';

export interface PresetCategory {
  key: PresetCategoryKey;
  label: string;
  presets: IconPreset[];
  multiple: boolean;
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
  nudgeEnabled: boolean;
  nudgeIntervalMinutes: number; // Default 60 (1 hour)
  dailySyncEnabled: boolean;
}

export interface RoutineItem {
  id: string;
  title: string;
  icon: string;
  order: number;
  archived?: boolean;
  createdAt?: number;
  archivedAt?: number;
  targetCount?: number; // Reserved for multi-check routines (default 1)
}

export interface RoutineDayLog {
  id: string;           // `${dateKey}_${routineId}`
  dateKey: string;      // "YYYY-MM-DD"
  routineId: string;
  completed: boolean;
  count?: number;       // Reserved for multi-check routines (default completed ? 1 : 0)
  comment?: string;     // Per-completion daily note/comment
  completedAt?: number; // Epoch ms when transitioned false -> true
  updatedAt: number;
}

export type AppTab = 'timeline' | 'routines' | 'pixels';
