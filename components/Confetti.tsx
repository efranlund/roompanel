"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import styles from "./Confetti.module.css";

export interface ConfettiHandle {
  /** Spawn a celebratory burst at a viewport coordinate. */
  fire: (x: number, y: number) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string | null; // null => EP-logo coin
  life: number; // seconds remaining
}

// EP brand palette + a celebratory gold.
const COLORS = ["#e05a47", "#e8786a", "#2ecc71", "#f0ece4", "#f5c542", "#2a2f42"];
const GRAVITY = 1500; // px/s^2
const COUNT_PER_BURST = 36;
const LOGO_COIN_PX = 48; // pre-baked size of the circular EP-logo coin

const Confetti = forwardRef<ConfettiHandle>(function Confetti(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const coinRef = useRef<HTMLCanvasElement | null>(null); // pre-baked logo coin

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    ctxRef.current = canvas.getContext("2d");

    // Pre-bake the EP logo into a small circular coin so the loop blits it
    // instead of resampling the full-resolution image every frame.
    const img = new Image();
    img.onload = () => {
      const coin = document.createElement("canvas");
      coin.width = LOGO_COIN_PX;
      coin.height = LOGO_COIN_PX;
      const cx = coin.getContext("2d");
      if (cx) {
        cx.beginPath();
        cx.arc(LOGO_COIN_PX / 2, LOGO_COIN_PX / 2, LOGO_COIN_PX / 2, 0, Math.PI * 2);
        cx.clip();
        cx.drawImage(img, 0, 0, LOGO_COIN_PX, LOGO_COIN_PX);
        coinRef.current = coin;
      }
    };
    img.src = "/logos/ep-logo.jpg";

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Held in a ref so the loop can re-schedule itself without referencing its
  // own (not-yet-initialised) const by name.
  const loopRef = useRef<(ts: number) => void>(() => {});

  const loop = useCallback((ts: number) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const last = lastTsRef.current ?? ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    lastTsRef.current = ts;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const coin = coinRef.current;
    for (const p of particlesRef.current) {
      p.vy += GRAVITY * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.life -= dt;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
      if (p.color) {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62); // little ribbon
      } else if (coin) {
        ctx.drawImage(coin, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = "#e05a47";
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }

    particlesRef.current = particlesRef.current.filter(
      (p) => p.life > 0 && p.y < canvas.height + 60
    );

    if (particlesRef.current.length > 0) {
      rafRef.current = requestAnimationFrame(loopRef.current);
    } else {
      rafRef.current = null;
      lastTsRef.current = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useImperativeHandle(
    ref,
    () => ({
      fire: (x: number, y: number) => {
        for (let i = 0; i < COUNT_PER_BURST; i++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2; // upward fan
          const speed = 320 + Math.random() * 540;
          const isLogo = i % 6 === 0; // ~1 in 6 are EP-logo coins
          particlesRef.current.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 14,
            size: isLogo ? 22 + Math.random() * 12 : 9 + Math.random() * 8,
            color: isLogo ? null : COLORS[Math.floor(Math.random() * COLORS.length)],
            life: 1.1 + Math.random() * 0.8,
          });
        }
        if (rafRef.current == null) {
          lastTsRef.current = null;
          rafRef.current = requestAnimationFrame(loop);
        }
      },
    }),
    [loop]
  );

  return <canvas ref={canvasRef} className={styles.confetti} aria-hidden="true" />;
});

export default Confetti;
