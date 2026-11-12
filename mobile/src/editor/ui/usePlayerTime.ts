import type { VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';

const seek = (p: VideoPlayer, t: number) => {
  p.currentTime = t;
};

/**
 * Tempo do player a ~30 quadros por segundo (para a legenda acompanhar o vídeo). Com [range],
 * volta ao começo do trecho quando chega ao fim, como uma prévia em repetição.
 */
export function usePlayerTime(player: VideoPlayer, range: { start: number; end: number } | null) {
  const [state, setState] = useState(() => ({ time: player.currentTime, playing: player.playing }));
  const start = range?.start ?? null;
  const end = range?.end ?? null;
  useEffect(() => {
    let raf = 0;
    let last = -1;
    let was = player.playing;
    const tick = () => {
      const t = player.currentTime;
      const p = player.playing;
      if (p && start != null && end != null && t >= end - 0.04) seek(player, start);
      if (Math.abs(t - last) >= 1 / 30 || p !== was) {
        last = t;
        was = p;
        setState({ time: t, playing: p });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player, start, end]);
  return state;
}
