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
