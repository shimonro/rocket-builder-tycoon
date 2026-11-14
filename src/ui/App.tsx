import { lazy, Suspense, useEffect } from 'react';
import { connectAudio } from '../services/audio/audio';
import { gameEvents, useGame } from '../state/game';
import { resolveImport, useSession } from '../state/session';
import { Coach, Notice } from './components/common';
import { TopBar } from './components/TopBar';
import { Entrance } from './screens/Entrance';
import { Hangar } from './screens/Hangar';
import { LevelSelect } from './screens/LevelSelect';
import { Results } from './screens/Results';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';

// PixiJS is only needed in flight, so it loads separately from the menus.
const Journey = lazy(() => import('./screens/Journey').then((m) => ({ default: m.Journey })));

function ImportPrompt() {
  const pending = useSession((s) => s.pendingImport);
  if (!pending) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Import guest progress">
        <h2>Import guest progress?</h2>
        <p className="muted">
          This browser has a guest save with ${Math.floor(pending.cash).toLocaleString('en-US')} and {pending.stats.flights} flights. Move it into
          your new account?
        </p>
        <button type="button" className="btn primary" onClick={() => resolveImport(true)}>
          Yes, import it
        </button>
        <button type="button" className="btn ghost" onClick={() => resolveImport(false)}>
          No, start fresh
        </button>
      </div>
    </div>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  useEffect(() => connectAudio(gameEvents, () => useGame.getState().save.settings), []);

  const content = {
    entrance: <Entrance />,
    hangar: <Hangar />,
    shop: <Shop />,
    levels: <LevelSelect />,
    journey: <Journey />,
    results: <Results />,
    settings: <Settings />,
  }[screen];

  const chrome = screen !== 'entrance' && screen !== 'journey';
  return (
    <div className={`app app-${screen}`}>
      {chrome && <TopBar />}
      {chrome && <Coach />}
      <main>
        <Suspense fallback={<div className="screen muted">Preparing launch…</div>}>{content}</Suspense>
      </main>
      <Notice />
      <ImportPrompt />
    </div>
  );
}
