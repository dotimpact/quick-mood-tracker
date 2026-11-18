import { MoodLevel, MoodPreset, IconPreset, RoutineItem } from '../types';

/**
 * Calm, muted, cohesive Nordic/earthy palette inspired by Moodistory.
 * No neon glows; gentle contrast that feels soothing on a warm dark surface.
 */
export const MOOD_PRESETS: Record<MoodLevel, MoodPreset> = {
  5: {
    level: 5,
    icon: 'Laugh',
    color: '#E5A93C',       // Warm Muted Ochre / Gold
    bgSoft: 'rgba(229, 169, 60, 0.16)',
    borderColor: 'rgba(229, 169, 60, 0.45)',
    glowShadow: 'none',
    hint: '最高',
  },
  4: {
    level: 4,
    icon: 'Smile',
    color: '#68B088',       // Calm Sage Green
    bgSoft: 'rgba(104, 176, 136, 0.16)',
    borderColor: 'rgba(104, 176, 136, 0.45)',
    glowShadow: 'none',
    hint: '良い',
  },
  3: {
    level: 3,
    icon: 'Meh',
    color: '#729BBE',       // Quiet Dusty Blue
    bgSoft: 'rgba(114, 155, 190, 0.16)',
    borderColor: 'rgba(114, 155, 190, 0.45)',
    glowShadow: 'none',
    hint: '普通',
  },
  2: {
    level: 2,
    icon: 'Frown',
    color: '#8E7DBE',       // Muted Lavender
    bgSoft: 'rgba(142, 125, 190, 0.16)',
    borderColor: 'rgba(142, 125, 190, 0.45)',
    glowShadow: 'none',
    hint: '微妙',
  },
  1: {
    level: 1,
    icon: 'Annoyed',
    color: '#C97076',       // Soft Dusty Rose
    bgSoft: 'rgba(201, 112, 118, 0.16)',
    borderColor: 'rgba(201, 112, 118, 0.45)',
    glowShadow: 'none',
    hint: '不調',
  },
};

export const MOOD_ORDER: MoodLevel[] = [5, 4, 3, 2, 1];

export const WEATHER_PRESETS: IconPreset[] = [
  { id: 'sunny', icon: 'Sun', hint: '晴れ' },
  { id: 'partly', icon: 'CloudSun', hint: '薄曇り' },
  { id: 'cloudy', icon: 'Cloud', hint: 'くもり' },
  { id: 'rainy', icon: 'CloudRain', hint: '雨' },
  { id: 'windy', icon: 'Wind', hint: '風' },
];

export const SENSATION_PRESETS: IconPreset[] = [
  { id: 'hot', icon: 'Flame', hint: '暑い' },
  { id: 'cold', icon: 'Snowflake', hint: '寒い' },
  { id: 'hungry', icon: 'Utensils', hint: '空腹' },
  { id: 'tired', icon: 'BatteryLow', hint: '疲れた' },
  { id: 'sleepy', icon: 'Moon', hint: '眠い' },
  { id: 'fresh', icon: 'Zap', hint: 'スッキリ' },
  { id: 'unwell', icon: 'Activity', hint: '不調' },
  { id: 'relaxed', icon: 'Coffee', hint: '一息' },
];

export const ACTIVITY_PRESETS: IconPreset[] = [
  { id: 'work', icon: 'Briefcase', hint: '仕事' },
  { id: 'study', icon: 'BookOpen', hint: '読書・勉強' },
  { id: 'home', icon: 'Home', hint: '家・家事' },
  { id: 'meal', icon: 'Soup', hint: '食事' },
  { id: 'game', icon: 'Gamepad2', hint: '趣味' },
  { id: 'exercise', icon: 'Footprints', hint: '散歩・運動' },
  { id: 'transit', icon: 'TrainFront', hint: '移動' },
  { id: 'social', icon: 'Users', hint: '人と一緒' },
  { id: 'rest', icon: 'Bed', hint: '休息' },
  { id: 'music', icon: 'Headphones', hint: '音楽' },
  { id: 'shop', icon: 'ShoppingBag', hint: '買い物' },
  { id: 'bath', icon: 'Droplets', hint: '入浴' },
];

export const ROUTINE_ICON_OPTIONS: Array<{ icon: string; label: string }> = [
  { icon: 'BookOpen', label: '読書・学習' },
  { icon: 'Footprints', label: '散歩・運動' },
  { icon: 'Activity', label: 'ストレッチ' },
  { icon: 'Droplets', label: '水分・入浴' },
  { icon: 'Bed', label: '睡眠・早寝' },
  { icon: 'Coffee', label: '一息・瞑想' },
  { icon: 'Utensils', label: '食事・自炊' },
  { icon: 'Sparkles', label: 'セルフケア' },
  { icon: 'Home', label: '片付け・家事' },
  { icon: 'Briefcase', label: '仕事・作業' },
  { icon: 'Headphones', label: '音楽・趣味' },
  { icon: 'Sun', label: '朝活・日光' },
];

export const DEFAULT_ROUTINES: RoutineItem[] = [
  {
    id: 'routine-reading',
    title: '読書',
    icon: 'BookOpen',
    order: 0,
    targetCount: 1,
  },
  {
    id: 'routine-walk',
    title: '散歩・運動',
    icon: 'Footprints',
    order: 1,
    targetCount: 1,
  },
  {
    id: 'routine-stretch',
    title: 'ストレッチ',
    icon: 'Activity',
    order: 2,
    targetCount: 1,
  },
];
