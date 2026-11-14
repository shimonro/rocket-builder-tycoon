import { parseCatalog, parsePrebuilts } from '../core/parts/parts';
import { hashString } from '../core/rng';
import type { RankingWeights } from '../core/rocket/rocket';
import type { JourneyConfig } from '../engines/journey/config';
import type { EconomyConfig } from '../engines/levels/economy';
import { parseLevels } from '../engines/levels/levels';
import type { TutorialScript } from '../engines/tutorial/tutorial';
import catalogJson from './parts/catalog.json';
import prebuiltsJson from './parts/prebuilts.json';
import levelsJson from './levels/levels.json';
import rankingJson from './config/ranking.json';
import economyJson from './config/economy.json';
import journeyJson from './config/journey.json';
import tutorialJson from './config/tutorial.json';

export const catalog = parseCatalog(catalogJson);
export const prebuilts = parsePrebuilts(prebuiltsJson, catalog);
export const levels = parseLevels(levelsJson);
export const rankingWeights: RankingWeights = rankingJson;
export const economy: EconomyConfig = economyJson;
export const journeyConfig: JourneyConfig = journeyJson;
export const tutorialScript: TutorialScript = tutorialJson;
import type { Achievement, Cosmetic, MissionTemplate } from '../engines/progression/progression';
import achievementsJson from './progression/achievements.json';
import missionsJson from './progression/missions.json';
import cosmeticsJson from './progression/cosmetics.json';

export const achievements = achievementsJson as Achievement[];
export const missionTemplates = missionsJson as MissionTemplate[];
export const cosmetics = cosmeticsJson as Cosmetic[];
export const MISSIONS_PER_DAY = 3;

/** Changes whenever flight rules change, so the leaderboard server can reject runs from an outdated client. */
export const RULES_VERSION = hashString(JSON.stringify([journeyJson, levelsJson, catalogJson, economyJson.shieldsAndWeaponsFromLevel])).toString(36);
