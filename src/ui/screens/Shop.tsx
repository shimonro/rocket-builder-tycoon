import { useState } from 'react';
import { CATEGORIES, RARITIES, STAT_KEYS, effectiveStat, isSpecialist, type Category, type Part, type Rarity } from '../../core/parts/parts';
import { rocketParts, rocketStats, ranking, type Rocket } from '../../core/rocket/rocket';
import { catalog, cosmetics, economy, prebuilts, rankingWeights } from '../../data';
import { emptyBay } from '../../engines/builder/builder';
import { COSMETIC_TYPES } from '../../engines/progression/progression';
import { listParts, partLock, rarityFromLevel, sortParts, type PartSort } from '../../engines/shop/shop';
import { useGame } from '../../state/game';
import { rankingWith, rocketRanking, shopAccess, tutorialDone } from '../../state/selectors';
import { decalCloseupSvg, RARITY_COLORS, rocketLook, rocketSvg, type RocketLook } from '../art/rocketArt';
import { CATEGORY_LABELS, cx, GateButton, money, PartIcon, RarityTag, STAT_LABELS, Svg } from '../components/common';
import { Compare, type CompareSide } from '../components/Compare';
import './shop.css';

const LOCK_TEXT = {
  prebuilt_only: 'Prebuilt only',
  category_locked: 'Unlocks with Level 2',
} as const;

/** What each part type adds to the rocket. */
const CATEGORY_HELP: Record<Category, string> = {
  body: 'Hull: how many hits you survive, plus a little efficiency.',
  fuel_tank: 'Fuel: more fuel means more range.',
  engine: 'Thrust: sets top speed. Heavier rockets are slower.',
  booster: 'Extra thrust for more speed. Optional.',
  fins: 'Handling: how fast you steer.',
  shield: 'Absorbs damage before the hull. Level 2+.',
  weapon: 'Shoots obstacles with F, X or Enter. Level 2+.',
};

const SORTS: { value: PartSort; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
  { value: 'ranking', label: 'Ranking gain' },
  { value: 'rarity', label: 'Rarity' },
];

const COSMETIC_HEADINGS = { paint: 'Hull paint', flame: 'Engine flame', trail: 'Smoke trail', decal: 'Flags & logos' } as const;

/** Category name with an ⓘ that explains it: hover on desktop, tap (focus) on phones. */
function CategoryHelp({ category }: { category: Category }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cx('cat-help', open && 'open')}>
      {CATEGORY_LABELS[category]}{' '}
      <button
        type="button"
        className="help-dot"
        aria-label={`What does a ${CATEGORY_LABELS[category].toLowerCase()} do?`}
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
      >
        ⓘ
      </button>
      <span className="help-tip" role="tooltip">
        {CATEGORY_HELP[category]}
      </span>
    </span>
  );
}

/** A decal on the rocket: the whole rocket plus a close-up of the badge. */
function DecalPreview({ look, label }: { look: RocketLook; label?: string }) {
  return (
    <span className="decal-preview">
      <Svg svg={rocketSvg(look)} className="cosmetic-art" />
      <Svg svg={decalCloseupSvg(look)} className="decal-closeup" label={label} />
    </span>
  );
}

/** First game level at which any of these parts can be bought. */
function unlockLevel(parts: Part[]): number | null {
  if (parts.length === 0) return null;
  return Math.min(...parts.map((p) => Math.max(p.level * 2 - 1, ['shield', 'weapon'].includes(p.category) ? economy.shieldsAndWeaponsFromLevel : 1)));
}

export function Shop() {
  const save = useGame((s) => s.save);
  const { buyPart, buyPrebuilt, buyCosmetic, equipCosmetic } = useGame.getState();
  const [tab, setTab] = useState<'parts' | 'prebuilts' | 'cosmetics'>('parts');
  const [category, setCategory] = useState<Category | undefined>();
  const [rarity, setRarity] = useState<Rarity | undefined>();
  const [showLocked, setShowLocked] = useState(false);
  const [sort, setSort] = useState<PartSort>('default');
  const [compare, setCompare] = useState<{ title: string; before: CompareSide; after: CompareSide; note?: string } | null>(null);
  const access = shopAccess(save);
  const free = tutorialDone(save);
  // During the tutorial the shop shows only the category of the part being taught.
  const step = save.tutorialStep;
  const forced = step.startsWith('buy_') ? (step.slice(4) as Category) : undefined;
  const shownCategory = free ? category : forced;
  const shownRarity = free ? rarity : undefined;
  const current = rocketRanking(save.rocket, save.upgrades);
  const gain = (part: Part) => rankingWith(save.rocket, part, save.upgrades) - current;
  const matching = listParts(catalog, CATEGORIES, { category: shownCategory, rarity: shownRarity });
  const parts = sortParts(
    matching.filter((p) => showLocked || partLock(p, access) === null),
    free ? sort : 'default',
    gain,
  );
  const look = rocketLook(save.rocket, catalog);
  const paint = cosmetics.find((c) => c.id === save.cosmetics.equipped.paint)?.color;
  const yours: CompareSide = { label: 'Your rocket', rocket: save.rocket };

  const emptyNote = () => {
    const what = [shownRarity, shownCategory && CATEGORY_LABELS[shownCategory].toLowerCase()].filter(Boolean).join(' ');
    const from = shownCategory || !shownRarity ? unlockLevel(matching) : rarityFromLevel(catalog, shownRarity);
    if (showLocked || from === null || from <= access.highestUnlocked) return `No ${what} parts in the shop right now.`;
    return `No ${what} parts yet — they reach the shop at Level ${from}. Tick “Show locked” to preview them.`;
  };

  return (
    <div className="screen shop">
      <div className="tabs">
        <button type="button" className={cx('tab', tab === 'parts' && 'active')} onClick={() => setTab('parts')}>
          Parts
        </button>
        <button type="button" disabled={!free} className={cx('tab', tab === 'prebuilts' && 'active')} onClick={() => setTab('prebuilts')} data-testid="tab-prebuilts">
          Prebuilt rockets
        </button>
        <button type="button" disabled={!free} className={cx('tab', tab === 'cosmetics' && 'active')} onClick={() => setTab('cosmetics')} data-testid="tab-cosmetics">
          💎 Cosmetics
        </button>
      </div>

      {tab === 'cosmetics' ? (
        <div className="cosmetics">
          <p className="muted">
            Cosmetics change only how your rocket looks. Pay with 💎 gems from daily missions and achievements — you have {save.gems} 💎.
          </p>
          {COSMETIC_TYPES.map((type) => (
            <section key={type}>
              <h3 className="cosmetic-heading">{COSMETIC_HEADINGS[type]}</h3>
              <ul className={cx('grid cosmetic-grid', type === 'decal' && 'decal-grid')}>
                <li className={cx('card cosmetic-card', !save.cosmetics.equipped[type] && 'selected')}>
                  {type === 'decal' ? (
                    <DecalPreview look={{ ...look, body: look.body ?? '#94a3b8', paint }} />
                  ) : (
                    <span className="swatch default" />
                  )}
                  <h4>{type === 'decal' ? 'None' : 'Standard'}</h4>
                  <button type="button" className="btn small ghost" disabled={!save.cosmetics.equipped[type]} onClick={() => equipCosmetic(type, null)}>
                    {save.cosmetics.equipped[type] ? 'Use' : 'In use'}
                  </button>
                </li>
                {cosmetics
                  .filter((c) => c.type === type)
                  .map((c) => {
                    const owned = save.cosmetics.owned.includes(c.id);
                    const equipped = save.cosmetics.equipped[type] === c.id;
                    return (
                      <li key={c.id} className={cx('card cosmetic-card', equipped && 'selected')} data-testid={`cosmetic-${c.id}`}>
                        {type === 'paint' ? (
                          <Svg svg={rocketSvg({ ...look, body: look.body ?? '#94a3b8', paint: c.color })} className="cosmetic-art" />
                        ) : type === 'decal' ? (
                          <DecalPreview look={{ ...look, body: look.body ?? '#94a3b8', paint, decal: c.id }} label={c.name} />
                        ) : (
                          <span className={cx('swatch', c.color === 'rainbow' && 'rainbow')} style={c.color === 'rainbow' ? undefined : { background: c.color }} />
                        )}
                        <h4>{c.name}</h4>
                        {owned ? (
                          <button type="button" className="btn small ghost" disabled={equipped} onClick={() => equipCosmetic(type, c.id)}>
                            {equipped ? 'In use' : 'Use'}
                          </button>
                        ) : (
                          <GateButton
                            action={`cosmetic:${c.id}`}
                            onClick={() => buyCosmetic(c.id)}
                            disabled={save.gems < c.price}
                            className="small primary"
                            testId={`buy-cosmetic-${c.id}`}
                          >
                            {c.price} 💎
                          </GateButton>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      ) : tab === 'parts' ? (
        <>
          <div className="filters" aria-label="Filters">
            <div className="chips">
              <button type="button" disabled={!free} className={cx('chip', !shownCategory && 'active')} onClick={() => setCategory(undefined)}>
                All
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!free}
                  className={cx('chip chip-help', shownCategory === c && 'active')}
                  title={CATEGORY_HELP[c]}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_LABELS[c]}
                  <span className="help-tip" aria-hidden>
                    {CATEGORY_HELP[c]}
                  </span>
                </button>
              ))}
            </div>
            <div className="chips">
              <button type="button" disabled={!free} className={cx('chip', !rarity && 'active')} onClick={() => setRarity(undefined)}>
                Any rarity
              </button>
              {RARITIES.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={!free}
                  className={cx('chip', rarity === r && 'active')}
                  style={{ color: RARITY_COLORS[r] }}
                  onClick={() => setRarity(r)}
                >
                  {r}
                </button>
              ))}
              <label className="chip toggle">
                <input type="checkbox" checked={showLocked} disabled={!free} onChange={(e) => setShowLocked(e.target.checked)} /> Show locked
              </label>
              <label className="chip sort-control">
                Sort
                <select value={sort} disabled={!free} onChange={(e) => setSort(e.target.value as PartSort)} data-testid="sort-parts">
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {parts.length === 0 && (
            <p className="card rarity-empty" data-testid="rarity-empty">
              {emptyNote()}
            </p>
          )}
          <ul className="grid parts-grid">
            {parts.map((part) => {
              const lock = partLock(part, access);
              const owned = save.inventory[part.id] ?? 0;
              const equipped = Object.values(save.rocket).includes(part.id);
              const delta = gain(part);
              return (
                <li key={part.id} className={cx('card part-card', lock && 'is-locked')} data-testid={`part-${part.id}`}>
                  <div className="part-head">
                    <PartIcon part={part} />
                    <div>
                      <h3>{part.name}</h3>
                      <small>
                        <CategoryHelp category={part.category} /> · Lv {part.level} · <RarityTag rarity={part.rarity} />
                      </small>
                      {isSpecialist(part) && (
                        <span className="specialist" title="Specialist: a big strength paid for with a penalty elsewhere">
                          ⚖️ Specialist
                        </span>
                      )}
                    </div>
                  </div>
                  <ul className="part-stats">
                    {STAT_KEYS.filter((k) => part[k] !== 0).map((k) => (
                      <li key={k} className={cx(part[k] < 0 && 'neg')}>
                        {STAT_LABELS[k]} <b>{Math.round(effectiveStat(part, k))}</b>
                      </li>
                    ))}
                    <li>
                      Mass <b>{part.mass}</b>
                    </li>
                  </ul>
                  <div className="part-foot">
                    <span className={delta > 0 ? 'delta up' : 'delta'}>
                      {delta > 0 ? `+${delta} ★ if mounted` : equipped ? 'Mounted' : `${delta} ★`}
                    </span>
                    {owned > 0 && <span className="owned">Owned ×{owned}</span>}
                  </div>
                  <div className="part-actions">
                    <button
                      type="button"
                      className="btn small ghost compare-btn"
                      onClick={() =>
                        setCompare({
                          title: `Compare: ${part.name}`,
                          before: { label: 'Current', rocket: save.rocket },
                          after: { label: `With ${part.name}`, rocket: { ...save.rocket, [part.category]: part.id } },
                        })
                      }
                      data-testid={`compare-${part.id}`}
                    >
                      Compare
                    </button>
                    <GateButton
                      action={`buy:${part.id}`}
                      onClick={() => buyPart(part.id)}
                      disabled={!!lock || save.cash < part.price}
                      className="primary buy"
                      testId={`buy-${part.id}`}
                    >
                      {lock === 'level_locked'
                        ? `🔒 Unlock level ${part.level * 2 - 1}`
                        : lock
                          ? `🔒 ${LOCK_TEXT[lock]}`
                          : `Buy ${money(part.price)}`}
                    </GateButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <ul className="grid prebuilt-grid">
          {prebuilts.map((p) => {
            const parts = p.parts.map((id) => catalog.get(id)!);
            const rocket: Rocket = Object.fromEntries(parts.map((x) => [x.category, x.id]));
            const rank = ranking(rocketStats(rocketParts(rocket, catalog)), rankingWeights);
            const locked = p.levelRequired > access.highestUnlocked;
            return (
              <li key={p.id} className={cx('card prebuilt-card', locked && 'is-locked')} data-testid={`prebuilt-${p.id}`}>
                <Svg svg={rocketSvg(rocketLook(rocket, catalog))} className="prebuilt-art" />
                <div>
                  <h3>{p.name}</h3>
                  <p className="muted">{p.description}</p>
                  <p>
                    Ranking <b>★ {rank}</b> · {parts.length} parts · ready to launch
                  </p>
                  <div className="prebuilt-actions">
                    <GateButton
                      action={`buyPrebuilt:${p.id}`}
                      onClick={() => buyPrebuilt(p.id)}
                      disabled={locked || save.cash < p.price}
                      className="primary"
                    >
                      {locked ? `🔒 Unlock level ${p.levelRequired}` : `Buy ${money(p.price)}`}
                    </GateButton>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() =>
                        setCompare({
                          title: `Compare: ${p.name}`,
                          before: yours,
                          after: { label: p.name, rocket },
                          note:
                            emptyBay({ rocket: save.rocket, fleet: save.fleet, active: save.activeRocket }) === null
                              ? 'Buying needs a free hangar bay, and yours are all full: build one in the Hangar or strip a rocket first.'
                              : 'Buying needs a free hangar bay — you have one, so it is assembled there.',
                        })
                      }
                      data-testid={`compare-prebuilt-${p.id}`}
                    >
                      Compare
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {compare && <Compare {...compare} upgrades={save.upgrades} onClose={() => setCompare(null)} />}
    </div>
  );
}
