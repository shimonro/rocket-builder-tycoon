import { create } from 'zustand';
import { createEventBus, type GameEvent } from '../core/events';
import type { Category } from '../core/parts/parts';
import { isLaunchable } from '../core/rocket/rocket';
import { catalog, economy, prebuilts, tutorialScript } from '../data';
import { equip, equipAll, unequip } from '../engines/builder/builder';
import { computePayout, type PayoutBreakdown } from '../engines/levels/economy';
import { recordFlight, unlockLevel } from '../engines/levels/levels';
import { buyPart, buyPrebuilt, sellPart, type ShopError } from '../engines/shop/shop';
import { advanceTutorial, type TutorialAction } from '../engines/tutorial/tutorial';
import { defaultSave, type SaveData, type Settings } from '../services/persistence/save';
import { allowed, levelById, rocketRanking, shopAccess, tutorialDone } from './selectors';

export type Screen = 'entrance' | 'hangar' | 'shop' | 'levels' | 'journey' | 'results' | 'settings';
export const NAV_SCREENS: Screen[] = ['hangar', 'shop', 'levels', 'settings'];

export interface FlightOutcome {
  distance: number;
  targetReached: boolean;
  endReason: 'destroyed' | 'fuel' | 'aborted';
  hoops: number;
  destroyed: number;
}

export interface FlightResult extends FlightOutcome {
  levelId: number;
  firstCompletion: boolean;
  tutorial: boolean;
  payout: PayoutBreakdown;
}

export interface GameStore {
  save: SaveData;
  screen: Screen;
  lastResult: FlightResult | null;
  notice: string | null;
  /** Increments every launch; seeds the level layout. */
  flightNumber: number;
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
};

export const useGame = create<GameStore>()((set, get) => {
  /** Runs `change` only if the tutorial allows `action`, then advances the tutorial. */
  function act(action: TutorialAction, change: (save: SaveData) => SaveData | null, extra: Partial<GameStore> = {}) {
    const { save } = get();
    if (!allowed(save, action)) return false;
    const next = change(save);
    if (!next) return false;
    set({ ...extra, save: { ...next, tutorialStep: advanceTutorial(save.tutorialStep, action, tutorialScript), updatedAt: Date.now() } });
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

    loadSave(save) {
      set({ save, screen: 'hangar', lastResult: null, notice: null });
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
        const r = unlockLevel(levelById(levelId), s.progress, rocketRanking(s.rocket), s.cash);
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
      if (act('launch', (s) => s, { screen: 'journey', flightNumber: get().flightNumber + 1, notice: null })) {
        gameEvents.emit({ type: 'launch', levelId: save.selectedLevel });
      }
    },

    finishFlight(outcome) {
      const { save, screen } = get();
      if (screen !== 'journey') return;
      const level = levelById(save.selectedLevel);
      const firstCompletion = outcome.targetReached && !save.progress.completed.includes(level.id);
      const payout = computePayout(
        { distance: outcome.distance, level, ranking: rocketRanking(save.rocket), targetReached: outcome.targetReached, firstCompletion },
        economy,
      );
      const result: FlightResult = { ...outcome, levelId: level.id, firstCompletion, tutorial: !tutorialDone(save), payout };
      gameEvents.emit({ type: 'payout', amount: payout.total });
      set({
        screen: 'results',
        lastResult: result,
        save: {
          ...save,
          cash: save.cash + payout.total,
          progress: recordFlight(save.progress, level.id, outcome.distance, outcome.targetReached),
          stats: { flights: save.stats.flights + 1, totalEarned: save.stats.totalEarned + payout.total },
          tutorialStep: advanceTutorial(save.tutorialStep, 'flight:end', tutorialScript),
          updatedAt: Date.now(),
        },
      });
    },

    continueFromResults(next) {
      const { save } = get();
      if (!tutorialDone(save)) {
        act('continue', (s) => s, { screen: 'hangar', notice: 'Tutorial complete! Shop, levels and upgrades are now unlocked.' });
        return;
      }
      if (next === 'retry') get().launch();
      else set({ screen: next });
    },

    updateSettings(settings) {
      const { save } = get();
      set({ save: { ...save, settings: { ...save.settings, ...settings }, updatedAt: Date.now() } });
    },

    dismissNotice() {
      set({ notice: null });
    },
  };
});
