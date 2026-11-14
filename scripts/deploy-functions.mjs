// Bundles each edge function (inlining the shared game engine and data) and deploys it through the
// Supabase Management API. Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.
// Usage: node scripts/deploy-functions.mjs [--dry-run]
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'rolldown';

const FUNCTIONS = [{ slug: 'submit-run', verifyJwt: false }];
const dryRun = process.argv.includes('--dry-run');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!dryRun && (!token || !ref)) throw new Error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF');

for (const fn of FUNCTIONS) {
  const outDir = `dist-functions/${fn.slug}`;
  await mkdir(outDir, { recursive: true });
  await build({
    input: `supabase/functions/${fn.slug}/index.ts`,
    platform: 'neutral',
    output: { file: `${outDir}/index.js`, format: 'esm', minify: true },
    logLevel: 'warn',
  });
  const code = await readFile(`${outDir}/index.js`);
  console.log(`${fn.slug}: bundled ${(code.length / 1024).toFixed(1)} KB`);
  if (dryRun) continue;

  const form = new FormData();
  form.append('metadata', JSON.stringify({ name: fn.slug, entrypoint_path: 'index.js', verify_jwt: fn.verifyJwt }));
  form.append('file', new Blob([code], { type: 'application/javascript' }), 'index.js');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${fn.slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn.slug}: deploy failed (${res.status}) ${text}`);
  console.log(`${fn.slug}: deployed (${JSON.parse(text).version ? `version ${JSON.parse(text).version}` : 'ok'})`);
}
