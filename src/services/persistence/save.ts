import { TUTORIAL_STEPS, type TutorialStep } from '../../engines/tutorial/tutorial';

export type TouchControls = 'auto' | 'on' | 'off';

export interface Settings {
  volume: number;
  muted: boolean;
  touchControls: TouchControls;
}

export interface SaveData {
  version: 1;
  cash: number;
  inventory: Record<string, number>;
  rocket: Record<string, string>;
  progress: { unlocked: number[]; completed: number[]; best: Record<string, number> };
  selectedLevel: number;
  tutorialStep: TutorialStep;
  settings: Settings;
  stats: { flights: number; totalEarned: number };
  updatedAt: number;
}

export function defaultSave(startingCash: number): SaveData {
  return {
    version: 1,
    cash: startingCash,
    inventory: {},
    rocket: {},
    progress: { unlocked: [1], completed: [], best: {} },
    selectedLevel: 1,
    tutorialStep: 'welcome',
    settings: { volume: 0.7, muted: false, touchControls: 'auto' },
    stats: { flights: 0, totalEarned: 0 },
    updatedAt: 0,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isIntList = (v: unknown): v is number[] => Array.isArray(v) && v.every(isCount);
const isRecordOf = <T>(v: unknown, check: (x: unknown) => x is T): v is Record<string, T> =>
  isObject(v) && Object.values(v).every(check);
const isString = (v: unknown): v is string => typeof v === 'string';

/** Returns a valid save, or null when the data is not a save we can trust. */
export function parseSave(raw: unknown): SaveData | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  const { progress, settings, stats } = raw;
  if (typeof raw.cash !== 'number' || raw.cash < 0 || !Number.isFinite(raw.cash)) return null;
  if (!isRecordOf(raw.inventory, isCount) || !isRecordOf(raw.rocket, isString)) return null;
  if (!isObject(progress) || !isIntList(progress.unlocked) || !isIntList(progress.completed)) return null;
  if (!isRecordOf(progress.best, isCount)) return null;
  if (!isCount(raw.selectedLevel) || !TUTORIAL_STEPS.includes(raw.tutorialStep as TutorialStep)) return null;
  if (!isObject(settings) || typeof settings.volume !== 'number' || typeof settings.muted !== 'boolean') return null;
  if (!['auto', 'on', 'off'].includes(settings.touchControls as string)) return null;
  if (!isObject(stats) || !isCount(stats.flights) || typeof stats.totalEarned !== 'number') return null;
  return raw as unknown as SaveData;
}

/** True when the player has done more than open the game. */
export function hasProgress(save: SaveData): boolean {
  return save.stats.flights > 0 || save.tutorialStep !== 'welcome';
}
