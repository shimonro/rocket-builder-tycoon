import { useEffect, useRef, type ReactNode } from 'react';
import type { Category, Part } from '../../core/parts/parts';
import { TUTORIAL_MESSAGES, type TutorialStep } from '../../engines/tutorial/tutorial';
import { useGame } from '../../state/game';
import { allowed, tutorialDone } from '../../state/selectors';
import { partIconSvg, RARITY_COLORS } from '../art/rocketArt';
import { TOUR, TUTORIAL_TARGETS } from '../tour';
import { Spotlight } from './Spotlight';

export const CATEGORY_LABELS: Record<Category, string> = {
  body: 'Body',
  fuel_tank: 'Fuel tank',
  engine: 'Engine',
  booster: 'Booster',
  fins: 'Fins',
  shield: 'Shield',
  weapon: 'Weapon',
};

export const STAT_LABELS = {
  thrust: 'Thrust',
  fuelCapacity: 'Fuel',
  fuelEfficiency: 'Efficiency',
  maneuverability: 'Handling',
  hull: 'Hull',
  shield: 'Shield',
  weaponDamage: 'Damage',
} as const;

export function money(n: number): string {
  return `$${Math.floor(n).toLocaleString('en-US')}`;
}

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

export function Svg({ svg, className, label }: { svg: string; className?: string; label?: string }) {
  return <span className={cx('svg', className)} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function PartIcon({ part, size = 44 }: { part: Pick<Part, 'category' | 'rarity'>; size?: number }) {
  return (
    <span className="part-icon" style={{ width: size, height: size, borderColor: RARITY_COLORS[part.rarity] }}>
      <Svg svg={partIconSvg(part.category, RARITY_COLORS[part.rarity])} />
    </span>
  );
}

export function RarityTag({ rarity }: { rarity: Part['rarity'] }) {
  return (
    <span className="rarity" style={{ color: RARITY_COLORS[rarity], borderColor: RARITY_COLORS[rarity] }}>
      {rarity}
    </span>
  );
}

interface GateButtonProps {
  /** Tutorial action this button performs; it is disabled while the tutorial expects something else. */
  action: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
  testId?: string;
}

export function GateButton({ action, onClick, disabled, className, title, children, testId }: GateButtonProps) {
  const save = useGame((s) => s.save);
  const ok = allowed(save, action);
  const highlight = ok && !tutorialDone(save);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [highlight]);
  return (
    <button
      ref={ref}
      type="button"
      className={cx('btn', className, highlight && 'highlight', !ok && 'locked')}
      disabled={disabled || !ok}
      onClick={onClick}
      title={title}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

const TOUR_END_NOTICE = 'Tour over! Your next flight will explain hoops, asteroids and coins.';

/** The replayable guided tour: walks through the screens, spotlighting one thing per stop. */
function TourCoach({ stop }: { stop: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const screen = useGame((s) => s.screen);
  const { setTour, navigate } = useGame.getState();
  const current = TOUR[Math.min(stop, TOUR.length - 1)];
  const last = stop >= TOUR.length - 1;
  useEffect(() => {
    if (useGame.getState().screen !== current.screen) navigate(current.screen);
  }, [current, navigate]);
  const end = (skipped: boolean) => {
    setTour(null);
    // The last stop already says this.
    if (skipped) useGame.setState({ notice: TOUR_END_NOTICE });
  };
  return (
    <div ref={ref} className="coach guide" data-testid="tour" role="status">
      <span className="coach-avatar" aria-hidden>
        🧑‍🚀
      </span>
      <p>
        <small className="coach-step">
          {stop + 1}/{TOUR.length}
        </small>{' '}
        {current.text}
      </p>
      <div className="coach-actions">
        <button type="button" className="btn primary" onClick={() => (last ? end(false) : setTour(stop + 1))} data-testid="tour-next">
          {last ? 'Done' : 'Next'}
        </button>
        {!last && (
          <button type="button" className="btn ghost small" onClick={() => end(true)} data-testid="tour-end">
            Skip tour
          </button>
        )}
      </div>
      {screen === current.screen && <Spotlight key={stop} target={current.target} from={ref} />}
    </div>
  );
}

const TOUR_STEPS = new Set<TutorialStep>(['tour_cash', 'tour_ranking', 'tour_gems', 'tour_stats']);

/** The tutorial's coach bubble, pinned above the current screen, pointing at what it explains. */
export function Coach() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useGame((s) => s.save.tutorialStep);
  const tour = useGame((s) => s.tour);
  const tutorialNext = useGame((s) => s.tutorialNext);
  const skip = useGame((s) => s.skipTutorial);
  if (step === 'done' && tour !== null) return <TourCoach stop={tour} />;
  if (step === 'done' || step === 'flight') return null;
  const target = TUTORIAL_TARGETS[step];
  return (
    <div ref={ref} className="coach guide" data-testid="coach" role="status">
      <span className="coach-avatar" aria-hidden>
        🧑‍🚀
      </span>
      <p>{TUTORIAL_MESSAGES[step]}</p>
      {step === 'welcome' && (
        <div className="coach-actions">
          <GateButton action="next" onClick={tutorialNext} className="primary" testId="tutorial-next">
            Let’s go!
          </GateButton>
          <button type="button" className="btn ghost small" onClick={skip} data-testid="skip-tutorial">
            I’ve played before — skip
          </button>
        </div>
      )}
      {TOUR_STEPS.has(step) && (
        <div className="coach-actions">
          <GateButton action="next" onClick={tutorialNext} className="primary" testId="tutorial-next">
            Next
          </GateButton>
        </div>
      )}
      {target && <Spotlight key={step} target={target} from={ref} />}
    </div>
  );
}

export function Notice() {
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismissNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, 3500);
    return () => clearTimeout(t);
  }, [notice, dismiss]);
  if (!notice) return null;
  return (
    <button type="button" className="notice" onClick={dismiss} data-testid="notice">
      {notice}
    </button>
  );
}

export function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar" aria-label={label} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
