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
  OBSTACLE_TYPES,
} from "@/lib/game/zamboniGame";
import { ScoreEntry, MAX_NAME_LENGTH, LEADERBOARD_SIZE } from "@/lib/highscores";
import styles from "./HockeyGame.module.css";

const IDLE_TIMEOUT_MS = 45_000;
// Cap the canvas backing-store width. Panels are fill-rate limited, so
// rendering above this and letting CSS upscale is wasted GPU work.
const RENDER_MAX_W = 1440;
const OBSTACLE_DRAW_SCALE = 1.18; // obstacles drawn a touch larger than their hitbox

type Screen = "playing" | "gameover";
type SaveState = "idle" | "saving" | "saved" | "error";
const ZAMBONI_DRAW = 172; // square draw size for the zamboni sprite

// The zamboni + each meeting room's team logo (logos double as obstacles).
const SPRITE_SOURCES: Record<string, string> = {
  zamboni: "/zamboni.png",
  "maple-leafs": "/logos/maple-leafs.png",
  bruins: "/logos/bruins.png",
  blackhawks: "/logos/blackhawks.png",
  "red-wings": "/logos/red-wings.png",
};

// Draw an image anchored by the centre of its bottom edge, optionally mirrored.
function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerX: number,
  bottomY: number,
  w: number,
  h: number,
  flip: boolean
) {
  ctx.save();
  ctx.translate(centerX, bottomY - h);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, 0, w, h);
  ctx.restore();
}

// Pre-render a (large) source image into a small offscreen canvas at its draw
// size — once — so the render loop blits a same-size bitmap instead of
// resampling the full-resolution source every frame.
function bakeSprite(img: HTMLImageElement, w: number, h: number, flip: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const cx = c.getContext("2d");
  if (cx) {
    if (flip) {
      cx.translate(c.width, 0);
      cx.scale(-1, 1);
    }
    cx.drawImage(img, 0, 0, c.width, c.height);
  }
  return c;
}

// Soft contact shadow on the ice so entities feel grounded.
function drawContactShadow(ctx: CanvasRenderingContext2D, centerX: number, groundY: number, w: number) {
  ctx.save();
  ctx.fillStyle = "rgba(20,30,50,0.16)";
  ctx.beginPath();
  ctx.ellipse(centerX, groundY + 8, w * 0.42, 11, 0, 0, Math.PI * 2);
  ctx.fill();
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
  const spritesRef = useRef<Record<string, HTMLImageElement>>({});
  const bakedRef = useRef<Record<string, HTMLCanvasElement>>({});
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgGradRef = useRef<CanvasGradient | null>(null);
  const iceGradRef = useRef<CanvasGradient | null>(null);
  const idleRef = useRef<number>(performance.now());

  const [screen, setScreen] = useState<Screen>("playing");
  const [score, setScore] = useState(0);
  const [name, setName] = useState("");
  const [scores, setScores] = useState<ScoreEntry[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const [hasJumped, setHasJumped] = useState(false); // hides the "tap to jump" hint after first jump

  const draw = useCallback((s: GameState) => {
    const ctx = ctxRef.current;
    if (!ctx || !bgGradRef.current || !iceGradRef.current) return;

    // opaque EP gradient background (same look as the app's default view, but
    // painted into the canvas so the compositor doesn't alpha-blend each frame)
    ctx.fillStyle = bgGradRef.current;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // ice surface
    ctx.fillStyle = iceGradRef.current;
    ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y);

    // scrolling rink lines (red line cadence, blue otherwise) for a hockey feel
    const period = 360;
    let idx = Math.floor(s.distance / period);
    for (let x = -(s.distance % period); x < WORLD_WIDTH + period; x += period) {
      ctx.fillStyle = idx % 4 === 0 ? "rgba(214,48,38,0.5)" : "rgba(36,84,196,0.3)";
      ctx.fillRect(x, GROUND_Y + 6, 8, WORLD_HEIGHT - GROUND_Y);
      idx++;
    }

    // boards line (coral accent)
    ctx.fillStyle = "rgba(224,90,71,0.85)";
    ctx.fillRect(0, GROUND_Y - 3, WORLD_WIDTH, 6);

    // obstacles (team logos) — blit the pre-baked bitmap; fall back to the raw
    // image (then a rect) until the bake is ready.
    for (const o of s.obstacles) {
      const cx = o.x + o.width / 2;
      const dw = o.width * OBSTACLE_DRAW_SCALE;
      const dh = o.height * OBSTACLE_DRAW_SCALE;
      drawContactShadow(ctx, cx, GROUND_Y, dw);
      const baked = bakedRef.current[o.sprite];
      const raw = spritesRef.current[o.sprite];
      if (baked) {
        ctx.drawImage(baked, cx - dw / 2, GROUND_Y + 2 - dh);
      } else if (raw && raw.complete && raw.naturalWidth > 0) {
        drawSprite(ctx, raw, cx, GROUND_Y + 2, dw, dh, false);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(cx - o.width / 2, GROUND_Y - o.height, o.width, o.height);
      }
    }

    // the zamboni — pre-baked already mirrored to face right (into play)
    const zcx = ZAMBONI_X + ZAMBONI_WIDTH / 2;
    drawContactShadow(ctx, zcx, GROUND_Y, ZAMBONI_WIDTH);
    const zBaked = bakedRef.current.zamboni;
    const zRaw = spritesRef.current.zamboni;
    if (zBaked) {
      ctx.drawImage(zBaked, zcx - ZAMBONI_DRAW / 2, GROUND_Y - s.y + 24 - ZAMBONI_DRAW);
    } else if (zRaw && zRaw.complete && zRaw.naturalWidth > 0) {
      drawSprite(ctx, zRaw, zcx, GROUND_Y - s.y + 24, ZAMBONI_DRAW, ZAMBONI_DRAW, true);
    } else {
      ctx.fillStyle = "#e05a47";
      ctx.fillRect(ZAMBONI_X, GROUND_Y - s.y - ZAMBONI_HEIGHT, ZAMBONI_WIDTH, ZAMBONI_HEIGHT);
    }
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
      if (!ctxRef.current) return;
      const last = lastTsRef.current ?? ts;
      const dt = ts - last;
      lastTsRef.current = ts;
      idleRef.current = ts; // active play counts as interaction

      const jump = jumpRef.current;
      jumpRef.current = false;

      const next = step(stateRef.current, dt, jump);
      stateRef.current = next;

      draw(next);
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
    setHasJumped(false);
    setName("");
    setScores(null);
    setSaveState("idle");
    setSavedRank(null);
    if (scoreRef.current) scoreRef.current.textContent = "0";
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // mount: size canvas (capped for fill-rate), build cached gradients, bake
  // sprites, start the loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Render into a capped backing store and let CSS upscale to the panel.
    // Sized to the WORLD aspect so coordinates map cleanly.
    const displayW = canvas.clientWidth || window.innerWidth || WORLD_WIDTH;
    const dpr = window.devicePixelRatio || 1;
    const backW = Math.min(RENDER_MAX_W, Math.round(displayW * dpr));
    const backH = Math.round((backW * WORLD_HEIGHT) / WORLD_WIDTH);
    canvas.width = backW;
    canvas.height = backH;

    // Opaque context — no per-frame alpha compositing with the layer below.
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.setTransform(backW / WORLD_WIDTH, 0, 0, backH / WORLD_HEIGHT, 0, 0);
    ctxRef.current = ctx;

    // Build gradients once (recreating them every frame is wasteful).
    const bg = ctx.createLinearGradient(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    bg.addColorStop(0, "#1a1e2e");
    bg.addColorStop(0.4, "#2a1f2e");
    bg.addColorStop(1, "#e05a47");
    bgGradRef.current = bg;
    const ice = ctx.createLinearGradient(0, GROUND_Y, 0, WORLD_HEIGHT);
    ice.addColorStop(0, "#f6f9fc");
    ice.addColorStop(1, "#d6e2ef");
    iceGradRef.current = ice;

    // Load each sprite and bake it to its draw size once it's ready.
    for (const [key, src] of Object.entries(SPRITE_SOURCES)) {
      const img = new Image();
      img.onload = () => {
        if (key === "zamboni") {
          bakedRef.current.zamboni = bakeSprite(img, ZAMBONI_DRAW, ZAMBONI_DRAW, true);
        } else {
          const type = OBSTACLE_TYPES.find((t) => t.sprite === key);
          if (type) {
            bakedRef.current[key] = bakeSprite(
              img,
              type.width * OBSTACLE_DRAW_SCALE,
              type.height * OBSTACLE_DRAW_SCALE,
              false
            );
          }
        }
      };
      img.src = src;
      spritesRef.current[key] = img;
    }

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
        if (screen === "playing") {
          jumpRef.current = true;
          setHasJumped(true);
        }
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

  // Does this run make the board? True if it's not full yet, or it beats the
  // lowest score currently on it. Only then do we ask for a name.
  const qualifies =
    scores !== null &&
    (scores.length < LEADERBOARD_SIZE || score > scores[scores.length - 1].score);

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
            setHasJumped(true);
          }}
        >
          <div className={styles.hud}>
            <span className={styles.hudLabel}>SCORE</span>
            <span className={styles.hudScore} ref={scoreRef}>
              0
            </span>
          </div>
          {!hasJumped && <div className={styles.hint}>TAP TO JUMP</div>}
        </div>
      )}

      {screen === "gameover" && (
        <div className={styles.gameover}>
          <div className={styles.card}>
            <h2 className={styles.goTitle}>GAME OVER</h2>
            <div className={styles.finalScore}>{score}</div>

            {saveState !== "saved" &&
              scores !== null &&
              (qualifies ? (
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
              ) : (
                <p className={styles.noQualify}>
                  Not in the top {LEADERBOARD_SIZE} — give it another go!
                </p>
              ))}
            {saveState === "error" && (
              <p className={styles.errorMsg}>Couldn&apos;t save — try again.</p>
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
