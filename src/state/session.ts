import { create } from 'zustand';
import { economy } from '../data';
import { createGuestBackend, decideMigration, type SaveBackend } from '../services/persistence/backend';
import { defaultSave, parseSave, type SaveData } from '../services/persistence/save';
import type { User } from '../services/persistence/supabase';
import { useGame } from './game';

const loginAvailable = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const guestBackend = createGuestBackend(window.localStorage);

/** Supabase loads on demand, so guest players never download it. */
let cloudApi: ReturnType<typeof loadCloud> | null = null;
function loadCloud() {
  return import('../services/persistence/supabase').then((m) => {
    const client = m.createSupabaseFromEnv(import.meta.env)!;
    return { auth: m.createAuth(client), backendFor: (userId: string) => m.createCloudBackend(client, userId) };
  });
}
function cloud() {
  cloudApi ??= loadCloud();
  return cloudApi;
}

interface SessionState {
  /** Login needs Supabase settings at build time. */
  loginAvailable: boolean;
  user: User | null;
  /** Guest save waiting for the player to accept or decline importing it into their new account. */
  pendingImport: SaveData | null;
  busy: boolean;
  error: string | null;
}

export const useSession = create<SessionState>()(() => ({
  loginAvailable,
  user: null,
  pendingImport: null,
  busy: false,
  error: null,
}));

let backend: SaveBackend = guestBackend;
let pending: ReturnType<typeof setTimeout> | undefined;

function persistNow() {
  clearTimeout(pending);
  pending = undefined;
  const { save, screen } = useGame.getState();
  if (screen === 'entrance') return;
  backend.save(save).catch((e: Error) => useSession.setState({ error: `Save failed: ${e.message}` }));
}

useGame.subscribe((state, prev) => {
  if (state.save !== prev.save && state.screen !== 'entrance') {
    clearTimeout(pending);
    pending = setTimeout(persistNow, 400);
  }
});
window.addEventListener('pagehide', () => pending && persistNow());

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
  backend = guestBackend;
  useSession.setState({ user: null });
  useGame.getState().loadSave((await guestBackend.load()) ?? defaultSave(economy.startingCash));
}

async function enterAccount(user: User) {
  const cloudBackend = (await cloud()).backendFor(user.id);
  const [remote, guest] = await Promise.all([cloudBackend.load(), guestBackend.load()]);
  backend = cloudBackend;
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

/** Imports (or discards) the guest save into the freshly signed-in account. */
export function resolveImport(accept: boolean) {
  const { pendingImport } = useSession.getState();
  useSession.setState({ pendingImport: null });
  const save = accept && pendingImport ? pendingImport : defaultSave(economy.startingCash);
  useGame.getState().loadSave({ ...save, updatedAt: Date.now() });
  persistNow();
}

export function signOut() {
  return withBusy(async () => {
    persistNow();
    if (useSession.getState().user) await (await cloud()).auth.signOut();
    backend = guestBackend;
    useSession.setState({ user: null });
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
  useGame.getState().loadSave({ ...defaultSave(economy.startingCash), settings });
  persistNow();
}
