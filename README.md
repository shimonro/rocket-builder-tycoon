# Rocket Builder Tycoon

Browser arcade-tycoon hybrid: buy rocket parts, assemble a rocket, fly it up through hazardous levels, earn money, upgrade, unlock the next level. Built from the design document v1.1.

- **Production:** https://rocket-builder-tycoon.vercel.app (branch `main`; installable as an app; works offline as a guest)
- **QA:** https://rocket-builder-tycoon-qa.vercel.app (branch `dev`; Vercel login required)
- **Code:** https://github.com/shimonro/rocket-builder-tycoon is the primary repository.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run build && npm run preview   # production build
```

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint, including a rule that stops engines importing each other |
| `npm run typecheck` | TypeScript |
| `npm run test:coverage` | Vitest; fails below 100% statements/branches/functions/lines on `src/core`, `src/engines`, `src/services/persistence` and the leaderboard verifier |
| `npm run test:e2e` | Playwright (desktop + Pixel 7 touch) against the production build, with Supabase mocked |
| `npm run deploy:functions` | Bundles and deploys the Supabase edge functions (needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`) |

Add `?timescale=4` to the URL to speed up flights (used by the E2E tests).

## Controls

| Keyboard | Touch | Action |
| --- | --- | --- |
| ← → / A D | drag anywhere | steer |
| ↑ / W | ▲ | full throttle (default is 70% cruise) |
| ↓ / S | ▼ | brake / reverse |
| ↑ ×3 quickly | ▲ ×3 quickly | fast mode: locks full throttle; tap ↓ / ▼ once to cancel |
| Space | ⚡ | turbo (short burst, costs 3% fuel) |
| F / X / Enter | 🔫 | fire weapon (Level 2+) |
| Esc / P | ⏸ | pause, or end the flight and collect the payout |

## What's in the game

- **Shop, hangar, 10 levels, locked tutorial** (returning players can skip it), per the design document. The tutorial points at each thing it explains (cash, ranking ★, gems 💎, rocket stats) and the tutorial flight pauses to introduce the first hoop, asteroid, coin, fuel can and gem. The ℹ️ guide can replay it as a guided tour without touching progress.
- **Hangar bays:** up to 4 rockets (bays cost $2,500 / $12,000 / $45,000). Each prebuilt rocket needs a free bay; inventory parts are shared.
- **Shop tools:** sort (price, ranking gain, rarity), compare any part or prebuilt against your current rocket, per-category help, and specialist parts (part levels 3–5) that boost one stat at a cost elsewhere (penalties are not scaled by rarity or upgrades).
- **Part upgrades:** +10% to all of a part's stats per level, up to 3 levels; level n+1 costs price × 0.5 × (n+1).
- **Flight variety:** coin trails (paid after the flight, outside the soft cap), fuel cans (+20% tank), wind bands (Level 3+), meteor showers (Level 4+), and a Guardian boss just before the finish line (Level 2+; shooting it down pays 15 coins).
- **Gems 💎 (premium currency, earned only):** 17 achievements, 3 daily missions and rare gems caught in flight pay gems, which buy cosmetic hull paints, flame colors, smoke trails and flags/logos on the hull. Gems are never sold and never affect stats.
- **Replays and celebrations:** watch any finished flight again from the results (1×/2×/4×); confetti for new bests, completed levels, achievements and missions.
- **Profile:** pilot name, rocket and lifetime statistics.
- **Environment badge and god mode:** the top bar shows `QA`/`DEV` and the version (`package.json` version + commit). QA and local builds have a god-mode toggle (endless cash and gems, everything unlocked); switching it off restores the earlier save, and god-mode runs never reach the leaderboards. Production builds never include the toggle.
- **Ghost:** a faint rocket replays your best run on each level (stored on the device).
- **Leaderboards:** signed-in players' best run per level. The `submit-run` edge function replays the recorded inputs with the rocket from the player's cloud save, so the score is the server's distance, not a number the client claims.
- **Accounts:** email/password, guest→account import, password reset by email, and save-conflict handling when two devices play the same account.
- **Audio:** synthesized sound effects, background music (menu and flight moods), engine hum; vibration on hits on phones.
- **PWA:** installable, precached, playable offline as a guest.
- **Anonymous telemetry and crash reports** (players can opt out in Settings; Do Not Track is honored).

## Layout

```
src/
  core/        parts + rarity/upgrade math, rocket assembly + ranking, seeded RNG, event bus
  engines/     shop, builder (hangar), journey (flight sim + replay), levels (+ economy), progression
               (achievements, missions, cosmetics), tutorial: pure functions, no cross-engine imports, 100% covered
  data/        JSON catalog (102 parts, 5 prebuilts), 10 levels, achievements, missions, cosmetics, tuning configs
  services/    persistence (localStorage guest, Supabase cloud, ghosts), audio, telemetry
  state/       Zustand store wiring the engines together; save/auth/leaderboard session
  ui/          React screens + components, PixiJS flight renderer, shared SVG rocket art
api/           Vercel function: daily keep-alive (with a 6-hourly GitHub Actions backup) so the free Supabase project is not paused
e2e/           Playwright specs, with an in-memory Supabase mock
supabase/      SQL migrations and the submit-run edge function
scripts/       edge function bundler/deployer
```

All balance numbers live in `src/data`; edit the JSON, no code changes needed. To check balance, `.amp/in/orb-backup/sim.test.ts.bak` is an autopilot simulation: copy it to `src/sim.test.ts`, run it with Vitest, and read `/tmp/sim.txt`.

## Backend setup (Supabase + Vercel)

Guest play works with no backend. For accounts, leaderboards and telemetry:

1. Create a Supabase project and run the files in `supabase/migrations/` in order in its SQL editor.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (in `.env.local`, and in the Vercel project settings) and rebuild.
3. Deploy the edge function: `SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… npm run deploy:functions`. CI does this on every push to `main` once the repository has a `SUPABASE_ACCESS_TOKEN` Actions secret (the project ref is in `.github/workflows/ci.yml`). The function must match the deployed client's flight rules; an outdated client is asked to reload.
4. Keep-alive: Free projects pause after a quiet week. `keepalive()` (migration 0003) does a small write and reads; the Vercel cron calls it daily on production and `.github/workflows/keepalive.yml` calls it on both projects every 6 hours. Supabase does not publish its exact activity rule, so this makes a pause unlikely but not impossible; only a paid plan guarantees it.
5. Reports: the `analytics` schema has views `daily_sessions`, `tutorial_funnel`, `level_stats` and `recent_errors` (Supabase dashboard → SQL editor, e.g. `select * from analytics.level_stats`).

Password-reset and confirmation emails use Supabase's built-in mailer, which only delivers to the project team's addresses and a few per hour. For real players, add a custom SMTP provider (e.g. Resend with a verified domain) under Authentication → Emails, then you can turn email confirmation back on.

Vercel's Hobby plan is for non-commercial projects; move to Pro before adding ads or purchases.

## Environments and promotion

| | QA | Production |
| --- | --- | --- |
| Branch | `dev` | `main` |
| URL | https://rocket-builder-tycoon-qa.vercel.app | https://rocket-builder-tycoon.vercel.app |
| Supabase project | `rocket-builder-tycoon-qa` (`xcjjnkzrnmsljixwfhtz`) | `rocket-builder-tycoon` (`mauusienlfbrzwnbvzru`) |
| Vercel env vars | Preview + Development targets | Production target |
| Access | Vercel login (deployment protection) | Public |

QA has its own accounts, saves, leaderboards and telemetry, so testing never touches real players. Pull request previews (and local `.env.local`) use the QA project too.

1. Push to `dev` (directly or by merging a feature branch). CI runs and Vercel deploys QA.
2. Test on the QA URL.
3. Promote: open a pull request from `dev` to `main` (https://github.com/shimonro/rocket-builder-tycoon/compare/main...dev?expand=1), wait for the green `check`, and merge. Vercel deploys production.

Database changes go in `supabase/migrations/`; apply each new file to QA first, then to production before promoting. Edge functions deploy from CI to the matching project once the `SUPABASE_ACCESS_TOKEN` secret exists. To enforce the flow, protect `main` in GitHub (Settings → Branches → Add rule: require a pull request and the `check` status).

## Design interpretations

Where the design document left room, the game does this (all tunable in `src/data`):

- **Overtime flights.** Reaching the target completes the level and pays the bonus, but the flight continues so the diminishing-returns band (50% to 2× target, 25% beyond, soft cap at 3× target pay) actually matters.
- **Ranking bonus** = +0.2% payout per ranking point above the level's minimum, capped at +50%.
- **Completion bonus** is paid in full the first time, 25% on repeats; the "multiplier increase" comes from each next level paying more per meter.
- **Hull** is a stat (bodies provide it) and counts in the ranking at weight 0.5, so bodies matter.
- **Part levels 1–5** unlock two game levels at a time (part level ≤ ⌈highest unlocked level / 2⌉).
- **Prebuilt rockets** use exclusive, ~12% better tuned parts and cost ~25% more than the equivalent parts.
- **Selling** spare parts refunds 50%; upgrades stay with the part type.
- **Weapons** have 12 shots per flight with a short cooldown.
- **Leaderboard trust:** runs are verified by replay, but the economy runs on the client, so a determined cheater could edit their own save or script inputs. Scores are still always physically possible for the rocket on file.
