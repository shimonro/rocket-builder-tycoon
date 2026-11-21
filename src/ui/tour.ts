import type { TutorialStep } from '../engines/tutorial/tutorial';
import type { Screen } from '../state/game';

/** What the tutorial coach points at on each step (CSS selector), if anything. */
export const TUTORIAL_TARGETS: Partial<Record<TutorialStep, string>> = {
  tour_cash: '[data-testid=cash]',
  tour_ranking: '[data-testid=ranking]',
  tour_gems: '[data-testid=gems]',
  buy_body: '.screen .btn.highlight',
  buy_fuel_tank: '.screen .btn.highlight',
  buy_engine: '.screen .btn.highlight',
  buy_fins: '.screen .btn.highlight',
  goto_hangar: '[data-testid=nav-hangar]',
  equip_body: '.screen .btn.highlight',
  equip_fuel_tank: '.screen .btn.highlight',
  equip_engine: '.screen .btn.highlight',
  equip_fins: '.screen .btn.highlight',
  tour_stats: '[data-testid=stat-grid]',
  launch: '[data-testid=launch]',
  results: '[data-testid=payout-total]',
};

export interface TourStop {
  screen: Screen;
  /** CSS selector of the element to spotlight; the first match is used. */
  target: string;
  text: string;
}

/** The replayable guided tour from the game guide. It never touches the player's progress. */
export const TOUR: TourStop[] = [
  { screen: 'hangar', target: '[data-testid=cash]', text: 'Your cash 💵: flights earn it, parts cost it.' },
  { screen: 'hangar', target: '[data-testid=ranking]', text: 'Your rocket ranking ★: better parts raise it, and new levels need a minimum.' },
  { screen: 'hangar', target: '[data-testid=gems]', text: 'Gems 💎 come from missions, achievements and rare finds in flight, and buy cosmetics.' },
  { screen: 'hangar', target: '[data-testid=info-button]', text: 'Tap ℹ️ any time for the game guide.' },
  { screen: 'hangar', target: '[data-testid=profile-button]', text: 'Your pilot profile: name, rocket and lifetime stats.' },
  { screen: 'shop', target: '.filters', text: 'Filter the shop to find the part you need.' },
  { screen: 'shop', target: '.part-card', text: 'Each card shows a part’s stats and price — buy it here.' },
  { screen: 'shop', target: '[data-testid=tab-prebuilts]', text: 'Prebuilt rockets come fully assembled in a free hangar bay.' },
  { screen: 'hangar', target: '.bays-card', text: 'Hangar bays hold your rockets: tap one to fly it, or buy more bays for more rockets.' },
  { screen: 'hangar', target: '.slots-card', text: 'These are your rocket’s slots: body, tank, engine and fins are required.' },
  { screen: 'hangar', target: '.inventory-card', text: 'Spare parts wait here to be mounted, upgraded or sold.' },
  { screen: 'hangar', target: '[data-testid=stat-grid]', text: 'Your rocket’s stats come from its parts.' },
  { screen: 'levels', target: '.level-grid', text: 'Pick a level here; unlock new ones with a finished level, enough ranking and a fee.' },
  { screen: 'missions', target: '.missions > .card', text: 'Daily missions and achievements pay gems.' },
  { screen: 'hangar', target: '[data-testid=launch]', text: 'That’s the tour! Your next flight will explain hoops, asteroids and coins.' },
];
