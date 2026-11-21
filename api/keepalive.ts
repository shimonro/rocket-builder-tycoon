// Daily Vercel cron (see vercel.json), backed up by .github/workflows/keepalive.yml every 6 hours:
// calls the keepalive() database function (one write plus table reads) so the free Supabase
// project never looks inactive and gets paused.
export async function GET(): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ ok: false, error: 'Supabase is not configured' }, { status: 500 });
  const res = await fetch(`${url}/rest/v1/rpc/keepalive`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body: unknown = await res.json().catch(() => null);
  return Response.json({ ok: res.ok, status: res.status, db: body }, { status: res.ok ? 200 : 502 });
}
