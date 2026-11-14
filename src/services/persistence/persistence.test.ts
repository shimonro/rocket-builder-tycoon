import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createGuestBackend, decideMigration, decideSync, GUEST_SAVE_KEY, SaveConflictError } from './backend';
import { createGhostStore, ghostPosition, GHOST_INTERVAL } from './ghosts';
import { defaultSave, hasProgress, parseSave, type SaveData } from './save';
import { createAuth, createCloudBackend, createLeaderboard, createSupabaseFromEnv } from './supabase';

const fresh = defaultSave(600);
const played: SaveData = { ...fresh, cash: 900, tutorialStep: 'done', stats: { ...fresh.stats, flights: 3, totalEarned: 1500 }, updatedAt: 50 };

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
    ['wrong version', { ...fresh, version: 3 }],
    ['fractional gems', { ...fresh, gems: 1.5 }],
    ['bad upgrades', { ...fresh, upgrades: { a: -1 } }],
    ['bad music level', { ...fresh, settings: { ...fresh.settings, music: 'loud' } }],
    ['bad pilot name', { ...fresh, settings: { ...fresh.settings, pilotName: 7 } }],
    ['bad achievements', { ...fresh, achievements: [1] }],
    ['bad tips', { ...fresh, tips: null }],
    ['bad missions', { ...fresh, missions: { day: '2026-01-01', list: [{ id: 'x' }] } }],
    ['missions without list', { ...fresh, missions: { day: '2026-01-01' } }],
    ['bad cosmetics', { ...fresh, cosmetics: { owned: 'x', equipped: {} } }],
    ['missing cosmetics', { ...fresh, cosmetics: undefined }],
    ['unknown cosmetic slot', { ...fresh, cosmetics: { owned: [], equipped: { hat: 'x' } } }],
    ['bad lifetime stat', { ...fresh, stats: { ...fresh.stats, coins: -2 } }],
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
    ['bad stats', { ...fresh, stats: { ...fresh.stats, totalEarned: '5' } }],
    ['missing stats', { ...fresh, stats: undefined }],
    ['bad flight count', { ...fresh, stats: { ...fresh.stats, flights: 1.5 } }],
  ])('rejects %s', (_label, raw) => {
    expect(parseSave(raw)).toBeNull();
  });

  it('accepts saved missions and equipped cosmetics', () => {
    const save = {
      ...played,
      missions: { day: '2026-11-14', list: [{ id: 'hoops', metric: 'hoops', text: 'Fly through 8 hoops', target: 8, progress: 3, gems: 5, claimed: false }] },
      cosmetics: { owned: ['paint_gold'], equipped: { paint: 'paint_gold' } },
    };
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('upgrades version 1 saves, keeping their progress and settings', () => {
    const v1 = {
      version: 1,
      cash: 1234,
      inventory: { a: 1 },
      rocket: { engine: 'e' },
      progress: { unlocked: [1, 2], completed: [1], best: { '1': 1500 } },
      selectedLevel: 2,
      tutorialStep: 'done',
      settings: { volume: 0.3, muted: true, touchControls: 'on' },
      stats: { flights: 7, totalEarned: 9000 },
      updatedAt: 5,
    };
    const save = parseSave(v1)!;
    expect(save).toMatchObject({ version: 2, cash: 1234, gems: 0, upgrades: {}, achievements: [], missions: null, tips: [] });
    expect(save.settings).toEqual({ ...fresh.settings, volume: 0.3, muted: true, touchControls: 'on' });
    expect(save.stats).toEqual({ ...fresh.stats, flights: 7, totalEarned: 9000 });
    expect(parseSave({ ...v1, stats: 'x' })).toBeNull();
    expect(parseSave({ ...v1, settings: undefined })?.settings).toEqual(fresh.settings);
  });

  it('knows whether a save holds progress', () => {
    expect(hasProgress(fresh)).toBe(false);
    expect(hasProgress({ ...fresh, tutorialStep: 'buy_body' })).toBe(true);
    expect(hasProgress({ ...fresh, stats: { ...fresh.stats, flights: 1 } })).toBe(true);
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

describe('decideSync', () => {
  const remote = { ...played, updatedAt: 90 };
  it('adopts changes made elsewhere unless this device changed too', () => {
    expect(decideSync(50, 50, null)).toBe('in-sync');
    expect(decideSync(70, 90, remote)).toBe('in-sync');
    expect(decideSync(50, 50, remote)).toBe('adopt-remote');
    expect(decideSync(60, 50, remote)).toBe('conflict');
    expect(decideSync(60, null, remote)).toBe('conflict');
  });
});

describe('ghosts', () => {
  it('keeps only the best run per level and survives bad storage', () => {
    const storage = memoryStorage();
    const ghosts = createGhostStore(storage, 'g');
    expect(ghosts.get(1)).toBeNull();
    expect(ghosts.offer(1, { distance: 100, points: [0, 0, 1, 10] })).toBe(true);
    expect(ghosts.offer(1, { distance: 90, points: [] })).toBe(false);
    expect(ghosts.offer(2, { distance: 5, points: [] })).toBe(true);
    expect(ghosts.get(1)?.distance).toBe(100);
    storage.setItem('g', '{oops');
    expect(ghosts.get(1)).toBeNull();
    storage.setItem('g', 'null');
    expect(ghosts.get(1)).toBeNull();
    const full = { ...storage, setItem: () => { throw new Error('quota'); } };
    expect(createGhostStore(full, 'g').offer(3, { distance: 1, points: [] })).toBe(false);
  });

  it('interpolates the ghost position over time', () => {
    const ghost = { distance: 20, points: [10, 0, 12, 10, 14, 20] };
    expect(ghostPosition(ghost, 0)).toEqual({ x: 10, y: 0 });
    const mid = ghostPosition(ghost, GHOST_INTERVAL * 1.5)!;
    expect(mid.x).toBeCloseTo(13);
    expect(mid.y).toBeCloseTo(15);
    expect(ghostPosition(ghost, GHOST_INTERVAL * 2)).toBeNull();
    expect(ghostPosition(ghost, -1)).toBeNull();
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
function fakeClient(opts: {
  row?: unknown;
  error?: { message: string; code?: string } | null;
  user?: { id: string; email?: string } | null;
  updated?: unknown[];
  insertError?: { message: string; code?: string } | null;
  rows?: unknown[];
  invoke?: { data: unknown; error: unknown };
}) {
  const error = opts.error ?? null;
  const calls: unknown[][] = [];
  const query = {
    select: (...a: unknown[]) => (calls.push(['select', ...a]), query),
    eq: (...a: unknown[]) => (calls.push(['eq', ...a]), query),
    order: (...a: unknown[]) => (calls.push(['order', ...a]), query),
    limit: async (...a: unknown[]) => (calls.push(['limit', ...a]), { data: opts.rows ?? null, error }),
    maybeSingle: async () => ({ data: typeof opts.row === 'function' ? opts.row() : (opts.row ?? null), error }),
    upsert: async (...a: unknown[]) => (calls.push(['upsert', ...a]), { error }),
    insert: async (...a: unknown[]) => (calls.push(['insert', ...a]), { error: opts.insertError ?? error }),
    update: (...a: unknown[]) => {
      calls.push(['update', ...a]);
      const chain = {
        eq: (...e: unknown[]) => (calls.push(['eq', ...e]), chain),
        select: async () => ({ data: opts.updated ?? [], error }),
      };
      return chain;
    },
    delete: () => ({ eq: async (...a: unknown[]) => (calls.push(['delete', ...a]), { error }) }),
  };
  const user = opts.user === undefined ? { id: 'u1', email: 'a@b.c' } : opts.user;
  let authListener: ((event: string) => void) | null = null;
  const unsubscribe = vi.fn();
  const auth = {
    getUser: async () => ({ data: { user } }),
    signInWithPassword: vi.fn(async () => ({ data: { user }, error })),
    signUp: vi.fn(async () => ({ data: { user }, error })),
    signOut: async () => ({ error }),
    resetPasswordForEmail: vi.fn(async () => ({ error })),
    updateUser: vi.fn(async () => ({ data: { user }, error })),
    onAuthStateChange: (cb: (event: string) => void) => ((authListener = cb), { data: { subscription: { unsubscribe } } }),
  };
  const functions = { invoke: vi.fn(async () => opts.invoke ?? { data: null, error: null }) };
  const client = { from: () => query, auth, functions } as unknown as SupabaseClient;
  return { client, calls, auth, functions, unsubscribe, fire: (event: string) => authListener?.(event) };
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

  it('only overwrites the cloud copy this device last saw', async () => {
    const ok = fakeClient({ updated: [{ user_id: 'u1' }] });
    await createCloudBackend(ok.client, 'u1').save(played, 40);
    expect(ok.calls).toContainEqual(['eq', 'data->>updatedAt', '40']);
    expect(ok.calls.some((c) => c[0] === 'upsert')).toBe(false);

    const newer = { ...played, cash: 5, updatedAt: 99 };
    const stale = createCloudBackend(fakeClient({ updated: [], row: { data: newer } }).client, 'u1');
    const err = await stale.save(played, 40).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveConflictError);
    expect((err as SaveConflictError).remote).toEqual(newer);

    const gone = fakeClient({ updated: [], row: null });
    await createCloudBackend(gone.client, 'u1').save(played, 40);
    expect(gone.calls).toContainEqual(['upsert', expect.objectContaining({ data: played })]);

    const garbled = fakeClient({ insertError: { message: 'dup', code: '23505' }, row: { data: { version: 9 } } });
    await expect(createCloudBackend(garbled.client, 'u1').save(played, null)).rejects.toThrow(/unreadable/);
  });

  it('inserts the first cloud copy and detects one created meanwhile', async () => {
    const first = fakeClient({});
    await createCloudBackend(first.client, 'u1').save(played, null);
    expect(first.calls).toContainEqual(['insert', expect.objectContaining({ data: played })]);
    const raced = createCloudBackend(fakeClient({ insertError: { message: 'dup', code: '23505' }, row: { data: played } }).client, 'u1');
    await expect(raced.save(played, null)).rejects.toBeInstanceOf(SaveConflictError);
    const broken = createCloudBackend(fakeClient({ insertError: { message: 'nope' } }).client, 'u1');
    await expect(broken.save(played, null)).rejects.toThrow('nope');
  });

  it('returns null without a row and surfaces database errors', async () => {
    expect(await createCloudBackend(fakeClient({}).client, 'u1').load()).toBeNull();
    const failing = createCloudBackend(fakeClient({ error: { message: 'boom' } }).client, 'u1');
    await expect(failing.load()).rejects.toThrow('boom');
    await expect(failing.save(played)).rejects.toThrow('boom');
    await expect(failing.save(played, 3)).rejects.toThrow('boom');
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

  it('resets passwords through an emailed link', async () => {
    const fake = fakeClient({});
    const service = createAuth(fake.client);
    await service.requestPasswordReset('a@b.c', 'https://game.example/');
    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', { redirectTo: 'https://game.example/' });
    await service.updatePassword('new-secret');
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'new-secret' });
    const onRecovery = vi.fn();
    const stop = service.onPasswordRecovery(onRecovery);
    fake.fire('SIGNED_IN');
    expect(onRecovery).not.toHaveBeenCalled();
    fake.fire('PASSWORD_RECOVERY');
    expect(onRecovery).toHaveBeenCalledOnce();
    stop();
    expect(fake.unsubscribe).toHaveBeenCalled();
    const failing = createAuth(fakeClient({ error: { message: 'rate limited' } }).client);
    await expect(failing.requestPasswordReset('a', 'b')).rejects.toThrow('rate limited');
    await expect(failing.updatePassword('x')).rejects.toThrow('rate limited');
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

describe('leaderboard adapter', () => {
  const run = { levelId: 2, seed: 9, log: [1, 2], aborted: false, rulesVersion: 'v', name: 'Ace' };

  it('lists the top runs of a level', async () => {
    const fake = fakeClient({ rows: [{ user_id: 'u1', name: 'Ace', distance: 900 }] });
    expect(await createLeaderboard(fake.client).top(2)).toEqual([{ userId: 'u1', name: 'Ace', distance: 900 }]);
    expect(fake.calls).toContainEqual(['eq', 'level_id', 2]);
    expect(fake.calls).toContainEqual(['order', 'distance', { ascending: false }]);
    expect(fake.calls).toContainEqual(['limit', 10]);
    expect(await createLeaderboard(fakeClient({}).client).top(2)).toEqual([]);
    await expect(createLeaderboard(fakeClient({ error: { message: 'down' } }).client).top(2)).rejects.toThrow('down');
  });

  it('submits runs for verification and reports server errors', async () => {
    const accepted = { ok: true, distance: 900, rank: 1, best: 900 };
    const fake = fakeClient({ invoke: { data: accepted, error: null } });
    expect(await createLeaderboard(fake.client).submit(run)).toEqual(accepted);
    expect(fake.functions.invoke).toHaveBeenCalledWith('submit-run', { body: run });

    const context = { json: async () => ({ error: 'Replay mismatch' }) };
    const rejected = fakeClient({ invoke: { data: null, error: { message: 'non-2xx', context } } });
    expect(await createLeaderboard(rejected.client).submit(run)).toEqual({ ok: false, error: 'Replay mismatch' });

    const offline = fakeClient({ invoke: { data: null, error: { message: 'Failed to fetch' } } });
    expect(await createLeaderboard(offline.client).submit(run)).toEqual({ ok: false, error: 'Failed to fetch' });
    const unreadable = fakeClient({ invoke: { data: null, error: { message: 'bad', context: { json: async () => { throw new Error('x'); } } } } });
    expect(await createLeaderboard(unreadable.client).submit(run)).toEqual({ ok: false, error: 'bad' });
  });
});
