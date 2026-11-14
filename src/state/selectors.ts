import type { Part } from '../core/parts/parts';
import { ranking, rocketParts, rocketStats, type Rocket, type Upgrades } from '../core/rocket/rocket';
import { catalog, economy, levels, rankingWeights, tutorialScript } from '../data';
import type { ProgressSnapshot } from '../engines/progression/progression';
import { highestUnlocked, partLevelCap, type Level } from '../engines/levels/levels';
import type { ShopAccess } from '../engines/shop/shop';
import { isAllowed, isTutorialActive } from '../engines/tutorial/tutorial';
import type { SaveData } from '../services/persistence/save';

export function rocketRanking(rocket: Rocket, upgrades: Upgrades = {}): number {
  return ranking(rocketStats(rocketParts(rocket, catalog), upgrades), rankingWeights);
}

/** Ranking the rocket would have with `part` swapped into its slot. */
export function rankingWith(rocket: Rocket, part: Part, upgrades: Upgrades = {}): number {
  return rocketRanking({ ...rocket, [part.category]: part.id }, upgrades);
}

/** True when the player has the part spare or mounted. */
export function ownsPart(save: SaveData, partId: string): boolean {
  return (save.inventory[partId] ?? 0) > 0 || Object.values(save.rocket).includes(partId);
}

export function progressSnapshot(save: SaveData): ProgressSnapshot {
  return {
    ...save.stats,
    levelsCompleted: save.progress.completed.length,
    highestUnlocked: highestUnlocked(save.progress),
    bestDistance: Math.max(0, ...Object.values(save.progress.best)),
    upgrades: Object.values(save.upgrades).reduce((a, b) => a + b, 0),
    cosmetics: save.cosmetics.owned.length,
  };
}

/** Local calendar day, which daily missions are keyed by. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
