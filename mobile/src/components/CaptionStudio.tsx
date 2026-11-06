import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clock } from '../format';
import { CaptionLayer, Guides, NO_GUIDES, type GuideState } from '../editor/ui/CaptionLayer';
import { CueList, LookPicker, MotionPicker, PositionPicker } from '../editor/ui/CaptionControls';
import { Chip, Row, Section, Slider, Swatches, Toggle, ui, videoFill } from '../editor/ui/kit';
import { E } from '../editor/ui/palette';
import { StyleEditor } from '../editor/ui/panels/LayerPanels';
import { clamp, placement } from '../editor/timeline';
import type { CaptionStyle, Cue, MediaSource } from '../editor/types';

export type Framing = { zoom: number; panX: number; panY: number };
export const ORIGINAL: Framing = { zoom: 1, panX: 0, panY: 0 };

export type StudioTab = 'look' | 'motion' | 'text' | 'place' | 'cues' | 'frame';

const TABS: { id: StudioTab; label: string; icon: keyof typeof Feather.glyphMap; captions: boolean }[] = [
  { id: 'look', label: 'Estilo', icon: 'droplet', captions: true },
  { id: 'motion', label: 'Animação', icon: 'zap', captions: true },
  { id: 'text', label: 'Letra e cor', icon: 'type', captions: true },
  { id: 'place', label: 'Posição', icon: 'move', captions: true },
  { id: 'cues', label: 'Textos', icon: 'edit-3', captions: true },
  { id: 'frame', label: 'Enquadrar', icon: 'crop', captions: false },
];

const seek = (p: VideoPlayer, t: number) => {
  p.currentTime = t;
};

function pinchDistance(e: GestureResponderEvent): number | null {
  const t = e.nativeEvent.touches;
  return t.length < 2 ? null : Math.hypot(t[1].pageX - t[0].pageX, t[1].pageY - t[0].pageY);
}

/** Tempo do player a ~30 quadros por segundo, voltando ao começo do trecho quando chega ao fim. */
function usePlayerTime(player: VideoPlayer, range: { start: number; end: number }) {
  const [state, setState] = useState(() => ({ time: player.currentTime, playing: player.playing }));
  useEffect(() => {
    let raf = 0;
    let last = -1;
    let was = player.playing;
    const tick = () => {
      const t = player.currentTime;
      const p = player.playing;
      if (p && t >= range.end - 0.04) seek(player, range.start);
      if (Math.abs(t - last) >= 1 / 30 || p !== was) {
        last = t;
        was = p;
        setState({ time: t, playing: p });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player, range.start, range.end]);
  return state;
}

type Props = {
  player: VideoPlayer;
  source: MediaSource;
  /** Parte do vídeo que vai ser enviada, em segundos do arquivo. */
  range: { start: number; end: number };
  captions: boolean;
  cues: Cue[];
  onCues: (cues: Cue[]) => void;
  style: CaptionStyle;
  onStyle: (s: CaptionStyle) => void;
  framing: Framing;
  onFraming: (f: Framing) => void;
  /** Legendas sendo buscadas ou transcritas. */
  status: { label: string; fraction: number | null } | null;
  initialTab: StudioTab;
  onClose: () => void;
};

/**
 * Tela cheia para ajustar a legenda e o enquadramento antes de enviar, sem passar pelo modo
 * Criar: a legenda aparece de verdade sobre o vídeo, com a animação, e pode ser arrastada.
 */
export function CaptionStudio({ player, source, range, captions, cues, onCues, style, onStyle, framing, onFraming, status, initialTab, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<StudioTab>(captions ? initialTab : 'frame');
  const tabs = TABS.filter((t) => captions || !t.captions);
  const { time, playing } = usePlayerTime(player, range);

  const toggle = () => {
    if (player.playing) player.pause();
    else {
      if (player.currentTime < range.start || player.currentTime >= range.end - 0.1) seek(player, range.start);
      player.play();
    }
  };

  const inRange = cues.filter((c) => c.end > range.start && c.start < range.end);
  const zoomed = framing.zoom > 1.001;

  return (
    // O teclado (ao corrigir um texto) empurra o painel para cima; o vídeo encolhe
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.top}>
        <Text style={styles.title}>{captions ? 'Legenda e enquadramento' : 'Enquadramento'}</Text>
        <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
          <Text style={styles.doneText}>Pronto</Text>
        </Pressable>
      </View>

      <StudioCanvas
        player={player}
        source={source}
        range={range}
        time={time}
        captions={captions}
        cues={cues}
        style={style}
        onStyle={onStyle}
        framing={framing}
        onFraming={onFraming}
        zoomMode={tab === 'frame' && zoomed}
        onTap={toggle}
        status={status}
        playing={playing}
      />

      <View style={styles.transport}>
        <Pressable onPress={toggle} style={styles.play} accessibilityLabel={playing ? 'Pausar' : 'Reproduzir'}>
          <Feather name={playing ? 'pause' : 'play'} size={20} color={E.ink} style={playing ? undefined : { marginLeft: 2 }} />
        </Pressable>
        <Text style={styles.time}>
          {clock(Math.max(0, time - range.start))} / {clock(range.end - range.start)}
        </Text>
        <View style={{ flex: 1 }}>
          <Slider
            value={clamp(time, range.start, range.end)}
            min={range.start}
            max={Math.max(range.start + 0.1, range.end)}
            step={0.05}
            format={() => ''}
            onStart={() => player.pause()}
            onChange={(t) => seek(player, t)}
          />
        </View>
      </View>

      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
          {tabs.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTab(t.id);
              }}
              style={[styles.tab, tab === t.id && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
            >
              <Feather name={t.icon} size={15} color={tab === t.id ? '#fff' : E.muted} />
              <Text style={[styles.tabText, tab === t.id && { color: '#fff' }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {tab === 'look' ? (
          <Section label="Escolha um formato">
            <LookPicker style={style} onPick={onStyle} />
          </Section>
        ) : null}
        {tab === 'motion' ? (
          <>
            <Section label="Como a legenda entra">
              <MotionPicker
                value={style.motion}
                onPick={(motion) => {
                  onStyle({ ...style, motion });
                  // Mostra a animação na hora: volta ao começo da legenda atual e toca
                  const cur = inRange.find((c) => time >= c.start && time < c.end) ?? inRange[0];
                  if (cur) seek(player, Math.max(range.start, cur.start));
                  player.play();
                }}
              />
            </Section>
            {style.motion === 'karaoke' ? (
              <Section label="Cor da palavra falada">
                <Swatches value={style.highlight ?? '#FFD60A'} onChange={(highlight) => onStyle({ ...style, highlight })} />
              </Section>
            ) : null}
            <Text style={[ui.body, styles.hint]}>
              {style.motion === 'words' || style.motion === 'karaoke' || style.motion === 'single'
                ? 'O tempo de cada palavra é estimado pelo tamanho dela dentro da legenda.'
                : 'O vídeo enviado anima igual à prévia.'}
            </Text>
          </>
        ) : null}
        {tab === 'text' ? (
          <>
            <Toggle label="Tudo em maiúsculas" value={style.uppercase} onChange={(uppercase) => onStyle({ ...style, uppercase })} />
            <StyleEditor style={style} onChange={(s) => onStyle({ ...style, ...s })} onLive={(s) => onStyle({ ...style, ...s })} />
          </>
        ) : null}
        {tab === 'place' ? (
          <Section label="Onde fica">
            <PositionPicker style={style} onChange={onStyle} />
          </Section>
        ) : null}
        {tab === 'cues' ? (
          <CueList
            cues={inRange}
            time={time}
            offset={range.start}
            onSeek={(t) => {
              player.pause();
              seek(player, Math.max(range.start, t));
            }}
            onEdit={(i, text) => {
              const target = inRange[i];
              onCues(cues.map((c) => (c === target ? { ...c, text } : c)));
            }}
            onDelete={(i) => {
              const target = inRange[i];
              onCues(cues.filter((c) => c !== target));
            }}
            onAdd={() => {
              player.pause();
              // No meio de uma legenda, a nova entra logo depois dela
              let t = clamp(time, range.start, range.end - 0.3);
              const inside = cues.find((c) => t >= c.start && t < c.end);
              if (inside) t = inside.end;
              const next = cues.filter((c) => c.start > t + 0.01).sort((a, b) => a.start - b.start)[0];
              const end = Math.min(t + 2.5, next ? next.start : range.end, range.end);
              if (end - t < 0.3) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                return;
              }
              seek(player, t);
              onCues([...cues, { start: t, end, text: '' }].sort((a, b) => a.start - b.start));
            }}
          />
        ) : null}
        {tab === 'frame' ? (
          <>
            <Section label="Enquadramento">
              <Row>
                <Chip label="Original" detail="Como veio" active={!zoomed} onPress={() => onFraming(ORIGINAL)} />
                <Chip label="Zoom" detail="Aproximar e recortar" active={zoomed} onPress={() => onFraming(zoomed ? framing : { zoom: 1.5, panX: 0, panY: 0 })} />
              </Row>
            </Section>
            {zoomed ? (
              <>
                <Section label="Zoom">
                  <Slider value={framing.zoom} min={1} max={3} step={0.01} marks={[1.5, 2]} format={(v) => `${v.toFixed(2).replace('.', ',')}x`} onChange={(zoom) => onFraming({ ...framing, zoom })} />
                </Section>
                <Text style={[ui.body, styles.hint]}>Arraste o vídeo para escolher o que aparece; com dois dedos, aproxima ou afasta.</Text>
                <Row>
                  <Chip icon="crosshair" label="Centralizar" onPress={() => onFraming({ ...framing, panX: 0, panY: 0 })} />
                </Row>
              </>
            ) : (
              <Text style={[ui.body, styles.hint]}>O vídeo vai inteiro, sem cortes. Use o zoom para destacar uma parte da imagem.</Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** O quadro do vídeo com o enquadramento e a legenda por cima. */
function StudioCanvas({
  player,
  source,
  range,
  time,
  captions,
  cues,
  style,
  onStyle,
  framing,
  onFraming,
  zoomMode,
  onTap,
  status,
  playing,
}: {
  player: VideoPlayer;
  source: MediaSource;
  range: { start: number; end: number };
  time: number;
  playing: boolean;
  captions: boolean;
  cues: Cue[];
  style: CaptionStyle;
  onStyle: (s: CaptionStyle) => void;
  framing: Framing;
  onFraming: (f: Framing) => void;
  zoomMode: boolean;
  onTap: () => void;
  status: { label: string; fraction: number | null } | null;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [guides, setGuides] = useState<GuideState>(NO_GUIDES);
  const ratio = source.width > 0 && source.height > 0 ? source.width / source.height : 16 / 9;
  const cw = Math.floor(Math.min(box.width, box.height * ratio));
  const ch = Math.floor(cw / ratio);
  const pl = placement({ fit: 'fill', zoom: framing.zoom, panX: framing.panX, panY: framing.panY, rotate: 0 }, source, cw, ch);

  const live = useRef({ framing, onFraming, zoomMode, onTap, cw, ch, source });
  useEffect(() => {
    live.current = { framing, onFraming, zoomMode, onTap, cw, ch, source };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let origin: Framing = ORIGINAL;
    let pinch: { d0: number; z0: number } | null = null;
    let moved = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => live.current.zoomMode,
      onPanResponderGrant: () => {
        origin = live.current.framing;
        pinch = null;
        moved = false;
      },
      onPanResponderMove: (e, g) => {
        const r = live.current;
        if (Math.hypot(g.dx, g.dy) > 5) moved = true;
        if (!r.zoomMode) return;
        const d = pinchDistance(e);
        if (d != null) {
          if (!pinch) pinch = { d0: d, z0: r.framing.zoom };
          r.onFraming({ ...r.framing, zoom: clamp((pinch.z0 * d) / Math.max(1, pinch.d0), 1, 3) });
          return;
        }
        if (pinch) return;
        const p = placement({ fit: 'fill', zoom: origin.zoom, panX: 0, panY: 0, rotate: 0 }, r.source, r.cw, r.ch);
        const rx = Math.abs(r.cw - p.sw) / 2;
        const ry = Math.abs(r.ch - p.sh) / 2;
        r.onFraming({ ...r.framing, panX: rx > 1 ? clamp(origin.panX + g.dx / rx, -1, 1) : 0, panY: ry > 1 ? clamp(origin.panY + g.dy / ry, -1, 1) : 0 });
      },
      onPanResponderRelease: () => {
        if (!moved && !pinch) live.current.onTap();
      },
    });
  });

  // Sem legendas ainda: um exemplo que se repete, para escolher estilo, animação e lugar
  const inRange = cues.filter((c) => c.end > range.start && c.start < range.end);
  let cue: Cue | null = null;
  let next: number | undefined;
  let at = time;
  if (inRange.length) {
    const i = inRange.findIndex((c) => time >= c.start && time < c.end);
    cue = i >= 0 ? inRange[i] : null;
    next = i >= 0 ? inRange[i + 1]?.start : undefined;
    if (!cue && !playing) {
      // Parado entre legendas: mostra a mais próxima já assentada, para dar para ajustar
      const near = [...inRange].sort((a, b) => Math.min(Math.abs(a.start - time), Math.abs(a.end - time)) - Math.min(Math.abs(b.start - time), Math.abs(b.end - time)))[0];
      cue = near;
      at = near.start + Math.min(1.2, (near.end - near.start) * 0.6);
    }
  } else if (captions) {
    const k = Math.floor(Math.max(0, time - range.start) / 2.6);
    cue = { start: range.start + k * 2.6, end: range.start + k * 2.6 + 2.4, text: 'Sua legenda aparece aqui' };
  }

  return (
    <View style={styles.stage} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {cw > 0 ? (
        <View style={[styles.canvas, { width: cw, height: ch }]}>
          <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
            <View pointerEvents="none" style={{ position: 'absolute', left: pl.x, top: pl.y, width: pl.sw, height: pl.sh }}>
              <VideoView player={player} style={videoFill} contentFit="fill" nativeControls={false} surfaceType="textureView" />
            </View>
          </View>
          {captions && cue ? (
            <CaptionLayer
              cue={cue}
              next={next}
              time={at}
              style={style}
              cw={cw}
              ch={ch}
              selected
              onMoveStart={() => player.pause()}
              onMove={(x, y) => onStyle({ ...style, x, y })}
              onGuides={setGuides}
            />
          ) : null}
          <Guides state={guides} cw={cw} ch={ch} />
          {zoomMode ? <View pointerEvents="none" style={styles.frameOutline} /> : null}
          {status ? (
            <View pointerEvents="none" style={styles.status}>
              <Text style={styles.statusText} numberOfLines={1}>
                {status.label}
                {status.fraction != null ? ` ${Math.round(status.fraction * 100)}%` : ''}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: E.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8, minHeight: 50 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontFamily: 'Archivo_700Bold', fontSize: 18, color: E.ink },
  done: { height: 38, paddingHorizontal: 18, borderRadius: 19, backgroundColor: E.accent, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: 'Archivo_700Bold', fontSize: 14, color: '#fff' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  canvas: { backgroundColor: '#000', overflow: 'hidden', borderRadius: 8 },
  frameOutline: { ...StyleSheet.absoluteFill, borderWidth: 2, borderColor: E.accent, borderRadius: 8 },
  status: { position: 'absolute', left: 10, right: 10, bottom: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(11,12,15,0.82)' },
  statusText: { fontFamily: 'Archivo_600SemiBold', fontSize: 13, color: E.ink, textAlign: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 4 },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: E.raised2, alignItems: 'center', justifyContent: 'center' },
  time: { fontFamily: 'Archivo_600SemiBold', fontSize: 13, color: E.ink, fontVariant: ['tabular-nums'] },
  tabs: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: E.line, backgroundColor: E.panel },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: E.raised },
  tabOn: { backgroundColor: E.accent },
  tabText: { fontFamily: 'Archivo_600SemiBold', fontSize: 13, color: E.muted },
  panel: { maxHeight: 300, backgroundColor: E.panel },
  hint: { color: E.faint, fontSize: 12, marginTop: 8 },
});
