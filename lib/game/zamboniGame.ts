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
