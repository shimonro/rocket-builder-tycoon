import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const PAD = 6;

function boxOf(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
}

const same = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.right - b.right) + Math.abs(a.bottom - b.bottom) < 1);

/**
 * Follows the target element and the bubble every frame, so the ring stays on the target through
 * resizes, scrolling, smooth scrolls and layout changes. Scrolls the target into view once when it appears.
 */
function useTracked(selector: string, from: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<{ selector: string; ring: Box | null; bubble: Box | null }>({ selector, ring: null, bubble: null });
  useEffect(() => {
    let frame = 0;
    let scrolled = false;
    let last: { ring: Box | null; bubble: Box | null } = { ring: null, bubble: null };
    const tick = () => {
      const el = document.querySelector(selector);
      let ring = el ? boxOf(el) : null;
      if (el && ring && !el.closest('.topbar')) {
        if (!scrolled) {
          scrolled = true;
          el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        }
        // Page content scrolled under the sticky top bar is hidden; clip the ring to what is visible.
        const bar = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
        ring = ring.bottom <= bar ? null : { ...ring, top: Math.max(ring.top, bar + PAD) };
      }
      const bubble = from.current ? boxOf(from.current) : null;
      if (!same(ring, last.ring) || !same(bubble, last.bubble)) {
        last = { ring, bubble };
        setState({ selector, ring, bubble });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [selector, from]);
  return state.selector === selector ? state : { ring: null, bubble: null };
}

/** Path of an arrow from the bubble's nearest edge to the ring, or null when they overlap. */
function arrowPath(b: Box, r: Box): string | null {
  const rx = (r.left + r.right) / 2;
  const ry = (r.top + r.bottom) / 2;
  const clampX = (x: number) => Math.min(Math.max(x, b.left + 24), b.right - 24);
  let s: [number, number];
  let e: [number, number];
  let vertical = true;
  if (r.bottom < b.top - 4) {
    s = [clampX(rx), b.top];
    e = [rx, r.bottom + 4];
  } else if (r.top > b.bottom + 4) {
    s = [clampX(rx), b.bottom];
    e = [rx, r.top - 4];
  } else if (r.left > b.right + 4) {
    s = [b.right, (b.top + b.bottom) / 2];
    e = [r.left - 4, ry];
    vertical = false;
  } else if (r.right < b.left - 4) {
    s = [b.left, (b.top + b.bottom) / 2];
    e = [r.right + 4, ry];
    vertical = false;
  } else {
    return null;
  }
  if (Math.hypot(e[0] - s[0], e[1] - s[1]) < 10) return null;
  const [c1, c2] = vertical
    ? [`${s[0]} ${(s[1] + e[1]) / 2}`, `${e[0]} ${(s[1] + e[1]) / 2}`]
    : [`${(s[0] + e[0]) / 2} ${s[1]}`, `${(s[0] + e[0]) / 2} ${e[1]}`];
  return `M ${s[0]} ${s[1]} C ${c1}, ${c2}, ${e[0]} ${e[1]}`;
}

/** A pulsing ring around `target` and an arrow to it from the `from` bubble. */
export function Spotlight({ target, from }: { target: string; from: RefObject<HTMLElement | null> }) {
  const { ring, bubble } = useTracked(target, from);
  if (!ring) return null;
  const box = { left: ring.left - PAD, top: ring.top - PAD, right: ring.right + PAD, bottom: ring.bottom + PAD };
  const path = bubble && arrowPath(bubble, box);
  // Portaled to the body so it draws above the sticky top bar and coach (each is its own stacking context).
  return createPortal(
    <>
      <div
        className="spot-ring"
        data-testid="spotlight"
        aria-hidden
        style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
      />
      {path && (
        <svg className="spot-arrow" aria-hidden>
          <defs>
            <marker id="spot-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
            </marker>
          </defs>
          <path d={path} markerEnd="url(#spot-head)" />
        </svg>
      )}
    </>,
    document.body,
  );
}
