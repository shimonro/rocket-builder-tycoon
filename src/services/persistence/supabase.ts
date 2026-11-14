import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SaveConflictError, type SaveBackend } from './backend';
import { parseSave, type SaveData } from './save';

export interface SupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** Login is available only when the deployment sets both Supabase variables. */
export function createSupabaseFromEnv(env: SupabaseEnv): SupabaseClient | null {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

export interface User {
  id: string;
  email: string;
}

export interface AuthService {
  currentUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signUp(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  /** Emails a reset link that returns to `redirectTo`. */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** Calls back when the page was opened from a password reset link. Returns an unsubscribe function. */
  onPasswordRecovery(callback: () => void): () => void;
}

type AuthResponse = {
  data: { user: { id: string; email?: string } | null };
  error: { message: string } | null;
};

function toUser({ data, error }: AuthResponse, fallback: string): User {
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error(fallback);
  return { id: data.user.id, email: data.user.email ?? '' };
}

function check({ error }: { error: { message: string } | null }) {
  if (error) throw new Error(error.message);
}

export function createAuth(client: SupabaseClient): AuthService {
  return {
    async currentUser() {
      const { data } = await client.auth.getUser();
      return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null;
    },
    async signIn(email, password) {
      return toUser(await client.auth.signInWithPassword({ email, password }), 'Sign-in failed');
    },
    async signUp(email, password) {
      return toUser(
        await client.auth.signUp({ email, password }),
        'Check your inbox to confirm your email, then sign in.',
      );
    },
    async signOut() {
      check(await client.auth.signOut());
    },
    async requestPasswordReset(email, redirectTo) {
      check(await client.auth.resetPasswordForEmail(email, { redirectTo }));
    },
    async updatePassword(password) {
      check(await client.auth.updateUser({ password }));
    },
    onPasswordRecovery(callback) {
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') callback();
      });
      return () => data.subscription.unsubscribe();
    },
  };
}

/** Cloud saves: one row per user in the `saves` table (see supabase/migrations). */
export function createCloudBackend(client: SupabaseClient, userId: string): SaveBackend {
  const table = () => client.from('saves');
  const row = (save: SaveData) => ({ user_id: userId, data: save, updated_at: new Date().toISOString() });
  async function load() {
    const { data, error } = await table().select('data').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? parseSave(data.data) : null;
  }
  async function conflict(): Promise<never> {
    const remote = await load();
    throw remote ? new SaveConflictError(remote) : new Error('Save failed: the cloud copy is unreadable.');
  }
  return {
    load,
    async save(save, base) {
      if (base === undefined) return check(await table().upsert(row(save)));
      if (base === null) {
        const { error } = await table().insert(row(save));
        if (error?.code === '23505') return conflict();
        return check({ error });
      }
      // Only overwrite the copy this device last saw; anything else means another device saved meanwhile.
      const { data, error } = await table().update(row(save)).eq('user_id', userId).eq('data->>updatedAt', String(base)).select('user_id');
      check({ error });
      if (data && data.length > 0) return;
      if ((await load()) === null) return check(await table().upsert(row(save)));
      return conflict();
    },
    async clear() {
      check(await table().delete().eq('user_id', userId));
    },
  };
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  distance: number;
}

export interface RunSubmission {
  levelId: number;
  seed: number;
  log: number[];
  aborted: boolean;
  rulesVersion: string;
  name: string;
}

export type SubmitResult = { ok: true; distance: number; rank: number; best: number } | { ok: false; error: string };

/** Per-level leaderboards. Runs are re-simulated by the `submit-run` edge function before they count. */
export function createLeaderboard(client: SupabaseClient) {
  return {
    async top(levelId: number, limit = 10): Promise<LeaderboardEntry[]> {
      const { data, error } = await client
        .from('leaderboard')
        .select('user_id, name, distance')
        .eq('level_id', levelId)
        .order('distance', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ userId: r.user_id, name: r.name, distance: r.distance }));
    },
    async submit(run: RunSubmission): Promise<SubmitResult> {
      const { data, error } = await client.functions.invoke('submit-run', { body: run });
      if (error) {
        // Edge function errors carry the JSON body in `context`.
        const body = await (error.context as Response | undefined)?.json?.().catch(() => null);
        return { ok: false, error: body?.error ?? error.message };
      }
      return data as SubmitResult;
    },
  };
}
