import React, { useMemo, useState } from 'react';
import { RoutineDayLog, RoutineItem } from '../types';
import { ROUTINE_ICON_OPTIONS } from '../constants/presets';
import {
  getCalendarDayKey,
  getRoutineDayProgress,
  isRoutineActiveOnDate,
} from '../services/storage';
import { MinimalIcon } from './MinimalIcon';

export interface RoutineViewProps {
  routines: RoutineItem[];
  routineLogs: RoutineDayLog[];
  selectedDateKey: string;
  onChangeDateKey: (dateKey: string) => void;
  onToggleRoutine: (dateKey: string, routineId: string) => void;
  onUpdateRoutineComment: (dateKey: string, routineId: string, comment: string) => void;
  onAddRoutine: (title: string, icon: string) => void;
  onUpdateRoutine: (item: RoutineItem) => void;
  onReorderRoutines: (items: RoutineItem[]) => void;
  onDeleteRoutine: (id: string) => void;
  accentColor?: string;
}

const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + deltaDays);
  return getCalendarDayKey(d);
}

function formatDateLabel(dateKey: string): string {
  const d = parseDateKey(dateKey);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = WEEKDAY_SHORT[d.getDay()];
  return `${month}/${day} (${weekday})`;
}

export const RoutineView: React.FC<RoutineViewProps> = ({
  routines,
  routineLogs,
  selectedDateKey,
  onChangeDateKey,
  onToggleRoutine,
  onUpdateRoutineComment,
  onAddRoutine,
  onUpdateRoutine,
  onReorderRoutines,
  onDeleteRoutine,
  accentColor = '#68B088',
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCommentRoutineId, setEditingCommentRoutineId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [newIcon, setNewIcon] = useState<string>(ROUTINE_ICON_OPTIONS[0]?.icon || 'BookOpen');
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const [openIconPickerId, setOpenIconPickerId] = useState<string | null>(null);

  const todayKey = getCalendarDayKey(new Date());
  const isToday = selectedDateKey >= todayKey;

  const activeRoutines = useMemo(
    () =>
      routines
        .filter((r) => !r.archived)
        .sort((a, b) => a.order - b.order),
    [routines]
  );

  const dayLogMap = useMemo(() => {
    const map = new Map<string, RoutineDayLog>();
    for (const entry of routineLogs) {
      if (entry.dateKey === selectedDateKey) {
        map.set(entry.routineId, entry);
      }
    }
    return map;
  }, [routineLogs, selectedDateKey]);

  const dayProgress = useMemo(
    () => getRoutineDayProgress(selectedDateKey, routines, routineLogs),
    [selectedDateKey, routines, routineLogs]
  );

  const visibleRoutinesForDate = useMemo(
    () =>
      routines
        .filter((r) => {
          if (isRoutineActiveOnDate(r, selectedDateKey)) return true;
          const log = dayLogMap.get(r.id);
          return Boolean(log?.completed || log?.comment?.trim());
        })
        .sort((a, b) => a.order - b.order),
    [routines, selectedDateKey, dayLogMap]
  );

  const openCommentEditor = (routineId: string) => {
    const existingComment = dayLogMap.get(routineId)?.comment || '';
    setEditingCommentRoutineId(routineId);
    setCommentDraft(existingComment);
  };

  const commitCommentEditor = (routineId: string) => {
    const existingComment = dayLogMap.get(routineId)?.comment || '';
    const trimmed = commentDraft.trim();
    if (trimmed !== existingComment) {
      onUpdateRoutineComment(selectedDateKey, routineId, trimmed);
    }
    setEditingCommentRoutineId(null);
  };

  const commitRoutineTitle = (routine: RoutineItem) => {
    const draft = draftTitles[routine.id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== routine.title) {
      onUpdateRoutine({ ...routine, title: trimmed });
    }
    setDraftTitles((prev) => {
      const next = { ...prev };
      delete next[routine.id];
      return next;
    });
  };

  const flushAllDraftTitles = () => {
    for (const routine of activeRoutines) {
      const draft = draftTitles[routine.id];
      if (draft !== undefined) {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== routine.title) {
          onUpdateRoutine({ ...routine, title: trimmed });
        }
      }
    }
    setDraftTitles({});
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onAddRoutine(trimmed, newIcon);
    setNewTitle('');
  };

  const handleMoveRoutine = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activeRoutines.length) return;
    const reordered = [...activeRoutines];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const updated = reordered.map((item, idx) => ({ ...item, order: idx }));
    onReorderRoutines(updated);
  };

  return (
    <div className="w-full space-y-4">
      {/* Top Bar: Date Switcher + Edit Mode Toggle */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-11 bg-[#16171B] border border-zinc-800/80 rounded-xl px-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (editingCommentRoutineId) {
                commitCommentEditor(editingCommentRoutineId);
              }
              onChangeDateKey(shiftDateKey(selectedDateKey, -1));
            }}
            aria-label="Previous day"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 active:scale-95 transition-colors"
          >
            <MinimalIcon name="ChevronLeft" size={18} />
          </button>

          <button
            type="button"
            onClick={() => {
              if (editingCommentRoutineId) {
                commitCommentEditor(editingCommentRoutineId);
              }
              onChangeDateKey(todayKey);
            }}
            className="flex items-center gap-2 px-2 h-9 rounded-lg text-xs font-medium text-zinc-200 hover:text-white transition-colors"
            title="今日に戻る"
          >
            <span className="font-mono tracking-wide">{formatDateLabel(selectedDateKey)}</span>
            <span
              className="font-mono"
              style={{ color: accentColor }}
            >
              {dayProgress.completed}/{dayProgress.total}
            </span>
          </button>

          <button
            type="button"
            disabled={isToday}
            onClick={() => {
              if (isToday) return;
              if (editingCommentRoutineId) {
                commitCommentEditor(editingCommentRoutineId);
              }
              onChangeDateKey(shiftDateKey(selectedDateKey, 1));
            }}
            aria-label="Next day"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-colors"
          >
            <MinimalIcon name="ChevronRight" size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (editingCommentRoutineId) {
              commitCommentEditor(editingCommentRoutineId);
            }
            if (isEditMode) {
              flushAllDraftTitles();
              setOpenIconPickerId(null);
            }
            setIsEditMode((prev) => !prev);
          }}
          aria-label={isEditMode ? 'Done editing routines' : 'Edit routines'}
          className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors active:scale-95 ${
            isEditMode
              ? 'border-[#68B088]/50 bg-[#68B088]/10 text-[#68B088]'
              : 'bg-[#16171B] border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <MinimalIcon name={isEditMode ? 'Check' : 'Edit3'} size={18} />
        </button>
      </div>

      {isEditMode ? (
        /* Edit Mode: Add & Manage Routines */
        <div className="space-y-4">
          <form
            onSubmit={handleAddSubmit}
            className="bg-[#16171B] border border-zinc-800/80 rounded-2xl p-3.5 space-y-3"
          >
            <div className="text-[11px] font-mono text-zinc-500">NEW ROUTINE</div>

            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-xl border border-[#68B088]/45 bg-[#68B088]/15 text-[#68B088] flex items-center justify-center shrink-0">
                <MinimalIcon name={newIcon} size={20} />
              </div>

              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="ルーティン名"
                className="flex-1 min-w-0 h-11 bg-[#111214] border border-zinc-800 rounded-xl px-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />

              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="h-11 px-3.5 rounded-xl border border-[#68B088]/45 bg-[#68B088]/15 text-[#68B088] text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-40 active:scale-95 transition-all"
              >
                <MinimalIcon name="Plus" size={16} strokeWidth={2.2} />
                <span>追加</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {ROUTINE_ICON_OPTIONS.map((option) => {
                const isSelected = newIcon === option.icon;
                return (
                  <button
                    key={option.icon}
                    type="button"
                    onClick={() => setNewIcon(option.icon)}
                    aria-label={option.label}
                    aria-pressed={isSelected}
                    className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors active:scale-95 ${
                      isSelected
                        ? 'border-[#68B088] bg-[#68B088]/15 text-[#68B088]'
                        : 'border-zinc-800/80 bg-[#111214] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <MinimalIcon name={option.icon} size={18} />
                    <span className="text-[10px] leading-tight truncate max-w-full">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </form>

          <div className="space-y-2">
            <div className="text-[11px] font-mono text-zinc-500 px-1">
              REGISTERED ROUTINES
            </div>

            {activeRoutines.map((routine, index) => {
              const isIconPickerOpen = openIconPickerId === routine.id;
              const currentTitleValue = draftTitles[routine.id] ?? routine.title;

              return (
                <div
                  key={routine.id}
                  className="bg-[#16171B] border border-zinc-800/80 rounded-xl p-2.5 space-y-2.5"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenIconPickerId(isIconPickerOpen ? null : routine.id)
                      }
                      aria-label="Select routine icon"
                      aria-expanded={isIconPickerOpen}
                      title="アイコンを選択"
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-95 transition-colors shrink-0 ${
                        isIconPickerOpen
                          ? 'border-[#68B088] bg-[#68B088]/15 text-[#68B088]'
                          : 'bg-[#111214] border-zinc-800/80 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <MinimalIcon name={routine.icon} size={18} />
                    </button>

                    <input
                      type="text"
                      value={currentTitleValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftTitles((prev) => ({
                          ...prev,
                          [routine.id]: val,
                        }));
                      }}
                      onBlur={() => commitRoutineTitle(routine)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      aria-label="Routine title"
                      className="flex-1 min-w-0 h-10 bg-[#111214]/60 border border-zinc-800/70 focus:border-[#68B088]/60 px-3 text-sm text-zinc-100 focus:bg-[#111214] focus:outline-none rounded-xl"
                    />

                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveRoutine(index, -1)}
                      aria-label="Move up"
                      className="w-9 h-9 rounded-lg bg-[#111214] border border-zinc-800/80 flex items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none shrink-0"
                    >
                      <MinimalIcon name="ChevronUp" size={16} />
                    </button>

                    <button
                      type="button"
                      disabled={index === activeRoutines.length - 1}
                      onClick={() => handleMoveRoutine(index, 1)}
                      aria-label="Move down"
                      className="w-9 h-9 rounded-lg bg-[#111214] border border-zinc-800/80 flex items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none shrink-0"
                    >
                      <MinimalIcon name="ChevronDown" size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteRoutine(routine.id)}
                      aria-label="Archive routine"
                      title="アーカイブ（履歴は保持）"
                      className="w-9 h-9 rounded-lg bg-[#111214] border border-zinc-800/80 flex items-center justify-center text-[#C97076] hover:bg-[#C97076]/10 active:scale-95 shrink-0"
                    >
                      <MinimalIcon name="Trash2" size={16} />
                    </button>
                  </div>

                  {isIconPickerOpen && (
                    <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-zinc-800/60">
                      {ROUTINE_ICON_OPTIONS.map((option) => {
                        const isSelected = routine.icon === option.icon;
                        return (
                          <button
                            key={option.icon}
                            type="button"
                            onClick={() => {
                              onUpdateRoutine({ ...routine, icon: option.icon });
                              setOpenIconPickerId(null);
                            }}
                            aria-label={option.label}
                            aria-pressed={isSelected}
                            className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors active:scale-95 ${
                              isSelected
                                ? 'border-[#68B088] bg-[#68B088]/15 text-[#68B088]'
                                : 'border-zinc-800/80 bg-[#111214] text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <MinimalIcon name={option.icon} size={18} />
                            <span className="text-[10px] leading-tight truncate max-w-full">
                              {option.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Normal Mode: Check + Comment */
        <div className="space-y-2.5">
          {visibleRoutinesForDate.map((routine) => {
            const log = dayLogMap.get(routine.id);
            const completed = Boolean(log?.completed);
            const comment = log?.comment || '';
            const isEditingComment = editingCommentRoutineId === routine.id;

            return (
              <div
                key={routine.id}
                className={`rounded-2xl border px-3.5 py-3 transition-colors ${
                  completed
                    ? 'border-[#68B088]/40 bg-[#68B088]/[0.06]'
                    : 'border-zinc-800/80 bg-[#16171B]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleRoutine(selectedDateKey, routine.id)}
                    className="flex-1 flex items-center gap-3 text-left min-h-[36px] active:scale-[0.99] transition-transform"
                  >
                    <span
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        completed
                          ? 'border-[#68B088] bg-[#68B088]/20 text-[#68B088]'
                          : 'border-zinc-700 bg-transparent'
                      }`}
                    >
                      {completed && (
                        <MinimalIcon name="Check" size={16} strokeWidth={2.4} />
                      )}
                    </span>

                    <MinimalIcon
                      name={routine.icon}
                      size={20}
                      className={completed ? 'text-[#68B088]' : 'text-zinc-500'}
                    />

                    <span
                      className={
                        completed
                          ? 'text-sm font-medium text-zinc-100'
                          : 'text-sm font-medium text-zinc-400'
                      }
                    >
                      {routine.title}
                    </span>

                    {routine.archived && (
                      <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5 shrink-0">
                        アーカイブ
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingComment) {
                        commitCommentEditor(routine.id);
                      } else {
                        if (editingCommentRoutineId) {
                          commitCommentEditor(editingCommentRoutineId);
                        }
                        openCommentEditor(routine.id);
                      }
                    }}
                    aria-label="Toggle comment"
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      !isEditingComment && comment
                        ? 'text-[#68B088]'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <MinimalIcon
                      name={isEditingComment ? 'ChevronUp' : 'Edit3'}
                      size={16}
                    />
                  </button>
                </div>

                {isEditingComment ? (
                  <div className="ml-10 mt-2">
                    <input
                      type="text"
                      autoFocus
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onBlur={() => commitCommentEditor(routine.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          commitCommentEditor(routine.id);
                        }
                      }}
                      placeholder="コメントを入力（任意）..."
                      className="w-full h-10 bg-[#111214] border border-[#68B088]/70 rounded-xl px-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                    />
                  </div>
                ) : comment ? (
                  <div className="ml-10 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (editingCommentRoutineId) {
                          commitCommentEditor(editingCommentRoutineId);
                        }
                        openCommentEditor(routine.id);
                      }}
                      className="w-full text-left bg-[#111214] border border-zinc-800/80 rounded-xl px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700 transition-colors"
                    >
                      {comment}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
