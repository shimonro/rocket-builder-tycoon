# Rocket Builder Tycoon

Browser arcade-tycoon hybrid: buy rocket parts, assemble a rocket, fly it up through hazardous levels, earn money, upgrade, unlock the next level. Built from the design document v1.1.

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
| `npm run test:coverage` | Vitest; fails below 100% statements/branches/functions/lines on `src/core`, `src/engines`, `src/services/persistence` |
| `npm run test:e2e` | Playwright (desktop + Pixel 7 touch) against the production build |

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

## Layout

```
src/
  core/        parts + rarity math, rocket assembly + ranking, seeded RNG, event bus
  engines/     shop, builder (hangar), journey (flight sim), levels (+ economy), tutorial
               pure functions, no cross-engine imports, 100% covered
  data/        JSON catalog (102 parts, 5 prebuilts), 10 levels, tuning configs
  services/    persistence (localStorage guest, Supabase cloud), WebAudio sound effects
  state/       Zustand store wiring the engines together; save/auth session
  ui/          React screens + components, PixiJS flight renderer, shared SVG rocket art
e2e/           Playwright specs
supabase/      SQL for the cloud save table
```

All balance numbers live in `src/data` — edit the JSON, no code changes needed.

## Turning on login (Supabase)

Guest play works out of the box. To enable email/password accounts and guest→account migration:

1. Create a Supabase project and run `supabase/migrations/0001_saves.sql` in its SQL editor.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (in `.env.local`, or in the Vercel/Netlify project settings) and rebuild.

The first time a player signs in to an account with no cloud save, they are offered to import their guest progress. An existing cloud save always wins.

## Design interpretations

Where the design document left room, the game does this (all tunable in `src/data`):

- **Overtime flights.** Reaching the target completes the level and pays the bonus, but the flight continues so the diminishing-returns band (50% to 2× target, 25% beyond, soft cap at 3× target pay) actually matters.
- **Ranking bonus** = +0.2% payout per ranking point above the level's minimum, capped at +50%.
- **Completion bonus** is paid in full the first time, 25% on repeats; the "multiplier increase" comes from each next level paying more per meter.
- **Hull** is a stat (bodies provide it) and counts in the ranking at weight 0.5, so bodies matter.
- **Part levels 1–5** unlock two game levels at a time (part level ≤ ⌈highest unlocked level / 2⌉).
- **Prebuilt rockets** use exclusive, ~12% better tuned parts and cost ~25% more than the equivalent parts.
- **Selling** spare parts refunds 50%.
- **Weapons** have 12 shots per flight with a short cooldown.
