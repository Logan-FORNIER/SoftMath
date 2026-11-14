import { Coffee, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';

type PomodoroPhase = 'focus' | 'break';

const DURATIONS_SEC: Record<PomodoroPhase, number> = {
  focus: 25 * 60,
  break: 5 * 60,
};

function playSoftBell() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.62);
  } catch {
    // ignore audio block
  }
}

export function formatMmSs(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function PomodoroTimer() {
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [secondsLeft, setSecondsLeft] = useState(DURATIONS_SEC.focus);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          playSoftBell();
          setRunning(false);
          const nextPhase: PomodoroPhase = phase === 'focus' ? 'break' : 'focus';
          setPhase(nextPhase);
          return DURATIONS_SEC[nextPhase];
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, phase]);

  const togglePhase = () => {
    const nextPhase: PomodoroPhase = phase === 'focus' ? 'break' : 'focus';
    setRunning(false);
    setPhase(nextPhase);
    setSecondsLeft(DURATIONS_SEC[nextPhase]);
  };

  const resetTimer = () => {
    setRunning(false);
    setSecondsLeft(DURATIONS_SEC[phase]);
  };

  return (
    <div
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] transition-colors ${
        running
          ? phase === 'focus'
            ? 'border-indigo-400/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
            : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-stone-200/80 bg-white/60 text-stone-600 dark:border-zinc-700/70 dark:bg-zinc-900/60 dark:text-zinc-300'
      }`}
      title={
        phase === 'focus'
          ? 'Chrono Pomodoro (25 min Focus) — Cliquer sur l’icône pour passer en pause'
          : 'Pause Pomodoro (5 min) — Cliquer sur l’icône pour repasser en Focus'
      }
    >
      <button
        type="button"
        onClick={togglePhase}
        className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
        title={phase === 'focus' ? 'Passer en pause (5 min)' : 'Passer en focus (25 min)'}
      >
        {phase === 'focus' ? (
          <Timer className="h-3 w-3" />
        ) : (
          <Coffee className="h-3 w-3 text-emerald-500" />
        )}
      </button>

      <span className="font-mono font-semibold tabular-nums">
        {formatMmSs(secondsLeft)}
      </span>

      <button
        type="button"
        onClick={() => setRunning((r) => !r)}
        aria-label={running ? 'Mettre le chrono en pause' : 'Démarrer le chrono'}
        className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
      >
        {running ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
      </button>

      <button
        type="button"
        onClick={resetTimer}
        aria-label="Réinitialiser le chrono"
        title="Réinitialiser"
        className="rounded p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      >
        <RotateCcw className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

