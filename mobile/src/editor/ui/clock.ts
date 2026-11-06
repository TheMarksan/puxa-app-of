import { useEffect, useState } from 'react';

type Listener = (time: number, playing: boolean) => void;

/**
 * Relógio da prévia: a fonte da verdade do "agora" na linha do tempo. Os players de vídeo e
 * áudio seguem este relógio (e são corrigidos se escorregarem), não o contrário.
 */
export class Clock {
  time = 0;
  playing = false;
  duration = 0;
  private raf: number | null = null;
  private wall = 0;
  private from = 0;
  private listeners = new Set<Listener>();

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l(this.time, this.playing));
  }

  play() {
    if (this.duration <= 0) return;
    if (this.time >= this.duration - 0.05) this.time = 0;
    this.playing = true;
    this.wall = Date.now();
    this.from = this.time;
    this.emit();
    this.loop();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** O projeto mudou de duração: o "agora" não pode ficar depois do fim. */
  setDuration(d: number) {
    this.duration = Math.max(0, d);
    if (this.time > this.duration) this.seek(this.duration);
  }

  seek(t: number) {
    this.time = Math.max(0, Math.min(this.duration, t));
    if (this.playing) {
      this.wall = Date.now();
      this.from = this.time;
    }
    this.emit();
  }

  private loop = () => {
    if (!this.playing) return;
    const t = this.from + (Date.now() - this.wall) / 1000;
    if (t >= this.duration) {
      this.time = this.duration;
      this.pause();
      return;
    }
    this.time = t;
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  };
}

/** Tempo e estado do relógio, com no máximo [fps] atualizações de tela por segundo. */
export function useClock(clock: Clock, fps = 30): { time: number; playing: boolean } {
  const [state, setState] = useState({ time: clock.time, playing: clock.playing });
  useEffect(() => {
    let last = 0;
    let wasPlaying = clock.playing;
    return clock.subscribe((time, playing) => {
      const now = Date.now();
      if (playing !== wasPlaying || !playing || now - last >= 1000 / fps) {
        last = now;
        wasPlaying = playing;
        setState({ time, playing });
      }
    });
  }, [clock, fps]);
  return state;
}
