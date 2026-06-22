// Pure, DOM-free endless-runner engine for the Zamboni easter egg.
// All units are in a fixed logical world (1920x1200). The renderer draws
// whatever state `step` returns; this module never touches the DOM.

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1200;
export const GROUND_Y = 980; // y of the ice surface the player/obstacles rest on

export const GRAVITY = 2600; // px/s^2 (downward)
export const JUMP_VELOCITY = 1150; // px/s (initial upward impulse)
export const ZAMBONI_X = 320; // fixed horizontal position of the player
export const ZAMBONI_WIDTH = 170; // matches the wide zamboni sprite
export const ZAMBONI_HEIGHT = 110;
export const HITBOX_INSET = 22; // forgiving collision margin on the zamboni
export const OBSTACLE_HITBOX_INSET = 18; // logos are round with padding — be lenient

export const START_SPEED = 600; // px/s
export const SPEED_RAMP = 75; // px/s added per second — steep, so the reaction window collapses fast
export const SCORE_DIVISOR = 24; // world px per point — calibrated so ~5k ≈ 49s (very hard), ~10k ≈ 72s (near-impossible)
export const MAX_DT_MS = 50; // clamp big frame gaps (tab switch etc.)
export const SUBSTEP_MAX_PX = 28; // max world travel per integration step (anti-tunneling)
export const CLUSTER_MIN_SPEED = 1000; // clusters only once a jump has room to span a pair
export const CLUSTER_MAX_CHANCE = 0.5; // at most half of spawns become clusters
export const CLUSTER_INNER_GAP = 90; // px between adjacent obstacles in a cluster — reads as distinct, still one-jump clearable
export const CLUSTER_CLEAR_WINDOW = 0.66; // seconds the jump stays high enough to clear obstacles (conservative)
export const CLUSTER_MAX_SIZE = 6; // sanity ceiling on obstacles per cluster
export const CLUSTER_POINTS_PER_EXTRA = 2000; // +1 obstacle per this many points (base pair = 2)

export interface ObstacleType {
  sprite: string; // image key under /public/logos (see HockeyGame sprite map)
  width: number;
  height: number;
}

// Obstacles are the meeting rooms' team logos — sized big enough to read at a
// glance, widths follow each logo's aspect ratio.
export const OBSTACLE_TYPES: ObstacleType[] = [
  { sprite: "maple-leafs", width: 92, height: 102 },
  { sprite: "bruins", width: 100, height: 100 },
  { sprite: "blackhawks", width: 114, height: 100 },
  { sprite: "red-wings", width: 144, height: 90 },
];

// Derived so the "spawns are always clearable" invariant (see requiredGap)
// maintains itself when obstacle types change.
export const MAX_OBSTACLE_WIDTH = Math.max(...OBSTACLE_TYPES.map((t) => t.width));

export interface Obstacle {
  x: number; // left edge in world px
  width: number;
  height: number;
  sprite: string;
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
  // Minimum jumpable gap: one jump's airtime of travel (+ a tiny safety
  // margin) plus the widest obstacle. The 1.02 margin packs obstacles right up
  // against the limit of what a single jump can clear.
  return speed * JUMP_AIRTIME * 1.02 + MAX_OBSTACLE_WIDTH;
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
    const oLeft = o.x + OBSTACLE_HITBOX_INSET;
    const oRight = o.x + o.width - OBSTACLE_HITBOX_INSET;
    const oBottom = GROUND_Y;
    const oTop = GROUND_Y - o.height + 14;
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

  // Speed never caps, so at high speed a single frame could move an obstacle
  // clear past the zamboni between collision checks (tunneling). Split the
  // frame so no integration step advances the world more than SUBSTEP_MAX_PX.
  const projectedSpeed = state.speed + SPEED_RAMP * dt;
  const substeps = Math.max(1, Math.ceil((projectedSpeed * dt) / SUBSTEP_MAX_PX));
  const sdt = dt / substeps;

  let cur = state;
  for (let i = 0; i < substeps; i++) {
    cur = advance(cur, sdt, i === 0 && jump);
    if (cur.status === "gameover") break;
  }
  return cur;
}

// One fixed-size integration step. `dt` is in seconds and already clamped.
function advance(state: GameState, dt: number, jump: boolean): GameState {
  const speed = state.speed + SPEED_RAMP * dt; // no cap — difficulty never plateaus

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
    obstacles.push({ x: WORLD_WIDTH + 40, width: type.width, height: type.height, sprite: type.sprite });

    // Cluster: occasionally spawn a group of tightly-packed obstacles right
    // behind the first, clearable in one well-timed jump. Chance ramps in with
    // speed (so the jump arc has room to span them); capped so it never becomes
    // every spawn.
    const clusterChance = Math.min(
      CLUSTER_MAX_CHANCE,
      Math.max(0, (speed - CLUSTER_MIN_SPEED) / 4000)
    );
    const clusterRoll = nextRandom(seed);
    seed = clusterRoll.seed;
    if (clusterRoll.value < clusterChance) {
      // Group grows with score (+1 obstacle per CLUSTER_POINTS_PER_EXTRA beyond
      // the base pair), bounded by what a single jump can physically span at
      // this speed and by a sane ceiling.
      const clearMax = Math.floor(
        (CLUSTER_CLEAR_WINDOW * speed - ZAMBONI_WIDTH + CLUSTER_INNER_GAP) /
          (MAX_OBSTACLE_WIDTH + CLUSTER_INNER_GAP)
      );
      const scoreMax = 2 + Math.floor(state.score / CLUSTER_POINTS_PER_EXTRA);
      const maxSize = Math.max(2, Math.min(scoreMax, clearMax, CLUSTER_MAX_SIZE));
      const sizeRoll = nextRandom(seed);
      seed = sizeRoll.seed;
      const groupSize = 2 + Math.floor(sizeRoll.value * (maxSize - 1)); // [2, maxSize]

      let cx = WORLD_WIDTH + 40 + type.width + CLUSTER_INNER_GAP;
      for (let k = 1; k < groupSize; k++) {
        const pk = nextRandom(seed);
        seed = pk.seed;
        const tk = OBSTACLE_TYPES[Math.floor(pk.value * OBSTACLE_TYPES.length)];
        obstacles.push({ x: cx, width: tk.width, height: tk.height, sprite: tk.sprite });
        cx += tk.width + CLUSTER_INNER_GAP;
      }
    }

    distanceSinceSpawn = 0;
    const extra = nextRandom(seed);
    seed = extra.seed;
    // Difficulty ramp: the random "breather" beyond the jumpable minimum
    // shrinks as speed climbs, so the *time* between obstacles tightens the
    // faster you go. Without this, gaps scale with speed and the time window
    // stays constant — the game looks quicker but never gets harder.
    const ramp = Math.min(1, (speed - START_SPEED) / 1800);
    const breather = 0.4 - 0.34 * ramp; // 0.4×speed early → 0.06×speed late (tight)
    nextGap = requiredGap(speed) + extra.value * speed * breather;
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
