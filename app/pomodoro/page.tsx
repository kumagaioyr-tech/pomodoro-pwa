"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Phase = "work" | "break" | "longBreak";
type Preset = { label: string; workMin: number; breakMin: number; longBreakMin: number; longEvery: number };

const PRESETS: Preset[] = [
  { label: "Ignite 2/1", workMin: 2, breakMin: 1, longBreakMin: 3, longEvery: 4 },
  { label: "Classic 25/5", workMin: 25, breakMin: 5, longBreakMin: 15, longEvery: 4 },
  { label: "Deep 50/10", workMin: 50, breakMin: 10, longBreakMin: 20, longEvery: 2 },
];

const LS_KEY = "pomodoro_timer_v1";

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
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
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

export default function PomodoroPage() {
  const [prefs, setPrefs] = useLocalStorageState(LS_KEY, {
    workMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    longEvery: 4,
    autoStartNext: false,
    soundOn: true,
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
    document.title = `${phaseLabel} ${mmss(secondsLeft)}`;
  }, [phaseLabel, secondsLeft]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 720, border: "1px solid #222", borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Pomodoro Timer</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setPrefs({ ...prefs, soundOn: !prefs.soundOn })}>
              {prefs.soundOn ? "Sound: ON" : "Sound: OFF"}
            </button>
            <button onClick={() => setPrefs({ ...prefs, autoStartNext: !prefs.autoStartNext })}>
              {prefs.autoStartNext ? "Auto: ON" : "Auto: OFF"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, opacity: 0.8, letterSpacing: "0.25em", fontSize: 12 }}>{phaseLabel}</div>
        <div style={{ marginTop: 10, fontSize: 64, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {mmss(secondsLeft)}
        </div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>Sessions: {workSessionsDone}</div>

        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setIsRunning((v) => !v)} style={{ padding: "10px 14px" }}>
            {isRunning ? "Pause" : "Start"}
          </button>
          <button onClick={resetPhase} style={{ padding: "10px 14px" }}>Reset</button>
          <button onClick={skip} style={{ padding: "10px 14px" }}>Skip</button>
          <button onClick={resetAll} style={{ padding: "10px 14px" }}>Reset all</button>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Presets</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p)} style={{ padding: "8px 12px" }}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ opacity: 0.75, marginTop: 8, fontSize: 12 }}>
            Tip: Ignite 2/1 → 乗ったら Classic 25/5 に切り替え。
          </div>
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div>Work (min)</div>
            <input
              type="number"
              value={prefs.workMin}
              min={1}
              max={180}
              onChange={(e) => setPrefs({ ...prefs, workMin: clampInt(Number(e.target.value), 1, 180) })}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div>
            <div>Break (min)</div>
            <input
              type="number"
              value={prefs.breakMin}
              min={1}
              max={120}
              onChange={(e) => setPrefs({ ...prefs, breakMin: clampInt(Number(e.target.value), 1, 120) })}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div>
            <div>Long break (min)</div>
            <input
              type="number"
              value={prefs.longBreakMin}
              min={1}
              max={180}
              onChange={(e) => setPrefs({ ...prefs, longBreakMin: clampInt(Number(e.target.value), 1, 180) })}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div>
            <div>Long every (sessions, 0=off)</div>
            <input
              type="number"
              value={prefs.longEvery}
              min={0}
              max={20}
              onChange={(e) => setPrefs({ ...prefs, longEvery: clampInt(Number(e.target.value), 0, 20) })}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
