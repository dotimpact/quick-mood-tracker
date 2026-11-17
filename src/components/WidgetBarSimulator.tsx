import React, { useEffect, useMemo, useState } from 'react';
import { MoodLevel, MoodLog } from '../types';
import { MOOD_PRESETS } from '../constants/presets';
import { MinimalIcon } from './MinimalIcon';

export interface WidgetBarSimulatorProps {
  logs?: MoodLog[];
  onQuickMoodTap: (mood: MoodLevel) => void;
  onEditLog?: (log: MoodLog) => void;
  lastMood?: MoodLevel;
}

const FALLBACK_PHOTO_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#272b3b"/>
        <stop offset="50%" stop-color="#5d4c66"/>
        <stop offset="100%" stop-color="#d8926a"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#bg)"/>
    <circle cx="255" cy="220" r="36" fill="#ffe5b4" opacity="0.85"/>
    <path d="M0 295 Q120 265 240 288 T400 280 L400 400 L0 400 Z" fill="#1e1b24"/>
  </svg>`
)}`;

function formatBadgeDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatBadgeTime(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function readStoredPhotoSnapshot(): {
  imageDataUrl?: string;
  mood?: MoodLevel;
  timestamp?: number;
} {
  try {
    const imageDataUrl = localStorage.getItem('widget_last_photo_data') || undefined;
    const moodNum = Number(localStorage.getItem('widget_last_photo_mood'));
    const tsNum = Number(localStorage.getItem('widget_last_photo_timestamp'));
    return {
      imageDataUrl,
      mood: moodNum >= 1 && moodNum <= 5 ? (moodNum as MoodLevel) : undefined,
      timestamp: Number.isFinite(tsNum) && tsNum > 0 ? tsNum : undefined,
    };
  } catch {
    return {};
  }
}

export const WidgetBarSimulator: React.FC<WidgetBarSimulatorProps> = ({
  logs,
  onQuickMoodTap,
  onEditLog,
  lastMood,
}) => {
  const photoLogs = useMemo(
    () => (logs ?? []).filter((log) => Boolean(log.imageDataUrl)),
    [logs]
  );

  const [activeIndex, setActiveIndex] = useState(0);

  // Reset to the newest photo when photoLogs changes
  useEffect(() => {
    setActiveIndex(0);
  }, [photoLogs.length, photoLogs[0]?.id]);

  const safeIndex = photoLogs.length > 0 ? activeIndex % photoLogs.length : 0;
  const activePhotoLog = photoLogs[safeIndex];

  const storedSnapshot = useMemo(() => readStoredPhotoSnapshot(), [logs]);
  const latestLog = logs?.[0];

  const photoUrl =
    activePhotoLog?.imageDataUrl ||
    storedSnapshot.imageDataUrl ||
    FALLBACK_PHOTO_SVG;

  const displayMood: MoodLevel =
    activePhotoLog?.mood ||
    (storedSnapshot.imageDataUrl ? storedSnapshot.mood : undefined) ||
    latestLog?.mood ||
    lastMood ||
    4;

  const displayTimestamp =
    activePhotoLog?.timestamp ||
    (storedSnapshot.imageDataUrl ? storedSnapshot.timestamp : undefined) ||
    latestLog?.timestamp ||
    Date.now();

  const moodPreset = MOOD_PRESETS[displayMood];
  const dateLabel = formatBadgeDate(displayTimestamp);
  const timeLabel = formatBadgeTime(displayTimestamp);

  const handlePhotoClick = () => {
    if (photoLogs.length > 1) {
      setActiveIndex((prev) => (prev + 1) % photoLogs.length);
      return;
    }
    if (activePhotoLog && onEditLog) {
      onEditLog(activePhotoLog);
    }
  };

  const handleBadgeClick = (e: React.MouseEvent) => {
    if (activePhotoLog && onEditLog) {
      e.stopPropagation();
      onEditLog(activePhotoLog);
    }
  };

  const handleAddEntryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickMoodTap(lastMood || 4);
  };

  return (
    <div
      className="w-full flex justify-center"
      aria-label="Moodistory 2x2 Photo Widget Preview"
    >
      <div
        onClick={handlePhotoClick}
        role={photoLogs.length > 1 || (activePhotoLog && onEditLog) ? 'button' : undefined}
        tabIndex={photoLogs.length > 1 || (activePhotoLog && onEditLog) ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handlePhotoClick();
          }
        }}
        aria-label={
          photoLogs.length > 1
            ? '写真を切り替える'
            : activePhotoLog && onEditLog
              ? 'この記録を編集'
              : '写真ウィジェット'
        }
        className="w-44 h-44 sm:w-48 sm:h-48 rounded-[22px] overflow-hidden relative shadow-xl border border-zinc-800/60 select-none group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
      >
        {/* 1. Full-bleed Photo Background */}
        <img
          src={photoUrl}
          alt={activePhotoLog?.note || '気分の写真'}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          draggable={false}
        />

        {/* Subtle bottom-right vignette for button legibility */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tl from-black/45 via-transparent to-black/10" />

        {/* 2. Top-Left Mood & Date/Time Badge (Exact Moodistory Style) */}
        <div
          onClick={handleBadgeClick}
          style={{ backgroundColor: moodPreset.color }}
          className="absolute top-2.5 left-2.5 rounded-xl px-2.5 py-1.5 flex flex-col items-center justify-center shadow-md"
          title={moodPreset.hint}
        >
          <MinimalIcon name={moodPreset.icon} size={15} strokeWidth={2.2} color="#FFFFFF" />
          <span className="text-[11px] font-bold leading-tight text-white mt-0.5 tracking-tight">
            {dateLabel}
          </span>
          <span className="text-[11px] font-semibold leading-tight text-white/95 font-mono">
            {timeLabel}
          </span>
        </div>

        {/* Subtle indicator dots when multiple photo logs exist */}
        {photoLogs.length > 1 && (
          <div
            className="absolute bottom-3 left-3 flex items-center gap-1 pointer-events-none"
            aria-hidden="true"
          >
            {photoLogs.slice(0, 5).map((item, idx) => (
              <span
                key={item.id}
                className={`h-1.5 rounded-full transition-all ${
                  idx === safeIndex % 5
                    ? 'w-3 bg-white shadow-sm'
                    : 'w-1.5 bg-white/45'
                }`}
              />
            ))}
          </div>
        )}

        {/* 3. Bottom-Right Entry Add (+) Button */}
        <button
          type="button"
          onClick={handleAddEntryClick}
          aria-label="新しい記録を追加"
          title="記録を追加"
          className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-zinc-950/75 backdrop-blur-md border border-white/15 flex items-center justify-center text-white shadow-lg transition-transform active:scale-90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <MinimalIcon name="Plus" size={20} strokeWidth={2.25} color={moodPreset.color} />
        </button>
      </div>
    </div>
  );
};
