import { create } from 'zustand';
import { economy, RULES_VERSION } from '../data';
import { createGuestBackend, decideMigration, decideSync, SaveConflictError, type SaveBackend } from '../services/persistence/backend';
import { createGhostStore } from '../services/persistence/ghosts';
import { defaultSave, parseSave, type SaveData } from '../services/persistence/save';
import type { LeaderboardEntry, User } from '../services/persistence/supabase';
import { useGame } from './game';

const loginAvailable = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const guestBackend = createGuestBackend(window.localStorage);
export const ghosts = createGhostStore(window.localStorage);

/** Supabase loads on demand, so guest players never download it. */
let cloudApi: ReturnType<typeof loadCloud> | null = null;
function loadCloud() {
  return import('../services/persistence/supabase').then((m) => {
    const client = m.createSupabaseFromEnv(import.meta.env)!;
    const auth = m.createAuth(client);
    auth.onPasswordRecovery(() => useSession.setState({ recovery: true }));
    return { auth, leaderboard: m.createLeaderboard(client), backendFor: (userId: string) => m.createCloudBackend(client, userId) };
  });
}
function cloud() {
  cloudApi ??= loadCloud();
  return cloudApi;
}

export interface LeaderboardStatus {
  levelId: number;
  state: 'submitting' | 'accepted' | 'rejected';
  message?: string;
  rank?: number;
}

interface SessionState {
  /** Login needs Supabase settings at build time. */
  loginAvailable: boolean;
  user: User | null;
  /** Guest save waiting for the player to accept or decline importing it into their new account. */
  pendingImport: SaveData | null;
  /** Both this device and another one changed the cloud save; the player picks which to keep. */
  conflict: { local: SaveData; remote: SaveData } | null;
  /** Opened from a password reset link: ask for a new password. */
  recovery: boolean;
  /** The last run sent to the leaderboard. */
  leaderboard: LeaderboardStatus | null;
  busy: boolean;
  error: string | null;
}

export const useSession = create<SessionState>()(() => ({
  loginAvailable,
  user: null,
  pendingImport: null,
  conflict: null,
  recovery: loginAvailable && window.location.hash.includes('type=recovery'),
  leaderboard: null,
  busy: false,
  error: null,
}));

let backend: SaveBackend = guestBackend;
/** updatedAt of the cloud copy this device last loaded or wrote; undefined while playing as guest. */
let base: number | null | undefined;
let pending: ReturnType<typeof setTimeout> | undefined;
/** Saves run one at a time, so each knows the copy the previous one wrote. */
let chain: Promise<void> = Promise.resolve();

function switchBackend(next: SaveBackend, syncedAt: number | null | undefined) {
  backend = next;
  base = syncedAt;
}

function persistNow() {
  clearTimeout(pending);
  pending = undefined;
  if (useGame.getState().screen === 'entrance') return;
  chain = chain.then(async () => {
    const { save } = useGame.getState();
    if (useSession.getState().conflict || save.updatedAt === base) return;
    const target = backend;
    try {
      await target.save(save, base);
      if (target === backend && base !== undefined) base = save.updatedAt;
    } catch (e) {
      if (e instanceof SaveConflictError) useSession.setState({ conflict: { local: save, remote: e.remote } });
      else useSession.setState({ error: `Save failed: ${(e as Error).message}` });
    }
  });
}

useGame.subscribe((state, prev) => {
  if (state.save !== prev.save && state.screen !== 'entrance') {
    clearTimeout(pending);
    pending = setTimeout(persistNow, 400);
  }
});
window.addEventListener('pagehide', () => pending && persistNow());

/** Coming back to the tab: pick up progress saved on another device meanwhile. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || base === undefined) return;
  const { screen } = useGame.getState();
  if (screen === 'entrance' || screen === 'journey') return;
  const target = backend;
  chain = chain.then(async () => {
    const remote = await target.load().catch(() => null);
    const local = useGame.getState().save;
    if (target !== backend || useSession.getState().conflict) return;
    const decision = decideSync(local.updatedAt, base ?? null, remote);
    if (decision === 'adopt-remote') {
      base = remote!.updatedAt;
      useGame.setState({ save: remote! });
    } else if (decision === 'conflict') {
      useSession.setState({ conflict: { local, remote: remote! } });
    }
  });
});

async function withBusy<T>(work: () => Promise<T>): Promise<T | undefined> {
  useSession.setState({ busy: true, error: null });
  try {
    return await work();
  } catch (e) {
    useSession.setState({ error: (e as Error).message });
    return undefined;
  } finally {
    useSession.setState({ busy: false });
  }
}

export async function loadGuestPreview(): Promise<SaveData | null> {
  return guestBackend.load();
}

export async function playAsGuest() {
  switchBackend(guestBackend, undefined);
  useSession.setState({ user: null });
  useGame.getState().loadSave((await guestBackend.load()) ?? defaultSave(economy.startingCash));
}

async function enterAccount(user: User) {
  const cloudBackend = (await cloud()).backendFor(user.id);
  const [remote, guest] = await Promise.all([cloudBackend.load(), guestBackend.load()]);
  switchBackend(cloudBackend, remote ? remote.updatedAt : null);
  useSession.setState({ user });
  const decision = decideMigration(guest, remote);
  if (decision === 'offer-import') useSession.setState({ pendingImport: guest });
  else useGame.getState().loadSave(decision === 'use-remote' ? remote! : defaultSave(economy.startingCash));
}

export function restoreSession() {
  return withBusy(async () => {
    const user = loginAvailable ? await (await cloud()).auth.currentUser() : null;
    if (user) useSession.setState({ user });
    return user ?? null;
  });
}

export function continueAsUser() {
  const { user } = useSession.getState();
  return user ? withBusy(() => enterAccount(user)) : Promise.resolve();
}

export function signIn(email: string, password: string, mode: 'signin' | 'signup') {
  return withBusy(async () => {
    const { auth } = await cloud();
    const user = mode === 'signin' ? await auth.signIn(email, password) : await auth.signUp(email, password);
    await enterAccount(user);
  });
}

/** Emails a password reset link that brings the player back to this site. */
export function requestPasswordReset(email: string) {
  return withBusy(async () => {
    await (await cloud()).auth.requestPasswordReset(email, `${window.location.origin}/`);
    return true;
  });
}

export function setNewPassword(password: string) {
  return withBusy(async () => {
    await (await cloud()).auth.updatePassword(password);
    useSession.setState({ recovery: false });
    window.history.replaceState(null, '', window.location.pathname);
    return true;
  });
}

export function cancelRecovery() {
  useSession.setState({ recovery: false });
  window.history.replaceState(null, '', window.location.pathname);
}

/** Imports (or discards) the guest save into the freshly signed-in account. */
export function resolveImport(accept: boolean) {
  const { pendingImport } = useSession.getState();
  useSession.setState({ pendingImport: null });
  const save = accept && pendingImport ? pendingImport : defaultSave(economy.startingCash);
  useGame.getState().loadSave({ ...save, updatedAt: Date.now() });
  persistNow();
}

/** Settles a save conflict by keeping this device's progress or the other device's. */
export function resolveConflict(keep: 'local' | 'remote') {
  const { conflict } = useSession.getState();
  if (!conflict) return;
  base = conflict.remote.updatedAt;
  useSession.setState({ conflict: null });
  if (keep === 'remote') {
    useGame.setState({ save: conflict.remote });
  } else {
    const { save } = useGame.getState();
    useGame.setState({ save: { ...save, updatedAt: Math.max(Date.now(), conflict.remote.updatedAt + 1) } });
    persistNow();
  }
}

export function signOut() {
  return withBusy(async () => {
    persistNow();
    await chain;
    if (useSession.getState().user) await (await cloud()).auth.signOut();
    switchBackend(guestBackend, undefined);
    useSession.setState({ user: null, conflict: null, leaderboard: null });
    useGame.setState({ screen: 'entrance' });
  });
}

export function exportSave(): string {
  return JSON.stringify(useGame.getState().save, null, 2);
}

export function importSave(text: string): boolean {
  let parsed: SaveData | null;
  try {
    parsed = parseSave(JSON.parse(text));
  } catch {
    parsed = null;
  }
  if (!parsed) return false;
  useGame.getState().loadSave({ ...parsed, updatedAt: Date.now() });
  persistNow();
  return true;
}

export function resetProgress() {
  const { settings } = useGame.getState().save;
  useGame.getState().loadSave({ ...defaultSave(economy.startingCash), settings, updatedAt: Date.now() });
  persistNow();
}

export async function fetchLeaderboard(levelId: number): Promise<LeaderboardEntry[]> {
  return (await cloud()).leaderboard.top(levelId);
}

/** Best verified distance per level this session, so only improvements are sent. */
const serverBest: Record<number, number> = {};

// After each flight: keep the ghost of a new best run and send leaderboard-worthy runs for verification.
useGame.subscribe((state, prev) => {
  const result = state.lastResult;
  if (!result || result === prev.lastResult || result.tutorial) return;
  const distance = result.payout.distance;
  if (result.track && distance > result.previousBest) ghosts.offer(result.levelId, { distance, points: result.track });

  const { user } = useSession.getState();
  // God-mode (QA) runs never go on the leaderboards.
  if (state.save.godBackup) return;
  if (!user || !result.replay || distance <= (serverBest[result.levelId] ?? result.previousBest - 1) || distance === 0) return;
  const { levelId } = result;
  useSession.setState({ leaderboard: { levelId, state: 'submitting' } });
  void cloud()
    .then(({ leaderboard }) =>
      leaderboard.submit({ levelId, ...result.replay!, rulesVersion: RULES_VERSION, name: state.save.settings.pilotName }),
    )
    .then((r) => {
      if (r.ok) serverBest[levelId] = Math.max(serverBest[levelId] ?? 0, r.best);
      useSession.setState({
        leaderboard: r.ok ? { levelId, state: 'accepted', rank: r.rank } : { levelId, state: 'rejected', message: r.error },
      });
    })
    .catch((e: Error) => useSession.setState({ leaderboard: { levelId, state: 'rejected', message: e.message } }));
});
