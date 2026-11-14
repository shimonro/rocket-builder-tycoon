import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createGuestBackend, decideMigration, GUEST_SAVE_KEY } from './backend';
import { defaultSave, hasProgress, parseSave, type SaveData } from './save';
import { createAuth, createCloudBackend, createSupabaseFromEnv } from './supabase';

const fresh = defaultSave(600);
const played: SaveData = { ...fresh, cash: 900, tutorialStep: 'done', stats: { flights: 3, totalEarned: 1500 } };

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('parseSave', () => {
  it('accepts a valid save round-tripped through JSON', () => {
    expect(parseSave(JSON.parse(JSON.stringify(played)))).toEqual(played);
  });

  it.each([
    ['null', null],
    ['wrong version', { ...fresh, version: 2 }],
    ['negative cash', { ...fresh, cash: -1 }],
    ['infinite cash', { ...fresh, cash: Infinity }],
    ['fractional inventory', { ...fresh, inventory: { a: 0.5 } }],
    ['non-string rocket slot', { ...fresh, rocket: { engine: 3 } }],
    ['inventory array', { ...fresh, inventory: [] }],
    ['bad progress', { ...fresh, progress: { ...fresh.progress, unlocked: ['1'] } }],
    ['missing progress', { ...fresh, progress: undefined }],
    ['bad completed list', { ...fresh, progress: { ...fresh.progress, completed: null } }],
    ['bad best map', { ...fresh, progress: { ...fresh.progress, best: { 1: -5 } } }],
    ['bad selected level', { ...fresh, selectedLevel: 'one' }],
    ['unknown tutorial step', { ...fresh, tutorialStep: 'nap' }],
    ['bad settings', { ...fresh, settings: { ...fresh.settings, muted: 'no' } }],
    ['missing settings', { ...fresh, settings: undefined }],
    ['bad volume', { ...fresh, settings: { ...fresh.settings, volume: '1' } }],
    ['bad touch mode', { ...fresh, settings: { ...fresh.settings, touchControls: 'always' } }],
    ['bad stats', { ...fresh, stats: { flights: 1, totalEarned: '5' } }],
    ['missing stats', { ...fresh, stats: undefined }],
    ['bad flight count', { ...fresh, stats: { flights: -1, totalEarned: 0 } }],
  ])('rejects %s', (_label, raw) => {
    expect(parseSave(raw)).toBeNull();
  });

  it('knows whether a save holds progress', () => {
    expect(hasProgress(fresh)).toBe(false);
    expect(hasProgress({ ...fresh, tutorialStep: 'buy_body' })).toBe(true);
    expect(hasProgress({ ...fresh, stats: { flights: 1, totalEarned: 0 } })).toBe(true);
  });
});

describe('guest backend', () => {
  it('saves, loads and clears through storage', async () => {
    const storage = memoryStorage();
    const backend = createGuestBackend(storage);
    expect(await backend.load()).toBeNull();
    await backend.save(played);
    expect(storage.data.has(GUEST_SAVE_KEY)).toBe(true);
    expect(await backend.load()).toEqual(played);
    await backend.clear();
    expect(await backend.load()).toBeNull();
  });

  it('treats corrupt or invalid data as no save', async () => {
    const storage = memoryStorage();
    const backend = createGuestBackend(storage, 'k');
    storage.setItem('k', '{not json');
    expect(await backend.load()).toBeNull();
    storage.setItem('k', JSON.stringify({ version: 9 }));
    expect(await backend.load()).toBeNull();
  });
});

describe('decideMigration', () => {
  it('offers to import guest progress on first sign-in only', () => {
    expect(decideMigration(played, null)).toBe('offer-import');
    expect(decideMigration(played, fresh)).toBe('use-remote');
    expect(decideMigration(fresh, null)).toBe('fresh');
    expect(decideMigration(null, null)).toBe('fresh');
  });
});

/** A fake of the slice of supabase-js the adapters use. */
function fakeClient(opts: { row?: unknown; error?: { message: string } | null; user?: { id: string; email?: string } | null }) {
  const error = opts.error ?? null;
  const calls: unknown[][] = [];
  const query = {
    select: (...a: unknown[]) => (calls.push(['select', ...a]), query),
    eq: (...a: unknown[]) => (calls.push(['eq', ...a]), query),
    maybeSingle: async () => ({ data: opts.row ?? null, error }),
    upsert: async (...a: unknown[]) => (calls.push(['upsert', ...a]), { error }),
    delete: () => ({ eq: async (...a: unknown[]) => (calls.push(['delete', ...a]), { error }) }),
  };
  const user = opts.user === undefined ? { id: 'u1', email: 'a@b.c' } : opts.user;
  const auth = {
    getUser: async () => ({ data: { user } }),
    signInWithPassword: vi.fn(async () => ({ data: { user }, error })),
    signUp: vi.fn(async () => ({ data: { user }, error })),
    signOut: async () => ({ error }),
  };
  return { client: { from: () => query, auth } as unknown as SupabaseClient, calls, auth };
}

describe('supabase adapters', () => {
  it('only creates a client when both env variables are set', () => {
    expect(createSupabaseFromEnv({})).toBeNull();
    expect(createSupabaseFromEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(createSupabaseFromEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).not.toBeNull();
  });

  it('loads, upserts and deletes the signed-in player’s row', async () => {
    const { client, calls } = fakeClient({ row: { data: played } });
    const backend = createCloudBackend(client, 'u1');
    expect(await backend.load()).toEqual(played);
    await backend.save(played);
    await backend.clear();
    expect(calls).toContainEqual(['eq', 'user_id', 'u1']);
    expect(calls).toContainEqual(['upsert', expect.objectContaining({ user_id: 'u1', data: played })]);
    expect(calls).toContainEqual(['delete', 'user_id', 'u1']);
  });

  it('returns null without a row and surfaces database errors', async () => {
    expect(await createCloudBackend(fakeClient({}).client, 'u1').load()).toBeNull();
    const failing = createCloudBackend(fakeClient({ error: { message: 'boom' } }).client, 'u1');
    await expect(failing.load()).rejects.toThrow('boom');
    await expect(failing.save(played)).rejects.toThrow('boom');
    await expect(failing.clear()).rejects.toThrow('boom');
  });

  it('signs in, signs up and signs out with email and password', async () => {
    const { client, auth } = fakeClient({});
    const service = createAuth(client);
    expect(await service.currentUser()).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(await service.signIn('a@b.c', 'pw')).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });
    expect(await service.signUp('a@b.c', 'pw')).toEqual({ id: 'u1', email: 'a@b.c' });
    await expect(service.signOut()).resolves.toBeUndefined();
  });

  it('reports auth failures and unconfirmed sign-ups', async () => {
    const failing = createAuth(fakeClient({ error: { message: 'Invalid login' } }).client);
    await expect(failing.signIn('a', 'b')).rejects.toThrow('Invalid login');
    await expect(failing.signOut()).rejects.toThrow('Invalid login');
    const pending = createAuth(fakeClient({ user: null }).client);
    expect(await pending.currentUser()).toBeNull();
    await expect(pending.signUp('a', 'b')).rejects.toThrow(/confirm your email/);
    const noEmail = createAuth(fakeClient({ user: { id: 'u2' } }).client);
    expect(await noEmail.currentUser()).toEqual({ id: 'u2', email: '' });
    expect(await noEmail.signIn('a', 'b')).toEqual({ id: 'u2', email: '' });
  });
});
