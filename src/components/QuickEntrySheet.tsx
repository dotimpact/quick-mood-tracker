import React, { useEffect, useRef, useState } from 'react';
import { IconPreset, MoodLevel, MoodLog } from '../types';
import {
  ACTIVITY_PRESETS,
  MOOD_ORDER,
  MOOD_PRESETS,
  SENSATION_PRESETS,
  WEATHER_PRESETS,
} from '../constants/presets';
import { compressImageFile } from '../services/imageUtils';
import { MinimalIcon } from './MinimalIcon';

export interface QuickEntrySheetProps {
  isOpen: boolean;
  initialMood?: MoodLevel;
  initialImageDataUrl?: string;
  editingLog?: MoodLog | null;
  onClose: () => void;
  onSave: (entry: Omit<MoodLog, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) => void;
  onDelete?: (id: string) => void;
}

type SectionKey = 'sensations' | 'weather' | 'activities' | 'note';

const INITIAL_OPEN_SECTIONS: Record<SectionKey, boolean> = {
  weather: false,
  sensations: false,
  activities: false,
  note: false,
};

function toggleArrayItem(items: string[], id: string): string[] {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}

export const QuickEntrySheet: React.FC<QuickEntrySheetProps> = ({
  isOpen,
  initialMood,
  initialImageDataUrl,
  editingLog,
  onClose,
  onSave,
  onDelete,
}) => {
  const [mood, setMood] = useState<MoodLevel>(initialMood ?? 3);
  const [weather, setWeather] = useState<string | undefined>(undefined);
  const [sensations, setSensations] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [isCompressing, setIsCompressing] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(INITIAL_OPEN_SECTIONS);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({
    weather: null,
    sensations: null,
    activities: null,
    note: null,
  });

  const scrollSectionIntoView = (key: SectionKey) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const container = scrollContainerRef.current;
        const sectionEl = sectionRefs.current[key];
        if (!container || !sectionEl) return;
        const containerRect = container.getBoundingClientRect();
        const sectionRect = sectionEl.getBoundingClientRect();
        const overflowBottom = sectionRect.bottom - containerRect.bottom;
        if (overflowBottom > 0) {
          container.scrollBy({
            top: overflowBottom + 16,
            behavior: 'smooth',
          });
        }
      }, 20);
    });
  };

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

    setOpenSections({ ...INITIAL_OPEN_SECTIONS });

    if (editingLog) {
      setMood(editingLog.mood);
      setWeather(editingLog.weather);
      setSensations(editingLog.sensations);
      setActivities(editingLog.activities);
      setNote(editingLog.note ?? '');
      setImageDataUrl(editingLog.imageDataUrl);
    } else {
      setMood(initialMood ?? 3);
      setWeather(undefined);
      setSensations([]);
      setActivities([]);
      setNote('');
      setImageDataUrl(undefined);
    }
  }, [isOpen, editingLog, initialMood]);

  useEffect(() => {
    if (!isOpen || !initialImageDataUrl) return;
    setImageDataUrl(initialImageDataUrl);
    setOpenSections((prev) => ({ ...prev, note: true }));
    scrollSectionIntoView('note');
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

  if (!isOpen) {
    return null;
  }

  const activeMood = MOOD_PRESETS[mood];
  const selectedWeatherPreset = WEATHER_PRESETS.find((preset) => preset.id === weather);
  const selectedSensationPresets = SENSATION_PRESETS.filter((preset) => sensations.includes(preset.id));
  const selectedActivityPresets = ACTIVITY_PRESETS.filter((preset) => activities.includes(preset.id));
  const trimmedNote = note.trim();

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => {
      const willOpen = !prev[key];
      if (willOpen) {
        scrollSectionIntoView(key);
      }
      return { ...prev, [key]: willOpen };
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
    onSave({
      ...(editingLog ? { id: editingLog.id, timestamp: editingLog.timestamp } : {}),
      mood,
      weather,
      sensations,
      activities,
      note: trimmedNote || undefined,
      imageDataUrl,
    });
  };

  const renderPresetOption = (
    preset: IconPreset,
    isSelected: boolean,
    onToggle: () => void,
  ) => (
    <button
      key={preset.id}
      type="button"
      onClick={onToggle}
      aria-pressed={isSelected}
      style={
        isSelected
          ? {
              backgroundColor: activeMood.bgSoft,
              color: activeMood.color,
              borderColor: activeMood.borderColor,
            }
          : undefined
      }
      className={`min-h-[64px] py-3 px-1.5 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all duration-150 active:scale-95 focus:outline-none touch-pan-y ${
        isSelected
          ? 'font-medium'
          : 'border-zinc-800/40 bg-zinc-900/30 text-zinc-400 hover:bg-zinc-800/50'
      }`}
    >
      <MinimalIcon name={preset.icon} size={22} strokeWidth={1.85} />
      <span className="text-xs leading-tight truncate max-w-full">{preset.hint}</span>
    </button>
  );

  const renderAccordionSection = (
    key: SectionKey,
    label: string,
    summary: React.ReactNode,
    content: React.ReactNode,
  ) => {
    const isExpanded = openSections[key];
    return (
      <div
        ref={(el) => {
          sectionRefs.current[key] = el;
        }}
        className="border-t border-zinc-800/50"
      >
        <button
          type="button"
          onClick={() => toggleSection(key)}
          aria-expanded={isExpanded}
          className="w-full min-h-[54px] py-3.5 px-2 rounded-xl flex items-center justify-between gap-3 text-left focus:outline-none active:bg-zinc-800/40 transition-colors group touch-pan-y"
        >
          <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">
            {label}
          </span>
          <div className="flex items-center gap-2.5 min-w-0">
            {summary}
            <span className="w-8 h-8 rounded-lg bg-zinc-900/90 border border-zinc-800/70 flex items-center justify-center shrink-0 text-zinc-400 group-hover:text-zinc-200 transition-colors">
              <MinimalIcon
                name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
                size={20}
                strokeWidth={1.9}
              />
            </span>
          </div>
        </button>
        {isExpanded && content}
      </div>
    );
  };

  const notePreview = trimmedNote.length > 10 ? `${trimmedNote.slice(0, 10)}…` : trimmedNote;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md mx-auto bg-[#141417] border-t border-zinc-800/60 rounded-t-3xl px-5 pt-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-2xl flex flex-col overflow-hidden max-h-[85vh] max-h-[85dvh]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Subtle drag handle */}
        <div className="flex justify-center mb-4 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-zinc-700/60" />
        </div>

        {/* 1. Primary Mood Selector (Always Open at Top) */}
        <div className="flex items-start justify-between gap-2 pb-4 shrink-0">
          {MOOD_ORDER.map((level) => {
            const preset = MOOD_PRESETS[level];
            const isSelected = mood === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setMood(level)}
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

        {/* 2. Collapsible Optional Sections */}
        <div
          ref={scrollContainerRef}
          style={{ WebkitOverflowScrolling: 'touch' }}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y -mx-2 px-2 pb-2"
        >
          {renderAccordionSection(
            'sensations',
            '体感',
            selectedSensationPresets.length > 0 && (
              <div className="flex items-center gap-2">
                {selectedSensationPresets.map((preset) => (
                  <MinimalIcon
                    key={preset.id}
                    name={preset.icon}
                    size={18}
                    strokeWidth={1.85}
                    color={activeMood.color}
                  />
                ))}
              </div>
            ),
            <div className="grid grid-cols-4 gap-2.5 pt-1.5 pb-4">
              {SENSATION_PRESETS.map((preset) =>
                renderPresetOption(
                  preset,
                  sensations.includes(preset.id),
                  () => setSensations((prev) => toggleArrayItem(prev, preset.id)),
                ),
              )}
            </div>,
          )}

          {renderAccordionSection(
            'weather',
            '天候',
            selectedWeatherPreset && (
              <div className="flex items-center gap-2">
                <MinimalIcon
                  name={selectedWeatherPreset.icon}
                  size={18}
                  strokeWidth={1.85}
                  color={activeMood.color}
                />
                <span className="text-xs font-medium" style={{ color: activeMood.color }}>
                  {selectedWeatherPreset.hint}
                </span>
              </div>
            ),
            <div className="grid grid-cols-4 gap-2.5 pt-1.5 pb-4">
              {WEATHER_PRESETS.map((preset) =>
                renderPresetOption(
                  preset,
                  weather === preset.id,
                  () => setWeather((prev) => (prev === preset.id ? undefined : preset.id)),
                ),
              )}
            </div>,
          )}

          {renderAccordionSection(
            'activities',
            'していること',
            selectedActivityPresets.length > 0 && (
              <div className="flex items-center gap-2">
                {selectedActivityPresets.map((preset) => (
                  <MinimalIcon
                    key={preset.id}
                    name={preset.icon}
                    size={18}
                    strokeWidth={1.85}
                    color={activeMood.color}
                  />
                ))}
              </div>
            ),
            <div className="grid grid-cols-4 gap-2.5 pt-1.5 pb-4">
              {ACTIVITY_PRESETS.map((preset) =>
                renderPresetOption(
                  preset,
                  activities.includes(preset.id),
                  () => setActivities((prev) => toggleArrayItem(prev, preset.id)),
                ),
              )}
            </div>,
          )}

          {renderAccordionSection(
            'note',
            'メモ・画像',
            (trimmedNote || imageDataUrl) && (
              <div className="flex items-center gap-2 min-w-0">
                {imageDataUrl && (
                  <MinimalIcon
                    name="ImagePlus"
                    size={18}
                    strokeWidth={1.85}
                    color={activeMood.color}
                  />
                )}
                {trimmedNote && (
                  <>
                    <MinimalIcon
                      name="Edit3"
                      size={18}
                      strokeWidth={1.85}
                      color={activeMood.color}
                    />
                    <span className="text-xs text-zinc-400 truncate max-w-[120px]">
                      {notePreview}
                    </span>
                  </>
                )}
              </div>
            ),
            <div className="pt-1.5 pb-4 flex items-center gap-3">
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
                <div className="relative shrink-0 w-12 h-12">
                  <img
                    src={imageDataUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover border border-zinc-800/80"
                  />
                  <button
                    type="button"
                    onClick={() => setImageDataUrl(undefined)}
                    title="写真を削除"
                    aria-label="写真を削除"
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white active:scale-95 flex items-center justify-center shadow-md"
                  >
                    <MinimalIcon name="X" size={14} strokeWidth={2.25} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCameraClick}
                    disabled={isCompressing}
                    title="カメラで撮影"
                    aria-label="カメラで撮影"
                    className="w-12 h-12 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
                  >
                    <MinimalIcon name="Camera" size={22} strokeWidth={1.85} />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing}
                    title="ギャラリーから選択"
                    aria-label="ギャラリーから選択"
                    className="w-12 h-12 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
                  >
                    <MinimalIcon name="ImagePlus" size={22} strokeWidth={1.85} />
                  </button>
                </div>
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
                placeholder="ひとことメモ（任意）"
                aria-label="メモ"
                className="flex-1 min-w-0 h-12 bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-4 text-base text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
            </div>,
          )}
        </div>

        {/* 3. Always-Visible Bottom Action Bar */}
        <div className="border-t border-zinc-800/60 pt-3.5 mt-1 flex items-center justify-between gap-3 shrink-0">
          {editingLog && onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(editingLog.id);
                onClose();
              }}
              className="shrink-0 h-12 px-4 rounded-xl flex items-center gap-2 text-sm text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors active:scale-95"
            >
              <MinimalIcon name="Trash2" size={18} strokeWidth={1.85} />
              <span>削除</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            style={{
              backgroundColor: activeMood.color,
              color: '#141417',
            }}
            className="flex-1 h-12 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          >
            <MinimalIcon name="Check" size={20} strokeWidth={2.25} color="#141417" />
            <span>記録する</span>
          </button>
        </div>
      </div>
    </div>
  );
};
