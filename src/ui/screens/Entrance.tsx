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
import { cx, money, Svg } from '../components/common';

const HERO = rocketSvg(
  rocketLook(
    { body: 'body_aurora_hull', fuel_tank: 'fuel_tank_starwell_tank', engine: 'engine_helios_e4', fins: 'fins_aether_wings', booster: 'booster_solar_lance' },
    catalog,
  ),
);

type Mode = 'login' | 'register';
type Problems = Partial<Record<'email' | 'password' | 'confirm', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(mode: Mode, email: string, password: string, confirm: string): Problems {
  const problems: Problems = {};
  if (!EMAIL.test(email.trim())) problems.email = 'Enter a valid email, like pilot@example.com.';
  if (mode === 'login' && !password) problems.password = 'Enter your password.';
  if (mode === 'register' && password.length < 6) problems.password = 'Use at least 6 characters for your password.';
  if (mode === 'register' && password !== confirm) problems.confirm = 'The passwords don’t match.';
  return problems;
}

export function Entrance() {
  const { loginAvailable, user, busy, error } = useSession();
  const [guest, setGuest] = useState<SaveData | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  /** Field problems show once the player has tried to submit, then update as they type. */
  const [tried, setTried] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    void loadGuestPreview().then(setGuest);
    if (loginAvailable) void restoreSession();
  }, [loginAvailable]);

  const problems = tried ? validate(mode, email, password, confirm) : {};

  const switchMode = (next: Mode) => {
    setMode(next);
    setTried(false);
    useSession.setState({ error: null });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(validate(mode, email, password, confirm)).length > 0) return;
    void signIn(email.trim(), password, mode === 'register' ? 'signup' : 'signin');
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
            <>
              <div className="tabs auth-tabs" role="tablist" aria-label="Account">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={cx('tab', mode === 'login' && 'active')}
                  onClick={() => switchMode('login')}
                  data-testid="mode-login"
                >
                  Log in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'register'}
                  className={cx('tab', mode === 'register' && 'active')}
                  onClick={() => switchMode('register')}
                  data-testid="mode-register"
                >
                  Create account
                </button>
              </div>
              <form className="login" onSubmit={submit} noValidate>
                {mode === 'register' && <p className="muted small">Save your progress online and race on the leaderboards.</p>}
                <input
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!problems.email}
                  aria-describedby="email-problem"
                />
                {problems.email && (
                  <p className="field-error" id="email-problem" data-testid="email-error">
                    {problems.email}
                  </p>
                )}
                <input
                  type="password"
                  placeholder={mode === 'register' ? 'Password (6+ characters)' : 'Password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!problems.password}
                  aria-describedby="password-problem"
                />
                {problems.password && (
                  <p className="field-error" id="password-problem" data-testid="password-error">
                    {problems.password}
                  </p>
                )}
                {mode === 'register' && (
                  <>
                    <input
                      type="password"
                      placeholder="Confirm password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      aria-invalid={!!problems.confirm}
                      aria-describedby="confirm-problem"
                      data-testid="confirm-password"
                    />
                    {problems.confirm && (
                      <p className="field-error" id="confirm-problem" data-testid="confirm-error">
                        {problems.confirm}
                      </p>
                    )}
                  </>
                )}
                <button type="submit" className="btn primary" disabled={busy} data-testid={mode === 'register' ? 'register-submit' : 'login-submit'}>
                  {busy ? 'One moment…' : mode === 'register' ? 'Create account' : 'Log in'}
                </button>
                {mode === 'login' && (
                  <button type="button" className="link small" onClick={() => setResetting(true)} data-testid="forgot-password">
                    Forgot password?
                  </button>
                )}
              </form>
            </>
          )}
          {error && (
            <p className="warn" data-testid="auth-error">
              {error}
              {mode === 'register' && /already/i.test(error) && (
                <>
                  {' '}
                  <button type="button" className="link" onClick={() => switchMode('login')}>
                    Log in instead
                  </button>
                </>
              )}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
