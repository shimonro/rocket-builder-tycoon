import type { Catalog, Category, Rarity } from '../../core/parts/parts';
import type { Rocket } from '../../core/rocket/rocket';

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9aa5b5',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

/** Accent color per equipped slot, plus optional cosmetics: hull paint color and a decal (cosmetic id). */
export type RocketLook = Partial<Record<Category, string>> & { paint?: string; decal?: string };

export function rocketLook(rocket: Rocket, catalog: Catalog): RocketLook {
  const look: RocketLook = {};
  for (const [category, id] of Object.entries(rocket) as [Category, string][]) {
    const part = catalog.get(id);
    if (part) look[category] = RARITY_COLORS[part.rarity];
  }
  return look;
}

const OUTLINE = 'stroke="#0f172a" stroke-width="2" stroke-linejoin="round"';

/**
 * The rocket as one SVG (viewBox 0 0 100 160, nose up). The Hangar shows it as markup and the
 * flight renderer feeds the same string to PixiJS, so both views share one vector source.
 * `ghost` draws missing required parts as faint placeholders.
 */
export function rocketSvg(look: RocketLook, ghost = false): string {
  const g = (present: boolean, shape: string) => (present ? shape : ghost ? shape.replace(/fill="[^"]*"/g, 'fill="#1e293b"') : '');
  const parts: string[] = [];
  if (look.booster) {
    for (const x of [20, 70]) {
      parts.push(
        `<polygon points="${x + 5},62 ${x + 10},74 ${x},74" fill="${look.booster}" ${OUTLINE}/>`,
        `<rect x="${x}" y="74" width="10" height="48" fill="#cbd5e1" ${OUTLINE}/>`,
        `<rect x="${x}" y="98" width="10" height="8" fill="${look.booster}"/>`,
        `<polygon points="${x + 1},122 ${x + 9},122 ${x + 11},130 ${x - 1},130" fill="#475569" ${OUTLINE}/>`,
      );
    }
  }
  parts.push(
    g(!!look.fins, `<polygon points="33,90 12,126 12,142 33,124" fill="${look.fins ?? ''}" ${OUTLINE}/>`),
    g(!!look.fins, `<polygon points="67,90 88,126 88,142 67,124" fill="${look.fins ?? ''}" ${OUTLINE}/>`),
    g(!!look.engine, `<polygon points="38,118 62,118 70,140 30,140" fill="#475569" ${OUTLINE}/>`),
    g(!!look.engine, `<rect x="36" y="116" width="28" height="6" fill="${look.engine ?? ''}" ${OUTLINE}/>`),
  );
  if (look.weapon) {
    parts.push(
      `<rect x="46" y="2" width="8" height="18" fill="#334155" ${OUTLINE}/>`,
      `<rect x="45" y="0" width="10" height="5" fill="${look.weapon}" ${OUTLINE}/>`,
    );
  }
  parts.push(
    g(!!look.body, `<path d="M50 8 C62 20 68 34 68 52 L68 118 L32 118 L32 52 C32 34 38 20 50 8 Z" fill="${look.paint ?? '#e8edf5'}" ${OUTLINE}/>`),
    g(!!look.body, `<path d="M50 8 C58 16 62 24 64 32 L36 32 C38 24 42 16 50 8 Z" fill="${look.body ?? ''}"/>`),
    g(!!look.fuel_tank, `<rect x="32" y="76" width="36" height="30" fill="${look.fuel_tank ?? ''}" ${OUTLINE}/>`),
    g(!!look.fuel_tank, `<rect x="32" y="86" width="36" height="4" fill="#0f172a" opacity="0.35"/>`),
  );
  if (look.body) {
    parts.push(`<circle cx="50" cy="54" r="9" fill="#7dd3fc" ${OUTLINE}/>`, `<circle cx="47" cy="51" r="3" fill="#e0f2fe"/>`);
  }
  if (look.shield) {
    parts.push(`<circle cx="50" cy="54" r="13" fill="none" stroke="${look.shield}" stroke-width="3"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 160" width="100" height="160">${parts.join('')}</svg>`;
}

const ICONS: Record<Category, string> = {
  body: '<path d="M32 4 C42 14 46 24 46 36 L46 60 L18 60 L18 36 C18 24 22 14 32 4 Z" fill="#e8edf5" STROKE/><path d="M32 4 C38 10 41 16 43 22 L21 22 C23 16 26 10 32 4 Z" fill="C"/><circle cx="32" cy="36" r="7" fill="#7dd3fc" STROKE/>',
  fuel_tank: '<rect x="16" y="10" width="32" height="46" rx="8" fill="C" STROKE/><rect x="16" y="26" width="32" height="5" fill="#0f172a" opacity="0.35"/><rect x="26" y="4" width="12" height="8" fill="#94a3b8" STROKE/>',
  engine: '<rect x="18" y="8" width="28" height="12" fill="C" STROKE/><polygon points="22,20 42,20 52,54 12,54" fill="#475569" STROKE/><polygon points="24,54 40,54 32,62" fill="#f97316"/>',
  booster: '<polygon points="32,4 40,16 24,16" fill="C" STROKE/><rect x="24" y="16" width="16" height="36" fill="#cbd5e1" STROKE/><rect x="24" y="30" width="16" height="6" fill="C"/><polygon points="25,52 39,52 42,60 22,60" fill="#475569" STROKE/>',
  fins: '<polygon points="28,8 6,46 6,60 28,42" fill="C" STROKE/><polygon points="36,8 58,46 58,60 36,42" fill="C" STROKE/>',
  shield: '<path d="M32 4 L54 12 L52 34 C50 46 42 54 32 60 C22 54 14 46 12 34 L10 12 Z" fill="C" STROKE/><path d="M32 14 L44 18 L43 32 C42 39 38 44 32 48 Z" fill="#ffffff" opacity="0.35"/>',
  weapon: '<rect x="8" y="34" width="30" height="18" rx="4" fill="#334155" STROKE/><rect x="36" y="38" width="22" height="8" fill="#475569" STROKE/><rect x="54" y="36" width="6" height="12" fill="C" STROKE/><rect x="14" y="22" width="14" height="12" fill="C" STROKE/>',
};

export function partIconSvg(category: Category, color: string): string {
  const body = ICONS[category].replaceAll('fill="C"', `fill="${color}"`).replaceAll('STROKE', OUTLINE);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;
}
