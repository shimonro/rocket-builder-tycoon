import { useEffect, useState, type FormEvent } from 'react';
import { catalog, levels } from '../../data';
import type { SaveData } from '../../services/persistence/save';
import {
  continueAsUser,
  loadGuestPreview,
  playAsGuest,
  requestPasswordReset,
  restoreSession,
  signIn,
  signOut,
  useSession,
} from '../../state/session';
import { rocketLook, rocketSvg } from '../art/rocketArt';
import { money, Svg } from '../components/common';

const HERO = rocketSvg(
  rocketLook(
    { body: 'body_aurora_hull', fuel_tank: 'fuel_tank_starwell_tank', engine: 'engine_helios_e4', fins: 'fins_aether_wings', booster: 'booster_solar_lance' },
    catalog,
  ),
);

export function Entrance() {
  const { loginAvailable, user, busy, error } = useSession();
  const [guest, setGuest] = useState<SaveData | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    void loadGuestPreview().then(setGuest);
    if (loginAvailable) void restoreSession();
  }, [loginAvailable]);

  const submit = (mode: 'signin' | 'signup') => (e?: FormEvent) => {
    e?.preventDefault();
    void signIn(email, password, mode);
  };

  const highest = guest ? Math.max(...guest.progress.unlocked) : 1;
  return (
    <div className="screen entrance">
      <div className="hero">
        <Svg svg={HERO} className="hero-rocket" />
        <h1>
          Rocket Builder <span>Tycoon</span>
        </h1>
        <p className="tagline">Buy parts. Build a rocket. Fly it as far as you can across {levels.length} levels.</p>
      </div>
      <div className="entrance-panels">
        <section className="card">
          <h2>Play as guest</h2>
          <p className="muted">Your progress is saved in this browser.</p>
          <button type="button" className="btn primary big" onClick={() => void playAsGuest()} data-testid="play-guest">
            {guest && guest.stats.flights > 0 ? `Continue · ${money(guest.cash)} · Level ${highest}` : 'Play as guest'}
          </button>
        </section>
        <section className="card">
          <h2>Account</h2>
          {!loginAvailable ? (
            <p className="muted">Online accounts are not configured on this deployment yet. Guest saves can be imported once they are.</p>
          ) : user ? (
            <>
              <p className="muted">Signed in as {user.email}</p>
              <button type="button" className="btn primary big" onClick={() => void continueAsUser()} disabled={busy}>
                Continue
              </button>
              <button type="button" className="btn ghost" onClick={() => void signOut()} disabled={busy}>
                Sign out
              </button>
            </>
          ) : resetting ? (
            <form
              className="login"
              onSubmit={(e) => {
                e.preventDefault();
                void requestPasswordReset(email).then((ok) => setResetSent(!!ok));
              }}
            >
              <p className="muted small">Enter your account email and we’ll send you a link to choose a new password.</p>
              <input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <div className="row">
                <button type="submit" className="btn primary" disabled={busy || resetSent} data-testid="send-reset">
                  Send reset link
                </button>
                <button type="button" className="btn ghost" onClick={() => (setResetting(false), setResetSent(false))}>
                  Back
                </button>
              </div>
              {resetSent && (
                <p className="success small" data-testid="reset-sent">
                  If an account exists for {email}, a reset link is on its way. Check your inbox (and spam folder).
                </p>
              )}
            </form>
          ) : (
            <form className="login" onSubmit={submit('signin')}>
              <input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input
                type="password"
                placeholder="Password (6+ characters)"
                autoComplete="current-password"
                value={password}
                minLength={6}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="row">
                <button type="submit" className="btn primary" disabled={busy}>
                  Log in
                </button>
                <button type="button" className="btn ghost" disabled={busy || !email || password.length < 6} onClick={() => submit('signup')()}>
                  Register
                </button>
              </div>
              <button type="button" className="link small" onClick={() => setResetting(true)} data-testid="forgot-password">
                Forgot password?
              </button>
            </form>
          )}
          {error && <p className="warn">{error}</p>}
        </section>
      </div>
    </div>
  );
}
