import { NAV_SCREENS, useGame, type Screen } from '../../state/game';
import { rocketRanking } from '../../state/selectors';
import { cx, GateButton, money } from './common';

const LABELS: Partial<Record<Screen, string>> = { hangar: 'Hangar', shop: 'Shop', levels: 'Levels', settings: 'Settings' };
const ICONS: Partial<Record<Screen, string>> = { hangar: '🛠️', shop: '🛒', levels: '🗺️', settings: '⚙️' };

export function TopBar() {
  const screen = useGame((s) => s.screen);
  const cash = useGame((s) => s.save.cash);
  const rocket = useGame((s) => s.save.rocket);
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
          </GateButton>
        ))}
      </nav>
      <div className="wallet">
        <span className="pill rank" title="Rocket ranking" data-testid="ranking">
          ★ {rocketRanking(rocket)}
        </span>
        <span className="pill cash" data-testid="cash">
          {money(cash)}
        </span>
      </div>
    </header>
  );
}
