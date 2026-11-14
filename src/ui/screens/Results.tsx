import { levels } from '../../data';
import { useGame } from '../../state/game';
import { levelById } from '../../state/selectors';
import { useSession } from '../../state/session';
import { GateButton, money } from '../components/common';

const REASONS = { destroyed: '💥 Destroyed', fuel: '⛽ Out of fuel', aborted: '🛑 Flight ended' };

export function Results() {
  const result = useGame((s) => s.lastResult);
  const next = useGame((s) => s.continueFromResults);
  const board = useSession((s) => s.leaderboard);
  const user = useSession((s) => s.user);
  const loginAvailable = useSession((s) => s.loginAvailable);
  if (!result) return null;
  const { payout } = result;
  const level = levelById(result.levelId);
  const nextLevel = levels.find((l) => l.id === level.id + 1);
  const newBest = payout.distance > result.previousBest && payout.distance > 0;
  const boardHere = board?.levelId === level.id ? board : null;

  return (
    <div className="screen results">
      <section className="card results-card" data-testid="results">
        <p className="eyebrow">
          Level {level.id}: {level.name} · {REASONS[result.endReason]}
        </p>
        <h2 className="big-distance" data-testid="result-distance">
          {payout.distance.toLocaleString()} m
        </h2>
        {result.targetReached && (
          <p className="success">{result.firstCompletion ? '🏁 Level complete! New levels can be unlocked.' : '🏁 Target reached again!'}</p>
        )}
        {newBest && !result.tutorial && <p className="muted">New personal best for this level — your ghost will race you next time 👻</p>}
        {result.achievements.length > 0 && (
          <ul className="earned" data-testid="earned-achievements">
            {result.achievements.map((a) => (
              <li key={a.id}>
                🏆 <b>{a.name}</b> — {a.description} <span className="gems-reward">+{a.gems} 💎</span>
              </li>
            ))}
          </ul>
        )}
        {!result.tutorial && boardHere && (
          <p className={boardHere.state === 'rejected' ? 'warn small' : 'muted small'} data-testid="leaderboard-status">
            {boardHere.state === 'submitting'
              ? '🏆 Verifying your run for the leaderboard…'
              : boardHere.state === 'accepted'
                ? `🏆 Verified! You are #${boardHere.rank} on the Level ${level.id} leaderboard.`
                : `Leaderboard: ${boardHere.message}`}
          </p>
        )}
        {!result.tutorial && newBest && loginAvailable && !user && <p className="muted small">Sign in to put your best runs on the leaderboards.</p>}
        <table className="breakdown">
          <tbody>
            <tr>
              <td>Paid distance{payout.effectiveDistance < payout.distance ? ' (reduced beyond target)' : ''}</td>
              <td>{Math.round(payout.effectiveDistance).toLocaleString()} m</td>
            </tr>
            <tr>
              <td>Rate</td>
              <td>{money(payout.multiplier * 100)} / 100 m</td>
            </tr>
            <tr>
              <td>Ranking bonus</td>
              <td>+{Math.round(payout.rankingBonus * 100)}%</td>
            </tr>
            <tr>
              <td>Distance pay{payout.capped ? ' (soft cap reached)' : ''}</td>
              <td>{money(payout.distancePay)}</td>
            </tr>
            {payout.coins > 0 && (
              <tr>
                <td>Coins ({payout.coins} 🪙)</td>
                <td>{money(payout.coinPay)}</td>
              </tr>
            )}
            {payout.completionBonus > 0 && (
              <tr>
                <td>Completion bonus</td>
                <td>{money(payout.completionBonus)}</td>
              </tr>
            )}
            <tr className="total">
              <td>Total payout</td>
              <td data-testid="payout-total">{money(payout.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          Hoops flown through: {result.hoops} · Obstacles blasted: {result.destroyed}
          {result.guardianDefeated && ' · Guardian destroyed!'}
        </p>
        <div className="results-actions">
          {result.tutorial ? (
            <GateButton action="continue" onClick={() => next('hangar')} className="primary" testId="continue">
              Continue
            </GateButton>
          ) : (
            <>
              <button type="button" className="btn primary" onClick={() => next('retry')} data-testid="retry">
                🚀 Fly again
              </button>
              <button type="button" className="btn ghost" onClick={() => next('shop')}>
                🛒 Shop
              </button>
              <button type="button" className="btn ghost" onClick={() => next('hangar')}>
                🛠️ Hangar
              </button>
              {nextLevel && (
                <button type="button" className="btn ghost" onClick={() => next('levels')} data-testid="to-levels">
                  🗺️ Level {nextLevel.id}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
