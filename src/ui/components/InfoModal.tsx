import { createPortal } from 'react-dom';
import { economy, levels, MISSIONS_PER_DAY } from '../../data';
import { useGame } from '../../state/game';
import { tutorialDone } from '../../state/selectors';
import { money } from './common';

const ENV_LABEL = { prod: '', qa: ' · QA', dev: ' · DEV' }[__APP_ENV__];

/** The game guide behind the top bar's ℹ️ button. */
export function InfoModal({ onClose }: { onClose: () => void }) {
  const done = useGame((s) => tutorialDone(s.save));
  const setTour = useGame((s) => s.setTour);
  // Portaled to the body: the top bar's backdrop blur would otherwise trap this fixed overlay inside the bar.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal guide-modal" role="dialog" aria-label="Game guide" data-testid="info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <h2>📖 Game guide</h2>
          <button type="button" className="btn ghost icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <section>
          <h3>🎯 Goal</h3>
          <p>Buy parts, build a rocket and fly it as far as you can. Each flight pays cash for better parts, across {levels.length} levels.</p>
        </section>
        <section>
          <h3>★ Ranking</h3>
          <p>How strong your rocket is. Better and upgraded parts raise it; new levels need a minimum ranking.</p>
        </section>
        <section>
          <h3>💵 Cash</h3>
          <p>Earned from flights; spent on parts, upgrades, level fees and hangar bays.</p>
        </section>
        <section>
          <h3>💎 Gems</h3>
          <p>Earned from missions, achievements and rare gems in flight. They buy cosmetics only, never stats.</p>
        </section>
        <section>
          <h3>📏 How payout works</h3>
          <ul>
            <li>Each level has a target distance you are paid for in full.</li>
            <li>Past the target each meter pays half, then (beyond 2× target) a quarter.</li>
            <li>Distance pay stops growing at 3× the target’s pay, so flying further mostly counts for your high score and the leaderboard.</li>
            <li>Coins 🪙 and the completion bonus are paid on top.</li>
          </ul>
        </section>
        <section>
          <h3>🎮 Controls</h3>
          <table className="keys">
            <tbody>
              <tr>
                <td>← → / drag</td>
                <td>Steer</td>
              </tr>
              <tr>
                <td>↑ / ▲</td>
                <td>Full throttle · triple-tap ▲ for fast mode, ▼ cancels it</td>
              </tr>
              <tr>
                <td>↓ / ▼</td>
                <td>Brake</td>
              </tr>
              <tr>
                <td>Space / ⚡</td>
                <td>Turbo (uses a little fuel)</td>
              </tr>
              <tr>
                <td>F / 🔫</td>
                <td>Fire (Level 2+)</td>
              </tr>
              <tr>
                <td>Esc / ⏸</td>
                <td>Pause or end the flight</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>🛠️ Hangar bays</h3>
          <p>Each bay holds one rocket. Build more bays (from {money(economy.bayPrices[0])}) to keep several rockets and switch between them.</p>
        </section>
        <section>
          <h3>📅 Daily missions</h3>
          <p>{MISSIONS_PER_DAY} new missions every day pay gems. Claim them on the Missions screen.</p>
        </section>
        {done && (
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onClose();
              setTour(0);
            }}
            data-testid="replay-tutorial"
          >
            🧑‍🚀 Replay tutorial
          </button>
        )}
        <p className="muted small guide-version">
          Version {__APP_VERSION__}
          {ENV_LABEL}
        </p>
      </div>
    </div>,
    document.body,
  );
}
