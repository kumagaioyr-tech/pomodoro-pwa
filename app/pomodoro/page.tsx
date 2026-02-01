"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Phase = "work" | "break" | "longBreak";
type Preset = { label: string; workMin: number; breakMin: number; longBreakMin: number; longEvery: number };

const PRESETS: Preset[] = [
  { label: "Ignite 2/1", workMin: 2, breakMin: 1, longBreakMin: 3, longEvery: 4 },
  { label: "Classic 25/5", workMin: 25, breakMin: 5, longBreakMin: 15, longEvery: 4 },
  { label: "Deep 50/10", workMin: 50, breakMin: 10, longBreakMin: 20, longEvery: 2 },
];

const PALETTES = [
  { name: "Midnight", bg: "#0b0b0f", accent: "#7c3aed" },
  { name: "Ocean", bg: "#061826", accent: "#22c55e" },
  { name: "Mono", bg: "#0a0a0a", accent: "#e5e7eb" },
  { name: "Sunset", bg: "#1b1026", accent: "#f97316" },
];

const LS_KEY = "pomodoro_timer_v3";

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.trunc(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function playBeep() {
  try {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);

    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    o.start(now);
    o.stop(now + 0.3);
    o.onended = () => ctx.close().catch(() => undefined);
  } catch {}
}

function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue] as const;
}

function svgDataUri(svg: string) {
  const encoded = encodeURIComponent(svg)
    .replace(/%0A/g, "")
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/")
    .replace(/%2C/g, ",");
  return `url("data:image/svg+xml,${encoded}")`;
}

function Particles({ accent }: { accent: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.05,
      a: 0.1 + Math.random() * 0.35,
    }));

    const resize = () => {
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // 粒子
      for (const p of particles) {
        p.x += p.vx / 60;
        p.y += p.vy / 60;

        if (p.x < -0.05) p.x = 1.05;
        if (p.x > 1.05) p.x = -0.05;
        if (p.y < -0.05) p.y = 1.05;
        if (p.y > 1.05) p.y = -0.05;

        const x = p.x * w;
        const y = p.y * h;

        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${p.a})`;
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 近い粒子同士を薄く結ぶ
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = (a.x - b.x) * w;
          const dy = (a.y - b.y) * h;
          const dist = Math.hypot(dx, dy);
          const max = 140;
          if (dist < max) {
            const t = 1 - dist / max;
            ctx.strokeStyle = `rgba(255,255,255,${0.1 * t})`;
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }
      }

      // アクセントの霞
      const grad = ctx.createRadialGradient(w * 0.2, h * 0.15, 0, w * 0.2, h * 0.15, Math.max(w, h) * 0.7);
      grad.addColorStop(0, `${accent}22`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad as any;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [accent]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.7,
        mixBlendMode: "screen",
      }}
    />
  );
}

export default function PomodoroPage() {
  const [prefs, setPrefs] = useLocalStorageState(LS_KEY, {
    workMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    longEvery: 4,
    autoStartNext: false,
    soundOn: true,
    bgColor: "#0b0b0f",
    accentColor: "#7c3aed",
    noise: 0.12, // 0〜0.60
    glow: 0.55, // 0〜1
  });

  const [phase, setPhase] = useState<Phase>("work");
  const [isRunning, setIsRunning] = useState(false);
  const [workSessionsDone, setWorkSessionsDone] = useState(0);

  const phaseTotalSeconds = useMemo(() => {
    if (phase === "work") return prefs.workMin * 60;
    if (phase === "break") return prefs.breakMin * 60;
    return prefs.longBreakMin * 60;
  }, [phase, prefs.workMin, prefs.breakMin, prefs.longBreakMin]);

  const [secondsLeft, setSecondsLeft] = useState(phaseTotalSeconds);

  useEffect(() => {
    if (!isRunning) setSecondsLeft(phaseTotalSeconds);
  }, [phaseTotalSeconds, isRunning]);

  const intervalRef = useRef<number | null>(null);
  const clearTimer = () => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const nextPhase = (from: Phase) => {
    if (from === "work") {
      const nextCount = workSessionsDone + 1;
      const useLong = prefs.longEvery > 0 && nextCount % prefs.longEvery === 0;
      setWorkSessionsDone(nextCount);
      setPhase(useLong ? "longBreak" : "break");
      return;
    }
    setPhase("work");
  };

  const finishPhase = () => {
    if (prefs.soundOn) playBeep();
    setIsRunning(false);
    clearTimer();
    nextPhase(phase);
    if (prefs.autoStartNext) setTimeout(() => setIsRunning(true), 50);
  };

  useEffect(() => {
    if (!isRunning) {
      clearTimer();
      return;
    }
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setTimeout(() => finishPhase(), 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  useEffect(() => () => clearTimer(), []);

  const resetAll = () => {
    setIsRunning(false);
    clearTimer();
    setPhase("work");
    setWorkSessionsDone(0);
    setSecondsLeft(prefs.workMin * 60);
  };

  const resetPhase = () => {
    setIsRunning(false);
    clearTimer();
    setSecondsLeft(phaseTotalSeconds);
  };

  const skip = () => {
    setIsRunning(false);
    clearTimer();
    if (prefs.soundOn) playBeep();
    nextPhase(phase);
  };

  const applyPreset = (preset: Preset) => {
    setIsRunning(false);
    clearTimer();

    const newPrefs = {
      ...prefs,
      workMin: clampInt(preset.workMin, 1, 180),
      breakMin: clampInt(preset.breakMin, 1, 120),
      longBreakMin: clampInt(preset.longBreakMin, 1, 180),
      longEvery: clampInt(preset.longEvery, 0, 20),
    };
    setPrefs(newPrefs);

    const nextSeconds =
      phase === "work" ? newPrefs.workMin * 60 : phase === "break" ? newPrefs.breakMin * 60 : newPrefs.longBreakMin * 60;

    setSecondsLeft(nextSeconds);
  };

  const phaseLabel = phase === "work" ? "WORK" : phase === "break" ? "BREAK" : "LONG BREAK";

  useEffect(() => {
    document.documentElement.style.backgroundColor = prefs.bgColor;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", prefs.bgColor);

    document.title = `${phaseLabel} ${mmss(secondsLeft)}`;
  }, [prefs.bgColor, phaseLabel, secondsLeft]);

  const accent = prefs.accentColor;

  const btnBase: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    cursor: "pointer",
    userSelect: "none",
    fontWeight: 650,
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    background: accent,
    border: `1px solid ${accent}`,
    color: "#0b0b0f",
    boxShadow: `0 0 0 1px ${accent}55, 0 18px 55px ${accent}22`,
  };

  const chip: React.CSSProperties = {
    ...btnBase,
    padding: "8px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
  };

  const noiseSvg = svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
      <filter id="n">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="
          1 0 0 0 0
          0 1 0 0 0
          0 0 1 0 0
          0 0 0 0.6 0"/>
      </filter>
      <rect width="180" height="180" filter="url(#n)" opacity="0.55"/>
    </svg>
  `);

  const bgStyle: React.CSSProperties = {
    minHeight: "100vh",
    paddingTop: "max(16px, env(safe-area-inset-top))",
    paddingBottom: "max(16px, env(safe-area-inset-bottom))",
    paddingLeft: "max(16px, env(safe-area-inset-left))",
    paddingRight: "max(16px, env(safe-area-inset-right))",
    display: "grid",
    placeItems: "center",
    position: "relative",
    backgroundColor: prefs.bgColor,
    backgroundImage: `
      radial-gradient(900px 520px at 18% 12%, ${accent}33, transparent 58%),
      radial-gradient(900px 520px at 82% 88%, ${accent}26, transparent 58%),
      radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,0.25) 50%, transparent 52%),
      radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.18) 50%, transparent 52%),
      radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.12) 50%, transparent 52%)
    `,
    backgroundSize: `
      100% 100%,
      100% 100%,
      380px 380px,
      520px 520px,
      740px 740px
    `,
    backgroundPosition: `
      center,
      center,
      center,
      center,
      center
    `,
  };

  return (
    <div style={{ position: "relative" }}>
      <style jsx global>{`
        :root {
          color-scheme: dark;
        }
        .glass {
          position: relative;
          overflow: hidden;
        }
        .glass::before {
          content: "";
          position: absolute;
          inset: -2px;
          background:
            radial-gradient(800px 200px at 10% 0%, rgba(255,255,255,0.18), transparent 60%),
            radial-gradient(500px 200px at 90% 10%, rgba(255,255,255,0.10), transparent 55%),
            linear-gradient(120deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02), rgba(255,255,255,0.08));
          opacity: 0.55;
          pointer-events: none;
          transform: translateZ(0);
        }
        .glass::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.06), transparent 55%);
          opacity: 0.9;
          pointer-events: none;
        }
        @keyframes floaty {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -6px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        .floaty {
          animation: floaty 6.5s ease-in-out infinite;
        }
      `}</style>

      <Particles accent={accent} />

      {/* ノイズ（固定オーバーレイ） */}
      <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
        opacity: prefs.noise,
        backgroundImage: noiseSvg,
        backgroundRepeat: "repeat",
        backgroundSize: "180px 180px",
        mixBlendMode: "soft-light",
        filter: "contrast(400%) brightness(220%)",
        }}
    />

      {/* グロー */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 2,
          opacity: prefs.glow,
          backgroundImage: `
            radial-gradient(800px 420px at 30% 18%, ${accent}AA, transparent 60%),
            radial-gradient(700px 420px at 80% 80%, ${accent}88, transparent 62%)
          `,
          filter: "blur(28px)",
          mixBlendMode: "screen",
        }}
      />

      <div style={bgStyle}>
        <div
          className="glass floaty"
          style={{
            width: "100%",
            maxWidth: 760,
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(10,10,12,0.52)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            boxShadow: `0 22px 85px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset`,
            padding: 18,
            position: "relative",
            zIndex: 2,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: "rgba(255,255,255,0.95)", letterSpacing: "0.02em" }}>
                Pomodoro
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, letterSpacing: "0.22em" }}>{phaseLabel}</div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={chip} onClick={() => setPrefs({ ...prefs, soundOn: !prefs.soundOn })}>
                {prefs.soundOn ? "SOUND ON" : "SOUND OFF"}
              </button>
              <button style={chip} onClick={() => setPrefs({ ...prefs, autoStartNext: !prefs.autoStartNext })}>
                {prefs.autoStartNext ? "AUTO ON" : "AUTO OFF"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div
              className="glass"
              style={{
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                padding: 18,
                display: "grid",
                gap: 8,
                alignItems: "center",
                justifyItems: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: -1,
                  pointerEvents: "none",
                  background: `radial-gradient(500px 180px at 50% 0%, ${accent}22, transparent 60%)`,
                  opacity: 0.9,
                  filter: "blur(2px)",
                }}
              />

              <div
                style={{
                  fontSize: 72,
                  fontWeight: 950,
                  fontVariantNumeric: "tabular-nums",
                  color: "rgba(255,255,255,0.97)",
                  textShadow: `0 8px 50px rgba(0,0,0,0.45), 0 0 22px ${accent}18`,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {mmss(secondsLeft)}
              </div>

              <div style={{ opacity: 0.78, color: "rgba(255,255,255,0.86)", position: "relative", zIndex: 1 }}>
                Sessions: {workSessionsDone}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6, zIndex: 1 }}>
                <button onClick={() => setIsRunning((v) => !v)} style={isRunning ? btnBase : btnPrimary}>
                  {isRunning ? "Pause" : "Start"}
                </button>
                <button onClick={resetPhase} style={btnBase}>
                  Reset
                </button>
                <button onClick={skip} style={btnBase}>
                  Skip
                </button>
                <button onClick={resetAll} style={btnBase}>
                  Reset all
                </button>
              </div>
            </div>

            <div
              className="glass"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 12,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.94)" }}>Presets</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PRESETS.map((p) => (
                  <button key={p.label} onClick={() => applyPreset(p)} style={btnBase}>
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ fontWeight: 900, marginTop: 6, color: "rgba(255,255,255,0.94)" }}>Theme</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.85)" }}>Background</div>
                  <input
                    type="color"
                    value={prefs.bgColor}
                    onChange={(e) => setPrefs({ ...prefs, bgColor: e.target.value })}
                    style={{ width: 56, height: 36, padding: 0, border: "none", background: "transparent" }}
                    aria-label="background color"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.85)" }}>Accent</div>
                  <input
                    type="color"
                    value={prefs.accentColor}
                    onChange={(e) => setPrefs({ ...prefs, accentColor: e.target.value })}
                    style={{ width: 56, height: 36, padding: 0, border: "none", background: "transparent" }}
                    aria-label="accent color"
                  />
                </div>

                <div style={{ display: "grid", gap: 6, minWidth: 160 }}>
                  <div style={{ fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.85)" }}>
                    Noise ({Math.round(prefs.noise * 100)}%)
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={clampInt(Math.round(prefs.noise * 100), 0, 60)}
                    onChange={(e) => setPrefs({ ...prefs, noise: clampInt(Number(e.target.value), 0, 60) / 100 })}
                  />
                </div>

                <div style={{ display: "grid", gap: 6, minWidth: 160 }}>
                  <div style={{ fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.85)" }}>
                    Glow ({Math.round(prefs.glow * 100)}%)
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={clampInt(Math.round(prefs.glow * 100), 0, 100)}
                    onChange={(e) => setPrefs({ ...prefs, glow: clampInt(Number(e.target.value), 0, 100) / 100 })}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {PALETTES.map((p) => (
                    <button
                      key={p.name}
                      style={{
                        ...btnBase,
                        padding: "10px 12px",
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      onClick={() => setPrefs({ ...prefs, bgColor: p.bg, accentColor: p.accent })}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: p.accent, display: "inline-block" }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 6 }}>
                <label style={{ display: "grid", gap: 6, color: "rgba(255,255,255,0.90)" }}>
                  <span style={{ fontSize: 12, opacity: 0.78 }}>Work (min)</span>
                  <input
                    type="number"
                    value={prefs.workMin}
                    min={1}
                    max={180}
                    onChange={(e) => setPrefs({ ...prefs, workMin: clampInt(Number(e.target.value), 1, 180) })}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.92)",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, color: "rgba(255,255,255,0.90)" }}>
                  <span style={{ fontSize: 12, opacity: 0.78 }}>Break (min)</span>
                  <input
                    type="number"
                    value={prefs.breakMin}
                    min={1}
                    max={120}
                    onChange={(e) => setPrefs({ ...prefs, breakMin: clampInt(Number(e.target.value), 1, 120) })}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.92)",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, color: "rgba(255,255,255,0.90)" }}>
                  <span style={{ fontSize: 12, opacity: 0.78 }}>Long break (min)</span>
                  <input
                    type="number"
                    value={prefs.longBreakMin}
                    min={1}
                    max={180}
                    onChange={(e) => setPrefs({ ...prefs, longBreakMin: clampInt(Number(e.target.value), 1, 180) })}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.92)",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, color: "rgba(255,255,255,0.90)" }}>
                  <span style={{ fontSize: 12, opacity: 0.78 }}>Long every (0=off)</span>
                  <input
                    type="number"
                    value={prefs.longEvery}
                    min={0}
                    max={20}
                    onChange={(e) => setPrefs({ ...prefs, longEvery: clampInt(Number(e.target.value), 0, 20) })}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.92)",
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
