import * as Haptics from 'expo-haptics';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, PanResponderInstance, StyleSheet, Text, View } from 'react-native';

import { clock } from '../format';
import { font, Palette, usePalette } from '../theme';

const WAVE_H = 76;
const BAR = 3;
const GAP = 2;
const HANDLE_HIT = 44;
const LABEL_W = 48;
export const MIN_CLIP = 1;

type Props = {
  peaks: number[] | null;
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  /** Posição da prévia tocando, em segundos; null quando parada. */
  playhead: number | null;
  onScrubStart?: () => void;
  /** Ao soltar uma alça: o tempo dela (início ou fim), para a prévia ir até lá. */
  onScrubEnd?: (time: number) => void;
  /** Vídeo: miniaturas ao longo do arquivo no lugar da onda. */
  filmstrip?: string[];
  /** Duração máxima do trecho: puxar uma alça além disso arrasta a outra junto. */
  maxLength?: number;
};

type Edge = 'start' | 'end' | 'both';

/** Reamostra os picos para o número de barras que cabe na largura. */
function resample(peaks: number[], n: number): number[] {
  if (n <= 0) return [];
  if (!peaks.length) return Array(n).fill(0.08);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * peaks.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
    let m = 0;
    for (let j = a; j < b && j < peaks.length; j++) m = Math.max(m, peaks[j]);
    out.push(m);
  }
  return out;
}

const Bars = memo(function Bars({ values, color }: { values: number[]; color: string }) {
  return (
    <View style={styles.bars}>
      {values.map((v, i) => (
        <View key={i} style={{ width: BAR, height: Math.max(3, v * (WAVE_H - 12)), borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
});

export function Trimmer({ peaks, duration, start, end, onChange, playhead, onScrubStart, onScrubEnd, filmstrip, maxLength }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const [width, setWidth] = useState(0);
  const n = width > 0 ? Math.floor((width + GAP) / (BAR + GAP)) : 0;
  const bars = useMemo(() => (peaks ? resample(peaks, n) : Array(n).fill(0)), [peaks, n]);
  const [active, setActive] = useState<Edge | null>(null);

  // Os PanResponders são criados uma vez; os valores atuais chegam por ref
  const live = useRef({ start, end, duration, width, onChange, onScrubStart, onScrubEnd, maxLength });
  useLayoutEffect(() => {
    live.current = { start, end, duration, width, onChange, onScrubStart, onScrubEnd, maxLength };
  });
  const origin = useRef({ start: 0, end: 0 });

  const responders = useMemo(() => {
    const make = (edge: Edge): PanResponderInstance =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          origin.current = { start: live.current.start, end: live.current.end };
          setActive(edge);
          live.current.onScrubStart?.();
          Haptics.selectionAsync().catch(() => {});
        },
        onPanResponderMove: (_, g) => {
          const { duration: d, width: w, onChange: emit, maxLength: most } = live.current;
          const max = most ?? Infinity;
          if (w <= 0) return;
          const delta = (g.dx / w) * d;
          const o = origin.current;
          const len = o.end - o.start;
          const round = (t: number) => Math.round(t * 10) / 10;
          if (edge === 'both') {
            const a = Math.min(Math.max(0, o.start + delta), d - len);
            emit(round(a), round(a + len));
          } else if (edge === 'start') {
            let a = Math.min(Math.max(0, o.start + delta), d - MIN_CLIP);
            let b = o.end;
            // Empurrou a outra alça: a seleção desliza mantendo a duração
            if (a > b - MIN_CLIP) {
              b = Math.min(d, a + len);
              a = Math.min(a, b - MIN_CLIP);
            }
            if (b - a > max) b = a + max;
            emit(round(a), round(b));
          } else {
            let b = Math.max(Math.min(d, o.end + delta), MIN_CLIP);
            let a = o.start;
            if (b < a + MIN_CLIP) {
              a = Math.max(0, b - len);
              b = Math.max(b, a + MIN_CLIP);
            }
            if (b - a > max) a = b - max;
            emit(round(a), round(b));
          }
        },
        onPanResponderRelease: () => {
          setActive(null);
          live.current.onScrubEnd?.(edge === 'end' ? live.current.end : live.current.start);
        },
        onPanResponderTerminate: () => setActive(null),
      });
    // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
    return { start: make('start'), end: make('end'), both: make('both') };
  }, []);

  const x = (t: number) => (duration > 0 ? (t / duration) * width : 0);
  const sx = x(start);
  const ex = x(end);

  // Rótulos de tempo sob cada alça, sem encostar um no outro nem sair da borda
  let la = sx - LABEL_W / 2;
  let lb = ex - LABEL_W / 2;
  const minGap = LABEL_W + 6;
  if (lb - la < minGap) {
    const mid = (la + lb) / 2;
    la = mid - minGap / 2;
    lb = mid + minGap / 2;
  }
  const clamp = (v: number) => Math.min(Math.max(0, v), Math.max(0, width - LABEL_W));
  if (la < 0) {
    lb += -la;
    la = 0;
  }
  if (lb > width - LABEL_W) {
    la -= lb - (width - LABEL_W);
    lb = width - LABEL_W;
  }
  la = clamp(la);
  lb = clamp(lb);

  return (
    <View>
      <View
        style={s.wave}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={`Trecho de ${clock(start)} a ${clock(end)}`}
        accessibilityHint="Arraste as alças para escolher início e fim"
      >
        {width > 0 && filmstrip ? (
          <>
            {/* Vídeo: a tira de quadros, escurecida fora do trecho */}
            <View style={s.strip} pointerEvents="none">
              {filmstrip.map((uri, i) => (
                <Image key={i} source={{ uri }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
              ))}
            </View>
            <View pointerEvents="none" style={[s.dim, { left: 0, width: sx }]} />
            <View pointerEvents="none" style={[s.dim, { left: ex, right: 0 }]} />
            <View {...responders.both.panHandlers} style={[s.frame, { left: sx, width: Math.max(0, ex - sx) }]} />
          </>
        ) : width > 0 ? (
          <>
            <Bars values={bars} color={c.wave} />
            {/* Seleção: as mesmas barras em cor forte, recortadas entre as alças */}
            <View
              {...responders.both.panHandlers}
              style={[s.selection, { left: sx, width: Math.max(0, ex - sx) }, active === 'both' && { backgroundColor: c.dark ? '#26305A' : '#DCE3FA' }]}
            >
              <View style={{ position: 'absolute', left: -sx, top: 0, bottom: 0, width }} pointerEvents="none">
                <Bars values={bars} color={c.waveActive} />
              </View>
            </View>
          </>
        ) : null}
        {width > 0 ? (
          <>
            {playhead != null && playhead >= start && playhead <= end ? (
              <View pointerEvents="none" style={[s.playhead, { left: x(playhead) - 1 }]} />
            ) : null}
            <Handle x={sx} responder={responders.start} active={active === 'start'} c={c} label="Início" />
            <Handle x={ex} responder={responders.end} active={active === 'end'} c={c} label="Fim" />
          </>
        ) : null}
        {!peaks && !filmstrip && width > 0 ? <Text style={s.loading}>Lendo o áudio…</Text> : null}
        {filmstrip && !filmstrip.length && width > 0 ? <Text style={s.loading}>Lendo os quadros…</Text> : null}
      </View>
      <View style={s.labels}>
        <Text style={[s.time, { left: la }, active === 'start' && s.timeActive]}>{clock(start)}</Text>
        <Text style={[s.time, { left: lb }, active === 'end' && s.timeActive]}>{clock(end)}</Text>
      </View>
    </View>
  );
}

function Handle({ x, responder, active, c, label }: { x: number; responder: PanResponderInstance; active: boolean; c: Palette; label: string }) {
  return (
    <View
      {...responder.panHandlers}
      hitSlop={{ top: 12, bottom: 12 }}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      style={[styles.handleHit, { left: x - HANDLE_HIT / 2 }]}
    >
      <View style={[styles.handleBar, { backgroundColor: c.accent, width: active ? 5 : 4 }]} />
      <View style={[styles.grip, { backgroundColor: c.accent, transform: [{ scale: active ? 1.15 : 1 }] }]}>
        <View style={styles.gripLine} />
        <View style={styles.gripLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: GAP },
  handleHit: { position: 'absolute', top: -6, bottom: -6, width: HANDLE_HIT, alignItems: 'center', justifyContent: 'center' },
  handleBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2 },
  grip: { width: 18, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 3, flexDirection: 'row' },
  gripLine: { width: 2, height: 12, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    strip: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', borderRadius: 8, overflow: 'hidden', backgroundColor: c.sk },
    dim: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
    frame: { position: 'absolute', top: 0, bottom: 0, borderTopWidth: 3, borderBottomWidth: 3, borderColor: c.accent },
    wave: { height: WAVE_H, marginHorizontal: 12, justifyContent: 'center' },
    selection: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      overflow: 'hidden',
      backgroundColor: c.accentSoft,
      borderTopWidth: 2,
      borderBottomWidth: 2,
      borderColor: c.accent,
    },
    playhead: { position: 'absolute', top: -4, bottom: -4, width: 2, borderRadius: 1, backgroundColor: c.ink },
    loading: { position: 'absolute', alignSelf: 'center', fontFamily: font.medium, fontSize: 14, color: c.muted },
    labels: { height: 24, marginTop: 10, marginHorizontal: 12 },
    time: {
      position: 'absolute',
      width: LABEL_W,
      textAlign: 'center',
      fontFamily: font.semibold,
      fontSize: 14,
      color: c.muted,
      fontVariant: ['tabular-nums'],
    },
    timeActive: { color: c.ink },
  });
