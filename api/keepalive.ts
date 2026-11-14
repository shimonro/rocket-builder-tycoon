// Daily Vercel cron (see vercel.json): a tiny database read so the free Supabase project
// never counts as inactive and gets paused.
export async function GET(): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ ok: false, error: 'Supabase is not configured' }, { status: 500 });
  const res = await fetch(`${url}/rest/v1/leaderboard?select=level_id&limit=1`, { headers: { apikey: key } });
  return Response.json({ ok: res.ok, status: res.status, at: new Date().toISOString() }, { status: res.ok ? 200 : 502 });
}
