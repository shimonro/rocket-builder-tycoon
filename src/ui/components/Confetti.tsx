import { gameEvents } from '../../state/game';
import './confetti.css';

const COLORS = ['#f472b6', '#facc15', '#4ade80', '#38bdf8', '#a78bfa', '#fb923c', '#f87171'];

/**
 * A burst of confetti over the whole screen for a high score, a completed level or mission.
 * Plain DOM, so it works on every screen (including over the flight canvas) and cleans itself up.
 */
export function celebrate({ pieces = 120, duration = 2600 }: { pieces?: number; duration?: number } = {}) {
  if (typeof document === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gameEvents.emit({ type: 'celebrate' });
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.testid = 'confetti';
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('i');
    const drift = (Math.random() * 2 - 1) * 40;
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = COLORS[i % COLORS.length];
    piece.style.setProperty('--drift', `${drift}vw`);
    piece.style.setProperty('--spin', `${Math.round(360 + Math.random() * 720)}deg`);
    piece.style.animationDelay = `${Math.random() * 400}ms`;
    piece.style.animationDuration = `${duration * (0.7 + Math.random() * 0.5)}ms`;
    if (i % 3 === 0) piece.style.borderRadius = '50%';
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), duration * 1.4);
}
