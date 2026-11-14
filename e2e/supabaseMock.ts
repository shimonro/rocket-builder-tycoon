import type { Page, Route } from '@playwright/test';

export const MOCK_URL = 'https://e2e.supabase.test';

interface MockUser {
  id: string;
  email: string;
  password: string;
}

/** In-memory stand-in for the Supabase auth, REST and edge function endpoints the game calls. */
export class SupabaseMock {
  users: MockUser[] = [];
  saves = new Map<string, unknown>();
  events: unknown[] = [];
  submissions: unknown[] = [];
  resetRequests: string[] = [];
  passwordUpdates: string[] = [];
  leaderboard: { user_id: string; name: string; distance: number; level_id: number }[] = [];

  async install(page: Page) {
    await page.route(`${MOCK_URL}/**`, (route) => this.handle(route));
  }

  private token(user: MockUser) {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, exp, role: 'authenticated', aud: 'authenticated' })}.sig`;
  }

  private userJson(user: MockUser) {
    return { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  }

  private session(user: MockUser) {
    return {
      access_token: this.token(user),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `refresh-${user.id}`,
      user: this.userJson(user),
    };
  }

  private userFrom(route: Route): MockUser | undefined {
    const auth = route.request().headers()['authorization'] ?? '';
    const payload = auth.split(' ')[1]?.split('.')[1];
    if (!payload) return undefined;
    try {
      const { sub } = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return this.users.find((u) => u.id === sub);
    } catch {
      return undefined;
    }
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = () => JSON.parse(req.postData() ?? 'null');
    const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(data) });

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }

    if (path === '/auth/v1/signup') {
      const { email, password } = body();
      if (this.users.some((u) => u.email === email)) return json(422, { code: 'user_already_exists', msg: 'User already registered' });
      const user = { id: crypto.randomUUID(), email, password };
      this.users.push(user);
      return json(200, this.session(user));
    }
    if (path === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const { email, password } = body();
        const user = this.users.find((u) => u.email === email && u.password === password);
        return user ? json(200, this.session(user)) : json(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      const user = this.users.find((u) => `refresh-${u.id}` === body().refresh_token);
      return user ? json(200, this.session(user)) : json(400, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
    if (path === '/auth/v1/user') {
      const user = this.userFrom(route);
      if (!user) return json(401, { code: 'bad_jwt', msg: 'invalid JWT' });
      if (method === 'PUT') {
        const { password } = body();
        user.password = password;
        this.passwordUpdates.push(password);
      }
      return json(200, this.userJson(user));
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (path === '/auth/v1/recover') {
      this.resetRequests.push(body().email);
      return json(200, {});
    }

    if (path === '/rest/v1/saves') return this.saveRoute(route, json);
    if (path === '/rest/v1/events') {
      this.events.push(...body());
      return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } });
    }
    if (path === '/rest/v1/leaderboard') {
      const level = Number(url.searchParams.get('level_id')?.replace('eq.', ''));
      return json(200, this.leaderboard.filter((r) => r.level_id === level).sort((a, b) => b.distance - a.distance));
    }
    if (path === '/functions/v1/submit-run') {
      const run = body();
      this.submissions.push(run);
      return json(200, { ok: true, distance: 1234, best: 1234, rank: 1 });
    }
    return json(404, { message: `mock: no route for ${method} ${path}` });
  }

  /** PostgREST subset: select by user_id, insert, upsert, and update guarded by data->>updatedAt. */
  private saveRoute(route: Route, json: (status: number, data: unknown) => Promise<void>) {
    const req = route.request();
    const url = new URL(req.url());
    const user = this.userFrom(route);
    if (!user) return json(401, { message: 'JWT required' });
    const method = req.method();
    const row = (data: unknown) => ({ user_id: user.id, data, updated_at: new Date().toISOString() });
    if (method === 'GET') {
      const data = this.saves.get(user.id);
      const rows = data ? [{ data }] : [];
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return single ? (rows[0] ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' })) : json(200, rows);
    }
    const incoming = JSON.parse(req.postData() ?? 'null');
    if (method === 'POST') {
      const upsert = (req.headers()['prefer'] ?? '').includes('merge-duplicates');
      if (this.saves.has(user.id) && !upsert) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
      this.saves.set(user.id, incoming.data);
      return json(201, []);
    }
    if (method === 'PATCH') {
      const expected = url.searchParams.get('data->>updatedAt')?.replace('eq.', '');
      const current = this.saves.get(user.id) as { updatedAt: number } | undefined;
      if (!current || String(current.updatedAt) !== expected) return json(200, []);
      this.saves.set(user.id, incoming.data);
      return json(200, [row(incoming.data)].map(({ user_id }) => ({ user_id })));
    }
    if (method === 'DELETE') {
      this.saves.delete(user.id);
      return json(204, null);
    }
    return json(405, { message: 'mock: unsupported' });
  }
}
