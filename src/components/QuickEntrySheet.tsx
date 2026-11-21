import React, { useEffect, useRef, useState } from 'react';
import { IconPreset, MoodLevel, MoodLog, PresetCategory, PresetCategoryKey } from '../types';
import { MOOD_ORDER, MOOD_PRESETS, PRESET_CATEGORIES } from '../constants/presets';
import { compressImageFile } from '../services/imageUtils';
import { haptic } from '../services/haptics';
import { PresetRef, rankFrequentPresets } from '../services/frequentPresets';
import { MinimalIcon } from './MinimalIcon';

export interface QuickEntrySheetProps {
  isOpen: boolean;
  initialMood?: MoodLevel;
  initialImageDataUrl?: string;
  editingLog?: MoodLog | null;
  logs: MoodLog[];
  onClose: () => void;
  onSave: (entry: Omit<MoodLog, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) => void;
  onDelete?: (id: string) => void;
}

type Selection = Record<PresetCategoryKey, string[]>;

const EMPTY_SELECTION: Selection = { sensations: [], weather: [], activities: [] };
const DEFAULT_TAB: PresetCategoryKey = 'activities';
const GRID_COLUMNS = 5;
const TILE_HEIGHT = 54;
const TILE_GAP = 6;
const GRID_ROWS = Math.max(
  ...PRESET_CATEGORIES.map((category) => Math.ceil(category.presets.length / GRID_COLUMNS)),
);
const GRID_HEIGHT = GRID_ROWS * TILE_HEIGHT + (GRID_ROWS - 1) * TILE_GAP;

function selectionFromLog(log: MoodLog): Selection {
  return {
    sensations: log.sensations,
    weather: log.weather ? [log.weather] : [],
    activities: log.activities,
  };
}

function resolvePreset(ref: PresetRef): { category: PresetCategory; preset: IconPreset } | undefined {
  const category = PRESET_CATEGORIES.find((item) => item.key === ref.category);
  const preset = category?.presets.find((item) => item.id === ref.id);
  return category && preset ? { category, preset } : undefined;
}

export const QuickEntrySheet: React.FC<QuickEntrySheetProps> = ({
  isOpen,
  initialMood,
  initialImageDataUrl,
  editingLog,
  logs,
  onClose,
  onSave,
  onDelete,
}) => {
  const [mood, setMood] = useState<MoodLevel>(initialMood ?? 3);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [activeTab, setActiveTab] = useState<PresetCategoryKey>(DEFAULT_TAB);
  const [frequent, setFrequent] = useState<PresetRef[]>([]);
  const [note, setNote] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isMounted, setIsMounted] = useState(isOpen);
  if (isOpen && !isMounted) setIsMounted(true);
  const isClosing = isMounted && !isOpen;
  const shownEditingLogRef = useRef(editingLog);
  if (isOpen) shownEditingLogRef.current = editingLog;
  const shownEditingLog = shownEditingLogRef.current;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setActiveTab(DEFAULT_TAB);
    setFrequent(rankFrequentPresets(logs, Date.now()));

    if (editingLog) {
      setMood(editingLog.mood);
      setSelection(selectionFromLog(editingLog));
      setNote(editingLog.note ?? '');
      setImageDataUrl(editingLog.imageDataUrl);
    } else {
      setMood(initialMood ?? 3);
      setSelection(EMPTY_SELECTION);
      setNote('');
      setImageDataUrl(undefined);
    }
    // logs is left out of the deps on purpose: a log update while open must not reset the selection.
  }, [isOpen, editingLog, initialMood]);

  useEffect(() => {
    if (!isOpen || !initialImageDataUrl) return;
    setImageDataUrl(initialImageDataUrl);
  }, [isOpen, initialImageDataUrl]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isMounted) {
    return null;
  }

  const activeMood = MOOD_PRESETS[mood];
  const activeCategory = PRESET_CATEGORIES.find((category) => category.key === activeTab) ?? PRESET_CATEGORIES[0];
  const frequentPresets = frequent.flatMap((ref) => resolvePreset(ref) ?? []);
  const selectedStyle = {
    backgroundColor: activeMood.bgSoft,
    color: activeMood.color,
    borderColor: activeMood.borderColor,
  };

  const togglePreset = (category: PresetCategory, id: string) => {
    setSelection((prev) => {
      const current = prev[category.key];
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : category.multiple
          ? [...current, id]
          : [id];
      return { ...prev, [category.key]: next };
    });
  };

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsCompressing(true);
    try {
      const compressed = await compressImageFile(file);
      setImageDataUrl(compressed);
    } catch {
      // Ignore invalid or unreadable image files silently to keep entry frictionless
    } finally {
      setIsCompressing(false);
    }
  };

  const handleCameraClick = () => {
    const bridge = (window as unknown as { AndroidBridge?: { launchCamera?: () => boolean } }).AndroidBridge;
    if (bridge && typeof bridge.launchCamera === 'function') {
      bridge.launchCamera();
      return;
    }
    cameraInputRef.current?.click();
  };

  const handleSubmit = () => {
    haptic('confirm');
    onSave({
      ...(editingLog ? { id: editingLog.id, timestamp: editingLog.timestamp } : {}),
      mood,
      weather: selection.weather[0],
      sensations: selection.sensations,
      activities: selection.activities,
      note: note.trim() || undefined,
      imageDataUrl,
    });
  };

  const squareButtonClass =
    'w-11 h-11 shrink-0 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/70 backdrop-blur-sm ${
        isClosing ? 'sheet-backdrop-out pointer-events-none' : 'sheet-backdrop-in'
      }`}
      onClick={onClose}
      onAnimationEnd={(event) => {
        if (isClosing && event.target === event.currentTarget) setIsMounted(false);
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full max-w-md mx-auto bg-[#141417] border-t border-zinc-800/60 rounded-t-3xl px-5 pt-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] shadow-2xl flex flex-col overflow-hidden max-h-[85vh] max-h-[85dvh] ${
          isClosing ? 'sheet-panel-out' : 'sheet-panel-in'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex justify-center mb-4 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-zinc-700/60" />
          {shownEditingLog && onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(shownEditingLog.id);
                onClose();
              }}
              title="削除"
              aria-label="削除"
              className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors active:scale-95"
            >
              <MinimalIcon name="Trash2" size={18} strokeWidth={1.85} />
            </button>
          )}
        </div>

        <div className="flex items-start justify-between gap-2 pb-4 shrink-0">
          {MOOD_ORDER.map((level) => {
            const preset = MOOD_PRESETS[level];
            const isSelected = mood === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => {
                  if (level !== mood) haptic('tick');
                  setMood(level);
                }}
                aria-label={preset.hint}
                aria-pressed={isSelected}
                className="flex-1 flex flex-col items-center gap-2 py-1 group focus:outline-none"
              >
                <div
                  style={{
                    backgroundColor: isSelected ? preset.color : undefined,
                  }}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-150 group-active:scale-95 ${
                    isSelected ? 'scale-105 shadow-md' : 'bg-zinc-900/60 border border-zinc-800/50'
                  }`}
                >
                  <MinimalIcon
                    name={preset.icon}
                    size={28}
                    strokeWidth={isSelected ? 2.1 : 1.85}
                    color={isSelected ? '#141417' : preset.color}
                    className={isSelected ? '' : 'opacity-70 group-hover:opacity-95 transition-opacity'}
                  />
                </div>
                <span
                  style={isSelected ? { color: preset.color } : undefined}
                  className={`text-xs leading-none transition-colors ${
                    isSelected ? 'font-semibold' : 'text-zinc-400'
                  }`}
                >
                  {preset.hint}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{ WebkitOverflowScrolling: 'touch' }}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y"
        >
          {frequentPresets.length > 0 && (
            <>
              <div className="text-[11px] text-zinc-500 mx-0.5 mb-2">よく使う</div>
              <div className="flex flex-wrap gap-1.5 mb-3.5">
                {frequentPresets.map(({ category, preset }) => {
                  const isSelected = selection[category.key].includes(preset.id);
                  return (
                    <button
                      key={`${category.key}:${preset.id}`}
                      type="button"
                      onClick={() => togglePreset(category, preset.id)}
                      aria-pressed={isSelected}
                      style={isSelected ? selectedStyle : undefined}
                      className={`h-8 pl-2.5 pr-3 rounded-full border inline-flex items-center gap-1.5 text-xs transition-all duration-150 active:scale-95 focus:outline-none ${
                        isSelected
                          ? 'font-medium'
                          : 'border-zinc-800/60 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/50'
                      }`}
                    >
                      <MinimalIcon name={preset.icon} size={16} strokeWidth={1.85} />
                      <span>{preset.hint}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div role="tablist" className="flex gap-1 p-[3px] mb-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800/60">
            {PRESET_CATEGORIES.map((category) => {
              const isActive = category.key === activeTab;
              const count = category.presets.filter((preset) => selection[category.key].includes(preset.id)).length;
              return (
                <button
                  key={category.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(category.key)}
                  className={`flex-1 h-[30px] rounded-[9px] text-xs flex items-center justify-center gap-1.5 transition-colors focus:outline-none ${
                    isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{category.label}</span>
                  {count > 0 && (
                    <span
                      style={{ backgroundColor: activeMood.color }}
                      className="min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold leading-none text-[#141417] inline-flex items-center justify-center"
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            style={{ height: GRID_HEIGHT, gap: TILE_GAP, gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` }}
            className="grid content-start"
          >
            {activeCategory.presets.map((preset) => {
              const isSelected = selection[activeCategory.key].includes(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => togglePreset(activeCategory, preset.id)}
                  aria-pressed={isSelected}
                  style={isSelected ? { ...selectedStyle, height: TILE_HEIGHT } : { height: TILE_HEIGHT }}
                  className={`px-0.5 rounded-[14px] border flex flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-95 focus:outline-none touch-pan-y ${
                    isSelected
                      ? 'font-medium'
                      : 'border-zinc-800/40 bg-zinc-900/30 text-zinc-400 hover:bg-zinc-800/50'
                  }`}
                >
                  <MinimalIcon name={preset.icon} size={20} strokeWidth={1.85} />
                  <span className="text-[11px] leading-tight truncate max-w-full">{preset.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-zinc-800/60 pt-3 mt-3 flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageChange}
            className="hidden"
          />

          {imageDataUrl ? (
            <div className="relative shrink-0 w-11 h-11">
              <img
                src={imageDataUrl}
                alt=""
                className="w-11 h-11 rounded-xl object-cover border border-zinc-800/80"
              />
              <button
                type="button"
                onClick={() => setImageDataUrl(undefined)}
                title="写真を削除"
                aria-label="写真を削除"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white active:scale-95 flex items-center justify-center shadow-md"
              >
                <MinimalIcon name="X" size={12} strokeWidth={2.25} />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCameraClick}
                disabled={isCompressing}
                title="カメラで撮影"
                aria-label="カメラで撮影"
                className={squareButtonClass}
              >
                <MinimalIcon name="Camera" size={20} strokeWidth={1.85} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing}
                title="ギャラリーから選択"
                aria-label="ギャラリーから選択"
                className={squareButtonClass}
              >
                <MinimalIcon name="ImagePlus" size={20} strokeWidth={1.85} />
              </button>
            </>
          )}

          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="ひとことメモ"
            aria-label="メモ"
            className="flex-1 min-w-0 h-11 bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-3 text-base text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />

          <button
            type="button"
            onClick={handleSubmit}
            title="記録する"
            aria-label="記録する"
            style={{ backgroundColor: activeMood.color }}
            className="w-[52px] h-11 shrink-0 rounded-xl flex items-center justify-center transition-transform active:scale-95"
          >
            <MinimalIcon name="Check" size={22} strokeWidth={2.4} color="#141417" />
          </button>
        </div>
      </div>
    </div>
  );
};
