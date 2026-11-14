import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { connectAudio, setMusicMode } from '../services/audio/audio';
import type { SaveData } from '../services/persistence/save';
import { connectTelemetry, createTelemetry, reportError, type Telemetry } from '../services/telemetry';
import { gameEvents, useGame } from '../state/game';
import { cancelRecovery, resolveConflict, resolveImport, setNewPassword, useSession } from '../state/session';
import { Coach, money, Notice } from './components/common';
import { Tips } from './components/Tips';
import { TopBar } from './components/TopBar';
import { Entrance } from './screens/Entrance';
import { Hangar } from './screens/Hangar';
import { LevelSelect } from './screens/LevelSelect';
import { Missions } from './screens/Missions';
import { Results } from './screens/Results';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';

// PixiJS is only needed in flight, so it loads separately from the menus.
const Journey = lazy(() => import('./screens/Journey').then((m) => ({ default: m.Journey })));

const env = import.meta.env;
const telemetry: Telemetry | null =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? createTelemetry({
        url: env.VITE_SUPABASE_URL,
        key: env.VITE_SUPABASE_ANON_KEY,
        version: __APP_VERSION__,
        enabled: () => useGame.getState().save.settings.analytics && navigator.doNotTrack !== '1',
      })
    : null;

/** Shows a recovery screen instead of a blank page if rendering crashes, and reports the crash. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (telemetry) reportError(telemetry, error, 'react');
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen crash">
        <div className="card">
          <h2>💥 Houston, we have a problem</h2>
          <p className="muted">Something went wrong. Your progress is saved — reload to get back in.</p>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

function summary(save: SaveData) {
  return `${money(save.cash)} · ${save.stats.flights} flights · Level ${Math.max(...save.progress.unlocked)} · ${save.gems} 💎`;
}

function ImportPrompt() {
  const pending = useSession((s) => s.pendingImport);
  if (!pending) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Import guest progress">
        <h2>Import guest progress?</h2>
        <p className="muted">
          This browser has a guest save with {money(pending.cash)} and {pending.stats.flights} flights. Move it into your new account?
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

function ConflictPrompt() {
  const conflict = useSession((s) => s.conflict);
  if (!conflict) return null;
  const when = new Date(conflict.remote.updatedAt).toLocaleString();
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Save conflict" data-testid="conflict">
        <h2>Progress changed on another device</h2>
        <p className="muted">Your account was also played somewhere else. Which progress do you want to keep?</p>
        <ul className="conflict-options">
          <li>
            <b>Other device</b> (saved {when})<br />
            <small>{summary(conflict.remote)}</small>
          </li>
          <li>
            <b>This device</b>
            <br />
            <small>{summary(conflict.local)}</small>
          </li>
        </ul>
        <button type="button" className="btn primary" onClick={() => resolveConflict('remote')} data-testid="keep-remote">
          Use the other device’s progress
        </button>
        <button type="button" className="btn ghost" onClick={() => resolveConflict('local')} data-testid="keep-local">
          Keep this device’s progress
        </button>
      </div>
    </div>
  );
}

function RecoveryPrompt() {
  const recovery = useSession((s) => s.recovery);
  const busy = useSession((s) => s.busy);
  const error = useSession((s) => s.error);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  if (!recovery && !done) return null;
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        role="dialog"
        aria-label="Choose a new password"
        data-testid="recovery"
        onSubmit={(e) => {
          e.preventDefault();
          void setNewPassword(password).then((ok) => setDone(!!ok));
        }}
      >
        <h2>{done ? 'Password updated' : 'Choose a new password'}</h2>
        {done ? (
          <>
            <p className="muted">You are signed in. Continue to your rocket from the title screen.</p>
            <button type="button" className="btn primary" onClick={() => setDone(false)}>
              OK
            </button>
          </>
        ) : (
          <>
            <input
              type="password"
              placeholder="New password (6+ characters)"
              autoComplete="new-password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="new-password"
            />
            {error && <p className="warn">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy || password.length < 6}>
              Save password
            </button>
            <button type="button" className="btn ghost" onClick={cancelRecovery}>
              Cancel
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  useEffect(() => {
    const offAudio = connectAudio(gameEvents, () => useGame.getState().save.settings);
    setMusicMode('menu');
    const offTelemetry = telemetry ? connectTelemetry(telemetry, gameEvents) : () => undefined;
    telemetry?.track('session_start', { touch: matchMedia('(pointer: coarse)').matches, width: window.innerWidth });
    // Tutorial funnel: where new players drop off.
    const offTutorial = useGame.subscribe((s, prev) => {
      if (s.save.tutorialStep !== prev.save.tutorialStep) telemetry?.track('tutorial_step', { step: s.save.tutorialStep });
    });
    return () => {
      offAudio();
      offTelemetry();
      offTutorial();
    };
  }, []);

  const content = {
    entrance: <Entrance />,
    hangar: <Hangar />,
    shop: <Shop />,
    levels: <LevelSelect />,
    missions: <Missions />,
    journey: <Journey />,
    results: <Results />,
    settings: <Settings />,
  }[screen];

  const chrome = screen !== 'entrance' && screen !== 'journey';
  return (
    <ErrorBoundary>
      <div className={`app app-${screen}`}>
        {chrome && <TopBar />}
        {chrome && <Coach />}
        {chrome && screen !== 'results' && <Tips />}
        <main>
          <Suspense fallback={<div className="screen muted">Preparing launch…</div>}>{content}</Suspense>
        </main>
        <Notice />
        <ImportPrompt />
        <ConflictPrompt />
        <RecoveryPrompt />
      </div>
    </ErrorBoundary>
  );
}
