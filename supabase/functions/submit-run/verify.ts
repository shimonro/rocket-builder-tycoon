import { rocketParts, rocketStats, isLaunchable, type Rocket } from '../../../src/core/rocket/rocket';
import { catalog, journeyConfig, levels, RULES_VERSION } from '../../../src/data';
import { deriveFlightStats } from '../../../src/engines/journey/config';
import { journeyDistance } from '../../../src/engines/journey/journey';
import { isValidLog, replayJourney } from '../../../src/engines/journey/replay';
import { partLevelCap } from '../../../src/engines/levels/levels';
import type { SaveData } from '../../../src/services/persistence/save';

/** Longest flight accepted: 20 minutes of 60 Hz steps. */
export const MAX_STEPS = 60 * 60 * 20;

export interface RunBody {
  levelId: number;
  seed: number;
  log: number[];
  aborted: boolean;
  rulesVersion: string;
  name: string;
}

export type Verdict = { ok: true; distance: number } | { ok: false; status: number; error: string };

const reject = (status: number, error: string): Verdict => ({ ok: false, status, error });

/**
 * Replays a submitted flight with the player's cloud-saved rocket. The score is the replayed distance,
 * never a number the client claims.
 */
export function verifyRun(body: Partial<RunBody>, save: SaveData | null): Verdict {
  if (body.rulesVersion !== RULES_VERSION) return reject(409, 'Your game is out of date. Reload the page to update it.');
  const level = levels.find((l) => l.id === body.levelId);
  if (!level || !Number.isInteger(body.seed) || typeof body.aborted !== 'boolean') return reject(400, 'Malformed run.');
  if (!isValidLog(body.log, MAX_STEPS)) return reject(400, 'Malformed input log.');
  if (!save) return reject(403, 'No cloud save found for this account yet.');
  if (save.tutorialStep !== 'done' || !save.progress.unlocked.includes(level.id)) return reject(403, 'That level is not unlocked on this account.');

  const rocket = save.rocket as Rocket;
  if (!isLaunchable(rocket)) return reject(403, 'The saved rocket is incomplete.');
  const parts = rocketParts(rocket, catalog);
  const cap = partLevelCap(save.progress);
  if (parts.length !== Object.keys(rocket).length || parts.some((p) => !p.prebuiltOnly && p.level > cap)) {
    return reject(403, 'The saved rocket uses parts this account cannot have.');
  }

  const stats = deriveFlightStats(rocketStats(parts, save.upgrades), journeyConfig, true);
  const state = replayJourney({ stats, level, cfg: journeyConfig, seed: body.seed!, densityFactor: 1 }, body.log!, body.aborted!);
  if (state.status !== 'ended') return reject(400, 'The replay did not finish.');
  return { ok: true, distance: journeyDistance(state) };
}

/** Leaderboard names: letters, digits, spaces, _ and -, up to 16 characters; a default from the user id otherwise. */
export function pilotName(raw: unknown, userId: string): string {
  const name = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) : '';
  return name || `Pilot ${userId.slice(0, 4).toUpperCase()}`;
}
