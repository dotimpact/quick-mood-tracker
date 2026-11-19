import React, { useMemo, useState } from 'react';
import { IconPreset, MoodLevel, MoodLog, RoutineDayLog, RoutineItem } from '../types';
import {
  ACTIVITY_PRESETS,
  MOOD_PRESETS,
  SENSATION_PRESETS,
  WEATHER_PRESETS,
} from '../constants/presets';
import {
  getCalendarDayKey,
  getRoutineDayProgress,
  getRoutineEventTime,
} from '../services/storage';
import { MinimalIcon } from './MinimalIcon';
import { RoutineProgressRing } from './RoutineProgressRing';

export interface RoutineTimelineEvent {
  routine: RoutineItem;
  routineLog: RoutineDayLog;
  eventTime: number | null;
}

export interface RoutineClusterEntry {
  kind: 'routine-cluster';
  key: string;
  completed: boolean;
  items: RoutineTimelineEvent[];
  displayTime: number | null;
}

export interface MoodTimelineEntry {
  kind: 'mood';
  key: string;
  log: MoodLog;
}

export type DayTimelineEntry = MoodTimelineEntry | RoutineClusterEntry;

const ROUTINE_BATCH_WINDOW_MS = 30 * 60 * 1000;

export function buildDayTimelineEntries(
  moodLogs: MoodLog[],
  routineEvents: RoutineTimelineEvent[],
  includeRoutines: boolean
): DayTimelineEntry[] {
  type TimedItem =
    | { kind: 'mood'; sortTime: number; log: MoodLog }
    | { kind: 'routine'; sortTime: number; event: RoutineTimelineEvent };

  const timedItems: TimedItem[] = moodLogs.map((log) => ({
    kind: 'mood',
    sortTime: log.timestamp,
    log,
  }));

  const untimedRoutines: RoutineTimelineEvent[] = [];

  if (includeRoutines) {
    for (const ev of routineEvents) {
      if (ev.eventTime !== null) {
        timedItems.push({ kind: 'routine', sortTime: ev.eventTime, event: ev });
      } else {
        untimedRoutines.push(ev);
      }
    }
  }

  timedItems.sort((a, b) => {
    if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
    if (a.kind !== b.kind) return a.kind === 'mood' ? -1 : 1;
    if (a.kind === 'routine' && b.kind === 'routine') {
      return a.event.routine.order - b.event.routine.order;
    }
    return 0;
  });

  untimedRoutines.sort((a, b) => {
    if (a.routineLog.completed !== b.routineLog.completed) {
      return a.routineLog.completed ? -1 : 1;
    }
    return a.routine.order - b.routine.order;
  });

  const orderedRaw: Array<
    { kind: 'mood'; log: MoodLog } | { kind: 'routine'; event: RoutineTimelineEvent }
  > = [
    ...timedItems.map((item) =>
      item.kind === 'mood'
        ? { kind: 'mood' as const, log: item.log }
        : { kind: 'routine' as const, event: item.event }
    ),
    ...untimedRoutines.map((event) => ({ kind: 'routine' as const, event })),
  ];

  const result: DayTimelineEntry[] = [];
  let activeCluster: {
    completed: boolean;
    items: RoutineTimelineEvent[];
    newestTime: number | null;
    lastEventTime: number | null;
  } | null = null;

  const flushCluster = () => {
    if (!activeCluster) return;
    const sortedItems = [...activeCluster.items].sort(
      (a, b) => a.routine.order - b.routine.order
    );
    result.push({
      kind: 'routine-cluster',
      key: `routine-${sortedItems.map((i) => i.routineLog.id).join('-')}`,
      completed: activeCluster.completed,
      items: sortedItems,
      displayTime: activeCluster.newestTime,
    });
    activeCluster = null;
  };

  for (const item of orderedRaw) {
    if (item.kind === 'mood') {
      flushCluster();
      result.push({
        kind: 'mood',
        key: item.log.id,
        log: item.log,
      });
      continue;
    }

    const ev = item.event;
    const evCompleted = Boolean(ev.routineLog.completed);
    const canMerge =
      activeCluster !== null &&
      activeCluster.completed === evCompleted &&
      ((activeCluster.lastEventTime === null && ev.eventTime === null) ||
        (activeCluster.lastEventTime !== null &&
          ev.eventTime !== null &&
          activeCluster.lastEventTime - ev.eventTime <= ROUTINE_BATCH_WINDOW_MS));

    if (canMerge && activeCluster) {
      activeCluster.items.push(ev);
      activeCluster.lastEventTime = ev.eventTime;
    } else {
      flushCluster();
      activeCluster = {
        completed: evCompleted,
        items: [ev],
        newestTime: ev.eventTime,
        lastEventTime: ev.eventTime,
      };
    }
  }

  flushCluster();
  return result;
}

export interface LogTimelineProps {
  logs: MoodLog[];
  selectedMoodFilter: MoodLevel | null;
  onSelectMoodFilter: (mood: MoodLevel | null) => void;
  onEditLog: (log: MoodLog) => void;
  onDeleteLog: (id: string) => void;
  routines?: RoutineItem[];
  routineLogs?: RoutineDayLog[];
  onSelectRoutineDate?: (dateKey: string) => void;
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

function formatTimeNumeric(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const LogTimeline: React.FC<LogTimelineProps> = ({
  logs,
  selectedMoodFilter,
  onSelectMoodFilter: _onSelectMoodFilter,
  onEditLog,
  onDeleteLog: _onDeleteLog,
  routines = [],
  routineLogs = [],
  onSelectRoutineDate,
}) => {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.timestamp - a.timestamp),
    [logs]
  );

  const routineMap = useMemo(
    () => new Map<string, RoutineItem>(routines.map((r) => [r.id, r])),
    [routines]
  );

  const routineEventsByDate = useMemo(() => {
    const map = new Map<string, RoutineTimelineEvent[]>();
    for (const rl of routineLogs) {
      const hasComment = Boolean(rl.comment && rl.comment.trim().length > 0);
      if (!rl.completed && !hasComment) continue;
      const routine = routineMap.get(rl.routineId);
      if (!routine) continue;
      const list = map.get(rl.dateKey) || [];
      list.push({
        routine,
        routineLog: rl,
        eventTime: getRoutineEventTime(rl),
      });
      map.set(rl.dateKey, list);
    }
    map.forEach((list) => {
      list.sort((a, b) => a.routine.order - b.routine.order);
    });
    return map;
  }, [routineLogs, routineMap]);

  const filteredLogs = useMemo(() => {
    if (selectedMoodFilter === null) {
      return sortedLogs;
    }
    return sortedLogs.filter((log) => log.mood === selectedMoodFilter);
  }, [sortedLogs, selectedMoodFilter]);

  const groupedLogs = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        dateKey: string;
        dayNum: number;
        weekday: string;
        items: MoodLog[];
      }
    >();

    for (const log of filteredLogs) {
      const date = new Date(log.timestamp);
      const dateKey = getCalendarDayKey(date);
      const existing = groupsMap.get(dateKey);

      if (existing) {
        existing.items.push(log);
      } else {
        groupsMap.set(dateKey, {
          dateKey,
          dayNum: date.getDate(),
          weekday: WEEKDAY_SHORT[date.getDay()],
          items: [log],
        });
      }
    }

    if (selectedMoodFilter === null) {
      routineEventsByDate.forEach((_list, dateKey) => {
        if (!groupsMap.has(dateKey)) {
          const [y, m, d] = dateKey.split('-').map(Number);
          const date = new Date(y, (m || 1) - 1, d || 1);
          groupsMap.set(dateKey, {
            dateKey,
            dayNum: date.getDate(),
            weekday: WEEKDAY_SHORT[date.getDay()],
            items: [],
          });
        }
      });
    }

    return Array.from(groupsMap.values()).sort((a, b) =>
      b.dateKey.localeCompare(a.dateKey)
    );
  }, [filteredLogs, routineEventsByDate, selectedMoodFilter]);

  return (
    <div className="w-full space-y-6">
      {/* Connected Vertical Timeline */}
      {groupedLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-700">
          <MinimalIcon name="Sparkles" size={24} strokeWidth={1.5} />
        </div>
      ) : (
        <div className="space-y-6">
          {groupedLogs.map((group) => {
            const dayRoutineEvents = routineEventsByDate.get(group.dateKey) || [];
            const dayProgress = getRoutineDayProgress(
              group.dateKey,
              routines,
              routineLogs
            );
            const timelineEntries = buildDayTimelineEntries(
              group.items,
              dayRoutineEvents,
              selectedMoodFilter === null
            );

            return (
              <section key={group.dateKey} className="flex items-stretch">
                {/* Left Day Column */}
                <div className="w-12 shrink-0 pt-3 text-right">
                  <div className="text-base font-semibold text-zinc-200 leading-none">
                    {group.dayNum}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 mt-1">
                    {group.weekday}
                  </div>

                  {dayProgress.total > 0 && (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onSelectRoutineDate?.(group.dateKey)}
                        aria-label={`ルーチン ${dayProgress.completed}/${dayProgress.total} 完了`}
                        title={`${dayProgress.completed}/${dayProgress.total}`}
                        className="w-11 h-11 -mr-[11px] -my-[11px] flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#68B088]/60 active:scale-95 transition-transform"
                      >
                        <RoutineProgressRing
                          completed={dayProgress.completed}
                          total={dayProgress.total}
                        />
                      </button>
                    </div>
                  )}
                </div>

                {/* Timeline Spine & Entries Column */}
                <div className="flex-1 ml-4 relative">
                  {timelineEntries.length > 1 && (
                    <div
                      aria-hidden="true"
                      className="absolute left-[15px] top-4 bottom-4 w-[1.5px] bg-zinc-800/70"
                    />
                  )}

                  {timelineEntries.map((entry) => {
                    if (entry.kind === 'routine-cluster') {
                      const commentItems = entry.items.filter((item) =>
                        Boolean(item.routineLog.comment?.trim())
                      );

                      return (
                        <div
                          key={entry.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectRoutineDate?.(group.dateKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectRoutineDate?.(group.dateKey);
                            }
                          }}
                          className="group relative flex items-start gap-3.5 py-2 cursor-pointer rounded-xl transition-colors hover:bg-zinc-900/40 active:bg-zinc-900/60 px-2.5 -mx-2.5 focus:outline-none focus-visible:bg-zinc-900/50"
                        >
                          <div className="w-8 h-5 shrink-0 flex items-center justify-center relative z-10">
                            {entry.completed ? (
                              <span className="w-4 h-4 rounded-full bg-[#111214] border-[1.5px] border-[#68B088]/80 text-[#68B088] inline-flex items-center justify-center">
                                <MinimalIcon name="Check" size={9} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-[#111214] border-[1.5px] border-zinc-600 inline-flex items-center justify-center" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-5 text-zinc-400 break-words">
                              {entry.items.map((item, idx) => (
                                <React.Fragment key={item.routineLog.id}>
                                  {idx > 0 && (
                                    <span className="text-zinc-700"> · </span>
                                  )}
                                  <span>{item.routine.title}</span>
                                </React.Fragment>
                              ))}
                            </p>

                            {commentItems.length > 0 &&
                              (entry.items.length === 1 ? (
                                <p className="text-xs leading-[18px] text-zinc-500 line-clamp-2 break-words mt-0.5">
                                  {commentItems[0].routineLog.comment?.trim()}
                                </p>
                              ) : (
                                commentItems.map((item) => (
                                  <p
                                    key={item.routineLog.id}
                                    className="text-xs leading-[18px] text-zinc-500 line-clamp-2 break-words mt-0.5"
                                  >
                                    <span className="text-zinc-400 mr-2">
                                      {item.routine.title}
                                    </span>
                                    {item.routineLog.comment?.trim()}
                                  </p>
                                ))
                              ))}
                          </div>

                          {entry.displayTime !== null && (
                            <time className="text-[11px] leading-5 font-mono text-zinc-600 shrink-0">
                              {formatTimeNumeric(entry.displayTime)}
                            </time>
                          )}
                        </div>
                      );
                    }

                    const log = entry.log;
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
                        key={entry.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => onEditLog(log)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onEditLog(log);
                          }
                        }}
                        className="group relative flex items-start gap-3.5 py-3 min-h-[52px] cursor-pointer rounded-xl transition-colors hover:bg-zinc-900/40 active:bg-zinc-900/60 px-2.5 -mx-2.5 focus:outline-none focus-visible:bg-zinc-900/50"
                      >
                        {/* Mood Node on the Spine */}
                        <div
                          className="w-8 h-8 rounded-[10px] shrink-0 flex items-center justify-center relative z-10"
                          style={{ backgroundColor: moodPreset.color }}
                          title={moodPreset.hint}
                          aria-label={moodPreset.hint}
                        >
                          <MinimalIcon
                            name={moodPreset.icon}
                            size={18}
                            strokeWidth={2}
                            color="#121215"
                          />
                        </div>

                        {/* Middle Content: Quiet Monochrome Icons + Note + Thumbnail */}
                        <div className="min-w-0 flex-1">
                          {(weatherPreset ||
                            sensationPresets.length > 0 ||
                            activityPresets.length > 0) && (
                            <div className="flex flex-wrap items-center gap-3 pt-1">
                              {weatherPreset && (
                                <span
                                  className="inline-flex items-center justify-center text-zinc-200/90"
                                  title={weatherPreset.hint}
                                  aria-label={weatherPreset.hint}
                                >
                                  <MinimalIcon
                                    name={weatherPreset.icon}
                                    size={20}
                                    strokeWidth={1.85}
                                  />
                                </span>
                              )}

                              {sensationPresets.map((item) => (
                                <span
                                  key={`sen-${item.id}`}
                                  className="inline-flex items-center justify-center text-zinc-200/90"
                                  title={item.hint}
                                  aria-label={item.hint}
                                >
                                  <MinimalIcon
                                    name={item.icon}
                                    size={20}
                                    strokeWidth={1.85}
                                  />
                                </span>
                              ))}

                              {activityPresets.map((item) => (
                                <span
                                  key={`act-${item.id}`}
                                  className="inline-flex items-center justify-center text-zinc-200/90"
                                  title={item.hint}
                                  aria-label={item.hint}
                                >
                                  <MinimalIcon
                                    name={item.icon}
                                    size={20}
                                    strokeWidth={1.85}
                                  />
                                </span>
                              ))}
                            </div>
                          )}

                          {hasNote && (
                            <p className="text-sm text-zinc-300 mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
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
                              className="mt-2.5 block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
                            >
                              <img
                                src={log.imageDataUrl}
                                alt=""
                                className="h-28 w-auto rounded-xl object-cover border border-zinc-800/60 transition-opacity hover:opacity-90"
                              />
                            </button>
                          )}
                        </div>

                        {/* Right Timestamp */}
                        <time className="text-xs font-mono text-zinc-500 pt-1.5 shrink-0">
                          {formatTimeNumeric(log.timestamp)}
                        </time>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
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
            className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <MinimalIcon name="X" size={22} strokeWidth={1.9} />
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
