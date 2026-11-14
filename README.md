# Rocket Builder Tycoon

Browser arcade-tycoon hybrid: buy rocket parts, assemble a rocket, fly it up through hazardous levels, earn money, upgrade, unlock the next level. Built from the design document v1.1.

- **Play:** https://rocket-builder-tycoon.vercel.app (installable as an app; works offline as a guest)
- **Code:** https://github.com/shimonro/rocket-builder-tycoon is the primary repository. Vercel deploys every push to `main`.

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
| Space | ⚡ | turbo (short burst, costs 3% fuel) |
| F / X / Enter | 🔫 | fire weapon (Level 2+) |
| Esc / P | ⏸ | pause, or end the flight and collect the payout |

## What's in the game

- **Shop, hangar, 10 levels, locked tutorial** (returning players can skip it), per the design document.
- **Part upgrades:** +10% to all of a part's stats per level, up to 3 levels; level n+1 costs price × 0.5 × (n+1).
- **Flight variety:** coin trails (paid after the flight, outside the soft cap), fuel cans (+20% tank), wind bands (Level 3+), meteor showers (Level 4+), and a Guardian boss just before the finish line (Level 2+; shooting it down pays 15 coins).
- **Gems 💎 (premium currency, earned only):** 16 achievements and 3 daily missions pay gems, which buy cosmetic hull paints, flame colors and smoke trails. Gems are never sold and never affect stats.
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
api/           Vercel function: daily keep-alive ping so the free Supabase project is never paused
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
4. Reports: the `analytics` schema has views `daily_sessions`, `tutorial_funnel`, `level_stats` and `recent_errors` (Supabase dashboard → SQL editor, e.g. `select * from analytics.level_stats`).

Password-reset and confirmation emails use Supabase's built-in mailer, which only delivers to the project team's addresses and a few per hour. For real players, add a custom SMTP provider (e.g. Resend with a verified domain) under Authentication → Emails, then you can turn email confirmation back on.

Vercel's Hobby plan is for non-commercial projects; move to Pro before adding ads or purchases.

## Development workflow

`main` is protected: changes land through a pull request whose CI check (lint, typecheck, coverage, build, e2e) passes. Work on `dev` (or a feature branch), open a PR to `main`, and Vercel deploys after the merge. Every PR also gets a Vercel preview URL.

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
