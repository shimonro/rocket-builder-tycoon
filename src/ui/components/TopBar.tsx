import { NAV_SCREENS, useGame, type Screen } from '../../state/game';
import { rocketRanking } from '../../state/selectors';
import { cx, GateButton, money } from './common';

const LABELS: Partial<Record<Screen, string>> = { hangar: 'Hangar', shop: 'Shop', levels: 'Levels', missions: 'Missions', settings: 'Settings' };
const ICONS: Partial<Record<Screen, string>> = { hangar: '🛠️', shop: '🛒', levels: '🗺️', missions: '🎯', settings: '⚙️' };

export function TopBar() {
  const screen = useGame((s) => s.screen);
  const cash = useGame((s) => s.save.cash);
  const rocket = useGame((s) => s.save.rocket);
  const upgrades = useGame((s) => s.save.upgrades);
  const gems = useGame((s) => s.save.gems);
  const claimable = useGame((s) => s.save.missions?.list.filter((m) => m.progress >= m.target && !m.claimed).length ?? 0);
  const navigate = useGame((s) => s.navigate);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">🚀</span>
        <span className="brand-name">Rocket Builder Tycoon</span>
      </div>
      <nav className="nav">
        {NAV_SCREENS.map((s) => (
          <GateButton
            key={s}
            action={`nav:${s}`}
            onClick={() => navigate(s)}
            className={cx('nav-btn', screen === s && 'active')}
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
          💎 {gems}
        </span>
        <span className="pill cash" data-testid="cash">
          {money(cash)}
        </span>
      </div>
    </header>
  );
}
