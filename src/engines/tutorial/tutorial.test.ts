import { describe, expect, it } from 'vitest';
import script from '../../data/config/tutorial.json';
import { advanceTutorial, isAllowed, isTutorialActive, TUTORIAL_MESSAGES, TUTORIAL_STEPS, type TutorialStep } from './tutorial';

const PLAYTHROUGH = [
  'next',
  'buy:body_tin_can_hull',
  'buy:fuel_tank_jerrycan_tank',
  'buy:engine_sparrow_e1',
  'buy:fins_stub_fins',
  'nav:hangar',
  'equip:body_tin_can_hull',
  'equip:fuel_tank_jerrycan_tank',
  'equip:engine_sparrow_e1',
  'equip:fins_stub_fins',
  'launch',
  'flight:end',
  'continue',
];

describe('tutorial', () => {
  it('runs linearly from welcome to done on the scripted actions', () => {
    let step: TutorialStep = 'welcome';
    const visited: TutorialStep[] = [step];
    for (const action of PLAYTHROUGH) {
      expect(isAllowed(step, action, script)).toBe(true);
      step = advanceTutorial(step, action, script);
      visited.push(step);
    }
    expect(visited).toEqual([...TUTORIAL_STEPS]);
    expect(isTutorialActive(step)).toBe(false);
  });

  it('locks every other action while active', () => {
    expect(isAllowed('buy_body', 'buy:engine_sparrow_e1', script)).toBe(false);
    expect(isAllowed('buy_body', 'nav:hangar', script)).toBe(false);
    expect(advanceTutorial('buy_body', 'buy:engine_sparrow_e1', script)).toBe('buy_body');
  });

  it('allows everything once done', () => {
    expect(isAllowed('done', 'buy:anything', script)).toBe(true);
    expect(advanceTutorial('done', 'continue', script)).toBe('done');
  });

  it('has a message for every active step', () => {
    for (const step of TUTORIAL_STEPS.filter(isTutorialActive)) expect(TUTORIAL_MESSAGES[step]).not.toBe('');
  });
});
