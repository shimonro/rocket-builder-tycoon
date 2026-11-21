import { useEffect, type ReactNode } from 'react';
import { STAT_KEYS } from '../../core/parts/parts';
import { isLaunchable, rocketParts, rocketStats, type Rocket, type Upgrades } from '../../core/rocket/rocket';
import { catalog, cosmetics, journeyConfig } from '../../data';
import { deriveFlightStats } from '../../engines/journey/config';
import { useGame } from '../../state/game';
import { rocketRanking } from '../../state/selectors';
import { rocketLook, rocketSvg } from '../art/rocketArt';
import { cx, STAT_LABELS, Svg } from './common';
// The modal's styles live with the Shop, which uses it first; importing here keeps it styled anywhere.
import '../screens/shop.css';

export interface CompareSide {
  label: string;
  rocket: Rocket;
}

interface CompareProps {
  title: string;
  before: CompareSide;
  after: CompareSide;
  upgrades: Upgrades;
  onClose: () => void;
  /** Extra line under the table, e.g. a purchase condition. */
  note?: ReactNode;
}

interface Row {
  label: string;
  before: number | null;
  after: number | null;
  unit?: string;
  lowerIsBetter?: boolean;
}

function summary(rocket: Rocket, upgrades: Upgrades) {
  const stats = rocketStats(rocketParts(rocket, catalog), upgrades);
  const flight = deriveFlightStats(stats, journeyConfig, true);
  const ready = isLaunchable(rocket);
  return {
    stats,
    ranking: rocketRanking(rocket, upgrades),
    speed: ready ? Math.round(flight.maxSpeed) : null,
    range: ready ? Math.round((flight.fuelCapacity / flight.burnRate) * flight.maxSpeed) : null,
  };
}

function Delta({ row }: { row: Row }) {
  if (row.before === null || row.after === null) return <span className="delta">—</span>;
  const d = row.after - row.before;
  if (d === 0) return <span className="delta">±0</span>;
  const better = row.lowerIsBetter ? d < 0 : d > 0;
  return (
    <span className={cx('delta', better ? 'up' : 'down')}>
      {d > 0 ? '+' : '−'}
      {Math.abs(d).toLocaleString('en-US')}
    </span>
  );
}

const show = (n: number | null, unit = '') => (n === null ? '—' : `${n.toLocaleString('en-US')}${unit}`);

/** Side-by-side stats of two rockets with colored differences (after − before). */
export function Compare({ title, before, after, upgrades, onClose, note }: CompareProps) {
  const equipped = useGame((s) => s.save.cosmetics.equipped);
  const paint = cosmetics.find((c) => c.id === equipped.paint)?.color;
  const a = summary(before.rocket, upgrades);
  const b = summary(after.rocket, upgrades);
  const rows: Row[] = [
    { label: 'Ranking ★', before: a.ranking, after: b.ranking },
    { label: 'Top speed', before: a.speed, after: b.speed, unit: ' m/s' },
    { label: 'Est. range', before: a.range, after: b.range, unit: ' m' },
    ...STAT_KEYS.map((k) => ({ label: STAT_LABELS[k], before: Math.round(a.stats[k]), after: Math.round(b.stats[k]) })),
    { label: 'Mass', before: Math.round(a.stats.mass), after: Math.round(b.stats.mass), lowerIsBetter: true },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const art = (rocket: Rocket) => rocketSvg({ ...rocketLook(rocket, catalog), paint, decal: equipped.decal }, true);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal compare" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} data-testid="compare-modal">
        <h2>{title}</h2>
        <table className="compare-table">
          <thead>
            <tr>
              <th />
              <th>
                <Svg svg={art(before.rocket)} className="compare-art" />
                <span>{before.label}</span>
              </th>
              <th>
                <Svg svg={art(after.rocket)} className="compare-art" />
                <span>{after.label}</span>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  {row.lowerIsBetter && <small>lower is better</small>}
                </th>
                <td>{show(row.before, row.unit)}</td>
                <td>{show(row.after, row.unit)}</td>
                <td>
                  <Delta row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {note && <p className="muted small">{note}</p>}
        <button type="button" className="btn primary" onClick={onClose} data-testid="compare-close">
          Close
        </button>
      </div>
    </div>
  );
}
