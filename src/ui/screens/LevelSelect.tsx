import { useEffect, useState } from 'react';
import { levels } from '../../data';
import type { Level } from '../../engines/levels/levels';
import type { LeaderboardEntry } from '../../services/persistence/supabase';
import { evaluateUnlock } from '../../engines/levels/levels';
import { useGame } from '../../state/game';
import { rocketRanking } from '../../state/selectors';
import { fetchLeaderboard, useSession } from '../../state/session';
import { cx, GateButton, money } from '../components/common';

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className={ok ? 'check ok' : 'check'}>{ok ? '✅' : '⬜'} {children}</li>;
}

function Leaderboard({ level, onClose }: { level: Level; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchLeaderboard(level.id).then(setRows, (e: Error) => setError(e.message));
  }, [level.id]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal leaderboard" role="dialog" aria-label={`Level ${level.id} leaderboard`} onClick={(e) => e.stopPropagation()} data-testid="leaderboard">
        <h2>🏆 Level {level.id}: {level.name}</h2>
        {error ? (
          <p className="warn">Could not load the leaderboard: {error}</p>
        ) : rows === null ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No verified runs yet. Be the first!</p>
        ) : (
          <ol className="board">
            {rows.map((r, i) => (
              <li key={r.userId} className={cx(r.userId === user?.id && 'me')}>
                <span className="rank">{i + 1}</span>
                <span className="name">{r.name}</span>
                <span className="dist">{r.distance.toLocaleString('en-US')} m</span>
              </li>
            ))}
          </ol>
        )}
        <p className="muted small">
          {user ? 'Every run is replayed on the server before it counts.' : 'Sign in to compete. Every run is replayed on the server before it counts.'}
        </p>
        <button type="button" className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function LevelSelect() {
  const save = useGame((s) => s.save);
  const { selectLevel, unlockLevel, navigate } = useGame.getState();
  const loginAvailable = useSession((s) => s.loginAvailable);
  const [board, setBoard] = useState<Level | null>(null);
  const ranking = rocketRanking(save.rocket, save.upgrades);
  return (
    <div className="screen levels">
      <h2 className="screen-title">Mission map</h2>
      <p className="muted">
        To unlock a level, complete the previous one, reach its rocket ranking (yours: ★ {ranking}) and pay the fee.
      </p>
      <ul className="grid level-grid">
        {levels.map((level) => {
          const check = evaluateUnlock(level, save.progress, ranking, save.cash);
          const unlocked = check.alreadyUnlocked;
          const completed = save.progress.completed.includes(level.id);
          const selected = save.selectedLevel === level.id;
          const best = save.progress.best[level.id];
          return (
            <li
              key={level.id}
              className={cx('card level-card', unlocked ? 'is-open' : 'is-locked', selected && 'selected')}
              style={{ ['--sky' as string]: level.skyColor }}
              data-testid={`level-${level.id}`}
            >
              <div className="level-head">
                <span className="level-num">{level.id}</span>
                <div>
                  <h3>{level.name}</h3>
                  <small>{completed ? '🏁 Completed' : unlocked ? 'Unlocked' : '🔒 Locked'}</small>
                </div>
              </div>
              <ul className="level-facts">
                <li>Target {level.targetDistance.toLocaleString()} m</li>
                <li>{money(level.payoutMultiplier * 100)} / 100 m</li>
                <li>Bonus {money(level.completionBonus)}</li>
                {best !== undefined && <li>Best {best.toLocaleString()} m</li>}
              </ul>
              {loginAvailable && (
                <button type="button" className="link board-link" onClick={() => setBoard(level)} data-testid={`board-${level.id}`}>
                  🏆 Leaderboard
                </button>
              )}
              {unlocked ? (
                <div className="level-actions">
                  <GateButton action={`select:${level.id}`} onClick={() => selectLevel(level.id)} disabled={selected} className="ghost">
                    {selected ? 'Selected' : 'Select'}
                  </GateButton>
                  <GateButton
                    action={`select:${level.id}`}
                    onClick={() => {
                      selectLevel(level.id);
                      navigate('hangar');
                    }}
                    className="primary"
                  >
                    Fly
                  </GateButton>
                </div>
              ) : (
                <>
                  <ul className="checklist">
                    <Check ok={check.previousCompleted}>Complete level {level.id - 1}</Check>
                    <Check ok={check.rankingMet}>Ranking ★ {level.minRanking}</Check>
                    <Check ok={check.canAfford}>Fee {money(level.unlockFee)}</Check>
                  </ul>
                  <GateButton
                    action={`unlock:${level.id}`}
                    onClick={() => unlockLevel(level.id)}
                    disabled={!check.canUnlock}
                    className="primary"
                    testId={`unlock-${level.id}`}
                  >
                    Unlock for {money(level.unlockFee)}
                  </GateButton>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {board && <Leaderboard level={board} onClose={() => setBoard(null)} />}
    </div>
  );
}
