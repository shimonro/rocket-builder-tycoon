import { create } from 'zustand';
import { createEventBus, type GameEvent } from '../core/events';
import type { Category } from '../core/parts/parts';
import { isLaunchable } from '../core/rocket/rocket';
import { achievements, catalog, cosmetics, economy, missionTemplates, MISSIONS_PER_DAY, prebuilts, tutorialScript } from '../data';
import { equip, equipAll, unequip } from '../engines/builder/builder';
import { computePayout, type PayoutBreakdown } from '../engines/levels/economy';
import { highestUnlocked, recordFlight, unlockLevel } from '../engines/levels/levels';
import {
  applyFlight,
  buyCosmetic,
  claimMission,
  newAchievements,
  refreshMissions,
  type Achievement,
  type CosmeticType,
} from '../engines/progression/progression';
import { buyPart, buyPrebuilt, sellPart, upgradePart, type ShopError } from '../engines/shop/shop';
import { advanceTutorial, type TutorialAction } from '../engines/tutorial/tutorial';
import { defaultSave, type SaveData, type Settings } from '../services/persistence/save';
import { allowed, levelById, ownsPart, progressSnapshot, rocketRanking, shopAccess, today, tutorialDone } from './selectors';

export type Screen = 'entrance' | 'hangar' | 'shop' | 'levels' | 'missions' | 'journey' | 'results' | 'settings';
export const NAV_SCREENS: Screen[] = ['hangar', 'shop', 'levels', 'missions', 'settings'];

export interface FlightOutcome {
  distance: number;
  targetReached: boolean;
  endReason: 'destroyed' | 'fuel' | 'aborted';
  hoops: number;
  destroyed: number;
  coins: number;
  fuelCans: number;
  guardianDefeated: boolean;
  /** Recorded inputs, for leaderboard verification. */
  replay?: { seed: number; log: number[]; aborted: boolean };
  /** Rocket positions every GHOST_INTERVAL seconds, flattened [x, y, x, y, …]. */
  track?: number[];
}

export interface FlightResult extends FlightOutcome {
  levelId: number;
  firstCompletion: boolean;
  tutorial: boolean;
  /** Best distance on this level before the flight. */
  previousBest: number;
  payout: PayoutBreakdown;
  achievements: Achievement[];
}

export interface GameStore {
  save: SaveData;
  screen: Screen;
  lastResult: FlightResult | null;
  notice: string | null;
  /** Increments every launch. */
  flightNumber: number;
  /** Random seed of the current flight's sky layout. */
  flightSeed: number;
  loadSave(save: SaveData): void;
  tutorialNext(): void;
  navigate(screen: Screen): void;
  buyPart(partId: string): void;
  buyPrebuilt(prebuiltId: string): void;
  sellPart(partId: string): void;
  equip(partId: string): void;
  unequip(category: Category): void;
  selectLevel(levelId: number): void;
  unlockLevel(levelId: number): void;
  launch(): void;
  finishFlight(outcome: FlightOutcome): void;
  continueFromResults(next: 'hangar' | 'shop' | 'levels' | 'retry'): void;
  updateSettings(settings: Partial<Settings>): void;
  dismissNotice(): void;
  upgradePart(partId: string): void;
  buyCosmetic(id: string): void;
  equipCosmetic(type: CosmeticType, id: string | null): void;
  claimMission(id: string): void;
  skipTutorial(): void;
  markTip(id: string): void;
}

/** Game-wide events for audio and effects. */
export const gameEvents = createEventBus<GameEvent>();

const SHOP_ERRORS: Record<ShopError, string> = {
  unknown_item: 'That item does not exist.',
  insufficient_funds: 'Not enough cash.',
  level_locked: 'Unlock more levels to buy this.',
  category_locked: 'Shields and weapons unlock with Level 2.',
  prebuilt_only: 'Only available in a prebuilt rocket.',
  not_owned: 'You do not own that part.',
  max_upgrade: 'That part is fully upgraded.',
};

/** Unlocks any achievements the save now qualifies for and pays their gems. */
function withAchievements(save: SaveData): { save: SaveData; earned: Achievement[] } {
  const earned = newAchievements(achievements, progressSnapshot(save), save.achievements);
  if (earned.length === 0) return { save, earned };
  return {
    save: {
      ...save,
      achievements: [...save.achievements, ...earned.map((a) => a.id)],
      gems: save.gems + earned.reduce((sum, a) => sum + a.gems, 0),
    },
    earned,
  };
}

/** Deals today's missions once the tutorial is over. */
function withMissions(save: SaveData): SaveData {
  if (!tutorialDone(save)) return save;
  const missions = refreshMissions(save.missions, today(), missionTemplates, highestUnlocked(save.progress), MISSIONS_PER_DAY);
  return missions === save.missions ? save : { ...save, missions };
}

const achievementNotice = (earned: Achievement[]) =>
  earned.map((a) => `🏆 ${a.name} (+${a.gems} 💎)`).join(' · ');

export const useGame = create<GameStore>()((set, get) => {
  /** Runs `change` only if the tutorial allows `action`, then advances the tutorial. */
  function act(action: TutorialAction, change: (save: SaveData) => SaveData | null, extra: Partial<GameStore> = {}) {
    const { save } = get();
    if (!allowed(save, action)) return false;
    const next = change(save);
    if (!next) return false;
    const { save: checked, earned } = withAchievements({ ...next, tutorialStep: advanceTutorial(save.tutorialStep, action, tutorialScript) });
    set({ ...extra, ...(earned.length ? { notice: achievementNotice(earned) } : {}), save: { ...withMissions(checked), updatedAt: Date.now() } });
    return true;
  }

  function fail(message: string) {
    set({ notice: message });
    gameEvents.emit({ type: 'error', message });
    return null;
  }

  return {
    save: defaultSave(economy.startingCash),
    screen: 'entrance',
    lastResult: null,
    notice: null,
    flightNumber: 0,
    flightSeed: 1,

    loadSave(save) {
      set({ save: withMissions(save), screen: 'hangar', lastResult: null, notice: null });
    },

    tutorialNext() {
      act('next', (s) => s, { screen: 'shop' });
    },

    navigate(screen) {
      act(`nav:${screen}`, (s) => s, { screen, notice: null });
    },

    buyPart(partId) {
      act(`buy:${partId}`, (s) => {
        const r = buyPart({ cash: s.cash, inventory: s.inventory }, partId, catalog, shopAccess(s));
        if (!r.ok) return fail(SHOP_ERRORS[r.error]);
        gameEvents.emit({ type: 'purchase', itemId: partId });
        return { ...s, ...r.wallet };
      });
    },

    buyPrebuilt(prebuiltId) {
      const prebuilt = prebuilts.find((p) => p.id === prebuiltId);
      if (!prebuilt) return;
      act(`buyPrebuilt:${prebuiltId}`, (s) => {
        const r = buyPrebuilt({ cash: s.cash, inventory: s.inventory }, prebuilt, shopAccess(s));
        if (!r.ok) return fail(SHOP_ERRORS[r.error]);
        const equipped = equipAll({ rocket: s.rocket, inventory: r.wallet.inventory }, prebuilt.parts, catalog);
        if (!equipped.ok) return fail('Could not assemble the prebuilt.');
        gameEvents.emit({ type: 'purchase', itemId: prebuiltId });
        set({ notice: `${prebuilt.name} is assembled and ready to launch!` });
        return { ...s, cash: r.wallet.cash, ...equipped.hangar };
      });
    },

    sellPart(partId) {
      act(`sell:${partId}`, (s) => {
        const r = sellPart({ cash: s.cash, inventory: s.inventory }, partId, catalog, economy.sellBackFactor);
        if (!r.ok) return fail(SHOP_ERRORS[r.error]);
        gameEvents.emit({ type: 'sell', itemId: partId });
        return { ...s, ...r.wallet };
      });
    },

    equip(partId) {
      act(`equip:${partId}`, (s) => {
        const r = equip({ rocket: s.rocket, inventory: s.inventory }, partId, catalog);
        if (!r.ok) return fail('You do not own that part.');
        gameEvents.emit({ type: 'equip', partId });
        return { ...s, ...r.hangar };
      });
    },

    unequip(category) {
      act(`unequip:${category}`, (s) => ({ ...s, ...unequip({ rocket: s.rocket, inventory: s.inventory }, category) }));
    },

    selectLevel(levelId) {
      act(`select:${levelId}`, (s) => (s.progress.unlocked.includes(levelId) ? { ...s, selectedLevel: levelId } : null));
    },

    unlockLevel(levelId) {
      act(`unlock:${levelId}`, (s) => {
        const r = unlockLevel(levelById(levelId), s.progress, rocketRanking(s.rocket, s.upgrades), s.cash);
        if (!r.ok) return fail('Requirements not met yet.');
        gameEvents.emit({ type: 'unlock', levelId });
        set({ notice: `Level ${levelId} unlocked!` });
        return { ...s, cash: r.cash, progress: r.progress, selectedLevel: levelId };
      });
    },

    launch() {
      const { save } = get();
      if (!isLaunchable(save.rocket)) {
        fail('Mount a body, fuel tank, engine and fins first.');
        return;
      }
      if (!save.progress.unlocked.includes(save.selectedLevel)) return;
      if (act('launch', (s) => s, { screen: 'journey', flightNumber: get().flightNumber + 1, flightSeed: Math.floor(Math.random() * 2 ** 31), notice: null })) {
        gameEvents.emit({ type: 'launch', levelId: save.selectedLevel });
      }
    },

    finishFlight(outcome) {
      const { save, screen } = get();
      if (screen !== 'journey') return;
      const level = levelById(save.selectedLevel);
      const firstCompletion = outcome.targetReached && !save.progress.completed.includes(level.id);
      const payout = computePayout(
        {
          distance: outcome.distance,
          level,
          ranking: rocketRanking(save.rocket, save.upgrades),
          targetReached: outcome.targetReached,
          firstCompletion,
          coins: outcome.coins,
        },
        economy,
      );
      const distance = payout.distance;
      const stats = save.stats;
      const missions = save.missions
        ? applyFlight(save.missions, {
            distance,
            hoops: outcome.hoops,
            destroyed: outcome.destroyed,
            coins: outcome.coins,
            flights: 1,
            targets: outcome.targetReached ? 1 : 0,
            fuelCans: outcome.fuelCans,
          })
        : null;
      const { save: next, earned } = withAchievements({
        ...save,
        cash: save.cash + payout.total,
        progress: recordFlight(save.progress, level.id, distance, outcome.targetReached),
        stats: {
          flights: stats.flights + 1,
          totalEarned: stats.totalEarned + payout.total,
          totalDistance: stats.totalDistance + distance,
          hoops: stats.hoops + outcome.hoops,
          destroyed: stats.destroyed + outcome.destroyed,
          coins: stats.coins + outcome.coins,
          guardians: stats.guardians + (outcome.guardianDefeated ? 1 : 0),
          fuelCans: stats.fuelCans + outcome.fuelCans,
        },
        missions,
        tutorialStep: advanceTutorial(save.tutorialStep, 'flight:end', tutorialScript),
      });
      const result: FlightResult = {
        ...outcome,
        levelId: level.id,
        firstCompletion,
        tutorial: !tutorialDone(save),
        previousBest: save.progress.best[level.id] ?? 0,
        payout,
        achievements: earned,
      };
      gameEvents.emit({ type: 'payout', amount: payout.total });
      gameEvents.emit({ type: 'flightFinished', levelId: level.id, distance, reason: outcome.endReason, targetReached: outcome.targetReached });
      set({ screen: 'results', lastResult: result, save: { ...withMissions(next), updatedAt: Date.now() } });
    },

    continueFromResults(next) {
      const { save } = get();
      if (!tutorialDone(save)) {
        act('continue', (s) => s, { screen: 'hangar', notice: 'Tutorial complete! Shop, levels and upgrades are now unlocked.' });
        return;
      }
      if (next === 'retry') get().launch();
      else set({ screen: next, save: withMissions(save) });
    },

    updateSettings(settings) {
      const { save } = get();
      set({ save: { ...save, settings: { ...save.settings, ...settings }, updatedAt: Date.now() } });
    },

    dismissNotice() {
      set({ notice: null });
    },

    upgradePart(partId) {
      act(`upgrade:${partId}`, (s) => {
        const r = upgradePart({ cash: s.cash, upgrades: s.upgrades }, partId, ownsPart(s, partId), catalog, economy.upgradeCostFactor);
        if (!r.ok) return fail(SHOP_ERRORS[r.error]);
        gameEvents.emit({ type: 'upgrade', partId });
        return { ...s, cash: r.cash, upgrades: r.upgrades };
      });
    },

    buyCosmetic(id) {
      const item = cosmetics.find((c) => c.id === id);
      if (!item) return;
      act(`cosmetic:${id}`, (s) => {
        const r = buyCosmetic({ gems: s.gems, owned: s.cosmetics.owned }, item);
        if (!r.ok) return fail(r.error === 'owned' ? 'You already own that.' : 'Not enough gems. Earn them from missions and achievements.');
        gameEvents.emit({ type: 'purchase', itemId: id });
        return { ...s, gems: r.gems, cosmetics: { owned: r.owned, equipped: { ...s.cosmetics.equipped, [item.type]: id } } };
      });
    },

    equipCosmetic(type, id) {
      act(`cosmetic:${type}`, (s) => {
        if (id !== null && !s.cosmetics.owned.includes(id)) return null;
        const equipped = { ...s.cosmetics.equipped };
        if (id === null) delete equipped[type];
        else equipped[type] = id;
        return { ...s, cosmetics: { ...s.cosmetics, equipped } };
      });
    },

    claimMission(id) {
      act(`claim:${id}`, (s) => {
        const r = s.missions && claimMission(s.missions, id);
        if (!r) return null;
        gameEvents.emit({ type: 'payout', amount: r.gems });
        set({ notice: `Mission complete! +${r.gems} 💎` });
        return { ...s, missions: r.missions, gems: s.gems + r.gems };
      });
    },

    /** Returning players can skip straight to the full game with the starting cash. */
    skipTutorial() {
      const { save } = get();
      if (save.tutorialStep !== 'welcome') return;
      set({ save: { ...withMissions({ ...save, tutorialStep: 'done' }), updatedAt: Date.now() }, screen: 'shop', notice: 'Tutorial skipped. Build any rocket you like!' });
    },

    markTip(id) {
      const { save } = get();
      if (save.tips.includes(id)) return;
      set({ save: { ...save, tips: [...save.tips, id], updatedAt: Date.now() } });
    },
  };
});
