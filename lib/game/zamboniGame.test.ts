import { describe, it, expect } from "vitest";
import {
  createInitialState,
  step,
  collides,
  requiredGap,
  GameState,
  Obstacle,
  ZAMBONI_X,
  ZAMBONI_WIDTH,
  START_SPEED,
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
  it("keeps ramping speed without plateauing", () => {
    const a = advanceNoObstacles(createInitialState(1), 1000);
    const b = advanceNoObstacles(a, 1000);
    expect(a.speed).toBeGreaterThan(START_SPEED);
    expect(b.speed).toBeGreaterThan(a.speed); // no cap — still accelerating
  });

  it("accrues score as floor(distance / SCORE_DIVISOR)", () => {
    const s = advanceNoObstacles(createInitialState(1), 60);
    expect(s.score).toBe(Math.floor(s.distance / SCORE_DIVISOR));
    expect(s.score).toBeGreaterThan(0);
  });

  it("makes even 5k points a long climb, 10k far longer (calibration)", () => {
    // Measure pure scoring pace (clear obstacles so the run never ends).
    let s = createInitialState(3);
    let frames = 0;
    let secondsTo5k = 0;
    while (s.score < 10000 && frames < 30000) {
      s = step(s, FRAME, false);
      s = { ...s, obstacles: [] };
      frames++;
      if (s.score < 5000) secondsTo5k = (frames * FRAME) / 1000;
    }
    expect(s.score).toBeGreaterThanOrEqual(10000);
    expect(secondsTo5k).toBeGreaterThan(40); // reaching 5k takes >40s of survival
    expect((frames * FRAME) / 1000).toBeGreaterThan(65); // 10k takes >65s
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

  it("spawns tight clusters at speed (but not on every spawn)", () => {
    let s: GameState = { ...createInitialState(5), speed: 2500 }; // past the cluster threshold
    let spawnFrames = 0;
    let clusterFrames = 0;
    for (let i = 0; i < 3000; i++) {
      s = step(s, FRAME, false);
      // with obstacles cleared each frame, what's present == what spawned this frame
      if (s.obstacles.length >= 1) {
        spawnFrames++;
        if (s.obstacles.length >= 2) clusterFrames++;
      }
      s = { ...s, obstacles: [] };
    }
    expect(spawnFrames).toBeGreaterThan(0);
    expect(clusterFrames).toBeGreaterThan(0); // clusters do occur
    expect(clusterFrames).toBeLessThan(spawnFrames); // but not always
  });

  it("grows cluster size with score (more obstacles the further you get)", () => {
    // Start deep into a run (high score + matching speed). Groups should exceed
    // the base pair of 2.
    let s: GameState = {
      ...createInitialState(9),
      speed: 3500,
      distance: 5000 * SCORE_DIVISOR,
      score: 5000,
    };
    let maxGroup = 0;
    for (let i = 0; i < 4000; i++) {
      s = step(s, FRAME, false);
      maxGroup = Math.max(maxGroup, s.obstacles.length); // obstacles cleared each frame == this frame's spawn
      s = { ...s, obstacles: [] };
    }
    expect(maxGroup).toBeGreaterThanOrEqual(3); // 5k+ produces groups of 3 or more
  });

  it("tightens the time between obstacles as speed climbs (gets harder)", () => {
    let s = createInitialState(7);
    let prevDist: number | null = null;
    const samples: { speed: number; timeGap: number }[] = [];
    for (let i = 0; i < 8000; i++) {
      const before = s.distanceSinceSpawn;
      s = step(s, FRAME, false);
      if (s.distanceSinceSpawn < before) {
        if (prevDist !== null) {
          samples.push({ speed: s.speed, timeGap: (s.distance - prevDist) / s.speed });
        }
        prevDist = s.distance;
      }
      s = { ...s, obstacles: [] }; // never die; we only measure spacing
    }
    const avg = (xs: { timeGap: number }[]) =>
      xs.reduce((a, b) => a + b.timeGap, 0) / xs.length;
    const early = samples.slice(0, 5);
    const late = samples.slice(-5);
    // later (faster) obstacles arrive with a meaningfully shorter reaction window
    expect(avg(late)).toBeLessThan(avg(early) * 0.85);
  });
});

describe("collision", () => {
  it("ends the game when an obstacle overlaps the grounded zamboni", () => {
    const base = createInitialState(1);
    const obstacle: Obstacle = { x: ZAMBONI_X, width: 100, height: 100, sprite: "bruins" };
    const s: GameState = { ...base, obstacles: [obstacle] };
    expect(collides(s)).toBe(true);
    expect(step(s, FRAME, false).status).toBe("gameover");
  });

  it("does not collide when the zamboni has jumped above the obstacle", () => {
    const base = createInitialState(1);
    const obstacle: Obstacle = { x: ZAMBONI_X, width: 100, height: 100, sprite: "bruins" };
    const s: GameState = { ...base, y: 300, obstacles: [obstacle] };
    expect(collides(s)).toBe(false);
    expect(step(s, FRAME, false).status).toBe("playing");
  });

  it("is terminal: stepping a gameover state changes nothing", () => {
    const over: GameState = { ...createInitialState(1), status: "gameover", score: 42 };
    expect(step(over, FRAME, true)).toBe(over);
  });

  it("does not let an obstacle tunnel past the zamboni at extreme speed", () => {
    // At 8000 px/s a 50ms frame moves obstacles 400px — far enough to skip the
    // zamboni entirely in one jump. Sub-stepping must still catch the hit.
    const base = createInitialState(1);
    const obstacle: Obstacle = {
      x: ZAMBONI_X + ZAMBONI_WIDTH + 30,
      width: 100,
      height: 100,
      sprite: "bruins",
    };
    const s: GameState = { ...base, speed: 8000, obstacles: [obstacle] };
    expect(step(s, 50, false).status).toBe("gameover");
  });
});
