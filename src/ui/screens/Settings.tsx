import { useRef, useState } from 'react';
import type { TouchControls } from '../../services/persistence/save';
import { useGame } from '../../state/game';
import { exportSave, importSave, resetProgress, signOut, useSession } from '../../state/session';

export function Settings() {
  const settings = useGame((s) => s.save.settings);
  const update = useGame((s) => s.updateSettings);
  const user = useSession((s) => s.user);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportSave()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rocket-builder-tycoon-save.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setMessage(importSave(await file.text()) ? 'Save imported.' : 'That file is not a valid save.');
  };

  return (
    <div className="screen settings">
      <section className="card">
        <h2>Audio</h2>
        <label className="row">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
            aria-label="Volume"
          />
        </label>
        <label className="row">
          <input type="checkbox" checked={settings.muted} onChange={(e) => update({ muted: e.target.checked })} /> Mute
        </label>
      </section>

      <section className="card">
        <h2>Controls</h2>
        <label className="row">
          On-screen touch buttons
          <select value={settings.touchControls} onChange={(e) => update({ touchControls: e.target.value as TouchControls })}>
            <option value="auto">Auto (touch devices)</option>
            <option value="on">Always</option>
            <option value="off">Never</option>
          </select>
        </label>
        <table className="keys">
          <tbody>
            <tr><td>← → or A D</td><td>Steer (or drag on the screen)</td></tr>
            <tr><td>↑ or W</td><td>Full throttle</td></tr>
            <tr><td>↓ or S</td><td>Brake / reverse</td></tr>
            <tr><td>Space</td><td>Turbo boost (uses a little fuel)</td></tr>
            <tr><td>F, X or Enter</td><td>Fire weapon</td></tr>
            <tr><td>Esc or P</td><td>Pause</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Save</h2>
        <p className="muted">{user ? `Signed in as ${user.email}. Progress saves to your account.` : 'Playing as guest. Progress saves in this browser.'}</p>
        <div className="row wrap">
          <button type="button" className="btn ghost" onClick={download}>
            Export save
          </button>
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
            Import save
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm('Reset all progress? This cannot be undone.')) {
                resetProgress();
                setMessage('Progress reset.');
              }
            }}
          >
            Reset progress
          </button>
          <button type="button" className="btn ghost" onClick={() => void signOut()}>
            {user ? 'Sign out' : 'Back to title'}
          </button>
        </div>
        {message && <p className="muted">{message}</p>}
      </section>
    </div>
  );
}
