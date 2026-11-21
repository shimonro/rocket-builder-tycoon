import type { Catalog, Category, Rarity } from '../../core/parts/parts';
import type { Rocket } from '../../core/rocket/rocket';
import { cosmetics } from '../../data';

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
  if (look.body && look.decal) parts.push(decalShapes(look.decal));
  if (look.shield) {
    parts.push(`<circle cx="50" cy="54" r="13" fill="none" stroke="${look.shield}" stroke-width="3"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 160" width="100" height="160">${parts.join('')}</svg>`;
}

// Decal badge on the body, between the window (bottom y≈64) and the fuel tank (top y=76).
// PixiJS parses this SVG too, so decals use only rect/circle/polygon/path/line, with no transforms.
const DX = 40;
const DY = 64;
const DW = 20;
const DH = 11;
const LX = 50;
const LY = DY + DH / 2;

/** A rectangle in badge coordinates (0..20 × 0..11). */
const fr = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${DX + x}" y="${DY + y}" width="${w}" height="${h}" fill="${fill}"/>`;
/** Points in badge (flag) or logo (centered) coordinates. */
const pts = (list: number[][], ox: number, oy: number) => list.map(([x, y]) => `${+(ox + x).toFixed(2)},${+(oy + y).toFixed(2)}`).join(' ');
const ring = (n: number, radius: (i: number) => number, start = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / n;
    return [radius(i) * Math.cos(a), radius(i) * Math.sin(a)];
  });
/** An ellipse rotated by `deg`, as a polygon (PixiJS ignores SVG transforms). */
const orbit = (deg: number) => {
  const t = (deg * Math.PI) / 180;
  return Array.from({ length: 28 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 28;
    const [x, y] = [4.6 * Math.cos(a), 1.7 * Math.sin(a)];
    return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
  });
};

const hbands = (colors: string[]) => colors.map((c, i) => fr(0, (i * DH) / colors.length, DW, DH / colors.length, c)).join('');
const vbands = (colors: string[]) => colors.map((c, i) => fr((i * DW) / colors.length, 0, DW / colors.length, DH, c)).join('');

const FLAGS: Record<string, () => string> = {
  il: () =>
    fr(0, 0, DW, DH, '#ffffff') +
    fr(0, 1.1, DW, 1.4, '#0038b8') +
    fr(0, 8.5, DW, 1.4, '#0038b8') +
    `<polygon points="${pts([[0, -2.7], [2.35, 1.35], [-2.35, 1.35]], LX, LY)}" fill="none" stroke="#0038b8" stroke-width="0.6"/>` +
    `<polygon points="${pts([[0, 2.7], [2.35, -1.35], [-2.35, -1.35]], LX, LY)}" fill="none" stroke="#0038b8" stroke-width="0.6"/>`,
  hu: () => hbands(['#ce2939', '#ffffff', '#477050']),
  us: () =>
    Array.from({ length: 7 }, (_, i) => fr(0, (i * DH) / 7, DW, DH / 7, i % 2 ? '#ffffff' : '#b22234')).join('') +
    fr(0, 0, 8.5, (DH * 4) / 7, '#3c3b6e') +
    [1.5, 4.25, 7]
      .flatMap((x) => [1.5, 4.8].map((y) => `<circle cx="${DX + x}" cy="${DY + y}" r="0.55" fill="#ffffff"/>`))
      .join(''),
  uk: () =>
    fr(0, 0, DW, DH, '#012169') +
    `<polygon points="${pts([[0, 0], [2.2, 0], [DW, 9.8], [DW, DH], [17.8, DH], [0, 1.2]], DX, DY)}" fill="#ffffff"/>` +
    `<polygon points="${pts([[DW, 0], [DW, 1.2], [2.2, DH], [0, DH], [0, 9.8], [17.8, 0]], DX, DY)}" fill="#ffffff"/>` +
    `<line x1="${DX + 0.4}" y1="${DY + 0.3}" x2="${DX + DW - 0.4}" y2="${DY + DH - 0.3}" stroke="#c8102e" stroke-width="0.7"/>` +
    `<line x1="${DX + DW - 0.4}" y1="${DY + 0.3}" x2="${DX + 0.4}" y2="${DY + DH - 0.3}" stroke="#c8102e" stroke-width="0.7"/>` +
    fr(0, 3.9, DW, 3.2, '#ffffff') +
    fr(8.4, 0, 3.2, DH, '#ffffff') +
    fr(0, 4.6, DW, 1.8, '#c8102e') +
    fr(9.1, 0, 1.8, DH, '#c8102e'),
  de: () => hbands(['#000000', '#dd0000', '#ffce00']),
  fr: () => vbands(['#0055a4', '#ffffff', '#ef4135']),
  jp: () => fr(0, 0, DW, DH, '#ffffff') + `<circle cx="${LX}" cy="${LY}" r="3.3" fill="#bc002d"/>`,
};

const LOGOS: Record<string, (color: string) => string> = {
  bolt: (c) => `<polygon points="${pts([[1.2, -4.6], [-3, 0.7], [-0.3, 0.7], [-1.3, 4.6], [3, -0.9], [0.3, -0.9]], LX, LY)}" fill="${c}"/>`,
  star: (c) => `<polygon points="${pts(ring(10, (i) => (i % 2 ? 1.9 : 4.6)), LX, LY)}" fill="${c}"/>`,
  skull: (c) =>
    `<line x1="${LX - 4.2}" y1="${LY - 3.6}" x2="${LX + 4.2}" y2="${LY + 3.6}" stroke="${c}" stroke-width="1.2"/>` +
    `<line x1="${LX + 4.2}" y1="${LY - 3.6}" x2="${LX - 4.2}" y2="${LY + 3.6}" stroke="${c}" stroke-width="1.2"/>` +
    `<circle cx="${LX}" cy="${LY - 0.9}" r="3.1" fill="${c}"/>` +
    `<rect x="${LX - 1.8}" y="${LY + 1}" width="3.6" height="2.3" fill="${c}"/>` +
    `<circle cx="${LX - 1.15}" cy="${LY - 1}" r="0.85" fill="#0f172a"/>` +
    `<circle cx="${LX + 1.15}" cy="${LY - 1}" r="0.85" fill="#0f172a"/>` +
    `<polygon points="${pts([[0, 0.3], [0.5, 1.2], [-0.5, 1.2]], LX, LY)}" fill="#0f172a"/>`,
  heart: (c) =>
    `<path d="M${LX} ${LY + 4} C${LX - 5} ${LY + 0.6} ${LX - 4.6} ${LY - 4} ${LX - 2.2} ${LY - 4} C${LX - 1} ${LY - 4} ${LX - 0.3} ${LY - 3.2} ${LX} ${LY - 2.2} C${LX + 0.3} ${LY - 3.2} ${LX + 1} ${LY - 4} ${LX + 2.2} ${LY - 4} C${LX + 4.6} ${LY - 4} ${LX + 5} ${LY + 0.6} ${LX} ${LY + 4} Z" fill="${c}"/>`,
  atom: (c) =>
    [0, 60, 120].map((deg) => `<polygon points="${pts(orbit(deg), LX, LY)}" fill="none" stroke="${c}" stroke-width="0.7"/>`).join('') +
    `<circle cx="${LX}" cy="${LY}" r="1.2" fill="${c}"/>`,
};

/** The rocket cropped around its decal (window to fuel tank), for close-up previews. */
export function decalCloseupSvg(look: RocketLook): string {
  return rocketSvg(look).replace('viewBox="0 0 100 160" width="100" height="160"', `viewBox="${DX - 4} ${LY - 14} 28 28" width="28" height="28"`);
}

/** SVG shapes for a decal cosmetic id (`decal_flag_<code>` or `decal_logo_<name>`); '' when unknown. */
export function decalShapes(id: string): string {
  const [, kind, name] = id.split('_');
  if (kind === 'flag' && FLAGS[name]) {
    return FLAGS[name]() + `<rect x="${DX}" y="${DY}" width="${DW}" height="${DH}" fill="none" stroke="#0f172a" stroke-width="0.6"/>`;
  }
  const color = cosmetics.find((c) => c.id === id)?.color;
  if (kind === 'logo' && LOGOS[name] && color) {
    return `<rect x="${DX}" y="${DY}" width="${DW}" height="${DH}" rx="3" fill="#0f172a"/>` + LOGOS[name](color);
  }
  return '';
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
