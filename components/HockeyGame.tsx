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
  const idleRef = useRef<number>(performance.now());

  const [screen, setScreen] = useState<Screen>("playing");
  const [score, setScore] = useState(0);
  const [name, setName] = useState("");
  const [scores, setScores] = useState<ScoreEntry[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedRank, setSavedRank] = useState<number | null>(null);

  const draw = useCallback((ctx: CanvasRenderingContext2D, s: GameState) => {
    // Transparent canvas — the overlay's EP gradient (same as the app's default
    // view) shows through above the ice.
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // ice surface
    const ice = ctx.createLinearGradient(0, GROUND_Y, 0, WORLD_HEIGHT);
    ice.addColorStop(0, "#f6f9fc");
    ice.addColorStop(1, "#d6e2ef");
    ctx.fillStyle = ice;
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

    const getImg = (key: string) => {
      const im = spritesRef.current[key];
      return im && im.complete && im.naturalWidth > 0 ? im : null;
    };

    // obstacles (team logos) — drawn a touch larger than their hitbox, full opacity
    for (const o of s.obstacles) {
      const cx = o.x + o.width / 2;
      const dw = o.width * 1.18;
      const dh = o.height * 1.18;
      drawContactShadow(ctx, cx, GROUND_Y, dw);
      const img = getImg(o.sprite);
      if (img) {
        drawSprite(ctx, img, cx, GROUND_Y + 2, dw, dh, false);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(cx - o.width / 2, GROUND_Y - o.height, o.width, o.height);
      }
    }

    // the zamboni — sprite art faces left, so flip it to face right (into play)
    const zcx = ZAMBONI_X + ZAMBONI_WIDTH / 2;
    drawContactShadow(ctx, zcx, GROUND_Y, ZAMBONI_WIDTH);
    const z = getImg("zamboni");
    if (z) {
      drawSprite(ctx, z, zcx, GROUND_Y - s.y + 24, ZAMBONI_DRAW, ZAMBONI_DRAW, true);
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

  // mount: size canvas for DPR, preload sprites, start the loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD_WIDTH * dpr;
    canvas.height = WORLD_HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const [key, src] of Object.entries(SPRITE_SOURCES)) {
      const img = new Image();
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
