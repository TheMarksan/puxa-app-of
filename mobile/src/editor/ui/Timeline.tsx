import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';

import { clock as fmtClock } from '../../format';
import { cachedThumb, loadThumbs, waveform } from '../media';
import { store } from '../store';
import { clamp, clipLength, clipStarts, projectLength, transitionLength } from '../timeline';
import type { AudioTrack, Clip, Layer, Project } from '../types';
import type { Clock } from './clock';
import { E } from './palette';
import type { Selection } from './Preview';

const VIDEO_H = 54;
const LANE_H = 26;
const AUDIO_H = 34;
const TILE = 40;
const HANDLE = 18;

type Props = {
  project: Project;
  clock: Clock;
  selection: Selection;
  onSelect: (s: Selection) => void;
  pps: number;
  onAdd: () => void;
  onTransition: (clipIndex: number) => void;
};

/** Um gesto: começa no toque, guarda o estado inicial e termina ao soltar. */
type DragSession = { move: (dx: number) => void; end: () => void };
type Begin = () => DragSession;

/** PanResponder que abre uma sessão por gesto (o estado inicial não se perde entre renderizações). */
function useDrag(begin: Begin) {
  const ref = useRef(begin);
  useEffect(() => {
    ref.current = begin;
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [r] = useState(() => {
    let session: DragSession | null = null;
    const finish = () => {
      session?.end();
      session = null;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        session = ref.current();
      },
      onPanResponderMove: (_, g) => session?.move(g.dx),
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
  });
  return r.panHandlers;
}

/** Ímã: encosta no playhead e nos cortes quando passa perto (8 px), com um toque leve. */
function makeSnapper(points: number[], pps: number) {
  let last: number | null = null;
  return (t: number) => {
    const hit = points.find((p) => Math.abs(p - t) * pps < 8);
    if (hit != null && hit !== last) Haptics.selectionAsync().catch(() => {});
    last = hit ?? null;
    return hit ?? t;
  };
}

function Handle({ side, onDrag }: { side: 'left' | 'right'; onDrag: Begin }) {
  const handlers = useDrag(onDrag);
  return (
    <View {...handlers} hitSlop={{ top: 8, bottom: 8, left: side === 'left' ? 12 : 0, right: side === 'right' ? 12 : 0 }} style={[styles.handle, side === 'left' ? styles.handleLeft : styles.handleRight]}>
      <View style={styles.grip} />
    </View>
  );
}

function ClipBlock({ project, clip, index, start, pps, selected, onSelect, setScroll }: { project: Project; clip: Clip; index: number; start: number; pps: number; selected: boolean; onSelect: () => void; setScroll: (on: boolean) => void }) {
  const src = project.sources[clip.sourceId];
  const len = clipLength(clip);
  const width = Math.max(8, len * pps);
  const [, bump] = useState(0);
  const tiles = Math.max(1, Math.ceil(width / TILE));
  const times = useMemo(() => Array.from({ length: tiles }, (_, j) => Math.min(clip.out, clip.in + ((j + 0.5) * TILE * clip.speed) / pps)), [tiles, clip.in, clip.out, clip.speed, pps]);
  useEffect(() => {
    if (src && src.kind !== 'audio') loadThumbs(src, src.kind === 'image' ? [0] : times, () => bump((n) => n + 1));
  }, [src, times]);

  const edit =
    (side: 'left' | 'right'): Begin =>
    () => {
      const o = { in: clip.in, out: clip.out };
      setScroll(false);
      store.checkpoint();
      return {
        move: (dx: number) => {
          if (!src) return;
          const d = (dx / pps) * clip.speed;
          store.update(
            (p) => ({
              ...p,
              clips: p.clips.map((c) => {
                if (c.id !== clip.id) return c;
                if (src.kind === 'image') return { ...c, in: 0, out: clamp(o.out + (side === 'right' ? d : -d), 0.5, 60) };
                if (side === 'left') return { ...c, in: clamp(o.in + d, 0, o.out - 0.3) };
                return { ...c, out: clamp(o.out + d, o.in + 0.3, src.duration) };
              }),
            }),
            true,
          );
        },
        end: () => {
          setScroll(true);
          store.settle();
        },
      };
    };

  return (
    <View style={[styles.clip, { left: start * pps, width }]}>
      <Pressable onPress={onSelect} style={[styles.clipInner, selected && styles.clipSelected]} accessibilityLabel={`Clipe ${index + 1}, ${fmtClock(len)}`}>
        <View style={styles.tiles}>
          {times.map((t, j) => {
            const uri = src ? cachedThumb(src.path, src.kind === 'image' ? 0 : t) : undefined;
            return uri ? <Image key={j} source={{ uri }} style={styles.tile} /> : <View key={j} style={[styles.tile, { backgroundColor: E.clip }]} />;
          })}
        </View>
        {clip.speed !== 1 || clip.filter !== 'none' ? (
          <View style={styles.badges}>
            {clip.speed !== 1 ? <Text style={styles.badge}>{`${clip.speed}×`}</Text> : null}
            {clip.filter !== 'none' ? <Feather name="aperture" size={11} color="#fff" /> : null}
          </View>
        ) : null}
        <Text style={styles.clipTime}>{fmtClock(len)}</Text>
      </Pressable>
      {selected ? (
        <>
          {src?.kind !== 'image' ? <Handle side="left" onDrag={edit('left')} /> : null}
          <Handle side="right" onDrag={edit('right')} />
        </>
      ) : null}
    </View>
  );
}

type Lane<T> = { item: T; lane: number };

function lanes<T extends { start: number; end: number }>(items: T[], max: number): Lane<T>[] {
  const ends: number[] = [];
  return [...items]
    .sort((a, b) => a.start - b.start)
    .map((item) => {
      let lane = ends.findIndex((e) => e <= item.start + 0.01);
      if (lane < 0) lane = ends.length < max ? ends.length : max - 1;
      ends[lane] = Math.max(ends[lane] ?? 0, item.end);
      return { item, lane };
    });
}

const LAYER_COLOR: Record<Layer['kind'], string> = { text: E.text, sticker: E.sticker, image: E.image, facecam: E.facecam };

function layerLabel(l: Layer, p: Project): string {
  if (l.kind === 'text') return l.text.replace(/\n/g, ' ') || 'Texto';
  if (l.kind === 'sticker') return l.emoji;
  if (l.kind === 'image') return p.sources[l.sourceId]?.title ?? 'Imagem';
  return 'Facecam';
}

const LAYER_ICON: Record<Layer['kind'], keyof typeof Feather.glyphMap> = { text: 'type', sticker: 'smile', image: 'image', facecam: 'video' };

function Pill({
  left,
  width,
  top,
  height,
  color,
  selected,
  onSelect,
  onMove,
  onTrim,
  children,
}: {
  left: number;
  width: number;
  top: number;
  height: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onMove: Begin;
  onTrim?: { left: Begin; right: Begin };
  children: ReactNode;
}) {
  const body = useDrag(onMove);
  return (
    <View style={[styles.pill, { left, width: Math.max(10, width), top, height, backgroundColor: color + (selected ? 'FF' : 'B3') }, selected && styles.pillSelected]}>
      {selected ? (
        <View {...body} style={styles.pillBody}>
          {children}
        </View>
      ) : (
        <Pressable onPress={onSelect} style={styles.pillBody}>
          {children}
        </Pressable>
      )}
      {selected && onTrim ? (
        <>
          <Handle side="left" onDrag={onTrim.left} />
          <Handle side="right" onDrag={onTrim.right} />
        </>
      ) : null}
    </View>
  );
}

function Wave({ path, from, to, duration, width, color }: { path: string; from: number; to: number; duration: number; width: number; color: string }) {
  const [peaks, setPeaks] = useState<number[]>([]);
  useEffect(() => {
    let alive = true;
    waveform(path).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [path]);
  const bars = Math.max(1, Math.floor(width / 3));
  const values = useMemo(() => {
    if (!peaks.length || duration <= 0) return Array(bars).fill(0.25);
    return Array.from({ length: bars }, (_, i) => {
      const t = from + ((to - from) * (i + 0.5)) / bars;
      const k = Math.floor(((t % duration) / duration) * peaks.length);
      return peaks[clamp(k, 0, peaks.length - 1)] ?? 0.2;
    });
  }, [peaks, bars, from, to, duration]);
  return (
    <View pointerEvents="none" style={styles.wave}>
      {values.map((v, i) => (
        <View key={i} style={{ width: 2, height: Math.max(2, v * (AUDIO_H - 14)), backgroundColor: color, borderRadius: 1 }} />
      ))}
    </View>
  );
}

function TimelineImpl({ project, clock, selection, onSelect, pps, onAdd, onTransition }: Props) {
  const { width: screen } = useWindowDimensions();
  const scroll = useRef<ScrollViewInstance>(null);
  const user = useRef(false);
  const [scrollOn, setScrollOn] = useState(true);
  const total = projectLength(project);
  const starts = clipStarts(project.clips);
  const ppsRef = useRef(pps);
  useEffect(() => {
    ppsRef.current = pps;
    scroll.current?.scrollTo({ x: clock.time * pps, animated: false });
  }, [pps, clock]);

  // O relógio move a linha do tempo (a não ser que o dedo esteja nela)
  useEffect(() => {
    let last = 0;
    return clock.subscribe((t, playing) => {
      if (user.current) return;
      const now = Date.now();
      if (playing && now - last < 30) return;
      last = now;
      scroll.current?.scrollTo({ x: t * ppsRef.current, animated: false });
    });
  }, [clock]);

  const snapPoints = useMemo(() => [clock.time, ...starts, ...project.clips.map((c, i) => starts[i] + clipLength(c))], [clock.time, starts, project.clips]);

  const layerMove =
    (l: Layer, mode: 'move' | 'left' | 'right'): Begin =>
    () => {
      const o = { start: l.start, end: l.end, in: l.kind === 'facecam' ? l.in : 0 };
      const snap = makeSnapper(snapPoints, pps);
      setScrollOn(false);
      store.checkpoint();
      return {
      move: (dx: number) => {
        const d = dx / pps;
        store.update(
          (p) => ({
            ...p,
            layers: p.layers.map((x) => {
              if (x.id !== l.id) return x;
              const len = o.end - o.start;
              if (mode === 'move') {
                const s = Math.max(0, snap(o.start + d));
                return { ...x, start: s, end: s + len };
              }
              if (mode === 'left') {
                const maxBack = x.kind === 'facecam' ? -o.in : -o.start;
                const dd = clamp(snap(o.start + d) - o.start, maxBack, len - 0.3);
                return x.kind === 'facecam' ? { ...x, start: o.start + dd, in: o.in + dd } : { ...x, start: o.start + dd };
              }
              const srcDur = x.kind === 'facecam' ? (p.sources[x.sourceId]?.duration ?? 1e9) - x.in : 1e9;
              return { ...x, end: clamp(snap(o.end + d), o.start + 0.3, o.start + srcDur) };
            }),
          }),
          true,
        );
      },
      end: () => {
        setScrollOn(true);
        store.settle();
      },
      };
    };

  const audioMove =
    (tr: AudioTrack, mode: 'move' | 'left' | 'right'): Begin =>
    () => {
      const o = { start: tr.start, in: tr.in, out: tr.out };
      const snap = makeSnapper(snapPoints, pps);
      setScrollOn(false);
      store.checkpoint();
      return {
      move: (dx: number) => {
        const d = dx / pps;
        store.update(
          (p) => ({
            ...p,
            audio: p.audio.map((x) => {
              if (x.id !== tr.id) return x;
              const dur = p.sources[x.sourceId]?.duration ?? 1e9;
              if (mode === 'move') return { ...x, start: Math.max(0, snap(o.start + d)) };
              if (mode === 'left') {
                const dd = clamp(snap(o.start + d) - o.start, Math.max(-o.in, -o.start), o.out - o.in - 0.5);
                return { ...x, start: o.start + dd, in: o.in + dd };
              }
              return { ...x, out: clamp(o.out + d, o.in + 0.5, dur) };
            }),
          }),
          true,
        );
      },
      end: () => {
        setScrollOn(true);
        store.settle();
      },
      };
    };

  const layerLanes = lanes(project.layers, 3);
  const nLayerLanes = Math.max(1, ...layerLanes.map((l) => l.lane + 1));
  const audioItems = project.audio.map((a) => ({ ...a, end: a.loop ? total : a.start + (a.out - a.in) }));
  const audioLanes = lanes(audioItems, 3);
  const nAudioLanes = Math.max(1, ...audioLanes.map((l) => l.lane + 1));
  const capH = project.captions ? 18 : 0;
  const contentW = Math.max(total * pps, 1);
  const step = pps >= 60 ? 1 : pps >= 24 ? 2 : pps >= 10 ? 5 : 10;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scroll}
        horizontal
        scrollEnabled={scrollOn}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          user.current = true;
          clock.pause();
        }}
        onScroll={(e) => {
          if (user.current) clock.seek(e.nativeEvent.contentOffset.x / pps);
        }}
        onScrollEndDrag={(e) => {
          if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.x) < 0.05) user.current = false;
        }}
        onMomentumScrollEnd={() => {
          user.current = false;
        }}
        contentContainerStyle={{ paddingHorizontal: screen / 2, width: contentW + screen + 64 }}
      >
        <View style={{ width: contentW + 64 }}>
          {/* Régua */}
          <View style={styles.ruler}>
            {Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => (
              <View key={i} style={[styles.tick, { left: i * step * pps }]}>
                <Text style={styles.tickText}>{fmtClock(i * step)}</Text>
              </View>
            ))}
          </View>

          {/* Vídeo */}
          <View style={{ height: VIDEO_H }}>
            {project.clips.map((c, i) => (
              <ClipBlock
                key={c.id}
                project={project}
                clip={c}
                index={i}
                start={starts[i]}
                pps={pps}
                selected={selection?.kind === 'clip' && selection.id === c.id}
                onSelect={() => onSelect({ kind: 'clip', id: c.id })}
                setScroll={setScrollOn}
              />
            ))}
            {project.clips.slice(0, -1).map((c, i) => {
              const t = transitionLength(project.clips, i);
              const x = (starts[i + 1] + t / 2) * pps;
              return (
                <Pressable key={`t${c.id}`} onPress={() => onTransition(i)} hitSlop={6} style={[styles.join, { left: x - 11 }, c.transition && styles.joinOn]} accessibilityLabel="Transição">
                  <Feather name={c.transition ? 'shuffle' : 'plus'} size={11} color={c.transition ? '#fff' : E.ink} />
                </Pressable>
              );
            })}
            <Pressable onPress={onAdd} style={[styles.add, { left: contentW + 8 }]} accessibilityLabel="Adicionar mídia">
              <Feather name="plus" size={20} color={E.ink} />
            </Pressable>
          </View>

          {/* Camadas */}
          <View style={{ height: nLayerLanes * (LANE_H + 4) + 6, marginTop: 6 }}>
            {layerLanes.map(({ item: l, lane }) => (
              <Pill
                key={l.id}
                left={l.start * pps}
                width={(l.end - l.start) * pps}
                top={lane * (LANE_H + 4)}
                height={LANE_H}
                color={LAYER_COLOR[l.kind]}
                selected={selection?.kind === 'layer' && selection.id === l.id}
                onSelect={() => onSelect({ kind: 'layer', id: l.id })}
                onMove={layerMove(l, 'move')}
                onTrim={{ left: layerMove(l, 'left'), right: layerMove(l, 'right') }}
              >
                <Feather name={LAYER_ICON[l.kind]} size={11} color="#fff" />
                <Text numberOfLines={1} style={styles.pillText}>
                  {layerLabel(l, project)}
                </Text>
              </Pill>
            ))}
          </View>

          {/* Legendas */}
          {project.captions ? (
            <Pressable onPress={() => onSelect({ kind: 'captions', id: 'captions' })} style={{ height: capH, marginBottom: 4 }}>
              {project.captions.cues.map((q, i) => (
                <View
                  key={i}
                  style={[styles.cue, { left: q.start * pps, width: Math.max(2, (q.end - q.start) * pps - 1) }, selection?.kind === 'captions' && { backgroundColor: E.ink }]}
                />
              ))}
            </Pressable>
          ) : null}

          {/* Áudio */}
          <View style={{ height: nAudioLanes * (AUDIO_H + 4) }}>
            {audioLanes.map(({ item: tr, lane }) => {
              const src = project.sources[tr.sourceId];
              const width = (tr.end - tr.start) * pps;
              const color = tr.kind === 'music' ? E.music : E.voice;
              return (
                <Pill
                  key={tr.id}
                  left={tr.start * pps}
                  width={width}
                  top={lane * (AUDIO_H + 4)}
                  height={AUDIO_H}
                  color={color}
                  selected={selection?.kind === 'audio' && selection.id === tr.id}
                  onSelect={() => onSelect({ kind: 'audio', id: tr.id })}
                  onMove={audioMove(tr, 'move')}
                  onTrim={{ left: audioMove(tr, 'left'), right: audioMove(tr, 'right') }}
                >
                  {src ? <Wave path={src.path} from={tr.in} to={tr.in + (tr.end - tr.start)} duration={Math.max(0.1, src.duration)} width={width} color="rgba(255,255,255,0.55)" /> : null}
                  <Feather name={tr.kind === 'music' ? 'music' : 'mic'} size={11} color="#fff" />
                  <Text numberOfLines={1} style={styles.pillText}>
                    {tr.title}
                  </Text>
                </Pill>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View pointerEvents="none" style={[styles.playhead, { left: screen / 2 - 1 }]}>
        <View style={styles.playheadKnob} />
      </View>
    </View>
  );
}

export const Timeline = memo(TimelineImpl);

const styles = StyleSheet.create({
  wrap: { paddingTop: 4, paddingBottom: 8 },
  ruler: { height: 18 },
  tick: { position: 'absolute', top: 0, height: 18, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: E.lineStrong, paddingLeft: 3 },
  tickText: { fontFamily: 'Archivo_500Medium', fontSize: 10, color: E.faint, fontVariant: ['tabular-nums'] },
  clip: { position: 'absolute', top: 0, height: VIDEO_H, paddingHorizontal: 1 },
  clipInner: { flex: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: E.clip, borderWidth: 2, borderColor: 'transparent' },
  clipSelected: { borderColor: '#FFFFFF' },
  tiles: { flexDirection: 'row', height: '100%' },
  tile: { width: TILE, height: '100%' },
  clipTime: {
    position: 'absolute',
    right: 4,
    bottom: 3,
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 10,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 3,
    fontVariant: ['tabular-nums'],
  },
  badges: { position: 'absolute', left: 4, top: 3, flexDirection: 'row', gap: 4, alignItems: 'center' },
  badge: { fontFamily: 'Archivo_700Bold', fontSize: 10, color: '#fff', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 4, borderRadius: 3 },
  handle: { position: 'absolute', top: -1, bottom: -1, width: HANDLE, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  handleLeft: { left: -HANDLE + 4, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  handleRight: { right: -HANDLE + 4, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  grip: { width: 3, height: 14, borderRadius: 2, backgroundColor: '#11131A' },
  join: {
    position: 'absolute',
    top: VIDEO_H / 2 - 11,
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: E.raised2,
    borderWidth: 1,
    borderColor: E.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  joinOn: { backgroundColor: E.accent, borderColor: E.accent },
  add: { position: 'absolute', top: 6, width: 42, height: VIDEO_H - 12, borderRadius: 8, backgroundColor: E.raised2, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', borderRadius: 6, overflow: 'visible' },
  pillSelected: { borderWidth: 1.5, borderColor: '#FFFFFF' },
  pillBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, overflow: 'hidden', borderRadius: 6 },
  pillText: { flex: 1, fontFamily: 'Archivo_600SemiBold', fontSize: 11, color: '#fff' },
  wave: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 1, paddingHorizontal: 2, opacity: 0.9 },
  cue: { position: 'absolute', top: 5, height: 8, borderRadius: 2, backgroundColor: E.captions + '99' },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#FFFFFF', borderRadius: 1, shadowColor: E.accent, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4 },
  playheadKnob: { position: 'absolute', top: -2, left: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
});
