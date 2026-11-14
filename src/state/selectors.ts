import type { Part } from '../core/parts/parts';
import { ranking, rocketParts, rocketStats, type Rocket } from '../core/rocket/rocket';
import { catalog, economy, levels, rankingWeights, tutorialScript } from '../data';
import { highestUnlocked, partLevelCap, type Level } from '../engines/levels/levels';
import type { ShopAccess } from '../engines/shop/shop';
import { isAllowed, isTutorialActive } from '../engines/tutorial/tutorial';
import type { SaveData } from '../services/persistence/save';

export function rocketRanking(rocket: Rocket): number {
  return ranking(rocketStats(rocketParts(rocket, catalog)), rankingWeights);
}

/** Ranking the rocket would have with `part` swapped into its slot. */
export function rankingWith(rocket: Rocket, part: Part): number {
  return rocketRanking({ ...rocket, [part.category]: part.id });
}

export function tutorialDone(save: SaveData): boolean {
  return !isTutorialActive(save.tutorialStep);
}

export function shopAccess(save: SaveData): ShopAccess {
  const highest = highestUnlocked(save.progress);
  return {
    partLevelCap: partLevelCap(save.progress),
    highestUnlocked: highest,
    shieldsAndWeaponsUnlocked: tutorialDone(save) && highest >= economy.shieldsAndWeaponsFromLevel,
  };
}

export function allowed(save: SaveData, action: string): boolean {
  return isAllowed(save.tutorialStep, action, tutorialScript);
}

export function levelById(id: number): Level {
  return levels.find((l) => l.id === id) ?? levels[0];
}
