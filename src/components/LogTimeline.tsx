import React, { useMemo, useState } from 'react';
import { IconPreset, MoodLevel, MoodLog } from '../types';
import {
  ACTIVITY_PRESETS,
  MOOD_ORDER,
  MOOD_PRESETS,
  SENSATION_PRESETS,
  WEATHER_PRESETS,
} from '../constants/presets';
import { MinimalIcon } from './MinimalIcon';

export interface LogTimelineProps {
  logs: MoodLog[];
  selectedMoodFilter: MoodLevel | null;
  onSelectMoodFilter: (mood: MoodLevel | null) => void;
  onEditLog: (log: MoodLog) => void;
  onDeleteLog: (id: string) => void;
  viewMode?: 'timeline' | 'pixels';
}

const WEATHER_MAP = new Map<string, IconPreset>(
  WEATHER_PRESETS.map((item) => [item.id, item])
);
const SENSATION_MAP = new Map<string, IconPreset>(
  SENSATION_PRESETS.map((item) => [item.id, item])
);
const ACTIVITY_MAP = new Map<string, IconPreset>(
  ACTIVITY_PRESETS.map((item) => [item.id, item])
);

const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getCalendarDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeNumeric(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const LogTimeline: React.FC<LogTimelineProps> = ({
  logs,
  selectedMoodFilter,
  onSelectMoodFilter,
  onEditLog,
  onDeleteLog: _onDeleteLog,
  viewMode = 'timeline',
}) => {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.timestamp - a.timestamp),
    [logs]
  );

  // Average mood per calendar day (YYYY-MM-DD -> MoodLevel)
  const dayMoodMap = useMemo(() => {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const log of sortedLogs) {
      const key = getCalendarDayKey(new Date(log.timestamp));
      const existing = totals.get(key);
      if (existing) {
        existing.sum += log.mood;
        existing.count += 1;
      } else {
        totals.set(key, { sum: log.mood, count: 1 });
      }
    }

    const result = new Map<string, MoodLevel>();
    totals.forEach(({ sum, count }, key) => {
      const avg = Math.min(5, Math.max(1, Math.round(sum / count))) as MoodLevel;
      result.set(key, avg);
    });
    return result;
  }, [sortedLogs]);

  // Last N calendar days ending today (oldest -> newest)
  const recentDays28 = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 28 }, (_, index) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (27 - index));
      const key = getCalendarDayKey(d);
      return {
        key,
        dayOfMonth: d.getDate(),
        mood: dayMoodMap.get(key),
        isToday: index === 27,
      };
    });
  }, [dayMoodMap]);

  const recentDays14 = useMemo(() => recentDays28.slice(-14), [recentDays28]);

  // Mood distribution across all logs
  const moodStats = useMemo(() => {
    const counts: Record<MoodLevel, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const log of sortedLogs) {
      counts[log.mood] += 1;
    }
    return { counts, total: sortedLogs.length };
  }, [sortedLogs]);

  const filteredLogs = useMemo(() => {
    if (selectedMoodFilter === null) {
      return sortedLogs;
    }
    return sortedLogs.filter((log) => log.mood === selectedMoodFilter);
  }, [sortedLogs, selectedMoodFilter]);

  const groupedLogs = useMemo(() => {
    const groups: Array<{
      dateKey: string;
      dayNum: number;
      weekday: string;
      items: MoodLog[];
    }> = [];

    for (const log of filteredLogs) {
      const date = new Date(log.timestamp);
      const dateKey = getCalendarDayKey(date);
      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.dateKey === dateKey) {
        lastGroup.items.push(log);
      } else {
        groups.push({
          dateKey,
          dayNum: date.getDate(),
          weekday: WEEKDAY_SHORT[date.getDay()],
          items: [log],
        });
      }
    }
    return groups;
  }, [filteredLogs]);

  return (
    <div className="w-full space-y-6">
      {viewMode === 'pixels' ? (
        /* Moodistory-style Monthly Pixels Grid + Quiet Distribution Bar */
        <div className="space-y-4 pt-1">
          <div
            className="grid grid-cols-7 gap-2"
            role="grid"
            aria-label="Last 28 days mood pixels"
          >
            {recentDays28.map((day) => {
              const preset = day.mood ? MOOD_PRESETS[day.mood] : undefined;
              const isDimmed =
                selectedMoodFilter !== null &&
                day.mood !== undefined &&
                day.mood !== selectedMoodFilter;

              return (
                <div
                  key={day.key}
                  title={
                    preset ? `${day.key} · ${preset.hint}` : day.key
                  }
                  className={`aspect-square rounded-lg flex items-center justify-center text-[11px] font-mono transition-opacity duration-150 ${
                    day.isToday ? 'ring-1 ring-zinc-500/50' : ''
                  }`}
                  style={{
                    backgroundColor: preset
                      ? hexToRgba(preset.color, 0.82)
                      : '#18181B',
                    color: preset ? '#121215' : '#52525B',
                    fontWeight: preset ? 600 : 400,
                    opacity: isDimmed ? 0.25 : 1,
                  }}
                >
                  {day.dayOfMonth}
                </div>
              );
            })}
          </div>

          {/* Quiet horizontal 5-mood proportion bar */}
          <div
            className="h-1.5 w-full rounded-full overflow-hidden flex gap-0.5 bg-zinc-900/80"
            aria-label="Mood distribution"
          >
            {moodStats.total > 0 &&
              MOOD_ORDER.map((level) => {
                const count = moodStats.counts[level];
                if (count === 0) return null;
                const widthPercent = (count / moodStats.total) * 100;
                return (
                  <div
                    key={level}
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: hexToRgba(MOOD_PRESETS[level].color, 0.85),
                    }}
                    className="h-full transition-all duration-300"
                    title={`${MOOD_PRESETS[level].hint}: ${count}`}
                  />
                );
              })}
          </div>

          {/* 5 mood key-color filter pills */}
          <div
            className="flex items-center justify-between gap-1.5"
            role="group"
            aria-label="Filter timeline by mood"
          >
            {MOOD_ORDER.map((level) => {
              const preset = MOOD_PRESETS[level];
              const isSelected = selectedMoodFilter === level;
              const isDimmed = selectedMoodFilter !== null && !isSelected;
              const count = moodStats.counts[level];

              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => onSelectMoodFilter(isSelected ? null : level)}
                  aria-label={preset.hint}
                  aria-pressed={isSelected}
                  title={preset.hint}
                  className="flex flex-1 items-center justify-center gap-1.5 py-1.5 px-2 rounded-full border transition-all duration-150 focus:outline-none"
                  style={{
                    backgroundColor: isSelected ? preset.bgSoft : 'transparent',
                    borderColor: isSelected
                      ? preset.borderColor
                      : 'rgba(39, 39, 42, 0.5)',
                    opacity: isDimmed ? 0.35 : 1,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                    style={{ backgroundColor: preset.color }}
                  />
                  <span className="text-[11px] font-mono text-zinc-400">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Whisper-quiet 14-day mini pixel strip (borderless) */
        <div
          className="flex items-center justify-end gap-1.5 pt-0.5"
          aria-label="Last 14 days mood strip"
        >
          {recentDays14.map((day) => {
            const preset = day.mood ? MOOD_PRESETS[day.mood] : undefined;
            return (
              <span
                key={day.key}
                title={preset ? `${day.key} · ${preset.hint}` : day.key}
                className="w-3.5 h-3.5 rounded-[4px] transition-colors"
                style={{
                  backgroundColor: preset
                    ? hexToRgba(preset.color, 0.85)
                    : '#18181B',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Connected Vertical Timeline */}
      {groupedLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-700">
          <MinimalIcon name="Sparkles" size={22} strokeWidth={1.5} />
        </div>
      ) : (
        <div className="space-y-6">
          {groupedLogs.map((group) => (
            <section key={group.dateKey} className="flex items-stretch">
              {/* Left Day Column */}
              <div className="w-11 shrink-0 pt-2.5 text-right">
                <div className="text-sm font-semibold text-zinc-300 leading-none">
                  {group.dayNum}
                </div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                  {group.weekday}
                </div>
              </div>

              {/* Timeline Spine & Entries Column */}
              <div className="flex-1 ml-4 relative">
                <div
                  aria-hidden="true"
                  className="absolute left-[11px] top-3 bottom-0 w-[1.5px] bg-zinc-800/70"
                />

                {group.items.map((log) => {
                  const moodPreset = MOOD_PRESETS[log.mood];
                  const weatherPreset = log.weather
                    ? WEATHER_MAP.get(log.weather)
                    : undefined;
                  const sensationPresets = log.sensations
                    .map((id) => SENSATION_MAP.get(id))
                    .filter((item): item is IconPreset => Boolean(item));
                  const activityPresets = log.activities
                    .map((id) => ACTIVITY_MAP.get(id))
                    .filter((item): item is IconPreset => Boolean(item));

                  const hasNote = Boolean(log.note && log.note.trim().length > 0);
                  const hasImage = Boolean(log.imageDataUrl);

                  return (
                    <div
                      key={log.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onEditLog(log)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onEditLog(log);
                        }
                      }}
                      className="group relative flex items-start gap-3.5 py-2.5 cursor-pointer rounded-xl transition-colors hover:bg-zinc-900/40 px-2 -mx-2 focus:outline-none focus-visible:bg-zinc-900/50"
                    >
                      {/* Mood Node on the Spine */}
                      <div
                        className="w-6 h-6 rounded-[7px] shrink-0 flex items-center justify-center relative z-10"
                        style={{ backgroundColor: moodPreset.color }}
                        title={moodPreset.hint}
                        aria-label={moodPreset.hint}
                      >
                        <MinimalIcon
                          name={moodPreset.icon}
                          size={14}
                          strokeWidth={2}
                          color="#121215"
                        />
                      </div>

                      {/* Middle Content: Quiet Monochrome Icons + Note + Thumbnail */}
                      <div className="min-w-0 flex-1">
                        {(weatherPreset ||
                          sensationPresets.length > 0 ||
                          activityPresets.length > 0) && (
                          <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                            {weatherPreset && (
                              <span
                                className="inline-flex items-center justify-center text-zinc-300/85"
                                title={weatherPreset.hint}
                                aria-label={weatherPreset.hint}
                              >
                                <MinimalIcon
                                  name={weatherPreset.icon}
                                  size={16}
                                  strokeWidth={1.75}
                                />
                              </span>
                            )}

                            {sensationPresets.map((item) => (
                              <span
                                key={`sen-${item.id}`}
                                className="inline-flex items-center justify-center text-zinc-300/85"
                                title={item.hint}
                                aria-label={item.hint}
                              >
                                <MinimalIcon
                                  name={item.icon}
                                  size={16}
                                  strokeWidth={1.75}
                                />
                              </span>
                            ))}

                            {activityPresets.map((item) => (
                              <span
                                key={`act-${item.id}`}
                                className="inline-flex items-center justify-center text-zinc-300/85"
                                title={item.hint}
                                aria-label={item.hint}
                              >
                                <MinimalIcon
                                  name={item.icon}
                                  size={16}
                                  strokeWidth={1.75}
                                />
                              </span>
                            ))}
                          </div>
                        )}

                        {hasNote && (
                          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
                            {log.note}
                          </p>
                        )}

                        {hasImage && log.imageDataUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxImage(log.imageDataUrl ?? null);
                            }}
                            aria-label="Expand image"
                            className="mt-2 block overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
                          >
                            <img
                              src={log.imageDataUrl}
                              alt=""
                              className="h-24 w-auto rounded-lg object-cover border border-zinc-800/60 transition-opacity hover:opacity-90"
                            />
                          </button>
                        )}
                      </div>

                      {/* Right Timestamp */}
                      <time className="text-[11px] font-mono text-zinc-600 pt-1 shrink-0">
                        {formatTimeNumeric(log.timestamp)}
                      </time>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Full-screen Image Lightbox */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            aria-label="Close image"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <MinimalIcon name="X" size={18} strokeWidth={1.75} />
          </button>

          <img
            src={lightboxImage}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-full rounded-2xl border border-zinc-800 object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
