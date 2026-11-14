import { useEffect, useRef, type ReactNode } from 'react';
import type { Category, Part } from '../../core/parts/parts';
import { TUTORIAL_MESSAGES } from '../../engines/tutorial/tutorial';
import { useGame } from '../../state/game';
import { allowed, tutorialDone } from '../../state/selectors';
import { partIconSvg, RARITY_COLORS } from '../art/rocketArt';

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

/** The tutorial's coach bubble, pinned above the current screen. */
export function Coach() {
  const step = useGame((s) => s.save.tutorialStep);
  const tutorialNext = useGame((s) => s.tutorialNext);
  if (step === 'done' || step === 'flight') return null;
  return (
    <div className="coach" data-testid="coach" role="status">
      <span className="coach-avatar" aria-hidden>
        🧑‍🚀
      </span>
      <p>{TUTORIAL_MESSAGES[step]}</p>
      {step === 'welcome' && (
        <GateButton action="next" onClick={tutorialNext} className="primary" testId="tutorial-next">
          Let’s go!
        </GateButton>
      )}
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
