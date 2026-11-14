import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SaveBackend } from './backend';
import { parseSave } from './save';

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
      const { error } = await client.auth.signOut();
      if (error) throw new Error(error.message);
    },
  };
}

/** Cloud saves: one row per user in the `saves` table (see supabase/migrations). */
export function createCloudBackend(client: SupabaseClient, userId: string): SaveBackend {
  const table = () => client.from('saves');
  return {
    async load() {
      const { data, error } = await table().select('data').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? parseSave(data.data) : null;
    },
    async save(save) {
      const { error } = await table().upsert({ user_id: userId, data: save, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    async clear() {
      const { error } = await table().delete().eq('user_id', userId);
      if (error) throw new Error(error.message);
    },
  };
}
