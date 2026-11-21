import { achievements, catalog, cosmetics, levels } from '../../data';
import { useGame } from '../../state/game';
import { rocketRanking } from '../../state/selectors';
import { useSession } from '../../state/session';
import { rocketLook, rocketSvg } from '../art/rocketArt';
import { cx, money, Svg } from '../components/common';
import { pilotLabel } from '../components/TopBar';

const n = (v: number) => Math.round(v).toLocaleString('en-US');

export function Profile() {
  const save = useGame((s) => s.save);
  const update = useGame((s) => s.updateSettings);
  const user = useSession((s) => s.user);
  const { stats } = save;
  const paint = cosmetics.find((c) => c.id === save.cosmetics.equipped.paint)?.color;
  const look = { ...rocketLook(save.rocket, catalog), paint, decal: save.cosmetics.equipped.decal };
  const bay = save.fleet[save.activeRocket];
  const earned = new Set(save.achievements);
  const facts: [string, string][] = [
    ['🚀 Flights', n(stats.flights)],
    ['📏 Total distance', `${n(stats.totalDistance)} m`],
    ['💵 Total earned', money(stats.totalEarned)],
    ['⭕ Hoops', n(stats.hoops)],
    ['💥 Obstacles destroyed', n(stats.destroyed)],
    ['🪙 Coins', n(stats.coins)],
    ['💎 Gems found', n(stats.gemsFound)],
    ['👹 Guardians', n(stats.guardians)],
    ['🏁 Levels completed', `${save.progress.completed.length} / ${levels.length}`],
    ['🎨 Cosmetics owned', `${save.cosmetics.owned.length} / ${cosmetics.length}`],
    ['🛠️ Hangar bays', n(save.fleet.length)],
  ];

  return (
    <div className="screen profile" data-testid="profile">
      <section className="card profile-card">
        <div className="profile-head">
          <span className="profile-avatar" aria-hidden>
            🧑‍🚀
          </span>
          <div className="profile-id">
            <h2>{pilotLabel(save.settings.pilotName, user?.email)}</h2>
            <p className="muted small">{user ? `Signed in as ${user.email}` : 'Playing as guest — progress is saved in this browser.'}</p>
          </div>
        </div>
        <label className="profile-name-field">
          <span className="muted small">Pilot name (shown on leaderboards)</span>
          <input
            type="text"
            maxLength={16}
            placeholder="Auto"
            value={save.settings.pilotName}
            onChange={(e) => update({ pilotName: e.target.value.replace(/[^\p{L}\p{N} _-]/gu, '') })}
            aria-label="Pilot name"
            data-testid="profile-name"
          />
        </label>
        <div className="profile-rocket">
          <Svg svg={rocketSvg(look, true)} className="rocket-preview" label="Your active rocket" />
          <p>
            <b>{bay?.name}</b>
            <br />
            <span className="muted small">★ {rocketRanking(save.rocket, save.upgrades)}</span>
          </p>
        </div>
      </section>

      <section className="card">
        <h2>Statistics</h2>
        <dl className="profile-stats" data-testid="profile-stats">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <h3>Best per level</h3>
        <ul className="profile-best">
          {levels.map((level) => {
            const best = save.progress.best[level.id];
            return (
              <li key={level.id} className={cx(save.progress.completed.includes(level.id) && 'done')}>
                <span>
                  {level.id}. {level.name}
                </span>
                <b>{best === undefined ? '—' : `${n(best)} m`}</b>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2>
          Achievements{' '}
          <small className="muted">
            {achievements.filter((a) => earned.has(a.id)).length} / {achievements.length}
          </small>
        </h2>
        <ul className="profile-achievements">
          {achievements.map((a) => (
            <li key={a.id} className={cx(earned.has(a.id) && 'done')} title={a.description}>
              <span aria-hidden>{earned.has(a.id) ? '🏆' : '🔒'}</span> {a.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
