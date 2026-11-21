import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, MAX_UPGRADE, RARITIES, STAT_KEYS, type Category, type Part } from '../../core/parts/parts';
import { missingSlots, rocketParts, rocketStats, SLOTS, type Rocket } from '../../core/rocket/rocket';
import { catalog, cosmetics, economy, journeyConfig } from '../../data';
import { bayPrice, hangarState } from '../../engines/builder/builder';
import { deriveFlightStats } from '../../engines/journey/config';
import { sellPrice, upgradeCost } from '../../engines/shop/shop';
import { useGame } from '../../state/game';
import { fleetRockets, levelById, rankingWith, rocketRanking, tutorialDone } from '../../state/selectors';
import { rocketLook, rocketSvg } from '../art/rocketArt';
import { CATEGORY_LABELS, cx, GateButton, money, PartIcon, RarityTag, STAT_LABELS, Svg } from '../components/common';
import './hangar.css';

type SortKey = 'gain' | 'rarity' | 'name' | 'price';

const SORT_LABELS: Record<SortKey, string> = {
  gain: 'Ranking gain',
  rarity: 'Rarity',
  name: 'Name',
  price: 'Sell price',
};

/** Hull paint and decal the player has equipped, applied to every rocket drawing. */
function useCosmeticLook() {
  const equipped = useGame((s) => s.save.cosmetics.equipped);
  return { paint: cosmetics.find((c) => c.id === equipped.paint)?.color, decal: equipped.decal };
}

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

/** One card per hangar bay: switch rockets, rename the active one, buy more bays. */
function BayBar() {
  const save = useGame((s) => s.save);
  const { buyBay, switchRocket, renameRocket } = useGame.getState();
  const look = useCosmeticLook();
  const [draft, setDraft] = useState<string | null>(null);
  // Enter/Escape close the input; the blur that may follow its removal must not save again.
  const closed = useRef(false);
  const price = bayPrice(save.fleet.length, economy.bayPrices);
  // On a phone the bar scrolls sideways: keep the active rocket in view after switching.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.querySelector('.bay.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [save.activeRocket]);

  const startRename = (name: string) => {
    closed.current = false;
    setDraft(name);
  };
  const finishRename = (keep: boolean) => {
    if (closed.current) return;
    closed.current = true;
    if (keep && draft !== null) renameRocket(save.activeRocket, draft);
    setDraft(null);
  };

  return (
    <section className="card bays-card" aria-label="Hangar bays">
      <div className="bays-head">
        <h2>Hangar bays</h2>
        <p className="muted">Each prebuilt rocket needs its own bay. Parts in your inventory are shared.</p>
      </div>
      <ul className="bays" ref={list}>
        {fleetRockets(save).map((bay, i) => {
          const active = i === save.activeRocket;
          const empty = Object.keys(bay.parts).length === 0;
          const thumb = (
            <Svg svg={rocketSvg({ ...rocketLook(bay.parts, catalog), ...look }, true)} className="bay-thumb" label={`${bay.name} thumbnail`} />
          );
          return (
            <li key={i} className={cx('bay', active && 'active', empty && 'empty')}>
              {active && draft !== null ? (
                <div className="bay-select editing">
                  {thumb}
                  <input
                    className="bay-rename"
                    data-testid="rename-input"
                    aria-label="Rocket name"
                    value={draft}
                    maxLength={20}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => finishRename(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename(true);
                      if (e.key === 'Escape') finishRename(false);
                    }}
                  />
                </div>
              ) : (
                <>
                  <GateButton action={`rocket:${i}`} onClick={() => switchRocket(i)} className="bay-select" testId={`bay-${i}`} title={active ? 'Rocket in use' : `Switch to ${bay.name}`}>
                    {thumb}
                    <span className="bay-info">
                      <span className="bay-name">{bay.name}</span>
                      <span className="bay-meta">{empty ? 'Empty bay' : `★ ${rocketRanking(bay.parts, save.upgrades)}`}</span>
                      {active && <span className="bay-active">Active</span>}
                    </span>
                  </GateButton>
                  {active && (
                    <GateButton action={`rename:${i}`} onClick={() => startRename(bay.name)} className="bay-edit ghost" title="Rename this rocket" testId="rename-rocket">
                      ✏️
                    </GateButton>
                  )}
                </>
              )}
            </li>
          );
        })}
        <li className="bay bay-buy">
          {price === null ? (
            <span className="muted bay-full">All bays built</span>
          ) : (
            <GateButton action="buyBay" onClick={buyBay} disabled={save.cash < price} className="bay-buy-btn" title="A new bay for another rocket" testId="buy-bay">
              + Buy bay ({money(price)})
            </GateButton>
          )}
        </li>
      </ul>
    </section>
  );
}

/** Slots whose part differs between two rockets. */
function changedSlots(before: Rocket, after: Rocket): Category[] {
  return SLOTS.map((s) => s.category).filter((c) => before[c] !== after[c]);
}

export function Hangar() {
  const save = useGame((s) => s.save);
  const { equip, unequip, sellPart, launch, navigate } = useGame.getState();
  const look = useCosmeticLook();
  const [sort, setSort] = useState<SortKey>('gain');
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [onlyBetter, setOnlyBetter] = useState(false);

  // Equip feedback: when the rocket changes, replay a ~0.5 s animation on the changed slots and
  // the preview. `fx.n` keys the animated elements so each change restarts their CSS animation.
  const [seen, setSeen] = useState({ rocket: save.rocket, active: save.activeRocket });
  const [fx, setFx] = useState<{ n: number; slots: Category[] }>({ n: 0, slots: [] });
  if (seen.rocket !== save.rocket || seen.active !== save.activeRocket) {
    const slots = changedSlots(seen.rocket, save.rocket);
    setSeen({ rocket: save.rocket, active: save.activeRocket });
    if (slots.length > 0 || seen.active !== save.activeRocket) setFx({ n: fx.n + 1, slots });
  }

  const parts = rocketParts(save.rocket, catalog);
  const stats = rocketStats(parts, save.upgrades);
  const flight = deriveFlightStats(stats, journeyConfig, true);
  const state = hangarState(save.rocket);
  const missing = missingSlots(save.rocket);
  const level = levelById(save.selectedLevel);
  const ranking = rocketRanking(save.rocket, save.upgrades);
  const bays = tutorialDone(save);

  const owned = Object.entries(save.inventory)
    .map(([id, count]) => ({ part: catalog.get(id)!, count }))
    .filter((x) => x.part)
    .map((x) => ({ ...x, delta: rankingWith(save.rocket, x.part, save.upgrades) - ranking, sell: sellPrice(x.part, economy.sellBackFactor) }));
  const present = CATEGORIES.filter((c) => owned.some((x) => x.part.category === c));
  const category = filter !== 'all' && present.includes(filter) ? filter : 'all';
  const rarity = (p: Part) => RARITIES.indexOf(p.rarity);
  const shown = owned
    .filter((x) => (category === 'all' || x.part.category === category) && (!onlyBetter || x.delta > 0))
    .sort((a, b) => {
      const byName = a.part.name.localeCompare(b.part.name);
      if (sort === 'gain') return b.delta - a.delta || rarity(b.part) - rarity(a.part) || byName;
      if (sort === 'rarity') return rarity(b.part) - rarity(a.part) || byName;
      if (sort === 'price') return b.sell - a.sell || byName;
      return byName;
    });

  const remove = (slot: Category) => unequip(slot);

  return (
    <div className={cx('screen hangar', bays && 'with-bays')}>
      {bays && <BayBar />}

      <section className="card rocket-card">
        <h2>Your Rocket</h2>
        <div key={fx.n} className={cx('preview-wrap', fx.n > 0 && 'fx-bounce')}>
          <Svg svg={rocketSvg({ ...rocketLook(save.rocket, catalog), ...look }, true)} className="rocket-preview" label="Rocket preview" />
        </div>
        <div className="ranking-big" data-testid="hangar-ranking">
          <span>Ranking</span>
          <strong key={fx.n} className={cx(fx.n > 0 && 'fx-pop')}>
            ★ {ranking}
          </strong>
        </div>
        <dl className="stat-grid" data-testid="stat-grid">
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
            const changed = fx.slots.includes(category);
            return (
              <li
                key={changed ? `${category}-${fx.n}` : category}
                className={cx('slot', part && 'filled', changed && (part ? 'fx-in' : 'fx-out'))}
                data-testid={`slot-${category}`}
              >
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
                    <GateButton action={`unequip:${category}`} onClick={() => remove(category)} className="small ghost">
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
          <>
            <div className="inv-controls">
              <div className="chips inv-filters" role="group" aria-label="Filter by part type">
                <button type="button" className={cx('chip', category === 'all' && 'active')} aria-pressed={category === 'all'} onClick={() => setFilter('all')} data-testid="inv-filter-all">
                  All
                </button>
                {present.map((c) => (
                  <button key={c} type="button" className={cx('chip', category === c && 'active')} aria-pressed={category === c} onClick={() => setFilter(c)} data-testid={`inv-filter-${c}`}>
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
              <div className="inv-options">
                <label className="inv-sort">
                  <span>Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} data-testid="inv-sort">
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                      <option key={k} value={k}>
                        {SORT_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={cx('chip toggle', onlyBetter && 'active')}>
                  <input type="checkbox" checked={onlyBetter} onChange={(e) => setOnlyBetter(e.target.checked)} data-testid="inv-only-better" />
                  Only upgrades
                </label>
              </div>
            </div>
            {shown.length === 0 ? (
              <div className="inv-empty" data-testid="inv-empty">
                <span aria-hidden>🔭</span>
                <p>{onlyBetter ? 'No spare part here would raise your ranking. Your rocket is already in great shape!' : 'No parts match this filter.'}</p>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => {
                    setFilter('all');
                    setOnlyBetter(false);
                  }}
                >
                  Show all parts
                </button>
              </div>
            ) : (
              <ul className="inventory">
                {shown.map(({ part, count, delta, sell }) => (
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
                      Sell {money(sell)}
                    </GateButton>
                  </li>
                ))}
              </ul>
            )}
          </>
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
