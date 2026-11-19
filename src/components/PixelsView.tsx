import React, { useMemo, useState } from 'react';
import { IconPreset, MoodLevel, MoodLog, RoutineDayLog, RoutineItem } from '../types';
import {
  ACTIVITY_PRESETS,
  MOOD_ORDER,
  MOOD_PRESETS,
  WEATHER_PRESETS,
} from '../constants/presets';
import { getCalendarDayKey } from '../services/storage';
import { MinimalIcon } from './MinimalIcon';

export interface PixelsViewProps {
  logs: MoodLog[];
  routines: RoutineItem[];
  routineLogs: RoutineDayLog[];
  selectedMoodFilter: MoodLevel | null;
  onSelectMoodFilter: (mood: MoodLevel | null) => void;
  onEditLog: (log: MoodLog) => void;
  onOpenRoutineDate: (dateKey: string) => void;
}

const WEATHER_MAP = new Map<string, IconPreset>(
  WEATHER_PRESETS.map((item) => [item.id, item])
);
const ACTIVITY_MAP = new Map<string, IconPreset>(
  ACTIVITY_PRESETS.map((item) => [item.id, item])
);

function formatInspectorDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export const PixelsView: React.FC<PixelsViewProps> = ({
  logs,
  routines,
  routineLogs,
  selectedMoodFilter,
  onSelectMoodFilter,
  onEditLog,
  onOpenRoutineDate,
}) => {
  const [inspectedLogId, setInspectedLogId] = useState<string | null>(null);

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.timestamp - a.timestamp),
    [logs]
  );

  // Chronological (oldest -> newest) for up to 60 most recent logs
  const recentLogs = useMemo(
    () => sortedLogs.slice(0, 60).reverse(),
    [sortedLogs]
  );

  const inspectedLog = useMemo(() => {
    if (recentLogs.length === 0) return null;
    if (inspectedLogId) {
      const found = recentLogs.find((l) => l.id === inspectedLogId);
      if (found) return found;
    }
    return recentLogs[recentLogs.length - 1];
  }, [recentLogs, inspectedLogId]);

  const moodStats = useMemo(() => {
    const counts: Record<MoodLevel, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const log of recentLogs) {
      counts[log.mood] += 1;
    }
    return { counts, total: recentLogs.length };
  }, [recentLogs]);

  // Average mood color per calendar day for Routine Pixels
  const dayAverageMoodMap = useMemo(() => {
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

  const todayKey = getCalendarDayKey(new Date());

  const last14Days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, idx) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (13 - idx));
      return {
        key: getCalendarDayKey(d),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      };
    });
  }, [todayKey]);

  const activeRoutines = useMemo(
    () =>
      routines
        .filter((r) => !r.archived)
        .sort((a, b) => a.order - b.order),
    [routines]
  );

  const routineCompletionSet = useMemo(() => {
    const set = new Set<string>();
    for (const entry of routineLogs) {
      if (entry.completed) {
        set.add(`${entry.dateKey}_${entry.routineId}`);
      }
    }
    return set;
  }, [routineLogs]);

  const inspectedWeather = inspectedLog?.weather
    ? WEATHER_MAP.get(inspectedLog.weather)
    : undefined;
  const inspectedActivities = useMemo(() => {
    if (!inspectedLog) return [];
    return inspectedLog.activities
      .map((id) => ACTIVITY_MAP.get(id))
      .filter((item): item is IconPreset => Boolean(item));
  }, [inspectedLog]);

  return (
    <div className="w-full space-y-4">
      {/* Block 1: MOOD STREAM */}
      <section className="bg-[#16171B] border border-zinc-800/80 rounded-2xl p-4 space-y-3.5">
        <div className="text-[11px] font-mono text-zinc-500 flex justify-between">
          <span>MOOD STREAM</span>
          <span>RECENT {recentLogs.length} LOGS</span>
        </div>

        {recentLogs.length === 0 ? (
          <div className="py-6 flex items-center justify-center text-zinc-600">
            <MinimalIcon name="Sparkles" size={20} />
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-1.5">
            {recentLogs.map((log) => {
              const preset = MOOD_PRESETS[log.mood];
              const isInspected = inspectedLog?.id === log.id;
              const isDimmed =
                selectedMoodFilter !== null && log.mood !== selectedMoodFilter;

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setInspectedLogId(log.id)}
                  aria-label={`${formatInspectorDateTime(log.timestamp)} ${preset.hint}`}
                  className={`aspect-square rounded-[4px] transition-all focus:outline-none ${
                    isInspected ? 'ring-[1.5px] ring-white' : ''
                  } ${isDimmed ? 'opacity-25' : 'opacity-100'}`}
                  style={{ backgroundColor: preset.color }}
                />
              );
            })}
          </div>
        )}

        {/* 5-mood horizontal proportion bar */}
        <div className="h-1.5 w-full rounded-full overflow-hidden flex gap-0.5 bg-zinc-900">
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
                    backgroundColor: MOOD_PRESETS[level].color,
                  }}
                  className="h-full transition-all duration-300"
                />
              );
            })}
        </div>

        {/* 5 mood filter pills */}
        <div className="flex items-center justify-between gap-1.5">
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
                className="flex-1 min-h-[38px] rounded-full border flex items-center justify-center gap-1.5 px-2 transition-all active:scale-95 focus:outline-none"
                style={{
                  backgroundColor: isSelected ? preset.bgSoft : 'transparent',
                  borderColor: isSelected
                    ? preset.borderColor
                    : 'rgba(39, 39, 42, 0.7)',
                  opacity: isDimmed ? 0.35 : 1,
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: preset.color }}
                />
                <span className="text-[11px] font-mono text-zinc-300">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected log 1-line inspector */}
        {inspectedLog && (
          <button
            type="button"
            onClick={() => onEditLog(inspectedLog)}
            className="w-full bg-[#111214] border border-zinc-800/80 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs text-left hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-mono text-zinc-400 shrink-0">
                {formatInspectorDateTime(inspectedLog.timestamp)}
              </span>

              {inspectedLog.note && inspectedLog.note.trim().length > 0 ? (
                <span className="text-zinc-200 truncate">
                  {inspectedLog.note}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-zinc-400 truncate">
                  {inspectedWeather && (
                    <MinimalIcon name={inspectedWeather.icon} size={14} />
                  )}
                  {inspectedActivities.slice(0, 4).map((act) => (
                    <MinimalIcon key={act.id} name={act.icon} size={14} />
                  ))}
                </span>
              )}
            </div>

            <span
              className="font-medium shrink-0"
              style={{ color: MOOD_PRESETS[inspectedLog.mood].color }}
            >
              {MOOD_PRESETS[inspectedLog.mood].hint}
            </span>
          </button>
        )}
      </section>

      {/* Block 2: ROUTINE PIXELS */}
      <section className="bg-[#16171B] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <div className="text-[11px] font-mono text-zinc-500 flex justify-between">
          <span>ROUTINE PIXELS</span>
          <span>LAST 14 DAYS</span>
        </div>

        {activeRoutines.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500">
            ルーティンが登録されていません
          </div>
        ) : (
          <div className="space-y-2">
            {activeRoutines.map((routine) => {
              let completedDays = 0;
              let lastCompletedColor = '#68B088';

              const dayNodes = last14Days.map((day) => {
                const isDone = routineCompletionSet.has(`${day.key}_${routine.id}`);
                const avgMood = dayAverageMoodMap.get(day.key);
                const pillColor = isDone
                  ? avgMood
                    ? MOOD_PRESETS[avgMood].color
                    : '#68B088'
                  : '#27272A';

                if (isDone) {
                  completedDays += 1;
                  lastCompletedColor = pillColor;
                }

                return {
                  ...day,
                  isDone,
                  pillColor,
                };
              });

              const rate = Math.round((completedDays / 14) * 100);

              return (
                <div
                  key={routine.id}
                  className="flex items-center justify-between gap-2.5 py-1"
                >
                  <div className="flex items-center gap-2 min-w-0 w-28 shrink-0">
                    <MinimalIcon
                      name={routine.icon}
                      size={15}
                      className="text-zinc-400 shrink-0"
                    />
                    <span className="text-xs text-zinc-300 truncate">
                      {routine.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {dayNodes.map((day) => (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => onOpenRoutineDate(day.key)}
                        aria-label={`${routine.title} ${day.label}`}
                        title={`${day.label} · ${routine.title}`}
                        className="w-2.5 h-4 rounded-[3px] transition-opacity hover:opacity-80 focus:outline-none"
                        style={{ backgroundColor: day.pillColor }}
                      />
                    ))}
                  </div>

                  <span
                    className="w-10 text-right font-mono text-xs shrink-0"
                    style={{
                      color: completedDays > 0 ? lastCompletedColor : '#71717A',
                    }}
                  >
                    {rate}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
