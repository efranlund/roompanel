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
