import { useEffect, useRef, useState } from 'react';
import { NAV_SCREENS, useGame, type Screen } from '../../state/game';
import { rocketRanking, tutorialDone } from '../../state/selectors';
import { useSession } from '../../state/session';
import { cx, GateButton, money } from './common';
import { InfoModal } from './InfoModal';

const LABELS: Partial<Record<Screen, string>> = { hangar: 'Hangar', shop: 'Shop', levels: 'Levels', missions: 'Missions', settings: 'Settings' };
const ICONS: Partial<Record<Screen, string>> = { hangar: '🛠️', shop: '🛒', levels: '🗺️', missions: '🎯', settings: '⚙️' };

/** QA and local builds get a badge and the god mode switch; production builds compile both out. */
const TEST_BUILD = __APP_ENV__ !== 'prod';

export function pilotLabel(pilotName: string, email: string | undefined): string {
  return pilotName || email?.split('@')[0] || 'Pilot';
}

export function TopBar() {
  const screen = useGame((s) => s.screen);
  const cash = useGame((s) => s.save.cash);
  const rocket = useGame((s) => s.save.rocket);
  const upgrades = useGame((s) => s.save.upgrades);
  const gems = useGame((s) => s.save.gems);
  const god = useGame((s) => s.save.godBackup !== null);
  const done = useGame((s) => tutorialDone(s.save));
  const pilotName = useGame((s) => s.save.settings.pilotName);
  const email = useSession((s) => s.user?.email);
  const claimable = useGame((s) => s.save.missions?.list.filter((m) => m.progress >= m.target && !m.claimed).length ?? 0);
  const { navigate, toggleGodMode } = useGame.getState();
  const [info, setInfo] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // The coach sticks right below the bar, whose height changes when it wraps on phones.
  useEffect(() => {
    const bar = ref.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${bar.offsetHeight}px`));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <header className={cx('topbar', god && 'god')} ref={ref}>
      <div className="brand">
        <span className="brand-mark">🚀</span>
        <span className="brand-name">Rocket Builder Tycoon</span>
      </div>
      {TEST_BUILD && (
        <div className="topbar-meta">
          <span className={`env-badge env-${__APP_ENV__}`} data-testid="env-badge" title={`${__APP_ENV__.toUpperCase()} build ${__APP_VERSION__}`}>
            <b>{__APP_ENV__.toUpperCase()}</b>
            <small>v{__APP_VERSION__}</small>
          </span>
          <button
            type="button"
            className={cx('btn god-toggle', god && 'on')}
            aria-pressed={god}
            onClick={toggleGodMode}
            title="God mode (QA only): endless cash and gems; switching off restores your progress"
            data-testid="god-toggle"
          >
            ⚡<span className="god-label">{god ? ' GOD MODE' : ' God'}</span>
          </button>
        </div>
      )}
      <nav className="nav">
        {NAV_SCREENS.map((s) => (
          <GateButton
            key={s}
            action={`nav:${s}`}
            onClick={() => navigate(s)}
            className={cx('nav-btn', screen === s && 'active')}
            title={LABELS[s]}
            testId={`nav-${s}`}
          >
            <span aria-hidden>{ICONS[s]}</span> <span className="nav-label">{LABELS[s]}</span>
            {s === 'missions' && claimable > 0 && <span className="badge">{claimable}</span>}
          </GateButton>
        ))}
      </nav>
      <div className="wallet">
        <span className="pill rank" title="Rocket ranking" data-testid="ranking">
          ★ {rocketRanking(rocket, upgrades)}
        </span>
        <span className="pill gems" title="Gems: earned from missions and achievements, spent on cosmetics" data-testid="gems">
          💎 {god ? '∞' : gems}
        </span>
        <span className="pill cash" title="Cash" data-testid="cash">
          {god ? '$∞' : money(cash)}
        </span>
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn icon-btn" onClick={() => setInfo(true)} aria-label="Game guide" title="Game guide" data-testid="info-button">
          ℹ️
        </button>
        <button
          type="button"
          className={cx('btn profile-btn', screen === 'profile' && 'active', !done && 'locked')}
          disabled={!done}
          onClick={() => useGame.setState({ screen: 'profile', notice: null })}
          title="Pilot profile"
          data-testid="profile-button"
        >
          <span aria-hidden>🧑‍🚀</span>
          <span className="profile-name">{pilotLabel(pilotName, email)}</span>
        </button>
      </div>
      <span className="topbar-break" aria-hidden />
      {info && <InfoModal onClose={() => setInfo(false)} />}
    </header>
  );
}
