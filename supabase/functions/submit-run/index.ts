// Edge function: verifies a flight by replaying it, then records it on the level's leaderboard.
// Bundled with scripts/deploy-functions.mjs, which inlines the game engine it shares with the client.
import { parseSave } from '../../../src/services/persistence/save';
import { pilotName, verifyRun, type RunBody } from './verify';

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...init.headers },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const userRes = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: req.headers.get('Authorization') ?? '' } });
  if (!userRes.ok) return json({ ok: false, error: 'Sign in to submit runs.' }, 401);
  const user = (await userRes.json()) as { id: string };

  let body: Partial<RunBody>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Malformed run.' }, 400);
  }

  const saveRes = await db(`saves?user_id=eq.${user.id}&select=data`);
  const rows = saveRes.ok ? ((await saveRes.json()) as { data: unknown }[]) : [];
  const verdict = verifyRun(body, rows[0] ? parseSave(rows[0].data) : null);
  if (!verdict.ok) return json({ ok: false, error: verdict.error }, verdict.status);

  const levelId = body.levelId!;
  const existing = (await (await db(`leaderboard?user_id=eq.${user.id}&level_id=eq.${levelId}&select=distance`)).json()) as { distance: number }[];
  const previous = existing[0]?.distance ?? -1;
  const best = Math.max(previous, verdict.distance);
  const name = pilotName(body.name, user.id);
  if (verdict.distance > previous) {
    const write = await db('leaderboard?on_conflict=user_id,level_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: user.id, level_id: levelId, name, distance: verdict.distance, rules_version: body.rulesVersion, created_at: new Date().toISOString() }),
    });
    if (!write.ok) return json({ ok: false, error: 'Could not save the run.' }, 500);
  } else if (existing[0]) {
    await db(`leaderboard?user_id=eq.${user.id}&level_id=eq.${levelId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  }

  const ahead = await db(`leaderboard?level_id=eq.${levelId}&distance=gt.${best}&select=user_id`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  });
  const rank = Number(ahead.headers.get('content-range')?.split('/')[1] ?? 0) + 1;
  return json({ ok: true, distance: verdict.distance, best, rank });
});
