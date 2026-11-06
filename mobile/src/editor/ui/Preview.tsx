import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, type GestureResponderEvent, type ImageStyle, type ViewStyle } from 'react-native';

import { cachedThumb, toUri } from '../media';
import {
  aspectRatio,
  clamp,
  clipAt,
  clipStarts,
  FACECAM_BASE,
  IMAGE_BASE,
  placement,
  projectLength,
  sizeUnit,
  sourceTime,
  STICKER_BASE,
  transitionLength,
} from '../timeline';
import type { CaptionStyle, Clip, FacecamLayer, FilterId, Layer, MediaSource, Project } from '../types';
import { store } from '../store';
import { CaptionLayer, Guides, NO_GUIDES, snapToCenter, type GuideState } from './CaptionLayer';
import { useClock, type Clock } from './clock';
import { videoFill } from './kit';
import { E } from './palette';
import { TextVisual } from './TextVisual';

export type Selection = { kind: 'clip' | 'layer' | 'audio' | 'captions'; id: string } | null;

type Props = {
  project: Project;
  clock: Clock;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** Gestos na prévia mexem no enquadramento do clipe selecionado (zoom e posição). */
  adjusting: boolean;
  /** Enquanto grava narração sem fone: o som do vídeo fica mudo para não vazar no microfone. */
  muted?: boolean;
  /** Algo desenhado por cima do vídeo (a câmera durante a gravação da facecam). */
  children?: (canvas: { width: number; height: number }) => ReactNode;
};

/**
 * [pending]: quando o último play() foi pedido. O player leva uns décimos para pegar (buscar o
 * quadro, encher o buffer); pedir de novo a cada quadro reiniciava a busca e o vídeo não andava,
 * principalmente com a câmera gravando e o aparelho ocupado.
 */
type Slot = { player: VideoPlayer; path: string | null; clip: number | null; lastFix: number; lastSeek: number; pending: number };

const FADE = 0.25;
/** Espera antes de pedir o play de novo a um player que ainda não começou a tocar. */
const RETRY_PLAY = 1200;
/** Correção de deriva com o vídeo tocando: no máximo a cada FIX_EVERY ms, e só acima de DRIFT s. */
const FIX_EVERY = 1500;
const DRIFT = 0.4;

function fadeOpacity(t: number, start: number, end: number, on: boolean): number {
  if (!on) return 1;
  return clamp(Math.min((t - start) / FADE, (end - t) / FADE), 0, 1);
}

/**
 * Aproximação do filtro de cor na prévia: matriz de cor (filter do RN, que no Android vira um
 * ColorMatrix na camada e pega também o vídeo) e, nos tons quente/frio/retrô, um véu de cor.
 * O vídeo exportado usa os filtros do FFmpeg em render.ts.
 */
const LOOK: Record<FilterId, { filter?: string; tint?: string }> = {
  none: {},
  vivid: { filter: 'saturate(1.35) contrast(1.06)' },
  warm: { filter: 'saturate(1.08)', tint: 'rgba(255,140,50,0.10)' },
  cool: { tint: 'rgba(60,140,255,0.10)' },
  bw: { filter: 'grayscale(1) contrast(1.12)' },
  cinema: { filter: 'contrast(1.12) saturate(0.82) brightness(0.97)' },
  vintage: { filter: 'sepia(0.3) saturate(0.9) contrast(0.94) brightness(1.03)', tint: 'rgba(255,214,150,0.06)' },
};

const lookStyle = (f: FilterId): ViewStyle => (LOOK[f].filter ? { filter: LOOK[f].filter } : {});

function Tint({ filter }: { filter: FilterId }) {
  const tint = LOOK[filter].tint;
  return tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null;
}

/** Quadro de um clipe dentro do canvas: mesmo tamanho e posição que o FFmpeg vai usar. */
function frameStyle(c: Clip, src: MediaSource, cw: number, ch: number): ViewStyle {
  const pl = placement(c, src, cw, ch);
  const turned = c.rotate % 180 !== 0;
  const w = turned ? pl.sh : pl.sw;
  const h = turned ? pl.sw : pl.sh;
  return {
    position: 'absolute',
    width: w,
    height: h,
    left: pl.x + pl.sw / 2 - w / 2,
    top: pl.y + pl.sh / 2 - h / 2,
    transform: [{ rotate: `${c.rotate}deg` }, { scaleX: c.flip ? -1 : 1 }],
  };
}

type Pinch = { d0: number; a0: number; base: { scale: number; rotation: number } } | null;

function touchGeometry(e: GestureResponderEvent) {
  const t = e.nativeEvent.touches;
  if (t.length < 2) return null;
  const dx = t[1].pageX - t[0].pageX;
  const dy = t[1].pageY - t[0].pageY;
  return { d: Math.hypot(dx, dy), a: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/** Camada que se arrasta com um dedo e muda de tamanho e ângulo com dois. */
function Draggable({
  layer,
  cw,
  ch,
  selected,
  onSelect,
  onGuides,
  children,
}: {
  layer: Layer;
  cw: number;
  ch: number;
  selected: boolean;
  onSelect: () => void;
  onGuides: (g: GuideState) => void;
  children: ReactNode;
}) {
  const live = useRef({ layer, cw, ch, selected, onSelect, onGuides });
  useEffect(() => {
    live.current = { layer, cw, ch, selected, onSelect, onGuides };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let origin = { x: 0, y: 0, scale: 1, rotation: 0 };
    let pinch: Pinch = null;
    let snapped = { v: false, h: false };
    const patch = (fn: (l: Layer) => Partial<Layer>) => {
      const id = live.current.layer.id;
      store.update((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...fn(l) } as Layer) : l)) }), true);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const l = live.current.layer;
        origin = { x: l.x, y: l.y, scale: l.scale, rotation: l.rotation };
        pinch = null;
        if (!live.current.selected) live.current.onSelect();
        store.checkpoint();
      },
      onPanResponderMove: (e, g) => {
        const geo = touchGeometry(e);
        if (geo) {
          if (!pinch) pinch = { d0: geo.d, a0: geo.a, base: { scale: live.current.layer.scale, rotation: live.current.layer.rotation } };
          const scale = clamp((pinch.base.scale * geo.d) / Math.max(1, pinch.d0), 0.25, 5);
          let rotation = pinch.base.rotation + (geo.a - pinch.a0);
          // Ímã nos ângulos retos
          const near = Math.round(rotation / 90) * 90;
          if (Math.abs(rotation - near) < 4) rotation = near;
          patch(() => ({ scale, rotation }));
          return;
        }
        if (pinch) return;
        // Ímã nas linhas de centro, com um toque leve ao encaixar e as guias acesas
        const r = live.current;
        const s = snapToCenter(clamp(origin.x + g.dx / r.cw, 0, 1), clamp(origin.y + g.dy / r.ch, 0, 1), r.cw, r.ch);
        if ((s.v && !snapped.v) || (s.h && !snapped.h)) Haptics.selectionAsync().catch(() => {});
        snapped = { v: s.v, h: s.h };
        if (Math.hypot(g.dx, g.dy) > 3) r.onGuides({ active: true, v: s.v, h: s.h });
        patch(() => ({ x: s.x, y: s.y }));
      },
      onPanResponderRelease: () => {
        live.current.onGuides(NO_GUIDES);
        store.settle();
      },
      onPanResponderTerminate: () => {
        live.current.onGuides(NO_GUIDES);
        store.settle();
      },
    });
  });
  return (
    <View {...responder.panHandlers} hitSlop={12} style={selected ? styles.selected : undefined}>
      {children}
    </View>
  );
}

/** Ponto central fixo: o filho fica centralizado em (x, y) sem precisar medir o tamanho. */
function Anchor({ x, y, rotation, opacity, children, big }: { x: number; y: number; rotation: number; opacity: number; children: ReactNode; big: number }) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: x - big / 2, top: y - big / 2, width: big, height: big, alignItems: 'center', justifyContent: 'center', opacity }}
    >
      <View pointerEvents="box-none" style={{ transform: [{ rotate: `${rotation}deg` }] }}>
        {children}
      </View>
    </View>
  );
}

function FacecamVisual({ layer, player, size }: { layer: FacecamLayer; player: VideoPlayer; size: number }) {
  const radius = layer.shape === 'circle' ? size / 2 : layer.shape === 'rounded' ? size * 0.18 : 0;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: layer.border ? Math.max(2, size * 0.03) : 0,
        borderColor: layer.borderColor,
      }}
    >
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        surfaceType="textureView"
        style={{ width: '100%', height: '100%', transform: [{ scaleX: layer.mirror ? -1 : 1 }] }}
      />
    </View>
  );
}

/** Estilo de entrada/saída de cada transição, aproximando o xfade do FFmpeg. */
function transitionStyle(kind: string, pr: number, role: 'out' | 'in', cw: number, ch: number): { style: ViewStyle; clip?: { left: number; top: number; width: number; height: number; radius?: number } } {
  switch (kind) {
    case 'fadeblack':
      return { style: { opacity: role === 'out' ? clamp(1 - pr * 2, 0, 1) : clamp(pr * 2 - 1, 0, 1) } };
    case 'slideleft':
      return { style: { transform: [{ translateX: role === 'out' ? -pr * cw : (1 - pr) * cw }] } };
    case 'slideup':
      return { style: { transform: [{ translateY: role === 'out' ? -pr * ch : (1 - pr) * ch }] } };
    case 'wipeleft':
      return role === 'in' ? { style: {}, clip: { left: (1 - pr) * cw, top: 0, width: pr * cw, height: ch } } : { style: {} };
    case 'circleopen': {
      if (role === 'out') return { style: {} };
      const d = pr * Math.hypot(cw, ch);
      return { style: {}, clip: { left: cw / 2 - d / 2, top: ch / 2 - d / 2, width: d, height: d, radius: d / 2 } };
    }
    case 'zoomin':
      return role === 'out' ? { style: { opacity: 1 - pr, transform: [{ scale: 1 + pr * 0.6 }] } } : { style: { opacity: pr } };
    default:
      return { style: role === 'in' ? { opacity: pr } : {} };
  }
}

function Clipped({ rect, cw, ch, children }: { rect?: { left: number; top: number; width: number; height: number; radius?: number }; cw: number; ch: number; children: ReactNode }) {
  if (!rect) return <View style={[StyleSheet.absoluteFill]}>{children}</View>;
  return (
    <View style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderRadius: rect.radius ?? 0, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: -rect.left, top: -rect.top, width: cw, height: ch }}>{children}</View>
    </View>
  );
}

function PreviewImpl({ project, clock, selection, onSelect, adjusting, muted, children }: Props) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const ratio = aspectRatio(project);
  const cw = Math.floor(Math.min(box.width, box.height * ratio));
  const ch = Math.floor(cw / ratio);
  const { time } = useClock(clock, 30);

  const pa = useVideoPlayer(null, (p) => (p.timeUpdateEventInterval = 0));
  const pb = useVideoPlayer(null, (p) => (p.timeUpdateEventInterval = 0));
  const pc = useVideoPlayer(null, (p) => (p.timeUpdateEventInterval = 0));
  // Os players ficam dentro de refs: o efeito de sincronia mexe neles a cada quadro
  const slots = useRef<Slot[]>([
    { player: pa, path: null, clip: null, lastFix: 0, lastSeek: 0, pending: 0 },
    { player: pb, path: null, clip: null, lastFix: 0, lastSeek: 0, pending: 0 },
  ]);
  const cam = useRef({ player: pc, path: null as string | null, lastFix: 0, lastSeek: 0, pending: 0 });
  const [views, setViews] = useState<(number | null)[]>([null, null]);
  const [guides, setGuides] = useState<GuideState>(NO_GUIDES);
  const audio = useRef(new Map<string, { player: AudioPlayer; path: string; pending: number; lastFix: number }>());

  const live = useRef({ project, muted });
  useEffect(() => {
    live.current = { project, muted };
  });

  // Uma trilha de áudio da prévia por faixa do projeto
  useEffect(() => {
    const map = audio.current;
    const keep = new Set<string>();
    for (const tr of project.audio) {
      const src = project.sources[tr.sourceId];
      if (!src) continue;
      keep.add(tr.id);
      const hit = map.get(tr.id);
      if (hit && hit.path === src.path) continue;
      hit?.player.release();
      map.set(tr.id, { player: createAudioPlayer(toUri(src.path)), path: src.path, pending: 0, lastFix: 0 });
    }
    for (const [id, v] of map) {
      if (!keep.has(id)) {
        v.player.release();
        map.delete(id);
      }
    }
  }, [project.audio, project.sources]);

  useEffect(() => {
    const map = audio.current;
    return () => {
      for (const v of map.values()) v.player.release();
      map.clear();
    };
  }, []);

  // Sincroniza players com o relógio a cada quadro
  useEffect(() => {
    const sync = (t: number, playing: boolean) => {
      const { project: p, muted: mute } = live.current;
      const clips = p.clips;
      const now = Date.now();
      const starts = clipStarts(clips);
      const at = clipAt(clips, t);
      const visible: number[] = [];
      let preload = -1;
      if (at) {
        visible.push(at.index);
        const next = at.index + 1;
        if (next < clips.length) {
          if (t >= starts[next]) visible.push(next);
          else if (t > starts[next] - 3) preload = next;
        }
      }
      const isVideo = (i: number) => p.sources[clips[i]?.sourceId]?.kind === 'video';
      const want = [...visible, ...(preload >= 0 ? [preload] : [])].filter(isVideo);
      const assign: (number | null)[] = [null, null];
      for (const idx of want) {
        const path = p.sources[clips[idx].sourceId].path;
        let k = slots.current.findIndex((s, j) => assign[j] == null && s.path === path && (s.clip === idx || s.clip == null || !visible.includes(s.clip)));
        if (k < 0) k = slots.current.findIndex((s, j) => assign[j] == null && (s.clip == null || !visible.includes(s.clip) || s.clip === idx));
        if (k < 0) k = assign.findIndex((v) => v == null);
        if (k >= 0) assign[k] = idx;
      }
      slots.current.forEach((s, k) => {
        const idx = assign[k];
        const pl = s.player;
        if (idx == null) {
          if (pl.playing) pl.pause();
          s.clip = null;
          return;
        }
        const c = clips[idx];
        const src = p.sources[c.sourceId];
        if (s.path !== src.path) {
          s.path = src.path;
          // Com o arquivo novo carregado, o próximo quadro já acerta a posição e dá o play
          pl.replaceAsync({ uri: toUri(src.path) })
            .then(() => {
              s.lastFix = 0;
              s.pending = 0;
            })
            .catch(() => {});
        }
        if (s.clip !== idx) {
          s.lastFix = 0;
          s.pending = 0;
        }
        s.clip = idx;
        const shown = visible.includes(idx);
        const st = shown ? sourceTime(c, starts[idx], t) : c.in;
        if (Math.abs(pl.playbackRate - c.speed) > 0.01) pl.playbackRate = c.speed;
        pl.volume = clamp(c.volume, 0, 1);
        pl.muted = !!mute || c.volume < 0.01;
        if (playing && shown) {
          if (!pl.playing) {
            if (now - s.pending > RETRY_PLAY) {
              pl.currentTime = st;
              pl.play();
              s.pending = now;
              s.lastFix = now;
            }
          } else if (now - s.lastFix > FIX_EVERY && Math.abs(pl.currentTime - st) > DRIFT) {
            pl.currentTime = st;
            s.lastFix = now;
          }
        } else {
          s.pending = 0;
          if (pl.playing) pl.pause();
          if (now - s.lastSeek > 80 && Math.abs(pl.currentTime - st) > 0.05) {
            pl.currentTime = st;
            s.lastSeek = now;
          }
        }
      });
      setViews((prev) => (prev[0] === assign[0] && prev[1] === assign[1] ? prev : assign));

      // Facecam: a camada ativa mais acima
      const face = [...p.layers].reverse().find((l): l is FacecamLayer => l.kind === 'facecam' && t >= l.start && t < l.end);
      const fc = cam.current;
      if (face) {
        const src = p.sources[face.sourceId];
        if (src && fc.path !== src.path) {
          fc.path = src.path;
          fc.player
            .replaceAsync({ uri: toUri(src.path) })
            .then(() => {
              fc.lastFix = 0;
              fc.pending = 0;
            })
            .catch(() => {});
        }
        const st = face.in + (t - face.start);
        fc.player.volume = clamp(face.volume, 0, 1);
        fc.player.muted = !!mute || face.volume < 0.01;
        if (playing) {
          if (!fc.player.playing) {
            if (now - fc.pending > RETRY_PLAY) {
              fc.player.currentTime = st;
              fc.player.play();
              fc.pending = now;
              fc.lastFix = now;
            }
          } else if (now - fc.lastFix > FIX_EVERY && Math.abs(fc.player.currentTime - st) > DRIFT) {
            fc.player.currentTime = st;
            fc.lastFix = now;
          }
        } else {
          fc.pending = 0;
          if (fc.player.playing) fc.player.pause();
          if (now - fc.lastSeek > 80 && Math.abs(fc.player.currentTime - st) > 0.05) {
            fc.player.currentTime = st;
            fc.lastSeek = now;
          }
        }
      } else {
        fc.pending = 0;
        if (fc.player.playing) fc.player.pause();
      }

      // Trilhas e narração; a música abaixa quando há voz (como no vídeo final)
      const total = projectLength(p);
      const voiceNow =
        p.audio.some((tr) => tr.kind === 'voice' && t >= tr.start && t < tr.start + (tr.out - tr.in)) ||
        p.layers.some((l) => l.kind === 'facecam' && t >= l.start && t < l.end && p.sources[l.sourceId]?.hasAudio);
      for (const tr of p.audio) {
        const a = audio.current.get(tr.id);
        if (!a) continue;
        const seg = Math.max(0.1, tr.out - tr.in);
        const len = tr.loop ? total - tr.start : Math.min(seg, total - tr.start);
        const active = t >= tr.start && t < tr.start + len;
        const local = t - tr.start;
        const st = tr.in + (tr.loop ? local % seg : local);
        const fade = Math.min(tr.fadeIn > 0 ? local / tr.fadeIn : 1, tr.fadeOut > 0 ? (len - local) / tr.fadeOut : 1, 1);
        a.player.volume = clamp(tr.volume * clamp(fade, 0, 1) * (p.duck && voiceNow && tr.kind === 'music' ? 0.3 : 1), 0, 1);
        a.player.muted = !!mute;
        if (playing && active) {
          if (!a.player.playing) {
            if (now - a.pending > RETRY_PLAY) {
              a.player.seekTo(st).catch(() => {});
              a.player.play();
              a.pending = now;
              a.lastFix = now;
            }
          } else if (now - a.lastFix > FIX_EVERY && Math.abs(a.player.currentTime - st) > DRIFT) {
            a.player.seekTo(st).catch(() => {});
            a.lastFix = now;
          }
        } else {
          a.pending = 0;
          if (a.player.playing) a.player.pause();
        }
      }
    };
    sync(clock.time, clock.playing);
    return clock.subscribe(sync);
  }, [clock]);

  // ---------- Desenho ----------
  const clips = project.clips;
  const starts = clipStarts(clips);
  const at = clipAt(clips, time);
  const visible: number[] = [];
  let pr = 0;
  let tKind = '';
  if (at) {
    visible.push(at.index);
    const next = at.index + 1;
    if (next < clips.length && time >= starts[next]) {
      visible.push(next);
      const tl = transitionLength(clips, at.index);
      pr = tl > 0 ? clamp((time - starts[next]) / tl, 0, 1) : 1;
      tKind = clips[at.index].transition?.kind ?? 'fade';
    }
  }
  const big = Math.max(cw, ch) * 3;
  const sel = selection;

  const clipLayer = (idx: number, role: 'out' | 'in' | 'solo') => {
    const c = clips[idx];
    const src = project.sources[c.sourceId];
    if (!src) return null;
    const st = sourceTime(c, starts[idx], time);
    const tr = role === 'solo' ? { style: {} } : transitionStyle(tKind, pr, role, cw, ch);
    const thumb = src.kind === 'image' ? toUri(src.path) : (cachedThumb(src.path, st) ?? src.thumbnail);
    const slot = views.findIndex((v) => v === idx);
    return (
      <Clipped key={`c-${c.id}`} rect={tr.clip} cw={cw} ch={ch}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', overflow: 'hidden' }, lookStyle(c.filter), tr.style]}>
          {c.fit === 'blur' && thumb ? (
            <>
              <Image source={{ uri: thumb }} blurRadius={22} style={[StyleSheet.absoluteFill, { opacity: 0.95 }]} resizeMode="cover" />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />
            </>
          ) : null}
          {src.kind === 'image' ? (
            <Image source={{ uri: toUri(src.path) }} style={frameStyle(c, src, cw, ch) as ImageStyle} resizeMode="stretch" />
          ) : slot < 0 && thumb ? (
            <Image source={{ uri: thumb }} style={frameStyle(c, src, cw, ch) as ImageStyle} resizeMode="stretch" />
          ) : null}
          <Tint filter={c.filter} />
        </View>
      </Clipped>
    );
  };

  // Os dois VideoViews ficam sempre montados (trocar a superfície no meio da reprodução pisca)
  const videoFor = (k: number) => {
    const idx = views[k];
    const c = idx != null ? clips[idx] : undefined;
    const src = c ? project.sources[c.sourceId] : undefined;
    const shown = idx != null && visible.includes(idx) && src?.kind === 'video';
    const role = !shown ? 'solo' : visible.length > 1 ? (idx === visible[0] ? 'out' : 'in') : 'solo';
    const tr = role === 'solo' ? { style: {} as ViewStyle } : transitionStyle(tKind, pr, role, cw, ch);
    const frame = shown && c && src ? frameStyle(c, src, cw, ch) : { position: 'absolute' as const, width: 2, height: 2, left: -10, top: -10 };
    const z = shown ? (role === 'in' ? 3 : 2) : 0;
    return (
      <View key={`v${k}`} pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: z, opacity: shown ? 1 : 0 }]}>
        <Clipped rect={shown ? tr.clip : undefined} cw={cw} ch={ch}>
          <View style={[StyleSheet.absoluteFill, tr.style]}>
            <View style={[frame, shown && c ? lookStyle(c.filter) : null]}>
              <VideoView player={k === 0 ? pa : pb} nativeControls={false} contentFit="fill" surfaceType="textureView" style={videoFill} />
              {shown && c ? <Tint filter={c.filter} /> : null}
            </View>
          </View>
        </Clipped>
      </View>
    );
  };

  // ---------- Gestos no vídeo: zoom e enquadramento do clipe ----------
  const adjustRef = useRef({ project, selection: sel, adjusting, cw, ch, onSelect });
  useEffect(() => {
    adjustRef.current = { project, selection: sel, adjusting, cw, ch, onSelect };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [canvasResponder] = useState(() => {
    let origin = { panX: 0, panY: 0, zoom: 1 };
    let pinch: { d0: number; z0: number } | null = null;
    const selectedClip = () => {
      const r = adjustRef.current;
      return r.selection?.kind === 'clip' ? r.project.clips.find((c) => c.id === r.selection!.id) : undefined;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => adjustRef.current.adjusting,
      onPanResponderGrant: () => {
        const c = selectedClip();
        pinch = null;
        if (adjustRef.current.adjusting && c) {
          origin = { panX: c.panX, panY: c.panY, zoom: c.zoom };
          store.checkpoint();
        }
      },
      onPanResponderMove: (e, g) => {
        const r = adjustRef.current;
        const c = selectedClip();
        if (!r.adjusting || !c) return;
        const src = r.project.sources[c.sourceId];
        const geo = touchGeometry(e);
        if (geo) {
          if (!pinch) pinch = { d0: geo.d, z0: c.zoom };
          const zoom = clamp((pinch.z0 * geo.d) / Math.max(1, pinch.d0), 1, 4);
          store.update((p) => ({ ...p, clips: p.clips.map((x) => (x.id === c.id ? { ...x, zoom } : x)) }), true);
          return;
        }
        if (pinch) return;
        const pl = placement({ ...c, zoom: origin.zoom }, src, r.cw, r.ch);
        const rx = Math.abs(r.cw - pl.sw) / 2;
        const ry = Math.abs(r.ch - pl.sh) / 2;
        const panX = rx > 1 ? clamp(origin.panX + g.dx / rx, -1, 1) : c.panX;
        const panY = ry > 1 ? clamp(origin.panY + g.dy / ry, -1, 1) : c.panY;
        store.update((p) => ({ ...p, clips: p.clips.map((x) => (x.id === c.id ? { ...x, panX, panY } : x)) }), true);
      },
      onPanResponderRelease: (_, g) => {
        store.settle();
        // Toque simples fora das camadas: tira a seleção (fora do modo de ajuste)
        if (!adjustRef.current.adjusting && Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) adjustRef.current.onSelect(null);
      },
      onPanResponderTerminate: () => store.settle(),
    });
  });

  const cues = project.captions?.cues ?? [];
  const cueIndex = cues.findIndex((q) => time >= q.start && time < q.end);
  const cue = cueIndex >= 0 ? cues[cueIndex] : null;
  const capStyle: CaptionStyle | undefined = project.captions?.style;
  // Mesma base de tamanho do vídeo final (o lado menor do quadro)
  const cu = sizeUnit(cw, ch);

  const overlays = (kinds: Layer['kind'][]) =>
    project.layers
      .filter((l) => kinds.includes(l.kind) && time >= l.start && time < l.end)
      .map((l) => {
        const selected = sel?.kind === 'layer' && sel.id === l.id;
        const opacity = fadeOpacity(time, l.start, l.end, l.fade);
        let body: ReactNode = null;
        if (l.kind === 'text') {
          body = <TextVisual text={l.text || ' '} style={l.style} fontSize={l.style.size * cu * l.scale} maxWidth={cw * 0.9} />;
        } else if (l.kind === 'sticker') {
          body = <Text style={{ fontSize: STICKER_BASE * cu * l.scale, lineHeight: STICKER_BASE * cu * l.scale * 1.25 }}>{l.emoji}</Text>;
        } else if (l.kind === 'image') {
          const src = project.sources[l.sourceId];
          if (!src) return null;
          const w = IMAGE_BASE * cu * l.scale;
          const h = (w * Math.max(1, src.height)) / Math.max(1, src.width);
          body = (
            <Image
              source={{ uri: toUri(src.path) }}
              style={{ width: w, height: h, borderRadius: l.rounded ? Math.min(w, h) * 0.08 : 0, borderWidth: l.border ? Math.max(1.5, cu * 0.008) : 0, borderColor: '#FFFFFF' }}
            />
          );
        } else if (l.kind === 'facecam') {
          body = <FacecamVisual layer={l} player={pc} size={FACECAM_BASE * cu * l.scale} />;
        }
        return (
          <Anchor key={l.id} x={l.x * cw} y={l.y * ch} rotation={l.rotation} opacity={opacity} big={big}>
            <Draggable layer={l} cw={cw} ch={ch} selected={selected} onSelect={() => onSelect({ kind: 'layer', id: l.id })} onGuides={setGuides}>
              {body}
            </Draggable>
          </Anchor>
        );
      });

  return (
    <View style={styles.box} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {cw > 0 ? (
        <View style={[styles.canvas, { width: cw, height: ch }]}>
          <View style={StyleSheet.absoluteFill} {...canvasResponder.panHandlers}>
            {visible.map((idx, i) => clipLayer(idx, visible.length > 1 ? (i === 0 ? 'out' : 'in') : 'solo'))}
            {videoFor(0)}
            {videoFor(1)}
            {!clips.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Adicione vídeos ou fotos para começar</Text>
              </View>
            ) : null}
          </View>
          <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
            {overlays(['image', 'facecam'])}
            {capStyle ? (
              <CaptionLayer
                cue={cue}
                next={cues[cueIndex + 1]?.start}
                time={time}
                style={capStyle}
                cw={cw}
                ch={ch}
                selected={sel?.kind === 'captions'}
                onSelect={() => onSelect({ kind: 'captions', id: 'captions' })}
                onMoveStart={() => {
                  store.checkpoint();
                  onSelect({ kind: 'captions', id: 'captions' });
                }}
                onMove={(x, y) => store.update((p) => (p.captions ? { ...p, captions: { ...p.captions, style: { ...p.captions.style, x, y } } } : p), true)}
                onMoveEnd={() => store.settle()}
                onGuides={setGuides}
              />
            ) : null}
            {overlays(['text', 'sticker'])}
            {children?.({ width: cw, height: ch })}
            <Guides state={guides} cw={cw} ch={ch} />
          </View>
          {adjusting && sel?.kind === 'clip' ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.adjustFrame]}>
              <View style={[styles.guide, { left: cw / 3 }]} />
              <View style={[styles.guide, { left: (cw * 2) / 3 }]} />
              <View style={[styles.guideH, { top: ch / 3 }]} />
              <View style={[styles.guideH, { top: (ch * 2) / 3 }]} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const Preview = memo(PreviewImpl);

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  canvas: { backgroundColor: '#000', overflow: 'hidden', borderRadius: 6 },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: E.muted, fontFamily: 'Archivo_500Medium', fontSize: 14, textAlign: 'center' },
  selected: { borderWidth: 1.5, borderColor: E.accent, borderStyle: 'dashed', borderRadius: 4 },
  adjustFrame: { borderWidth: 2, borderColor: E.accent, borderRadius: 6, zIndex: 20 },
  guide: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)' },
  guideH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)' },
});

