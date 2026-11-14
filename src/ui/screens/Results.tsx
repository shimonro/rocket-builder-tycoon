import { levels } from '../../data';
import { useGame } from '../../state/game';
import { levelById } from '../../state/selectors';
import { GateButton, money } from '../components/common';

const REASONS = { destroyed: '💥 Destroyed', fuel: '⛽ Out of fuel', aborted: '🛑 Flight ended' };

export function Results() {
  const result = useGame((s) => s.lastResult);
  const save = useGame((s) => s.save);
  const next = useGame((s) => s.continueFromResults);
  if (!result) return null;
  const { payout } = result;
  const level = levelById(result.levelId);
  const nextLevel = levels.find((l) => l.id === level.id + 1);
  const best = save.progress.best[level.id] ?? 0;

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
        {payout.distance >= best && payout.distance > 0 && <p className="muted">New personal best for this level</p>}
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
