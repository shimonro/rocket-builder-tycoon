export const TUTORIAL_STEPS = [
  'welcome',
  'tour_cash',
  'tour_ranking',
  'tour_gems',
  'buy_body',
  'buy_fuel_tank',
  'buy_engine',
  'buy_fins',
  'goto_hangar',
  'equip_body',
  'equip_fuel_tank',
  'equip_engine',
  'equip_fins',
  'tour_stats',
  'launch',
  'flight',
  'results',
  'done',
] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

/** The starter part bought and equipped for each required slot. */
export interface TutorialScript {
  body: string;
  fuel_tank: string;
  engine: string;
  fins: string;
}

/**
 * UI actions the tutorial gates. Everything else is disabled while the tutorial runs.
 * `buy:<partId>`, `equip:<partId>`, `nav:<screen>`, `next`, `launch`, `continue`.
 */
export type TutorialAction = string;

/** The single action that advances each step. */
export function expectedAction(step: TutorialStep, script: TutorialScript): TutorialAction | null {
  switch (step) {
    case 'welcome':
    case 'tour_cash':
    case 'tour_ranking':
    case 'tour_gems':
    case 'tour_stats':
      return 'next';
    case 'buy_body':
    case 'buy_fuel_tank':
    case 'buy_engine':
    case 'buy_fins':
      return `buy:${script[step.slice(4) as keyof TutorialScript]}`;
    case 'goto_hangar':
      return 'nav:hangar';
    case 'equip_body':
    case 'equip_fuel_tank':
    case 'equip_engine':
    case 'equip_fins':
      return `equip:${script[step.slice(6) as keyof TutorialScript]}`;
    case 'launch':
      return 'launch';
    case 'flight':
      return 'flight:end';
    case 'results':
      return 'continue';
    case 'done':
      return null;
  }
}

export function isTutorialActive(step: TutorialStep): boolean {
  return step !== 'done';
}

export function isAllowed(step: TutorialStep, action: TutorialAction, script: TutorialScript): boolean {
  return !isTutorialActive(step) || expectedAction(step, script) === action;
}

/** Moves to the next step when the expected action happens; any other action leaves the step unchanged. */
export function advanceTutorial(step: TutorialStep, action: TutorialAction, script: TutorialScript): TutorialStep {
  if (expectedAction(step, script) !== action) return step;
  return TUTORIAL_STEPS[TUTORIAL_STEPS.indexOf(step) + 1];
}

export const TUTORIAL_MESSAGES: Record<TutorialStep, string> = {
  welcome: 'Welcome, Commander! Let’s build your first rocket and fly it.',
  tour_cash: 'Your cash 💵: flights earn it, parts cost it.',
  tour_ranking: 'Your ranking ★ shows how strong your rocket is; new levels need a minimum.',
  tour_gems: 'Gems 💎 come from missions, achievements and flights, and buy looks like paints and flags.',
  buy_body: 'Every rocket starts with a body. Buy the highlighted Tin Can Hull.',
  buy_fuel_tank: 'Now a fuel tank — no fuel, no flight. Buy the Jerrycan Tank.',
  buy_engine: 'An engine gives you thrust. Buy the Sparrow E1.',
  buy_fins: 'Fins let you steer. Buy the Stub Fins.',
  goto_hangar: 'All parts bought! Head to the Hangar to assemble your rocket.',
  equip_body: 'Tap the Tin Can Hull to mount it.',
  equip_fuel_tank: 'Mount the Jerrycan Tank.',
  equip_engine: 'Mount the Sparrow E1.',
  equip_fins: 'Mount the Stub Fins. Watch your ranking grow!',
  tour_stats: 'Your stats come from your parts: thrust = speed, fuel = range, handling = steering, hull = toughness.',
  launch: 'Your rocket is ready. Launch!',
  flight:
    'Steer with ← → (or drag). ↑ goes faster, ↓ brakes. Space = Turbo. Fly through hoops for a free boost and dodge asteroids!',
  results: 'You earned your first payout! Continue to unlock the full game.',
  done: '',
};
