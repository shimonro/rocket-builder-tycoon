import { useState } from 'react';
import { CATEGORIES, RARITIES, STAT_KEYS, effectiveStat, type Category, type Rarity } from '../../core/parts/parts';
import { rocketParts, rocketStats, ranking } from '../../core/rocket/rocket';
import { catalog, prebuilts, rankingWeights } from '../../data';
import { listParts, partLock } from '../../engines/shop/shop';
import { useGame } from '../../state/game';
import { rankingWith, rocketRanking, shopAccess, tutorialDone } from '../../state/selectors';
import { RARITY_COLORS, rocketLook, rocketSvg } from '../art/rocketArt';
import { CATEGORY_LABELS, cx, GateButton, money, PartIcon, RarityTag, STAT_LABELS, Svg } from '../components/common';

const LOCK_TEXT = {
  prebuilt_only: 'Prebuilt only',
  category_locked: 'Unlocks with Level 2',
} as const;

export function Shop() {
  const save = useGame((s) => s.save);
  const { buyPart, buyPrebuilt } = useGame.getState();
  const [tab, setTab] = useState<'parts' | 'prebuilts'>('parts');
  const [category, setCategory] = useState<Category | undefined>();
  const [rarity, setRarity] = useState<Rarity | undefined>();
  const [showLocked, setShowLocked] = useState(false);
  const access = shopAccess(save);
  const free = tutorialDone(save);
  // During the tutorial the shop shows only the category of the part being taught.
  const step = save.tutorialStep;
  const forced = step.startsWith('buy_') ? (step.slice(4) as Category) : undefined;
  const shownCategory = free ? category : forced;
  const parts = listParts(catalog, CATEGORIES, { category: shownCategory, rarity: free ? rarity : undefined }).filter(
    (p) => showLocked || partLock(p, access) === null,
  );
  const current = rocketRanking(save.rocket);

  return (
    <div className="screen shop">
      <div className="tabs">
        <button type="button" className={cx('tab', tab === 'parts' && 'active')} onClick={() => setTab('parts')}>
          Parts
        </button>
        <button type="button" disabled={!free} className={cx('tab', tab === 'prebuilts' && 'active')} onClick={() => setTab('prebuilts')} data-testid="tab-prebuilts">
          Prebuilt rockets
        </button>
      </div>

      {tab === 'parts' ? (
        <>
          <div className="filters" aria-label="Filters">
            <div className="chips">
              <button type="button" disabled={!free} className={cx('chip', !shownCategory && 'active')} onClick={() => setCategory(undefined)}>
                All
              </button>
              {CATEGORIES.map((c) => (
                <button key={c} type="button" disabled={!free} className={cx('chip', shownCategory === c && 'active')} onClick={() => setCategory(c)}>
                  {CATEGORY_LABELS[c]}
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
            </div>
          </div>
          <ul className="grid parts-grid">
            {parts.map((part) => {
              const lock = partLock(part, access);
              const owned = save.inventory[part.id] ?? 0;
              const equipped = Object.values(save.rocket).includes(part.id);
              const delta = rankingWith(save.rocket, part) - current;
              return (
                <li key={part.id} className={cx('card part-card', lock && 'is-locked')} data-testid={`part-${part.id}`}>
                  <div className="part-head">
                    <PartIcon part={part} />
                    <div>
                      <h3>{part.name}</h3>
                      <small>
                        {CATEGORY_LABELS[part.category]} · Lv {part.level} · <RarityTag rarity={part.rarity} />
                      </small>
                    </div>
                  </div>
                  <ul className="part-stats">
                    {STAT_KEYS.filter((k) => part[k] !== 0).map((k) => (
                      <li key={k}>
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
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <ul className="grid prebuilt-grid">
          {prebuilts.map((p) => {
            const parts = p.parts.map((id) => catalog.get(id)!);
            const rank = ranking(rocketStats(rocketParts(Object.fromEntries(parts.map((x) => [x.category, x.id])), catalog)), rankingWeights);
            const locked = p.levelRequired > access.highestUnlocked;
            return (
              <li key={p.id} className={cx('card prebuilt-card', locked && 'is-locked')} data-testid={`prebuilt-${p.id}`}>
                <Svg svg={rocketSvg(rocketLook(Object.fromEntries(parts.map((x) => [x.category, x.id])), catalog))} className="prebuilt-art" />
                <div>
                  <h3>{p.name}</h3>
                  <p className="muted">{p.description}</p>
                  <p>
                    Ranking <b>★ {rank}</b> · {parts.length} parts · ready to launch
                  </p>
                  <GateButton
                    action={`buyPrebuilt:${p.id}`}
                    onClick={() => buyPrebuilt(p.id)}
                    disabled={locked || save.cash < p.price}
                    className="primary"
                  >
                    {locked ? `🔒 Unlock level ${p.levelRequired}` : `Buy ${money(p.price)}`}
                  </GateButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
