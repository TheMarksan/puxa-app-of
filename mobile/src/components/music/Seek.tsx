import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { clock } from '../../format';
import { smoothTime, usePlayer, type PlayerState } from '../../playlist/player';

/** Barra de tempo: tocar ou arrastar leva para o ponto. */
export function SeekBar({ value, max, onScrub, onSeek, track, fill, thumb = 14 }: { value: number; max: number; onScrub: (v: number) => void; onSeek: (v: number) => void; track: string; fill: string; thumb?: number }) {
  const [width, setWidth] = useState(0);
  const live = useRef({ width, max, onScrub, onSeek });
  useLayoutEffect(() => {
    live.current = { width, max, onScrub, onSeek };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let x0 = 0;
    let last = 0;
    const at = (x: number) => {
      const { width: w, max: m } = live.current;
      return w > 0 && m > 0 ? Math.min(m, Math.max(0, (x / w) * m)) : 0;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        x0 = e.nativeEvent.locationX;
        last = at(x0);
        live.current.onScrub(last);
      },
      onPanResponderMove: (_, g) => {
        last = at(x0 + g.dx);
        live.current.onScrub(last);
      },
      onPanResponderRelease: () => live.current.onSeek(last),
      onPanResponderTerminate: () => live.current.onSeek(last),
    });
  });
  const x = max > 0 ? Math.min(1, Math.max(0, value / max)) * width : 0;
  return (
    <View
      style={{ height: 28, justifyContent: 'center' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Posição da música"
      accessibilityValue={{ text: `${clock(value)} de ${clock(max)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onSeek(Math.min(max, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 10 : -10))))}
    >
      <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: track, overflow: 'hidden' }}>
        <View style={{ width: x, height: 4, backgroundColor: fill }} />
      </View>
      {width > 0 && thumb > 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: x - thumb / 2, top: 14 - thumb / 2, width: thumb, height: thumb, borderRadius: thumb / 2, backgroundColor: fill }} /> : null}
      <View {...responder.panHandlers} style={[StyleSheet.absoluteFill, { top: -8, bottom: -8 }]} />
    </View>
  );
}

/**
 * Tempo da música andando liso (o player avisa a cada meio segundo; entre um aviso e outro, o
 * relógio do celular completa). Serve para a letra acender na hora certa.
 */
export function useSmoothTime(hz = 10): { time: number; p: PlayerState } {
  const p = usePlayer();
  const [now, setNow] = useState(smoothTime);
  useEffect(() => {
    const id = setInterval(() => setNow(smoothTime()), 1000 / (p.playing ? hz : 4));
    return () => clearInterval(id);
  }, [p.playing, hz]);
  return { time: p.playing ? now : p.time, p };
}
