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
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
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
      className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-95 focus:outline-none ${
        isSelected
          ? 'font-medium'
          : 'border-transparent text-zinc-400 hover:bg-zinc-800/40'
      }`}
    >
      <MinimalIcon name={preset.icon} size={18} strokeWidth={1.75} />
      <span className="text-[10px] leading-tight truncate max-w-full">{preset.hint}</span>
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
      <div className="border-t border-zinc-800/50">
        <button
          type="button"
          onClick={() => toggleSection(key)}
          aria-expanded={isExpanded}
          className="w-full py-3 flex items-center justify-between gap-3 text-left focus:outline-none group"
        >
          <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
            {label}
          </span>
          <div className="flex items-center gap-2 min-w-0">
            {summary}
            <MinimalIcon
              name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
              size={16}
              strokeWidth={1.75}
              className="shrink-0 text-zinc-500 group-hover:text-zinc-300 transition-colors"
            />
          </div>
        </button>
        {isExpanded && content}
      </div>
    );
  };

  const notePreview = trimmedNote.length > 10 ? `${trimmedNote.slice(0, 10)}…` : trimmedNote;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md mx-auto bg-[#141417] border-t border-zinc-800/60 rounded-t-3xl px-5 pt-3 pb-6 shadow-2xl flex flex-col max-h-[88vh]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Subtle drag handle */}
        <div className="flex justify-center mb-4 shrink-0">
          <div className="w-9 h-1 rounded-full bg-zinc-700/60" />
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
                className="flex flex-col items-center gap-1.5 group focus:outline-none"
              >
                <div
                  style={{
                    backgroundColor: isSelected ? preset.color : undefined,
                  }}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-150 group-active:scale-95 ${
                    isSelected ? 'scale-105' : 'bg-zinc-900/40'
                  }`}
                >
                  <MinimalIcon
                    name={preset.icon}
                    size={24}
                    strokeWidth={isSelected ? 2 : 1.75}
                    color={isSelected ? '#141417' : preset.color}
                    className={isSelected ? '' : 'opacity-60 group-hover:opacity-85 transition-opacity'}
                  />
                </div>
                <span
                  style={isSelected ? { color: preset.color } : undefined}
                  className={`text-[10px] leading-none transition-colors ${
                    isSelected ? 'font-medium' : 'text-zinc-500'
                  }`}
                >
                  {preset.hint}
                </span>
              </button>
            );
          })}
        </div>

        {/* 2. Collapsible Optional Sections */}
        <div className="overflow-y-auto min-h-0 -mx-1 px-1">
          {renderAccordionSection(
            'sensations',
            '体感',
            selectedSensationPresets.length > 0 && (
              <div className="flex items-center gap-1.5">
                {selectedSensationPresets.map((preset) => (
                  <MinimalIcon
                    key={preset.id}
                    name={preset.icon}
                    size={15}
                    strokeWidth={1.75}
                    color={activeMood.color}
                  />
                ))}
              </div>
            ),
            <div className="grid grid-cols-4 gap-2 pt-1 pb-3">
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
              <div className="flex items-center gap-1.5">
                <MinimalIcon
                  name={selectedWeatherPreset.icon}
                  size={15}
                  strokeWidth={1.75}
                  color={activeMood.color}
                />
                <span className="text-[11px]" style={{ color: activeMood.color }}>
                  {selectedWeatherPreset.hint}
                </span>
              </div>
            ),
            <div className="grid grid-cols-5 gap-1.5 pt-1 pb-3">
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
              <div className="flex items-center gap-1.5">
                {selectedActivityPresets.map((preset) => (
                  <MinimalIcon
                    key={preset.id}
                    name={preset.icon}
                    size={15}
                    strokeWidth={1.75}
                    color={activeMood.color}
                  />
                ))}
              </div>
            ),
            <div className="grid grid-cols-4 gap-2 pt-1 pb-3">
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
              <div className="flex items-center gap-1.5 min-w-0">
                {imageDataUrl && (
                  <MinimalIcon
                    name="ImagePlus"
                    size={14}
                    strokeWidth={1.75}
                    color={activeMood.color}
                  />
                )}
                {trimmedNote && (
                  <>
                    <MinimalIcon
                      name="Edit3"
                      size={14}
                      strokeWidth={1.75}
                      color={activeMood.color}
                    />
                    <span className="text-[11px] text-zinc-400 truncate max-w-[110px]">
                      {notePreview}
                    </span>
                  </>
                )}
              </div>
            ),
            <div className="pt-1 pb-3 flex items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />

              {imageDataUrl ? (
                <div className="relative shrink-0 w-10 h-10">
                  <img
                    src={imageDataUrl}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover border border-zinc-800/80"
                  />
                  <button
                    type="button"
                    onClick={() => setImageDataUrl(undefined)}
                    title="写真を削除"
                    aria-label="写真を削除"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center"
                  >
                    <MinimalIcon name="X" size={11} strokeWidth={2.25} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing}
                  title="写真を追加"
                  aria-label="写真を追加"
                  className="shrink-0 w-10 h-10 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
                >
                  <MinimalIcon name="ImagePlus" size={18} strokeWidth={1.75} />
                </button>
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
                className="flex-1 min-w-0 h-10 bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-3.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
              />
            </div>,
          )}
        </div>

        {/* 3. Always-Visible Bottom Action Bar */}
        <div className="border-t border-zinc-800/60 pt-3 mt-1 flex items-center justify-between gap-3 shrink-0">
          {editingLog && onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(editingLog.id);
                onClose();
              }}
              className="shrink-0 h-11 px-3 rounded-xl flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors active:scale-95"
            >
              <MinimalIcon name="Trash2" size={16} strokeWidth={1.75} />
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
            className="flex-1 h-11 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          >
            <MinimalIcon name="Check" size={18} strokeWidth={2.25} color="#141417" />
            <span>記録する</span>
          </button>
        </div>
      </div>
    </div>
  );
};
