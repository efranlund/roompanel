# Zamboni Runner — Easter Egg Design Spec

## Overview

A hidden mini-game on the room panels, in the spirit of Chrome's offline dinosaur
game. Triple-tapping the room logo opens a fullscreen endless runner where the
player drives a Zamboni 🚜 across a scrolling ice rink, jumping hockey-themed
obstacles. On game over the player can enter a name; scores are saved to a
**shared office leaderboard** (top 10, name + score + date) visible on every panel.

Target device: Yealink RoomPanel Plus, 1920×1200 landscape, 10.1" touchscreen
(fixed viewport, no responsive breakpoints). Touch is the primary input.

## Goals

- A fun, polished easter egg that feels "on brand" (hockey + EP coral accents).
- Shared leaderboard so people compete across rooms.
- Zero new asset files — render with emoji + canvas-drawn shapes.
- Never destabilise the panel: the game is an isolated overlay that can always be
  closed, auto-dismisses when idle, and degrades gracefully if storage is down.

## Non-Goals

- No sound.
- No ducking / second control — single-button (jump) only.
- No accounts, auth, or moderation of names (panels are already IP-restricted).
- No responsive layout — fixed 1920×1200.

## Trigger & Entry

- Detect **3 taps on the room logo within 1500ms** (`RoomPanel.tsx`, the `<img>` at
  the logo container). A rolling counter resets when the window lapses, so ordinary
  single taps never trigger it.
- On trigger, mount `<HockeyGame onClose={...} />` as a fullscreen overlay above the
  panel. The panel keeps running underneath (its polling/refresh timers are
  untouched).
- Exit paths: an **X close button**, **Play again**, and an **idle auto-close after
  ~45s** of no interaction (kiosk safety so a panel never gets stuck in the game).
- The 5-minute full-page reload in `RoomPanel` remains; if it fires mid-game the
  game simply unmounts. Acceptable for an easter egg.

## Gameplay

- **Endless runner.** The rink scrolls right-to-left; world speed increases gradually
  over time, capped at a maximum.
- **One control:** tap anywhere on the overlay (or press Space) to jump. Jump uses
  simple gravity (impulse up, constant gravity down). Ignored while airborne.
- **Obstacles** spawn from the right at the ground line with spacing that tightens as
  speed rises, with a guaranteed minimum gap so the run is always clearable:
  - 🧹 stray stick · ⚫ puck pile · 🔶 cone · 🚧 ice crack
  - Each obstacle is one of a few sizes; collision with the Zamboni ends the run.
- **Score** increases with distance/time (e.g. +1 per fixed tick). Shown live,
  top-right. A subtle "Speed up!" pulse appears at speed milestones.
- **Game over** on first collision: freeze the world, flash, then show the game-over
  panel.

## Rendering

- HTML5 `<canvas>` sized to the overlay (logical 1920×1200, scaled by
  `devicePixelRatio` for crispness), driven by a `requestAnimationFrame` loop.
- The loop computes `dt`, advances the pure engine (`step`), then draws:
  - Ice-blue rink background with subtle gradient, rink boards top/bottom, a faint
    centre line, slow drifting "snow" specks.
  - Ground line the Zamboni and obstacles sit on.
  - Emoji glyphs for the Zamboni and obstacles (drawn via `fillText`), with a soft
    shadow so they read on the ice.
  - EP coral (`--ep-coral`/`--ep-coral-light`) accents for score and UI chrome.
- Frame-rate independence: physics integrates against `dt` (clamped) so the game
  runs consistently regardless of refresh rate.

## Game Over → Name → Leaderboard

1. **Game over panel**: large final score, a name `<input>` (native field → on-screen
   keyboard on the touch panel; `maxLength` ~12, trimmed; default focus), and a
   **Save** button. Also **Play again** and **Close**.
2. **Save**: `POST /api/highscores` with `{ name, score }`. On success, transition to
   the leaderboard view. Saving is optional — the player can Play again or Close
   without saving.
3. **Leaderboard view**: 🏆 "Office Leaderboard", top 10 rows of `rank · name ·
   score · date (YYYY-MM-DD)`. The player's just-saved row is highlighted. Empty
   leaderboard shows a friendly "Be the first!" state. **Play again** and **Close**.

### Edge cases

- Blank/whitespace name → **Save stays disabled** until the field has at least one
  non-whitespace character (with a small hint).
- Save network/KV failure → keep the score on screen, show "Couldn't save — try
  again", offer retry. Never crash the overlay.
- If storage isn't provisioned, the game is fully playable; only Save/leaderboard are
  unavailable (handled as the failure case above with a clear message).

## Architecture

| Piece | Responsibility |
|---|---|
| `components/HockeyGame.tsx` | Fullscreen overlay React component: canvas + rAF render loop, input handling, screen state machine (`playing → gameover → leaderboard`), idle auto-close. |
| `components/HockeyGame.module.css` | Overlay, canvas, game-over panel, and leaderboard styling (EP brand). |
| `lib/game/zamboniGame.ts` | **Pure, DOM-free** game logic: state shape, tunable constants, `createInitialState()`, `step(state, dtMs, jumpPressed) → state`, spawning, and collision (AABB). Unit-testable. |
| `lib/leaderboard.ts` | Storage wrapper over Upstash Redis: `getTopScores(limit=10)` and `addScore({name, score, date})`. Uses a Redis **sorted set**. |
| `app/api/highscores/route.ts` | `GET` → top 10. `POST` → validate (`name` 1–12 chars after trim; `score` a non-negative finite integer within a sane cap) then `addScore` with server-stamped date; returns updated top 10 + the caller's rank. |
| `components/RoomPanel.tsx` | Triple-tap detection on the logo; conditionally renders `<HockeyGame>`. |

### Why split engine from rendering

The physics, spawning, and collision live in `lib/game/zamboniGame.ts` as pure
functions of `(state, dt, input)`. The canvas only ever draws the latest state.
This keeps the core logic unit-testable without a browser and keeps the component
focused on rendering + UI state.

## Data Model & Storage

- **Store**: Upstash Redis (provisioned via the Vercel Marketplace — the modern
  successor to the discontinued standalone "Vercel KV"). Accessed with
  `@upstash/redis`. Exact wiring confirmed against the `vercel:vercel-storage`
  guide at implementation time.
- **Key**: a single Redis sorted set, e.g. `roompanel:leaderboard`.
  - Write: `ZADD key score member` where `member = JSON.stringify({ name, date, id })`
    and `id` (e.g. `crypto.randomUUID()`) keeps equal scores unique.
  - Read top N: `ZRANGE key 0 N-1 REV WITHSCORES`, parse members.
  - Optional trim to keep the set bounded: `ZREMRANGEBYRANK key 0 -(MAX+1)`.
- **Entry shape returned to client**: `{ name: string, score: number, date: string }`
  where `date` is `YYYY-MM-DD`, server-stamped at save time.
- **Concurrency**: sorted-set ops are atomic, so concurrent submits don't race
  (unlike read-modify-write of a JSON blob).
- **Env vars**: `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or the Upstash-native
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`), set by the Marketplace
  integration. Final names confirmed at implementation.

## API

```
GET  /api/highscores            → { scores: Array<{name, score, date}> }   (top 10)
POST /api/highscores            → body { name, score }
                                  → { scores: [...], rank: number|null }
```

- Both routes sit behind the existing IP-allowlist middleware (matcher already
  covers `/api/*`). No extra access control needed.
- `POST` validation: trim `name` to 1–12 chars (reject empty); `score` must be a
  finite non-negative integer ≤ a generous cap (reject NaN/negative/absurd). Date is
  server-generated (clients never supply it).

## Visual Design

- Overlay uses the EP dark gradient as a backdrop frame; the canvas paints an
  ice-blue rink so it reads as "on the ice".
- Score, buttons, and the leaderboard use EP coral accents and the existing brand
  fonts (Bebas Neue headings, DM Sans body, Outfit numerals) consistent with the
  rest of the panel.
- Game-over and leaderboard panels are glassmorphism cards matching existing
  components (`rgba(255,255,255,0.08)` bg, blur, subtle border).

## Testing

- Unit tests for `lib/game/zamboniGame.ts`: gravity/jump integration, obstacle
  spawning gap guarantees, collision (hit and clear cases), score accrual, speed
  ramp cap. (No test runner exists yet; add a lightweight one — e.g. `node:test` —
  if introducing tests, otherwise document manual verification.)
- API validation tests for `/api/highscores` POST: rejects empty/oversized names,
  rejects non-integer/negative/huge scores, stamps date server-side.
- Manual verification on a 1920×1200 viewport: triple-tap opens game, jump works by
  tap and Space, collision ends run, save adds to leaderboard, X / idle close.

## Out of Scope

- Sound effects / music.
- A second control (duck) or flying obstacles.
- Per-room leaderboards (the board is global by design).
- Name moderation / profanity filtering.
- Persisting in-progress games across reloads.
