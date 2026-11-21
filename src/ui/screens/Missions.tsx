import { achievements } from '../../data';
import { useGame } from '../../state/game';
import { progressSnapshot, tutorialDone } from '../../state/selectors';
import { Bar, cx, GateButton } from '../components/common';
import { celebrate } from '../components/Confetti';

export function Missions() {
  const save = useGame((s) => s.save);
  const claim = useGame((s) => s.claimMission);
  const snapshot = progressSnapshot(save);
  const unlocked = new Set(save.achievements);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const hours = Math.ceil((midnight.getTime() - now.getTime()) / 3_600_000);

  return (
    <div className="screen missions">
      <section className="card">
        <h2>Daily missions</h2>
        <p className="muted">
          Complete missions to earn 💎 gems for rocket cosmetics. New missions in {hours} h.
        </p>
        {!tutorialDone(save) || !save.missions ? (
          <p className="muted">Finish the tutorial to get your first missions.</p>
        ) : (
          <ul className="mission-list" data-testid="missions">
            {save.missions.list.map((m) => {
              const done = m.progress >= m.target;
              return (
                <li key={m.id} className={cx('mission', done && 'done', m.claimed && 'claimed')} data-testid={`mission-${m.id}`}>
                  <div className="mission-text">
                    <strong>{m.text}</strong>
                    <Bar value={m.progress} max={m.target} color={done ? '#4ade80' : '#38bdf8'} label={m.text} />
                    <small>
                      {m.progress.toLocaleString('en-US')} / {m.target.toLocaleString('en-US')}
                    </small>
                  </div>
                  <GateButton
                    action={`claim:${m.id}`}
                    onClick={() => {
                      claim(m.id);
                      celebrate();
                    }}
                    disabled={!done || m.claimed}
                    className="small primary"
                    testId={`claim-${m.id}`}
                  >
                    {m.claimed ? 'Claimed ✓' : `Claim ${m.gems} 💎`}
                  </GateButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>
          Achievements <small className="muted">{unlocked.size} / {achievements.length}</small>
        </h2>
        <ul className="achievement-grid">
          {achievements.map((a) => {
            const done = unlocked.has(a.id);
            const value = Math.min(a.threshold, snapshot[a.metric]);
            return (
              <li key={a.id} className={cx('achievement', done && 'done')} data-testid={`achievement-${a.id}`}>
                <span className="achievement-icon" aria-hidden>
                  {done ? '🏆' : '🔒'}
                </span>
                <div>
                  <strong>{a.name}</strong>
                  <small>{a.description}</small>
                  {!done && <Bar value={value} max={a.threshold} color="#a78bfa" label={a.name} />}
                </div>
                <span className="gems-reward">+{a.gems} 💎</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
