# Zamboni Runner Easter Egg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden Chrome-dino-style "Zamboni Runner" game to the room panels, triggered by triple-tapping the room logo, with a shared office leaderboard (name + score + date).

**Architecture:** A fullscreen React overlay (`HockeyGame`) renders an HTML5 canvas driven by `requestAnimationFrame`. All game physics/spawning/collision live in a pure, DOM-free module (`lib/game/zamboniGame.ts`) so they are unit-testable. Scores are persisted in an Upstash Redis sorted set behind a `/api/highscores` Route Handler. The trigger is wired into the existing `RoomPanel` logo.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, CSS Modules, `@upstash/redis`, Vitest (new — for unit tests).

## Global Constraints

- **Next.js version:** `16.2.3`. This is NOT the Next.js in training data — Route Handlers use the Web `Request`/`Response` API; follow the existing pattern in `app/api/book/route.ts` (`NextResponse.json`, `export async function GET/POST(request: Request)`).
- **React version:** `19.2.4`.
- **Target device:** Yealink RoomPanel Plus, fixed **1920×1200 landscape** touchscreen. No responsive breakpoints. **Touch is the primary input.**
- **No new asset files** — render the game with emoji + canvas-drawn shapes only.
- **Brand tokens** (defined in `app/globals.css`, use via `var(...)`): `--ep-coral` `#e05a47`, `--ep-coral-light` `#e8786a`, `--ep-red` `#e74c3c`, `--ep-text-dim` `#8a8d9a`, `--glass-bg`, `--glass-border`, `--glass-blur`, `--font-heading` (Bebas Neue), `--font-body` (DM Sans), `--font-time` (Outfit).
- **Leaderboard entry shape:** `{ name: string; score: number; date: string }` where `date` is `YYYY-MM-DD`, **server-stamped** (clients never send a date).
- **Name rules:** 1–12 chars after trim; empty/whitespace rejected. **Score rules:** finite non-negative integer ≤ 1,000,000.
- **No sound. Single control (jump only).** No ducking / second control.
- The new `/api/highscores` route is automatically behind the existing IP-allowlist `middleware.ts` (matcher already covers `/api/*`). No extra auth.
- Game must never destabilise the panel: it is an isolated overlay, always closeable, auto-closes when idle, and degrades gracefully if storage is unavailable.

---

## File Structure

- **Create** `lib/game/zamboniGame.ts` — pure game engine (state, constants, `step`, spawning, collision, seeded PRNG).
- **Create** `lib/game/zamboniGame.test.ts` — engine unit tests (Vitest).
- **Create** `lib/highscores.ts` — pure submission validation + date helper + shared `ScoreEntry` type.
- **Create** `lib/highscores.test.ts` — validation/date unit tests (Vitest).
- **Create** `lib/leaderboard.ts` — Upstash Redis wrapper (`addScore`, `getTopScores`, pure `parseMember`).
- **Create** `lib/leaderboard.test.ts` — `parseMember` unit tests (Vitest).
- **Create** `app/api/highscores/route.ts` — `GET` (top 10) + `POST` (validate → save → top 10 + rank).
- **Create** `components/HockeyGame.tsx` — overlay component (canvas loop + game-over/leaderboard UI).
- **Create** `components/HockeyGame.module.css` — overlay styling.
- **Modify** `components/RoomPanel.tsx` — triple-tap detection on the logo → render `<HockeyGame>`.
- **Modify** `tsconfig.json` — exclude `**/*.test.ts` from type-checking so `next build` stays clean.
- **Modify** `package.json` — add `vitest` devDep + `"test"` script; add `@upstash/redis` dependency.

---

## Task 1: Pure game engine + test harness

**Files:**
- Create: `lib/game/zamboniGame.ts`
- Test: `lib/game/zamboniGame.test.ts`
- Modify: `package.json` (add `vitest`, `"test"` script)
- Modify: `tsconfig.json` (exclude `**/*.test.ts`)

**Interfaces:**
- Produces:
  - `interface GameState { status: "playing" | "gameover"; y: number; vy: number; obstacles: Obstacle[]; speed: number; distance: number; distanceSinceSpawn: number; nextGap: number; score: number; seed: number }`
  - `interface Obstacle { x: number; width: number; height: number; emoji: string }`
  - `createInitialState(seed: number): GameState`
  - `step(state: GameState, dtMs: number, jump: boolean): GameState`
  - `requiredGap(speed: number): number`
  - `nextRandom(seed: number): { value: number; seed: number }`
  - `collides(state: GameState): boolean`
  - Exported constants: `WORLD_WIDTH`, `WORLD_HEIGHT`, `GROUND_Y`, `ZAMBONI_X`, `ZAMBONI_WIDTH`, `ZAMBONI_HEIGHT`, `START_SPEED`, `MAX_SPEED`, `SCORE_DIVISOR`, `OBSTACLE_TYPES`.

- [ ] **Step 1: Add Vitest and the test script**

Run:
```bash
npm install -D vitest
```

Then edit `package.json` `"scripts"` to add a `test` entry (place after `"lint"`):
```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
```

- [ ] **Step 2: Exclude test files from the TypeScript build**

Edit `tsconfig.json` — change the `"exclude"` array from `["node_modules"]` to:
```json
  "exclude": ["node_modules", "**/*.test.ts"]
```

- [ ] **Step 3: Write the failing engine test**

Create `lib/game/zamboniGame.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  createInitialState,
  step,
  collides,
  requiredGap,
  GameState,
  Obstacle,
  ZAMBONI_X,
  START_SPEED,
  MAX_SPEED,
  SCORE_DIVISOR,
} from "./zamboniGame";

const FRAME = 16; // ms

// Advance the world while clearing spawned obstacles each frame, so that
// speed/score/landing dynamics can be tested in isolation from collisions.
// (Collision behaviour is covered directly in its own describe block.)
function advanceNoObstacles(state: GameState, n: number, jump = false): GameState {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = step(s, FRAME, jump);
    s = { ...s, obstacles: [] };
  }
  return s;
}

describe("createInitialState", () => {
  it("starts grounded, playing, scoreless", () => {
    const s = createInitialState(1);
    expect(s.status).toBe("playing");
    expect(s.y).toBe(0);
    expect(s.vy).toBe(0);
    expect(s.score).toBe(0);
    expect(s.obstacles).toEqual([]);
    expect(s.speed).toBe(START_SPEED);
  });
});

describe("jumping", () => {
  it("rises when jump pressed from the ground", () => {
    const s = step(createInitialState(1), FRAME, true);
    expect(s.y).toBeGreaterThan(0);
    expect(s.vy).toBeGreaterThan(0);
  });

  it("ignores jump while airborne (no double jump)", () => {
    const first = step(createInitialState(1), FRAME, true); // now airborne
    const second = step(first, FRAME, true); // jump pressed again midair
    // velocity keeps decreasing under gravity; it is NOT re-impulsed
    expect(second.vy).toBeLessThan(first.vy);
  });

  it("lands back on the ground after a jump", () => {
    const jumped = step(createInitialState(1), FRAME, true);
    const landed = advanceNoObstacles(jumped, 300, false);
    expect(landed.y).toBe(0);
    expect(landed.vy).toBe(0);
  });
});

describe("speed and score", () => {
  it("ramps speed up to but never past MAX_SPEED", () => {
    const s = advanceNoObstacles(createInitialState(1), 5000);
    expect(s.status).toBe("playing");
    expect(s.speed).toBe(MAX_SPEED);
  });

  it("accrues score as floor(distance / SCORE_DIVISOR)", () => {
    const s = advanceNoObstacles(createInitialState(1), 60);
    expect(s.score).toBe(Math.floor(s.distance / SCORE_DIVISOR));
    expect(s.score).toBeGreaterThan(0);
  });
});

describe("spawning", () => {
  it("keeps consecutive obstacles at least one clearable gap apart", () => {
    // Clear obstacles each frame so the run never ends; we only measure the
    // spacing the spawner produces.
    let s = createInitialState(12345);
    let prevSpawnDistance: number | null = null;
    const gaps: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const before = s.distanceSinceSpawn;
      s = step(s, FRAME, false);
      // a spawn just happened when the spawn accumulator reset downward
      if (s.distanceSinceSpawn < before) {
        if (prevSpawnDistance !== null) gaps.push(s.distance - prevSpawnDistance);
        prevSpawnDistance = s.distance;
      }
      s = { ...s, obstacles: [] };
    }
    expect(gaps.length).toBeGreaterThan(2);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(requiredGap(START_SPEED) * 0.99);
    }
  });
});

describe("collision", () => {
  it("ends the game when an obstacle overlaps the grounded zamboni", () => {
    const base = createInitialState(1);
    const obstacle: Obstacle = { x: ZAMBONI_X, width: 70, height: 64, emoji: "🧹" };
    const s: GameState = { ...base, obstacles: [obstacle] };
    expect(collides(s)).toBe(true);
    expect(step(s, FRAME, false).status).toBe("gameover");
  });

  it("does not collide when the zamboni has jumped above the obstacle", () => {
    const base = createInitialState(1);
    const obstacle: Obstacle = { x: ZAMBONI_X, width: 70, height: 64, emoji: "🧹" };
    const s: GameState = { ...base, y: 300, obstacles: [obstacle] };
    expect(collides(s)).toBe(false);
    expect(step(s, FRAME, false).status).toBe("playing");
  });

  it("is terminal: stepping a gameover state changes nothing", () => {
    const over: GameState = { ...createInitialState(1), status: "gameover", score: 42 };
    expect(step(over, FRAME, true)).toBe(over);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './zamboniGame'` (file not created yet).

- [ ] **Step 5: Implement the engine**

Create `lib/game/zamboniGame.ts`:
```ts
// Pure, DOM-free endless-runner engine for the Zamboni easter egg.
// All units are in a fixed logical world (1920x1200). The renderer draws
// whatever state `step` returns; this module never touches the DOM.

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1200;
export const GROUND_Y = 980; // y of the ice surface the player/obstacles rest on

export const GRAVITY = 2600; // px/s^2 (downward)
export const JUMP_VELOCITY = 1150; // px/s (initial upward impulse)
export const ZAMBONI_X = 320; // fixed horizontal position of the player
export const ZAMBONI_WIDTH = 120;
export const ZAMBONI_HEIGHT = 100;
export const HITBOX_INSET = 16; // forgiving collision margin

export const START_SPEED = 600; // px/s
export const MAX_SPEED = 1500; // px/s
export const SPEED_RAMP = 22; // px/s added per second of play
export const SCORE_DIVISOR = 14; // world px per point
export const MAX_DT_MS = 50; // clamp big frame gaps (tab switch etc.)

export interface ObstacleType {
  emoji: string;
  width: number;
  height: number;
}

export const OBSTACLE_TYPES: ObstacleType[] = [
  { emoji: "🧹", width: 72, height: 64 }, // stray stick
  { emoji: "⚫", width: 60, height: 50 }, // puck pile
  { emoji: "🔶", width: 64, height: 70 }, // cone
  { emoji: "🚧", width: 84, height: 66 }, // ice crack / barrier
];

export const MAX_OBSTACLE_WIDTH = 84;

export interface Obstacle {
  x: number; // left edge in world px
  width: number;
  height: number;
  emoji: string;
}

export type GameStatus = "playing" | "gameover";

export interface GameState {
  status: GameStatus;
  y: number; // height of the zamboni's underside above the ground (0 = grounded)
  vy: number; // vertical velocity, +up
  obstacles: Obstacle[];
  speed: number; // current world scroll speed (px/s)
  distance: number; // total px scrolled
  distanceSinceSpawn: number;
  nextGap: number; // px until the next obstacle spawns
  score: number;
  seed: number; // PRNG state (deterministic spawning)
}

// --- deterministic PRNG (mulberry32) so spawning is testable ---------------
export function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

// airtime of a full jump (s); used to guarantee obstacle gaps are clearable
const JUMP_AIRTIME = (2 * JUMP_VELOCITY) / GRAVITY;

export function requiredGap(speed: number): number {
  // enough horizontal room to clear one obstacle and land before the next
  return speed * JUMP_AIRTIME * 1.25 + MAX_OBSTACLE_WIDTH;
}

export function createInitialState(seed: number): GameState {
  return {
    status: "playing",
    y: 0,
    vy: 0,
    obstacles: [],
    speed: START_SPEED,
    distance: 0,
    distanceSinceSpawn: 0,
    nextGap: requiredGap(START_SPEED),
    score: 0,
    seed: Math.floor(seed) | 0,
  };
}

export function collides(state: GameState): boolean {
  const zLeft = ZAMBONI_X + HITBOX_INSET;
  const zRight = ZAMBONI_X + ZAMBONI_WIDTH - HITBOX_INSET;
  const zBottom = GROUND_Y - state.y - HITBOX_INSET;
  const zTop = GROUND_Y - state.y - ZAMBONI_HEIGHT + HITBOX_INSET;
  for (const o of state.obstacles) {
    const oLeft = o.x;
    const oRight = o.x + o.width;
    const oBottom = GROUND_Y;
    const oTop = GROUND_Y - o.height;
    if (zLeft < oRight && zRight > oLeft && zTop < oBottom && zBottom > oTop) {
      return true;
    }
  }
  return false;
}

export function step(state: GameState, dtMs: number, jump: boolean): GameState {
  if (state.status === "gameover") return state;
  const dt = Math.max(0, Math.min(dtMs, MAX_DT_MS)) / 1000;
  if (dt === 0) return state;

  const speed = Math.min(MAX_SPEED, state.speed + SPEED_RAMP * dt);

  // vertical motion
  let y = state.y;
  let vy = state.vy;
  if (jump && y <= 0) vy = JUMP_VELOCITY;
  vy -= GRAVITY * dt;
  y += vy * dt;
  if (y <= 0) {
    y = 0;
    vy = 0;
  }

  // scroll existing obstacles left, drop the ones fully off-screen
  const obstacles: Obstacle[] = [];
  for (const o of state.obstacles) {
    const nx = o.x - speed * dt;
    if (nx + o.width > -80) obstacles.push({ ...o, x: nx });
  }

  // spawning (distance-based so spacing scales with speed)
  let distanceSinceSpawn = state.distanceSinceSpawn + speed * dt;
  let nextGap = state.nextGap;
  let seed = state.seed;
  if (distanceSinceSpawn >= nextGap) {
    const pick = nextRandom(seed);
    seed = pick.seed;
    const type = OBSTACLE_TYPES[Math.floor(pick.value * OBSTACLE_TYPES.length)];
    obstacles.push({ x: WORLD_WIDTH + 40, width: type.width, height: type.height, emoji: type.emoji });
    distanceSinceSpawn = 0;
    const extra = nextRandom(seed);
    seed = extra.seed;
    nextGap = requiredGap(speed) + extra.value * speed * 0.6;
  }

  const distance = state.distance + speed * dt;
  const score = Math.floor(distance / SCORE_DIVISOR);

  const next: GameState = {
    status: "playing",
    y,
    vy,
    obstacles,
    speed,
    distance,
    distanceSinceSpawn,
    nextGap,
    score,
    seed,
  };
  if (collides(next)) next.status = "gameover";
  return next;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all engine tests green.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json lib/game/zamboniGame.ts lib/game/zamboniGame.test.ts
git commit -m "feat: add pure Zamboni Runner game engine with tests"
```

---

## Task 2: Highscore validation + date helpers

**Files:**
- Create: `lib/highscores.ts`
- Test: `lib/highscores.test.ts`

**Interfaces:**
- Produces:
  - `interface ScoreEntry { name: string; score: number; date: string }`
  - `const MAX_NAME_LENGTH = 12`, `const MAX_SCORE = 1_000_000`
  - `validateSubmission(body: unknown): { ok: boolean; error?: string; value?: { name: string; score: number } }`
  - `todayStamp(now: Date): string` → `YYYY-MM-DD`

- [ ] **Step 1: Write the failing validation test**

Create `lib/highscores.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateSubmission, todayStamp, MAX_NAME_LENGTH } from "./highscores";

describe("validateSubmission", () => {
  it("accepts a valid submission", () => {
    const r = validateSubmission({ name: "Eric", score: 420 });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ name: "Eric", score: 420 });
  });

  it("trims whitespace and caps name length", () => {
    const long = "x".repeat(40);
    const r = validateSubmission({ name: `  ${long}  `, score: 10 });
    expect(r.ok).toBe(true);
    expect(r.value?.name.length).toBe(MAX_NAME_LENGTH);
  });

  it("rejects an empty / whitespace name", () => {
    expect(validateSubmission({ name: "   ", score: 10 }).ok).toBe(false);
    expect(validateSubmission({ name: "", score: 10 }).ok).toBe(false);
  });

  it("rejects a missing or non-string name", () => {
    expect(validateSubmission({ score: 10 }).ok).toBe(false);
    expect(validateSubmission({ name: 5, score: 10 }).ok).toBe(false);
  });

  it("floors a float score and rejects bad scores", () => {
    expect(validateSubmission({ name: "A", score: 12.9 }).value?.score).toBe(12);
    expect(validateSubmission({ name: "A", score: -1 }).ok).toBe(false);
    expect(validateSubmission({ name: "A", score: Number.NaN }).ok).toBe(false);
    expect(validateSubmission({ name: "A", score: 9e9 }).ok).toBe(false);
    expect(validateSubmission({ name: "A", score: "10" }).ok).toBe(false);
  });

  it("rejects non-object bodies", () => {
    expect(validateSubmission(null).ok).toBe(false);
    expect(validateSubmission("nope").ok).toBe(false);
  });
});

describe("todayStamp", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(todayStamp(new Date(2026, 5, 22, 14, 30))).toBe("2026-06-22");
    expect(todayStamp(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './highscores'`.

- [ ] **Step 3: Implement the helpers**

Create `lib/highscores.ts`:
```ts
// Pure helpers shared by the /api/highscores route and the client.
// No DOM, no Next, no Redis — safe to unit test directly.

export const MAX_NAME_LENGTH = 12;
export const MAX_SCORE = 1_000_000;

export interface ScoreEntry {
  name: string;
  score: number;
  date: string; // YYYY-MM-DD
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  value?: { name: string; score: number };
}

export function validateSubmission(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid body" };
  }
  const { name, score } = body as { name?: unknown; score?: unknown };

  if (typeof name !== "string") {
    return { ok: false, error: "name is required" };
  }
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (trimmed.length === 0) {
    return { ok: false, error: "name cannot be empty" };
  }

  if (typeof score !== "number" || !Number.isFinite(score)) {
    return { ok: false, error: "score must be a number" };
  }
  const int = Math.floor(score);
  if (int < 0 || int > MAX_SCORE) {
    return { ok: false, error: "score out of range" };
  }

  return { ok: true, value: { name: trimmed, score: int } };
}

export function todayStamp(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — validation + date tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/highscores.ts lib/highscores.test.ts
git commit -m "feat: add highscore submission validation + date helpers"
```

---

## Task 3: Leaderboard storage wrapper (Upstash Redis)

**Files:**
- Create: `lib/leaderboard.ts`
- Test: `lib/leaderboard.test.ts`
- Modify: `package.json` (add `@upstash/redis`)

**Interfaces:**
- Consumes: `ScoreEntry` from `lib/highscores.ts`.
- Produces:
  - `addScore(entry: ScoreEntry, id: string): Promise<void>`
  - `getTopScores(limit?: number): Promise<ScoreEntry[]>`
  - `parseMember(member: unknown): { name: string; date: string; id: string } | null` (pure, exported for tests)

- [ ] **Step 1: Install the Redis client**

Run:
```bash
npm install @upstash/redis
```

- [ ] **Step 2: Write the failing `parseMember` test**

Create `lib/leaderboard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseMember } from "./leaderboard";

describe("parseMember", () => {
  it("parses a JSON string member", () => {
    const m = parseMember(JSON.stringify({ name: "Eric", date: "2026-06-22", id: "a" }));
    expect(m).toEqual({ name: "Eric", date: "2026-06-22", id: "a" });
  });

  it("accepts an already-deserialized object member", () => {
    const m = parseMember({ name: "Sara", date: "2026-06-20", id: "b" });
    expect(m?.name).toBe("Sara");
  });

  it("returns null for malformed or nameless members", () => {
    expect(parseMember("not json")).toBeNull();
    expect(parseMember(JSON.stringify({ date: "x" }))).toBeNull();
    expect(parseMember(42)).toBeNull();
    expect(parseMember(null)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './leaderboard'`.

- [ ] **Step 4: Implement the leaderboard wrapper**

Create `lib/leaderboard.ts`:
```ts
import { Redis } from "@upstash/redis";
import { ScoreEntry } from "./highscores";

const LEADERBOARD_KEY = "roompanel:leaderboard";
const MAX_ENTRIES = 50; // keep the set bounded; we only display the top 10

interface Member {
  name: string;
  date: string;
  id: string;
}

let client: Redis | null = null;

function getRedis(): Redis {
  if (!client) {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error("Leaderboard storage is not configured");
    }
    client = new Redis({ url, token });
  }
  return client;
}

// Upstash may return members as strings or, when they are valid JSON, as
// already-parsed objects. Handle both.
export function parseMember(member: unknown): Member | null {
  try {
    if (typeof member === "object" && member !== null) {
      const m = member as Partial<Member>;
      if (typeof m.name === "string" && typeof m.date === "string" && typeof m.id === "string") {
        return { name: m.name, date: m.date, id: m.id };
      }
      return null;
    }
    if (typeof member === "string") {
      const m = JSON.parse(member) as Partial<Member>;
      if (typeof m.name === "string" && typeof m.date === "string" && typeof m.id === "string") {
        return { name: m.name, date: m.date, id: m.id };
      }
    }
  } catch {
    // fall through to null for malformed members
  }
  return null;
}

export async function addScore(entry: ScoreEntry, id: string): Promise<void> {
  const redis = getRedis();
  const member: Member = { name: entry.name, date: entry.date, id };
  await redis.zadd(LEADERBOARD_KEY, { score: entry.score, member: JSON.stringify(member) });
  // drop everything below the top MAX_ENTRIES (ranks 0 .. -(MAX+1) are lowest)
  await redis.zremrangebyrank(LEADERBOARD_KEY, 0, -(MAX_ENTRIES + 1));
}

export async function getTopScores(limit = 10): Promise<ScoreEntry[]> {
  const redis = getRedis();
  // highest score first, flat [member, score, member, score, ...]
  const raw = (await redis.zrange(LEADERBOARD_KEY, 0, limit - 1, {
    rev: true,
    withScores: true,
  })) as unknown[];

  const entries: ScoreEntry[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const parsed = parseMember(raw[i]);
    const score = Number(raw[i + 1]);
    if (parsed && Number.isFinite(score)) {
      entries.push({ name: parsed.name, score, date: parsed.date });
    }
  }
  return entries;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — `parseMember` tests green (the Redis-backed functions are verified manually in Task 6).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/leaderboard.ts lib/leaderboard.test.ts
git commit -m "feat: add Upstash Redis leaderboard wrapper"
```

---

## Task 4: `/api/highscores` Route Handler

**Files:**
- Create: `app/api/highscores/route.ts`

**Interfaces:**
- Consumes: `validateSubmission`, `todayStamp`, `ScoreEntry` from `lib/highscores.ts`; `addScore`, `getTopScores` from `lib/leaderboard.ts`.
- Produces (HTTP):
  - `GET /api/highscores` → `{ scores: ScoreEntry[] }` (top 10), or `{ scores: [], error }` with `503` if storage is down.
  - `POST /api/highscores` body `{ name, score }` → `{ scores: ScoreEntry[], rank: number | null }`, `400` on invalid input, `503` on storage failure.

- [ ] **Step 1: Implement the route handler**

Create `app/api/highscores/route.ts`:
```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { validateSubmission, todayStamp, ScoreEntry } from "@/lib/highscores";
import { addScore, getTopScores } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scores = await getTopScores(10);
    return NextResponse.json({ scores });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ scores: [], error: detail }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateSubmission(body);
  if (!result.ok || !result.value) {
    return NextResponse.json({ error: result.error ?? "Invalid submission" }, { status: 400 });
  }

  const entry: ScoreEntry = {
    name: result.value.name,
    score: result.value.score,
    date: todayStamp(new Date()),
  };

  try {
    await addScore(entry, randomUUID());
    const scores = await getTopScores(10);
    const idx = scores.findIndex(
      (s) => s.name === entry.name && s.score === entry.score && s.date === entry.date
    );
    return NextResponse.json({ scores, rank: idx === -1 ? null : idx + 1 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Could not save score", detail }, { status: 503 });
  }
}
```

- [ ] **Step 2: Verify it type-checks / builds**

Run: `npm run build`
Expected: Build succeeds (the route compiles). Note: without Redis env vars configured locally, calling the endpoint at runtime returns `503` — that is expected and handled by the client in Task 5. End-to-end save is verified in Task 6.

- [ ] **Step 3: Commit**

```bash
git add app/api/highscores/route.ts
git commit -m "feat: add /api/highscores GET + POST route handler"
```

---

## Task 5: HockeyGame overlay component + trigger wiring

**Files:**
- Create: `components/HockeyGame.tsx`
- Create: `components/HockeyGame.module.css`
- Modify: `components/RoomPanel.tsx`

**Interfaces:**
- Consumes: engine exports from `lib/game/zamboniGame.ts`; `ScoreEntry` from `lib/highscores.ts`; the HTTP API from Task 4.
- Produces: `export default function HockeyGame({ onClose }: { onClose: () => void })`.

- [ ] **Step 1: Create the component**

Create `components/HockeyGame.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GameState,
  createInitialState,
  step,
  GROUND_Y,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ZAMBONI_X,
  ZAMBONI_WIDTH,
  ZAMBONI_HEIGHT,
} from "@/lib/game/zamboniGame";
import { ScoreEntry, MAX_NAME_LENGTH } from "@/lib/highscores";
import styles from "./HockeyGame.module.css";

const IDLE_TIMEOUT_MS = 45_000;

type Screen = "playing" | "gameover";
type SaveState = "idle" | "saving" | "saved" | "error";
interface Snowflake { x: number; y: number; r: number; s: number }

function drawEmoji(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  centerX: number,
  baselineY: number,
  size: number
) {
  ctx.save();
  ctx.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillText(emoji, centerX, baselineY);
  ctx.restore();
}

function Leaderboard({
  scores,
  highlightRank,
}: {
  scores: ScoreEntry[] | null;
  highlightRank: number | null;
}) {
  if (scores === null) return <p className={styles.lbLoading}>Loading scores…</p>;
  if (scores.length === 0) return <p className={styles.lbEmpty}>🏆 Be the first on the board!</p>;
  return (
    <div className={styles.leaderboard}>
      <div className={styles.lbHeader}>🏆 OFFICE LEADERBOARD</div>
      <ol className={styles.lbList}>
        {scores.map((s, i) => (
          <li
            key={`${s.name}-${s.date}-${i}`}
            className={`${styles.lbRow} ${highlightRank === i + 1 ? styles.lbHighlight : ""}`}
          >
            <span className={styles.lbRank}>{i + 1}</span>
            <span className={styles.lbName}>{s.name}</span>
            <span className={styles.lbScore}>{s.score}</span>
            <span className={styles.lbDate}>{s.date}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function HockeyGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scoreRef = useRef<HTMLSpanElement | null>(null);
  const stateRef = useRef<GameState>(createInitialState(performance.now()));
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const jumpRef = useRef(false);
  const snowRef = useRef<Snowflake[]>([]);
  const idleRef = useRef<number>(performance.now());

  const [screen, setScreen] = useState<Screen>("playing");
  const [score, setScore] = useState(0);
  const [name, setName] = useState("");
  const [scores, setScores] = useState<ScoreEntry[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedRank, setSavedRank] = useState<number | null>(null);

  const draw = useCallback((ctx: CanvasRenderingContext2D, s: GameState) => {
    // sky / rink backdrop
    const sky = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    sky.addColorStop(0, "#0f1830");
    sky.addColorStop(0.55, "#16335c");
    sky.addColorStop(1, "#1e4f8a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // ice surface
    const ice = ctx.createLinearGradient(0, GROUND_Y, 0, WORLD_HEIGHT);
    ice.addColorStop(0, "#dfeefc");
    ice.addColorStop(1, "#a9cdf0");
    ctx.fillStyle = ice;
    ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y);

    // boards line (coral accent)
    ctx.strokeStyle = "rgba(224,90,71,0.7)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(WORLD_WIDTH, GROUND_Y);
    ctx.stroke();

    // scrolling dashed centre line on the ice
    const offset = s.distance % 240;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 4;
    for (let x = -offset; x < WORLD_WIDTH; x += 240) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 70);
      ctx.lineTo(x + 120, GROUND_Y + 70);
      ctx.stroke();
    }

    // drifting snow
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (const f of snowRef.current) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // obstacles
    for (const o of s.obstacles) {
      drawEmoji(ctx, o.emoji, o.x + o.width / 2, GROUND_Y, o.height);
    }

    // the zamboni
    drawEmoji(ctx, "🚜", ZAMBONI_X + ZAMBONI_WIDTH / 2, GROUND_Y - s.y, ZAMBONI_HEIGHT);
  }, []);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch("/api/highscores");
      const data = res.ok ? await res.json() : { scores: [] };
      setScores(Array.isArray(data.scores) ? data.scores : []);
    } catch {
      setScores([]);
    }
  }, []);

  const handleGameOver = useCallback(
    (finalScore: number) => {
      setScore(finalScore);
      setScreen("gameover");
      setSaveState("idle");
      setSavedRank(null);
      fetchScores();
    },
    [fetchScores]
  );

  const loop = useCallback(
    (ts: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const last = lastTsRef.current ?? ts;
      const dt = ts - last;
      lastTsRef.current = ts;
      idleRef.current = ts; // active play counts as interaction

      const jump = jumpRef.current;
      jumpRef.current = false;

      const next = step(stateRef.current, dt, jump);
      stateRef.current = next;

      // drift snow
      for (const f of snowRef.current) {
        f.y += f.s * (dt / 16);
        f.x -= next.speed * 0.12 * (dt / 1000);
        if (f.y > WORLD_HEIGHT) f.y = -10;
        if (f.x < 0) f.x = WORLD_WIDTH;
      }

      draw(ctx, next);
      if (scoreRef.current) scoreRef.current.textContent = String(next.score);

      if (next.status === "gameover") {
        handleGameOver(next.score);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [draw, handleGameOver]
  );

  const start = useCallback(() => {
    stateRef.current = createInitialState(performance.now());
    lastTsRef.current = null;
    jumpRef.current = false;
    idleRef.current = performance.now();
    setScreen("playing");
    setScore(0);
    setName("");
    setScores(null);
    setSaveState("idle");
    setSavedRank(null);
    if (scoreRef.current) scoreRef.current.textContent = "0";
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // mount: size canvas for DPR, seed snow, start the loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD_WIDTH * dpr;
    canvas.height = WORLD_HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    snowRef.current = Array.from({ length: 40 }, (_, i) => ({
      x: (i * 137) % WORLD_WIDTH,
      y: (i * 89) % WORLD_HEIGHT,
      r: 1 + (i % 3),
      s: 0.4 + (i % 5) * 0.18,
    }));

    start();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard: Space to jump (dev / hardware keyboards)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        idleRef.current = performance.now();
        if (screen === "playing") jumpRef.current = true;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  // idle auto-close (kiosk safety)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (performance.now() - idleRef.current > IDLE_TIMEOUT_MS) onClose();
    }, 5000);
    return () => window.clearInterval(id);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaveState("saving");
    idleRef.current = performance.now();
    try {
      const res = await fetch("/api/highscores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, score }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      setScores(Array.isArray(data.scores) ? data.scores : []);
      setSavedRank(typeof data.rank === "number" ? data.rank : null);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [name, score]);

  return (
    <div
      className={styles.overlay}
      onPointerDown={() => {
        idleRef.current = performance.now();
      }}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close game">
        ✕
      </button>

      {screen === "playing" && (
        <div
          className={styles.touchLayer}
          onPointerDown={(e) => {
            e.preventDefault();
            idleRef.current = performance.now();
            jumpRef.current = true;
          }}
        >
          <div className={styles.hud}>
            <span className={styles.hudLabel}>SCORE</span>
            <span className={styles.hudScore} ref={scoreRef}>
              0
            </span>
          </div>
          <div className={styles.hint}>TAP TO JUMP</div>
        </div>
      )}

      {screen === "gameover" && (
        <div className={styles.gameover}>
          <div className={styles.card}>
            <h2 className={styles.goTitle}>GAME OVER</h2>
            <div className={styles.finalScore}>{score}</div>

            {saveState !== "saved" && (
              <div className={styles.saveRow}>
                <input
                  className={styles.nameInput}
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                  placeholder="YOUR NAME"
                  maxLength={MAX_NAME_LENGTH}
                  autoFocus
                />
                <button
                  className={styles.saveBtn}
                  onClick={handleSave}
                  disabled={!name.trim() || saveState === "saving"}
                >
                  {saveState === "saving" ? "SAVING…" : "SAVE"}
                </button>
              </div>
            )}
            {saveState === "error" && (
              <p className={styles.errorMsg}>Couldn’t save — try again.</p>
            )}

            <Leaderboard scores={scores} highlightRank={savedRank} />

            <div className={styles.goActions}>
              <button className={styles.playAgain} onClick={start}>
                PLAY AGAIN
              </button>
              <button className={styles.closeText} onClick={onClose}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the stylesheet**

Create `components/HockeyGame.module.css`:
```css
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #0f1830;
  overflow: hidden;
  font-family: var(--font-body);
  user-select: none;
  touch-action: manipulation;
}

.canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.touchLayer {
  position: absolute;
  inset: 0;
  cursor: pointer;
}

.hud {
  position: absolute;
  top: 32px;
  left: 40px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hudLabel {
  font-size: 14px;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.55);
}
.hudScore {
  font-family: var(--font-time);
  font-size: 64px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.hint {
  position: absolute;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 18px;
  letter-spacing: 4px;
  color: rgba(255, 255, 255, 0.6);
  animation: hintPulse 1.4s ease-in-out infinite;
}
@keyframes hintPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.9; }
}

.closeBtn {
  position: absolute;
  top: 24px;
  right: 28px;
  z-index: 10;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
}

.gameover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 14, 28, 0.72);
  backdrop-filter: blur(6px);
}
.card {
  width: min(680px, 86vw);
  max-height: 90vh;
  overflow: auto;
  padding: 40px 44px;
  border-radius: 24px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: var(--glass-blur);
  text-align: center;
}
.goTitle {
  font-family: var(--font-heading);
  font-size: 52px;
  letter-spacing: 4px;
  color: var(--ep-coral-light);
}
.finalScore {
  font-family: var(--font-time);
  font-size: 88px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
  margin: 4px 0 20px;
}
.saveRow {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 12px;
}
.nameInput {
  flex: 1;
  max-width: 320px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 20px;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-family: var(--font-body);
}
.nameInput:focus {
  outline: none;
  border-color: var(--ep-coral);
}
.saveBtn {
  padding: 16px 28px;
  border-radius: 12px;
  border: none;
  background: var(--ep-coral);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  cursor: pointer;
}
.saveBtn:disabled {
  opacity: 0.45;
  cursor: default;
}
.errorMsg {
  color: var(--ep-red);
  margin-bottom: 12px;
}

.leaderboard {
  margin: 18px 0 8px;
  text-align: left;
}
.lbHeader {
  font-size: 14px;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 10px;
  text-align: center;
}
.lbList {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lbRow {
  display: grid;
  grid-template-columns: 40px 1fr auto 120px;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 18px;
}
.lbHighlight {
  background: rgba(224, 90, 71, 0.22);
  border: 1px solid rgba(224, 90, 71, 0.5);
}
.lbRank {
  color: var(--ep-coral-light);
  font-weight: 700;
}
.lbName {
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lbScore {
  font-family: var(--font-time);
  font-weight: 700;
  color: #fff;
}
.lbDate {
  color: var(--ep-text-dim);
  font-size: 15px;
  text-align: right;
}
.lbEmpty,
.lbLoading {
  color: var(--ep-text-dim);
  text-align: center;
  margin: 18px 0;
}

.goActions {
  display: flex;
  gap: 14px;
  justify-content: center;
  margin-top: 22px;
}
.playAgain {
  padding: 16px 32px;
  border-radius: 12px;
  border: none;
  background: var(--ep-coral);
  color: #fff;
  font-weight: 700;
  letter-spacing: 2px;
  font-size: 18px;
  cursor: pointer;
}
.closeText {
  padding: 16px 28px;
  border-radius: 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
  font-size: 16px;
  cursor: pointer;
}
```

- [ ] **Step 3: Wire the triple-tap trigger into `RoomPanel`**

Edit `components/RoomPanel.tsx`:

(a) Add the import alongside the other component imports (after the `BookingConfirmation` import on line 10):
```tsx
import HockeyGame from "./HockeyGame";
```

(b) Add state + a tap-tracking ref. Inside the component, after the `showFindRoom` state (line 21), add:
```tsx
  const [showGame, setShowGame] = useState(false);
  const tapTimes = useRef<number[]>([]);

  function handleLogoTap() {
    const now = Date.now();
    tapTimes.current = [...tapTimes.current, now].filter((t) => now - t < 1500);
    if (tapTimes.current.length >= 3) {
      tapTimes.current = [];
      setShowGame(true);
    }
  }
```
Also add `useRef` to the React import on line 3:
```tsx
import { useEffect, useState, useCallback, useRef } from "react";
```

(c) Make the logo image trigger the counter. Replace the logo `<img>` (lines 72–74) so the image has an `onClick` and a pointer cursor:
```tsx
        <div className={styles.logoContainer}>
          <img
            src={room.logo}
            alt={room.name}
            className={styles.logo}
            onClick={handleLogoTap}
            style={{ cursor: "pointer" }}
          />
        </div>
```

(d) Render the game overlay. Just before the final closing `</div>` of the panel (after the `{bookedUntil && ...}` line, line 142), add:
```tsx
      {showGame && <HockeyGame onClose={() => setShowGame(false)} />}
```

- [ ] **Step 4: Build and lint**

Run: `npm run build`
Expected: Build + type-check succeed. Then:
Run: `npm run lint`
Expected: No errors.

- [ ] **Step 5: Manual smoke test (local)**

Run: `npm run dev`, open a room panel (e.g. `http://localhost:3000/rooms/nilsson`), then:
- Tap/click the room logo **3 times within ~1.5s** → game overlay opens.
- Tap anywhere (or press Space) → the Zamboni jumps; obstacles scroll and speed up.
- Hit an obstacle → GAME OVER panel with final score appears.
- The leaderboard area shows "Loading scores…" then (without local Redis) an empty/"Be the first!" state; typing a name + SAVE shows "Couldn't save — try again" (expected without storage). This is fixed in Task 6.
- "PLAY AGAIN" restarts; the ✕ and "CLOSE" return to the panel; leaving the GAME OVER screen idle ~45s auto-closes.

- [ ] **Step 6: Commit**

```bash
git add components/HockeyGame.tsx components/HockeyGame.module.css components/RoomPanel.tsx
git commit -m "feat: add Zamboni Runner game overlay + triple-tap trigger"
```

---

## Task 6: Provision storage + end-to-end verification

**Files:** none (configuration + verification).

- [ ] **Step 1: Provision Upstash Redis via the Vercel Marketplace**

The standalone "Vercel KV" product is discontinued; the modern equivalent is **Upstash Redis** via the Vercel Marketplace. Before provisioning, consult the `vercel:vercel-storage` skill / Marketplace guide for the current exact steps and env-var names. In the Vercel dashboard: **Storage → Create / Marketplace → Upstash for Redis**, create a database, and **connect it to the `roompanel` project**. This injects the REST env vars (typically `KV_REST_API_URL` / `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — the wrapper accepts either pair).

- [ ] **Step 2: Pull env vars locally and run**

Run:
```bash
vercel env pull .env.local
npm run dev
```
(`​.env.local` is gitignored. Confirm it contains the Upstash REST URL + token.)

- [ ] **Step 3: Verify the API directly**

With dev running, from another terminal:
```bash
curl -s -X POST http://localhost:3000/api/highscores \
  -H 'Content-Type: application/json' \
  -d '{"name":"Eric","score":420}'
```
Expected: `{"scores":[{"name":"Eric","score":420,"date":"2026-06-22"}, ...],"rank":1}`.
```bash
curl -s http://localhost:3000/api/highscores
```
Expected: `{"scores":[{"name":"Eric","score":420,"date":"..."}]}` sorted by score descending.
Verify a bad submission is rejected:
```bash
curl -s -X POST http://localhost:3000/api/highscores \
  -H 'Content-Type: application/json' -d '{"name":"   ","score":-5}'
```
Expected: `400` with an error message.

- [ ] **Step 4: Full end-to-end play test**

In the browser: triple-tap the logo, play, die, enter a name, **SAVE** → the leaderboard now lists the score with name + date `YYYY-MM-DD`, and the just-saved row is highlighted. Reload and re-open the game on a *different* room (e.g. `/rooms/bruins`) → the same shared leaderboard appears.

- [ ] **Step 5: Final full check + commit any config**

Run: `npm test && npm run build && npm run lint`
Expected: all green.
If `.gitignore` does not already cover `.env*`, confirm secrets are not staged. Commit only if there were tracked config changes:
```bash
git status   # ensure no secrets staged
git commit --allow-empty -m "chore: verify Zamboni Runner leaderboard end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** trigger (Task 5), gameplay/engine (Task 1), rendering (Task 5), game-over → name → leaderboard flow (Task 5), validation + date stamping (Tasks 2 & 4), Upstash sorted-set storage (Tasks 3 & 6), API behind IP middleware (automatic — noted in constraints), graceful degradation when storage is down (Tasks 4 & 5), idle auto-close + always-closeable (Task 5). All covered.
- **Type consistency:** `GameState`/`Obstacle`/`step`/`createInitialState`/`collides`/`requiredGap` names match between engine, tests, and component; `ScoreEntry` shape consistent across `highscores.ts`, `leaderboard.ts`, route, and component; `validateSubmission` return shape consistent between Task 2 and Task 4; env-var names consistent between `leaderboard.ts` (Task 3) and provisioning (Task 6).
- **No placeholders:** every code step contains complete, runnable content.
