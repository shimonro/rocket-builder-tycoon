import { COSMETIC_TYPES, type CosmeticType, type DailyMissions } from '../../engines/progression/progression';
import { TUTORIAL_STEPS, type TutorialStep } from '../../engines/tutorial/tutorial';

export type TouchControls = 'auto' | 'on' | 'off';

export interface Settings {
  volume: number;
  muted: boolean;
  touchControls: TouchControls;
  /** Music level, multiplied by the master volume. */
  music: number;
  vibration: boolean;
  /** Show the ghost of the best run on each level. */
  ghost: boolean;
  /** Share anonymous gameplay stats and crash reports. */
  analytics: boolean;
  /** Name on the leaderboards; empty picks one from the account. */
  pilotName: string;
}

export interface LifetimeStats {
  flights: number;
  totalEarned: number;
  totalDistance: number;
  hoops: number;
  destroyed: number;
  coins: number;
  guardians: number;
  fuelCans: number;
}

export interface SaveData {
  version: 2;
  cash: number;
  /** Premium currency, earned from achievements and daily missions and spent on cosmetics only. */
  gems: number;
  inventory: Record<string, number>;
  rocket: Record<string, string>;
  /** Upgrade level per part id. */
  upgrades: Record<string, number>;
  progress: { unlocked: number[]; completed: number[]; best: Record<string, number> };
  selectedLevel: number;
  tutorialStep: TutorialStep;
  settings: Settings;
  stats: LifetimeStats;
  achievements: string[];
  missions: DailyMissions | null;
  cosmetics: { owned: string[]; equipped: Partial<Record<CosmeticType, string>> };
  /** Contextual tips the player has already seen. */
  tips: string[];
  updatedAt: number;
}

const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  muted: false,
  touchControls: 'auto',
  music: 0.5,
  vibration: true,
  ghost: true,
  analytics: true,
  pilotName: '',
};

const EMPTY_STATS: LifetimeStats = { flights: 0, totalEarned: 0, totalDistance: 0, hoops: 0, destroyed: 0, coins: 0, guardians: 0, fuelCans: 0 };

export function defaultSave(startingCash: number): SaveData {
  return {
    version: 2,
    cash: startingCash,
    gems: 0,
    inventory: {},
    rocket: {},
    upgrades: {},
    progress: { unlocked: [1], completed: [], best: {} },
    selectedLevel: 1,
    tutorialStep: 'welcome',
    settings: { ...DEFAULT_SETTINGS },
    stats: { ...EMPTY_STATS },
    achievements: [],
    missions: null,
    cosmetics: { owned: [], equipped: {} },
    tips: [],
    updatedAt: 0,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isIntList = (v: unknown): v is number[] => Array.isArray(v) && v.every(isCount);
const isString = (v: unknown): v is string => typeof v === 'string';
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isRecordOf = <T>(v: unknown, check: (x: unknown) => x is T): v is Record<string, T> =>
  isObject(v) && Object.values(v).every(check);

/** Version 1 saves predate gems, upgrades, missions and cosmetics; they get empty defaults. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version !== 1) return raw;
  return {
    ...raw,
    version: 2,
    gems: 0,
    upgrades: {},
    settings: { ...DEFAULT_SETTINGS, ...(isObject(raw.settings) ? raw.settings : {}) },
    stats: isObject(raw.stats) ? { ...EMPTY_STATS, ...raw.stats } : raw.stats,
    achievements: [],
    missions: null,
    cosmetics: { owned: [], equipped: {} },
    tips: [],
  };
}

function isMissions(v: unknown): v is DailyMissions | null {
  if (v === null) return true;
  if (!isObject(v) || !isString(v.day) || !Array.isArray(v.list)) return false;
  return v.list.every(
    (m) => isObject(m) && isString(m.id) && isString(m.text) && isCount(m.target) && isCount(m.progress) && isCount(m.gems) && typeof m.claimed === 'boolean',
  );
}

function isSettings(v: unknown): v is Settings {
  return (
    isObject(v) &&
    typeof v.volume === 'number' &&
    typeof v.muted === 'boolean' &&
    ['auto', 'on', 'off'].includes(v.touchControls as string) &&
    typeof v.music === 'number' &&
    typeof v.vibration === 'boolean' &&
    typeof v.ghost === 'boolean' &&
    typeof v.analytics === 'boolean' &&
    isString(v.pilotName)
  );
}

/** Returns a valid save (upgrading older versions), or null when the data is not a save we can trust. */
export function parseSave(input: unknown): SaveData | null {
  if (!isObject(input)) return null;
  const raw = migrate(input);
  if (raw.version !== 2) return null;
  const { progress, stats, cosmetics } = raw;
  if (!isAmount(raw.cash) || !isCount(raw.gems)) return null;
  if (!isRecordOf(raw.inventory, isCount) || !isRecordOf(raw.rocket, isString) || !isRecordOf(raw.upgrades, isCount)) return null;
  if (!isObject(progress) || !isIntList(progress.unlocked) || !isIntList(progress.completed)) return null;
  if (!isRecordOf(progress.best, isCount)) return null;
  if (!isCount(raw.selectedLevel) || !TUTORIAL_STEPS.includes(raw.tutorialStep as TutorialStep)) return null;
  if (!isSettings(raw.settings)) return null;
  if (!isObject(stats) || !Object.keys(EMPTY_STATS).every((k) => isAmount(stats[k])) || !isCount(stats.flights)) return null;
  if (!isStringList(raw.achievements) || !isStringList(raw.tips) || !isMissions(raw.missions)) return null;
  if (!isObject(cosmetics) || !isStringList(cosmetics.owned) || !isRecordOf(cosmetics.equipped, isString)) return null;
  if (!Object.keys(cosmetics.equipped).every((k) => COSMETIC_TYPES.includes(k as CosmeticType))) return null;
  return raw as unknown as SaveData;
}

/** True when the player has done more than open the game. */
export function hasProgress(save: SaveData): boolean {
  return save.stats.flights > 0 || save.tutorialStep !== 'welcome';
}
