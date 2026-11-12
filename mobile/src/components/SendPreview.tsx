import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { shownCues } from '../editor/captionLayout';
import { placement } from '../editor/timeline';
import type { CaptionStyle, Cue, MediaSource } from '../editor/types';
import { CaptionLayer } from '../editor/ui/CaptionLayer';
import { videoFill } from '../editor/ui/kit';
import { usePlayerTime } from '../editor/ui/usePlayerTime';
import { clock } from '../format';
import { ms } from '../motion';
import { ease, font } from '../theme';
import type { Framing } from './CaptionStudio';

const seekTo = (p: VideoPlayer, t: number) => {
  p.currentTime = t;
};

/** Legenda que aparece em [time] (parado entre duas, a mais perto, para dar para ver o estilo). */
export function cueAt(cues: Cue[], time: number, playing: boolean): { cue: Cue | null; next?: number; at: number } {
  const i = cues.findIndex((c) => time >= c.start && time < c.end);
  if (i >= 0) return { cue: cues[i], next: cues[i + 1]?.start, at: time };
  if (playing || !cues.length) return { cue: null, at: time };
  const near = [...cues].sort((a, b) => Math.min(Math.abs(a.start - time), Math.abs(a.end - time)) - Math.min(Math.abs(b.start - time), Math.abs(b.end - time)))[0];
  return { cue: near, at: near.start + Math.min(1.2, (near.end - near.start) * 0.6) };
}

/**
 * A prévia do envio é um player de verdade: mostra o vídeo como vai sair (o trecho, o zoom e a
 * legenda gravada), com tocar/pausar e a barra de tempo do trecho, que dá para arrastar.
 */
export function SendPreview({
  player,
  source,
  range,
  framing,
  captions,
  chip,
  maxHeight = 360,
  onToggle,
  onOpenStudio,
}: {
  player: VideoPlayer;
  source: MediaSource | null;
  range: { start: number; end: number };
  framing: Framing;
  /** Legenda ligada: as falas (em segundos do arquivo) e o estilo. */
  captions: { cues: Cue[]; style: CaptionStyle } | null;
  chip: string;
  maxHeight?: number;
  /** Tocar/pausar (a dublagem toca junto, então quem manda é o envio). */
  onToggle: () => void;
  onOpenStudio?: () => void;
}) {
  const [width, setWidth] = useState(0);
  const { time, playing } = usePlayerTime(player, range);
  const [drag, setDrag] = useState<number | null>(null);
  const ratio = source && source.width > 0 && source.height > 0 ? source.width / source.height : 16 / 9;
  const ch = width ? Math.min(maxHeight, Math.round(width / ratio)) : 0;
  const cw = ch ? Math.round(ch * ratio) : 0;
  const pl = placement({ fit: 'fill', zoom: framing.zoom, panX: framing.panX, panY: framing.panY, rotate: 0 }, source ?? { width: 16, height: 9 }, cw, ch);
  const shown = captions ? shownCues(captions.cues.filter((c) => c.end > range.start && c.start < range.end), captions.style, cw || 1, ch || 1) : [];
  const t = drag ?? time;
  const cur = captions ? cueAt(shown, t, playing) : null;
  const length = Math.max(0.1, range.end - range.start);
  const rel = Math.min(length, Math.max(0, t - range.start));

  // O botão do meio aparece parado e some sozinho logo depois de começar a tocar
  const [fade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    Animated.timing(fade, { toValue: playing ? 0 : 1, duration: ms(playing ? 420 : 160), delay: playing ? ms(500) : 0, easing: playing ? ease.exit : ease.arrive, useNativeDriver: true }).start();
  }, [playing, fade]);

  const toggle = () => {
    Haptics.selectionAsync().catch(() => {});
    if (!playing && (player.currentTime < range.start || player.currentTime >= range.end - 0.15)) seekTo(player, range.start);
    onToggle();
  };

  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ alignItems: 'center' }}>
      {cw > 0 ? (
        <View style={[s.frame, { width: cw, height: ch }]}>
          <View pointerEvents="none" style={{ position: 'absolute', left: pl.x, top: pl.y, width: pl.sw, height: pl.sh }}>
            <VideoView player={player} style={videoFill} contentFit="fill" nativeControls={false} surfaceType="textureView" />
          </View>
          {cur?.cue && captions ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <CaptionLayer cue={cur.cue} next={cur.next} time={cur.at} style={captions.style} cw={cw} ch={ch} />
            </View>
          ) : null}
          <Pressable style={StyleSheet.absoluteFill} onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? 'Pausar a prévia' : 'Tocar a prévia'} />
          <Animated.View pointerEvents="none" style={[s.center, { opacity: fade }]}>
            <View style={s.bigBtn}>
              <Feather name={playing ? 'pause' : 'play'} size={24} color="#fff" style={playing ? null : { marginLeft: 3 }} />
            </View>
          </Animated.View>
          {/* Tocando, os controles somem para a legenda aparecer inteira; fica só a linha do tempo */}
          <Animated.View pointerEvents="none" style={[s.thin, { opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
            <View style={{ width: `${(rel / length) * 100}%`, height: 3, backgroundColor: '#fff' }} />
          </Animated.View>
          <Animated.View pointerEvents={playing ? 'none' : 'box-none'} style={[s.bottom, { opacity: fade }]}>
            <Pressable onPress={toggle} hitSlop={8} style={s.smallBtn} accessibilityRole="button" accessibilityLabel={playing ? 'Pausar' : 'Tocar'}>
              <Feather name={playing ? 'pause' : 'play'} size={16} color="#fff" style={playing ? null : { marginLeft: 2 }} />
            </Pressable>
            <Scrub
              value={rel}
              max={length}
              onScrub={(v) => {
                if (player.playing) player.pause();
                setDrag(range.start + v);
                seekTo(player, range.start + v);
              }}
              onSeek={(v) => {
                setDrag(null);
                seekTo(player, range.start + v);
              }}
            />
            <Text style={s.time}>
              {clock(rel)} / {clock(length)}
            </Text>
          </Animated.View>
          <View pointerEvents="none" style={s.chip}>
            <Text style={s.chipText}>{chip}</Text>
          </View>
          {onOpenStudio ? (
            <Pressable onPress={onOpenStudio} hitSlop={6} style={s.expand} accessibilityRole="button" accessibilityLabel="Abrir em tela cheia">
              <Feather name="maximize-2" size={15} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[s.frame, { width: '100%', aspectRatio: 16 / 9 }]} />
      )}
    </View>
  );
}

/** Barra fina do tempo do trecho: tocar ou arrastar leva ao ponto. */
function Scrub({ value, max, onScrub, onSeek }: { value: number; max: number; onScrub: (v: number) => void; onSeek: (v: number) => void }) {
  const [w, setW] = useState(0);
  const live = useRef({ w, max, onScrub, onSeek });
  useLayoutEffect(() => {
    live.current = { w, max, onScrub, onSeek };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let x0 = 0;
    let last = 0;
    const at = (x: number) => {
      const { w: ww, max: m } = live.current;
      return ww > 0 ? Math.min(m, Math.max(0, (x / ww) * m)) : 0;
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
  const x = max > 0 ? Math.min(1, value / max) * w : 0;
  return (
    <View
      style={s.scrub}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Posição no trecho"
      accessibilityValue={{ text: `${clock(value)} de ${clock(max)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onSeek(Math.min(max, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 2 : -2))))}
    >
      <View pointerEvents="none" style={s.rail}>
        <View style={{ width: x, height: 3, backgroundColor: '#fff' }} />
      </View>
      {w > 0 ? <View pointerEvents="none" style={[s.knob, { left: x - 6 }]} /> : null}
      <View {...responder.panHandlers} style={[StyleSheet.absoluteFill, { top: -10, bottom: -10 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  frame: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  bigBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  thin: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.45)' },
  smallBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  scrub: { flex: 1, height: 24, justifyContent: 'center' },
  rail: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  knob: { position: 'absolute', top: 6, width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  time: { fontFamily: font.semibold, fontSize: 12, color: '#fff', fontVariant: ['tabular-nums'], minWidth: 74, textAlign: 'right' },
  chip: { position: 'absolute', left: 10, top: 10, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: '#fff', fontVariant: ['tabular-nums'] },
  expand: { position: 'absolute', right: 8, top: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
