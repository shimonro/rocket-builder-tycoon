import { MAX_UPGRADE, STAT_KEYS, type Category, type Part } from '../../core/parts/parts';
import { missingSlots, rocketParts, rocketStats, SLOTS } from '../../core/rocket/rocket';
import { catalog, cosmetics, economy, journeyConfig } from '../../data';
import { hangarState } from '../../engines/builder/builder';
import { deriveFlightStats } from '../../engines/journey/config';
import { sellPrice, upgradeCost } from '../../engines/shop/shop';
import { useGame } from '../../state/game';
import { levelById, rankingWith, rocketRanking, tutorialDone } from '../../state/selectors';
import { rocketLook, rocketSvg } from '../art/rocketArt';
import { CATEGORY_LABELS, GateButton, money, PartIcon, RarityTag, STAT_LABELS, Svg } from '../components/common';

function UpgradeButton({ part }: { part: Part }) {
  const save = useGame((s) => s.save);
  const upgrade = useGame((s) => s.upgradePart);
  const level = save.upgrades[part.id] ?? 0;
  const cost = upgradeCost(part, level, economy.upgradeCostFactor);
  return (
    <GateButton
      action={`upgrade:${part.id}`}
      onClick={() => upgrade(part.id)}
      disabled={cost === null || save.cash < cost}
      className="small ghost upgrade"
      title="Each upgrade adds 10% to all of this part's stats"
      testId={`upgrade-${part.id}`}
    >
      {cost === null ? 'Max ⬆' : `⬆ ${money(cost)}`}
    </GateButton>
  );
}

function UpgradeLevel({ level }: { level: number }) {
  if (level === 0) return null;
  return (
    <span className="upgrade-level" title={`Upgraded +${level * 10}%`}>
      {'▲'.repeat(level)}
      {'△'.repeat(MAX_UPGRADE - level)}
    </span>
  );
}

export function Hangar() {
  const save = useGame((s) => s.save);
  const { equip, unequip, sellPart, launch, navigate } = useGame.getState();
  const parts = rocketParts(save.rocket, catalog);
  const stats = rocketStats(parts, save.upgrades);
  const paint = cosmetics.find((c) => c.id === save.cosmetics.equipped.paint)?.color;
  const flight = deriveFlightStats(stats, journeyConfig, true);
  const state = hangarState(save.rocket);
  const missing = missingSlots(save.rocket);
  const level = levelById(save.selectedLevel);
  const ranking = rocketRanking(save.rocket, save.upgrades);
  const owned = Object.entries(save.inventory)
    .map(([id, count]) => ({ part: catalog.get(id)!, count }))
    .filter((x) => x.part)
    .sort((a, b) => SLOTS.findIndex((s) => s.category === a.part.category) - SLOTS.findIndex((s) => s.category === b.part.category));

  return (
    <div className="screen hangar">
      <section className="card rocket-card">
        <h2>Your Rocket</h2>
        <Svg svg={rocketSvg({ ...rocketLook(save.rocket, catalog), paint }, true)} className="rocket-preview" label="Rocket preview" />
        <div className="ranking-big" data-testid="hangar-ranking">
          <span>Ranking</span>
          <strong>★ {ranking}</strong>
        </div>
        <dl className="stat-grid">
          {STAT_KEYS.map((k) => (
            <div key={k}>
              <dt>{STAT_LABELS[k]}</dt>
              <dd>{Math.round(stats[k])}</dd>
            </div>
          ))}
          <div>
            <dt>Mass</dt>
            <dd>{Math.round(stats.mass)}</dd>
          </div>
          <div>
            <dt>Top speed</dt>
            <dd>{state === 'ready' ? `${Math.round(flight.maxSpeed)} m/s` : '—'}</dd>
          </div>
          <div>
            <dt>Est. range</dt>
            <dd>{state === 'ready' ? `${Math.round((flight.fuelCapacity / flight.burnRate) * flight.maxSpeed)} m` : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="card slots-card">
        <h2>Assembly</h2>
        <ul className="slots">
          {SLOTS.map(({ category, required }) => {
            const id = save.rocket[category];
            const part = id ? catalog.get(id) : undefined;
            return (
              <li key={category} className={part ? 'slot filled' : 'slot'} data-testid={`slot-${category}`}>
                <span className="slot-label">
                  {CATEGORY_LABELS[category]}
                  {required && <em> required</em>}
                </span>
                {part ? (
                  <>
                    <PartIcon part={part} size={36} />
                    <span className="slot-part">
                      {part.name} <RarityTag rarity={part.rarity} /> <UpgradeLevel level={save.upgrades[part.id] ?? 0} />
                    </span>
                    {tutorialDone(save) && <UpgradeButton part={part} />}
                    <GateButton action={`unequip:${category}`} onClick={() => unequip(category as Category)} className="small ghost">
                      Remove
                    </GateButton>
                  </>
                ) : (
                  <span className="slot-empty">Empty</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card inventory-card">
        <h2>Inventory</h2>
        {owned.length === 0 ? (
          <p className="muted">
            No spare parts.{' '}
            {tutorialDone(save) && (
              <button type="button" className="link" onClick={() => navigate('shop')}>
                Visit the shop
              </button>
            )}
          </p>
        ) : (
          <ul className="inventory">
            {owned.map(({ part, count }) => {
              const delta = rankingWith(save.rocket, part, save.upgrades) - ranking;
              return (
                <li key={part.id} className="inv-item" data-testid={`inv-${part.id}`}>
                  <PartIcon part={part} size={36} />
                  <span className="inv-name">
                    {part.name} {count > 1 && <b>×{count}</b>} <UpgradeLevel level={save.upgrades[part.id] ?? 0} />
                    <small>
                      {CATEGORY_LABELS[part.category]} · <RarityTag rarity={part.rarity} />
                      <span className={delta >= 0 ? 'delta up' : 'delta down'}>
                        {delta >= 0 ? '+' : ''}
                        {delta} ★
                      </span>
                    </small>
                  </span>
                  <GateButton action={`equip:${part.id}`} onClick={() => equip(part.id)} className="small primary" testId={`equip-${part.id}`}>
                    Mount
                  </GateButton>
                  <GateButton action={`sell:${part.id}`} onClick={() => sellPart(part.id)} className="small ghost" title="Sell for half price">
                    Sell {money(sellPrice(part, economy.sellBackFactor))}
                  </GateButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card mission-card">
        <div>
          <h2>
            Level {level.id}: {level.name}
          </h2>
          <p className="muted">
            Target {level.targetDistance.toLocaleString()} m · {money(level.payoutMultiplier * 100)} per 100 m
            {save.progress.best[level.id] ? ` · Best ${save.progress.best[level.id].toLocaleString()} m` : ''}
          </p>
          {missing.length > 0 && <p className="warn">Missing: {missing.map((c) => CATEGORY_LABELS[c]).join(', ')}</p>}
        </div>
        <div className="mission-actions">
          {tutorialDone(save) && (
            <button type="button" className="btn ghost" onClick={() => navigate('levels')}>
              Change level
            </button>
          )}
          <GateButton action="launch" onClick={launch} disabled={state !== 'ready'} className="primary launch" testId="launch">
            🚀 Launch
          </GateButton>
        </div>
      </section>
    </div>
  );
}
