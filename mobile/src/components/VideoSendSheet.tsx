import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DoneEvent, VideoInfo } from '../../modules/puxa-engine';
import type { DubResult } from '../ai/dub';
import { useElevenKey } from '../ai/key';
import { CAPTION_LOOKS, defaultCaptionStyle, LINE_OPTIONS, lookOf, maxLinesOf, shownCues } from '../editor/captionLayout';
import { MOTIONS } from '../editor/captionMotion';
import { slice } from '../editor/captions';
import { exportProject } from '../editor/exporter';
import { FONTS } from '../editor/fonts';
import { cachedThumb, loadThumbs, sourceFromFile, toUri } from '../editor/media';
import { AUDIO_BITRATE, estimateBytes, plannedBitrate } from '../editor/render';
import { chooseTrack, hasModel, MODELS, SPOKEN, transcribe, youtubeCues, type CaptionProgress, type Engine, type WhisperModel } from '../editor/subtitles';
import { defaultClip, outputSize, placement } from '../editor/timeline';
import type { AudioTrack, CaptionStyle, Cue, MediaSource, Project } from '../editor/types';
import { CaptionLayer } from '../editor/ui/CaptionLayer';
import { videoFill } from '../editor/ui/kit';
import { bytes, clock } from '../format';
import { ms } from '../motion';
import { getSettings, setSettings } from '../settings';
import { ease, font, Palette, usePalette } from '../theme';
import { BackButton } from './BackButton';
import { Button } from './Button';
import { Pill } from './Pill';
import { CaptionStudio, ORIGINAL, type Framing, type StudioTab } from './CaptionStudio';
import { DubPanel, useDubPreview } from './DubPanel';
import { ModeTiles, Reveal, ToolToggle, useSheetDrag, type Mode } from './SheetParts';
import { clampCorner, defaultDesign, EMOJIS, type StickerDesign } from '../stickers/sticker';
import { StickerPanel } from './StickerPanel';
import { MIN_CLIP, Trimmer } from './Trimmer';

const WA_LIMIT = 16 * 1024 * 1024;

const seek = (p: VideoPlayer, t: number) => {
  p.currentTime = t;
};
const setVolume = (p: VideoPlayer, v: number) => {
  p.volume = v;
};

type Transcription = { engine: Engine; model: WhisperModel; lang: string };
type CapSource = { kind: 'youtube'; pt: boolean } | ({ kind: 'transcribe'; pt: boolean } & Transcription) | { kind: 'manual' } | { kind: 'dub' };
const keyOf = (s: CapSource) =>
  s.kind === 'manual' || s.kind === 'dub' ? s.kind : s.kind === 'transcribe' ? `transcribe-${s.pt}-${s.engine}-${s.engine === 'device' ? s.model : ''}-${s.lang}` : `youtube-${s.pt}`;

/** Últimas escolhas da transcrição (ElevenLabs só com chave; o modelo "Precisa" por padrão). */
const savedTranscription = (hasKey: boolean): Transcription => {
  const st = getSettings();
  return { engine: hasKey ? (st.transcriber ?? 'elevenlabs') : 'device', model: st.whisperModel ?? 'small', lang: st.spokenLanguage ?? 'auto' };
};

type CueEntry = { cues: Cue[]; span?: [number, number] };

type Props = {
  file: DoneEvent;
  info: VideoInfo;
  /** Como abrir (Compartilhar abre no vídeo ou na foto; Figurinha, na figurinha). */
  mode: SendAs;
  visible: boolean;
  onClose: () => void;
  onShare: (target: { path: string; filename: string; mime: string; size: number }, whatsapp: boolean) => Promise<void>;
  onError: (message: string) => void;
  onNotice: (title: string, body?: string) => void;
};

export type SendAs = 'video' | 'animated' | 'still' | 'photo';

/**
 * Envio do vídeo baixado: inteiro ou um trecho (com os capítulos do YouTube), enquadramento
 * original ou com zoom, legenda gravada na imagem (ajustada numa tela cheia, o CaptionStudio) e
 * dublagem com vozes de IA. Ou como figurinha do WhatsApp: animada (um trecho) ou parada (um
 * quadro). Fotos (Instagram, X) vão como foto ou figurinha parada.
 */
/** Linhas no máximo da legenda: três botões com o desenho de 1, 2 e 3 linhas. */
function LineLimit({ value, onChange, c }: { value: number; onChange: (n: number) => void; c: Palette }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 14, color: c.ink }}>Linhas da legenda</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 12, color: c.muted }}>Frase longa vira duas em sequência</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Linhas no máximo da legenda">
        {LINE_OPTIONS.map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(n);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={n === 1 ? '1 linha' : `${n} linhas`}
              style={({ pressed }) => [
                { flex: 1, minHeight: 56, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={{ height: 15, gap: 3, alignItems: 'center', justifyContent: 'center' }}>
                {Array.from({ length: n }, (_, i) => (
                  <View key={i} style={{ width: i === n - 1 && n > 1 ? 16 : 24, height: 3, borderRadius: 1.5, backgroundColor: on ? c.accentInk : c.muted }} />
                ))}
              </View>
              <Text style={{ fontFamily: on ? font.semibold : font.medium, fontSize: 12, color: on ? c.accentInk : c.muted }}>{n === 1 ? '1 linha' : `${n} linhas`}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function VideoSendSheet({ file, info, mode: openAs, visible, onClose, onShare, onError, onNotice }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const slide = useState(() => new Animated.Value(0))[0];
  const [source, setSource] = useState<MediaSource | null>(null);
  // Arquivo que veio sem duração (link direto de rede social): vale a do próprio arquivo ou a do post
  const duration = Math.max(MIN_CLIP, file.duration > 0 ? file.duration : source?.duration || info.duration || 0);
  const router = useRouter();
  const image = file.mime.startsWith('image');
  const [as, setAs] = useState<SendAs>(openAs);
  const [stickerCancel, setStickerCancel] = useState<(() => void) | null>(null);
  // A figurinha começa no último formato usado (recorte ou inteiro, cantos e contorno)
  const [stickerDesign, setStickerDesignState] = useState<StickerDesign>(() => {
    const st = getSettings();
    return { ...defaultDesign(), ...(st.stickerShape ? { shape: st.stickerShape } : null), ...(st.stickerCorner != null ? { corner: clampCorner(st.stickerCorner) } : null), ...(st.stickerOutline != null ? { outline: st.stickerOutline } : null) };
  });
  const setStickerDesign = (d: StickerDesign) => {
    setStickerDesignState(d);
    const st = getSettings();
    if (st.stickerShape !== d.shape || st.stickerCorner !== d.corner || st.stickerOutline !== d.outline) setSettings({ stickerShape: d.shape, stickerCorner: d.corner, stickerOutline: d.outline });
  };
  const [stickerEmoji, setStickerEmoji] = useState(EMOJIS[0]);
  const [mode, setMode] = useState<'whole' | 'clip'>('whole');
  const [range, setRange] = useState(() => ({ start: 0, end: Math.min(duration, 30) }));
  const [withCaptions, setWithCaptions] = useState(false);
  const hasYt = info.captions.length > 0;
  const elevenKey = useElevenKey();
  const hasKey = !!elevenKey;
  const [capSource, setCapSource] = useState<CapSource>(() => (hasYt ? { kind: 'youtube', pt: true } : { kind: 'transcribe', pt: true, ...savedTranscription(hasKey) }));
  const [langOpen, setLangOpen] = useState(false);
  const [dubOn, setDubOn] = useState(false);
  const [dub, setDub] = useState<{ result: DubResult; from: number; to: number } | null>(null);
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [dubCancel, setDubCancel] = useState<(() => void) | null>(null);
  const dubPlayer = useDubPreview(dub?.result ?? null);
  const [style, setStyle] = useState<CaptionStyle | null>(null);
  const [cache, setCache] = useState<Record<string, CueEntry>>({});
  const [status, setStatus] = useState<{ label: string; fraction: number | null } | null>(null);
  const [framing, setFraming] = useState<Framing>(ORIGINAL);
  const [studio, setStudio] = useState<StudioTab | null>(null);
  const [busy, setBusy] = useState<{ label: string; fraction: number | null } | null>(null);
  const signal = useRef({ cancelled: false });
  const loading = useRef(new Set<string>());
  const [, bump] = useState(0);

  const locked = !!busy || !!stickerCancel || !!dubCancel;
  const sheetDrag = useSheetDrag(onClose, !locked);

  const player = useVideoPlayer(image ? null : { uri: toUri(file.path) }, (p) => {
    p.muted = false;
    p.timeUpdateEventInterval = 0.1;
  });

  // Tamanho pelo próprio player, se o arquivo não disse o dele
  const [trackSize, setTrackSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const sub = player.addListener('videoTrackChange', ({ videoTrack }) => {
      const z = videoTrack?.size;
      if (z && z.width > 0 && z.height > 0) setTrackSize({ width: z.width, height: z.height });
    });
    return () => sub.remove();
  }, [player]);

  if (visible && !mounted) setMounted(true);
  // Cada vez que abre, abre no modo pedido (Compartilhar ou Figurinha)
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setAs(openAs);
  }

  useEffect(() => {
    if (visible) {
      slide.setValue(0);
      sheetDrag.reset();
      Animated.timing(slide, { toValue: 1, duration: ms(380), easing: ease.ios, useNativeDriver: true }).start();
      sourceFromFile(file.path, { title: info.title, origin: 'youtube', youtubeId: info.id, thumbnail: info.thumbnail })
        .then(setSource)
        .catch(() => {});
    } else if (mounted) {
      player.pause();
      dubPlayer.pause();
      Animated.timing(slide, { toValue: 0, duration: ms(220), easing: ease.exit, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const from = mode === 'clip' ? range.start : 0;
  const to = mode === 'clip' ? range.end : duration;

  // Miniaturas: a tira do trecho e o quadro da prévia da legenda
  const thumbTimes = useMemo(() => Array.from({ length: 12 }, (_, i) => (duration * (i + 0.5)) / 12), [duration]);
  const posterTime = Math.min(duration - 0.1, from + Math.min(1, (to - from) / 3));
  useEffect(() => {
    if (!source) return;
    if (mode === 'clip' || as !== 'video') loadThumbs(source, thumbTimes, () => bump((n) => n + 1));
    if (withCaptions) loadThumbs(source, [posterTime], () => bump((n) => n + 1));
  }, [mode, as, source, thumbTimes, withCaptions, posterTime]);
  const filmstrip = source ? thumbTimes.map((t) => cachedThumb(source.path, t)).filter((x): x is string => !!x) : [];
  const poster = (source && cachedThumb(source.path, posterTime)) || info.thumbnail;

  // A prévia do envio toca só o trecho escolhido
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (as === 'video' && mode === 'clip' && !studio && player.playing && currentTime >= range.end) {
        player.pause();
        seek(player, range.start);
      }
    });
    return () => sub.remove();
  }, [player, as, mode, range, studio]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (studio) setStudio(null);
      else if (busy) signal.current.cancelled = true;
      else if (stickerCancel) stickerCancel();
      else if (dubCancel) dubCancel();
      else onClose();
      return true;
    });
    return () => sub.remove();
  }, [busy, onClose, visible, studio, stickerCancel, dubCancel]);

  // A letra segue o lado menor do vídeo. Vídeo deitado costuma ser visto com o celular em pé,
  // ocupando só a largura da tela: a legenda precisa ser proporcionalmente maior para ser lida.
  const boost = source && source.width > source.height ? Math.min(1.6, source.width / source.height) : 1;
  const capStyle: CaptionStyle = style ?? { ...defaultCaptionStyle(), size: 0.052 * boost };

  const key = keyOf(capSource);
  const cues = cache[key]?.cues ?? null;
  const setCues = (list: Cue[]) => setCache((m) => ({ ...m, [key]: { ...m[key], cues: list } }));

  /** Legendas da fonte escolhida (do YouTube, transcritas ou escritas), em segundos do arquivo. */
  const load = async (src: CapSource, span: [number, number], progress: CaptionProgress): Promise<Cue[]> => {
    const k = keyOf(src);
    const hit = cache[k];
    if (src.kind === 'manual') return hit?.cues ?? [];
    if (src.kind === 'dub') {
      if (!dub) throw new Error('Dublagem ainda não feita.');
      return dub.result.cues.map((q) => ({ ...q, start: q.start + dub.from, end: q.end + dub.from }));
    }
    if (hit && (src.kind === 'youtube' || (hit.span && hit.span[0] <= span[0] + 0.05 && hit.span[1] >= span[1] - 0.05))) return hit.cues;
    if (src.kind === 'youtube') {
      const pick = chooseTrack(info.captions, src.pt);
      if (!pick) throw new Error('Este vídeo não tem legenda no YouTube.');
      const r = await youtubeCues(info.id, pick.track, pick.translate, progress);
      setCache((m) => ({ ...m, [k]: { cues: r.cues } }));
      return r.cues;
    }
    // A transcrição cobre só o trecho que vai ser enviado
    const r = await transcribe({ path: file.path, from: span[0], to: span[1], engine: src.engine, model: src.model, language: src.lang, toPortuguese: src.pt }, progress, signal.current);
    const list = r.cues.map((q) => ({ ...q, start: q.start + span[0], end: q.end + span[0] }));
    setCache((m) => ({ ...m, [k]: { cues: list, span } }));
    return list;
  };

  /** Busca em segundo plano (YouTube é rápido; a transcrição só começa quando a pessoa pede). */
  const prefetch = (src: CapSource, force = false) => {
    const k = keyOf(src);
    if (src.kind === 'manual' || src.kind === 'dub' || (src.kind === 'transcribe' && !force) || loading.current.has(k)) return;
    loading.current.add(k);
    signal.current = { cancelled: false };
    load(src, [from, to], (label, fraction) => setStatus({ label, fraction }))
      .catch((e) => {
        const err = e as Error & { code?: string };
        if (err.code !== 'cancelled') onError(err.message);
      })
      .finally(() => {
        loading.current.delete(k);
        setStatus(null);
      });
  };

  const pickSource = (src: CapSource) => {
    setCapSource(src);
    if (src.kind === 'manual') {
      if (!cache.manual) setCache((m) => ({ ...m, manual: { cues: [] } }));
      openStudio('cues');
    } else prefetch(src);
  };

  const openStudio = (tab: StudioTab) => {
    if (!source) return;
    player.pause();
    if (player.currentTime < from || player.currentTime > to) seek(player, from);
    setStudio(tab);
  };

  // Trecho, legenda ou zoom: o vídeo é montado de novo, ajustado para caber no WhatsApp e sem
  // gastar mais bits que o original tinha. A estimativa usa a mesma conta da exportação.
  const zoomed = framing.zoom > 1.001;
  // A dublagem vale para o trecho em que foi feita; mexeu no trecho, precisa dublar de novo
  const dubbed = dub && Math.abs(dub.from - (mode === 'clip' ? range.start : 0)) < 0.05 && Math.abs(dub.to - (mode === 'clip' ? range.end : duration)) < 0.05 ? dub : null;
  const direct = mode === 'whole' && !withCaptions && !zoomed && !dubbed;
  const sourceRate = (file.size * 8) / Math.max(1, duration) - AUDIO_BITRATE;
  const outSize = outputSize('original', 720, source ?? undefined);
  const estimate = direct ? file.size : estimateBytes(plannedBitrate(outSize.width, outSize.height, to - from, true, sourceRate * 1.3), to - from);

  const send = async (whatsapp: boolean) => {
    player.pause();
    signal.current = { cancelled: false };
    try {
      if (direct) {
        await onShare({ path: file.path, filename: file.filename, mime: file.mime, size: file.size }, whatsapp);
        return;
      }
      const src = source ?? (await sourceFromFile(file.path, { title: info.title, origin: 'youtube', youtubeId: info.id }));
      let captions: Project['captions'] = null;
      if (withCaptions) {
        setBusy({ label: 'Preparando a legenda…', fraction: null });
        const all = await load(capSource, [from, to], (label, fraction) => setBusy({ label, fraction }));
        const part = slice(all.filter((q) => q.text.trim()), from, to);
        if (part.length) captions = { cues: part, style: capStyle, label: 'envio' };
        else if (capSource.kind === 'manual') throw new Error('Escreva pelo menos uma legenda (em Ajustar na tela) ou desligue a legenda.');
      }
      if (signal.current.cancelled) return;
      const title = mode === 'clip' ? `${file.filename.replace(/\.[^.]+$/, '')} (trecho ${clock(from).replace(':', 'm')}s)` : file.filename.replace(/\.[^.]+$/, '');
      // Dublado: a fala nova entra como faixa de voz e o som original fica baixinho (ou some)
      const sources: Record<string, MediaSource> = { [src.id]: src };
      const audio: AudioTrack[] = [];
      if (dubbed) {
        sources.dub = { id: 'dub', kind: 'audio', path: dubbed.result.path, duration: to - from, width: 0, height: 0, hasAudio: true, title: 'Dublagem', origin: 'mic' };
        audio.push({ id: 'dub', kind: 'voice', sourceId: 'dub', start: 0, in: 0, out: to - from, volume: 1, fadeIn: 0, fadeOut: 0, loop: false, title: 'Dublagem' });
      }
      const project: Project = {
        id: 'envio',
        title: dubbed ? `${title} (dublado)` : title,
        aspect: 'original',
        quality: 720,
        clips: [{ ...defaultClip(src, from, to), fit: 'fill', zoom: framing.zoom, panX: framing.panX, panY: framing.panY, volume: dubbed ? (keepOriginal ? 0.18 : 0) : 1 }],
        layers: [],
        audio,
        captions,
        duck: false,
        fitWhatsApp: true,
        sources,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setBusy({ label: 'Montando o vídeo…', fraction: 0 });
      const out = await exportProject(
        project,
        (stage, f) => setBusy({ label: stage === 'preparing' ? 'Desenhando a legenda…' : 'Montando o vídeo…', fraction: stage === 'preparing' ? null : f }),
        undefined,
        { maxVideoBitrate: sourceRate * 1.3 },
      );
      await onShare({ path: out.path, filename: out.filename, mime: 'video/mp4', size: out.size }, whatsapp);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code !== 'cancelled') onError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!mounted) return null;
  const tooBig = estimate > WA_LIMIT;
  const length = to - from;
  const inRange = (cues ?? []).filter((q) => q.end > from && q.start < to);
  const lookName = CAPTION_LOOKS.find((l) => l.id === lookOf(capStyle))?.label ?? 'Personalizada';
  const motionName = MOTIONS.find((m) => m.id === (capStyle.motion ?? 'none'))?.label ?? '';
  const ratio = source && source.width > 0 && source.height > 0 ? source.width / source.height : 16 / 9;
  const pw = ratio >= 1 ? 112 : 64;
  const ph = Math.round(pw / ratio);
  const sample = shownCues(inRange.slice(0, 1), capStyle, pw, ph)[0] ?? { start: posterTime - 1, end: posterTime + 1.5, text: capSource.kind === 'manual' ? 'Escreva sua legenda' : 'Sua legenda aqui' };
  const fr = placement({ fit: 'fill', zoom: framing.zoom, panX: framing.panX, panY: framing.panY, rotate: 0 }, source ?? { width: 16, height: 9 }, pw, ph);
  const posterStyle = { position: 'absolute' as const, left: fr.x, top: fr.y, width: fr.sw, height: fr.sh };

  const capSummary =
    capSource.kind === 'manual'
      ? `${inRange.filter((q) => q.text.trim()).length} escritas`
      : capSource.kind === 'dub'
        ? `${inRange.length} falas da dublagem`
      : status
        ? `${status.label}${status.fraction != null ? ` ${Math.round(status.fraction * 100)}%` : ''}`
        : cues
          ? `${inRange.length} legendas`
          : capSource.kind === 'transcribe'
            ? 'Transcrição no celular'
            : 'Buscando…';

  const modes: Mode<SendAs>[] = image
    ? [
        { value: 'photo', label: 'Foto', hint: 'como veio', art: 'photo', a11y: 'Mandar a foto' },
        { value: 'still', label: 'Figurinha', hint: 'parada', art: 'still', a11y: 'Fazer figurinha com a foto' },
      ]
    : [
        { value: 'video', label: 'Vídeo', hint: dubbed ? 'dublado' : 'com som', art: 'video', a11y: 'Mandar o vídeo' },
        { value: 'animated', label: 'Animada', hint: 'até 10 s', art: 'animated', a11y: 'Mandar como figurinha animada' },
        { value: 'still', label: 'Parada', hint: 'um quadro', art: 'still', a11y: 'Mandar como figurinha de um quadro' },
      ];

  const transcription: Transcription = capSource.kind === 'transcribe' ? capSource : savedTranscription(hasKey);
  const setTranscription = (t: Partial<Transcription>) => {
    const next = { ...transcription, ...t };
    setSettings({ transcriber: next.engine, whisperModel: next.model, spokenLanguage: next.lang });
    setCapSource({ kind: 'transcribe', pt: capSource.kind === 'transcribe' ? capSource.pt : true, ...next });
  };

  /** Prévia da dublagem: o vídeo toca do começo do trecho com a fala nova por cima. */
  const listen = (on: boolean) => {
    if (!on || !dubbed) {
      dubPlayer.pause();
      setVolume(player, 1);
      return;
    }
    seek(player, dubbed.from);
    setVolume(player, keepOriginal ? 0.18 : 0);
    dubPlayer.seekTo(0);
    player.play();
    dubPlayer.play();
  };

  const toggleCaptions = () => {
    const on = !withCaptions;
    setWithCaptions(on);
    // Dublado: a legenda já sai com o texto da dublagem
    if (on && dubbed && capSource.kind !== 'manual') setCapSource({ kind: 'dub' });
    else if (on) prefetch(capSource);
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        if (studio) setStudio(null);
        else if (busy) signal.current.cancelled = true;
        else if (stickerCancel) stickerCancel();
        else onClose();
      }}
    >
      {studio && source ? (
        <CaptionStudio
          player={player}
          source={source}
          range={{ start: from, end: to }}
          captions={withCaptions}
          cues={cues ?? []}
          onCues={setCues}
          style={capStyle}
          onStyle={setStyle}
          framing={framing}
          onFraming={setFraming}
          status={status}
          initialTab={studio}
          onClose={() => {
            player.pause();
            setStudio(null);
          }}
        />
      ) : (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: slide }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => !locked && onClose()} accessibilityLabel="Fechar" />
          </Animated.View>
          <Animated.View
            style={[
              s.sheet,
              { paddingBottom: insets.bottom + 16, transform: [{ translateY: Animated.add(slide.interpolate({ inputRange: [0, 1], outputRange: [700, 0] }), sheetDrag.drag) }] },
            ]}
          >
            {/* Alça e topo: arrastar para baixo fecha a folha */}
            <View {...sheetDrag.handlers} style={s.dragZone}>
              <View style={s.grabber} />
              <View style={s.header}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.title} accessibilityRole="header">
                    Enviar
                  </Text>
                  <Text style={s.subtitle} numberOfLines={1}>
                    {file.filename.replace(/\.[^.]+$/, '')}
                  </Text>
                </View>
                <BackButton icon="close" onPress={onClose} disabled={locked} />
              </View>
            </View>
            <ScrollView contentContainerStyle={s.content} bounces={false} keyboardShouldPersistTaps="handled">
              <ModeTiles
                modes={modes}
                value={as}
                onChange={(v) => {
                  player.pause();
                  setAs(v);
                }}
              />

              {as === 'video' ? (
                <Reveal key="video">
                  <View style={s.stack}>
                    <View style={s.video}>
                      <VideoView player={player} style={videoFill} contentFit="contain" nativeControls={false} surfaceType="textureView" />
                      <Pressable
                        style={s.playOver}
                        onPress={() => {
                          if (player.playing) {
                            player.pause();
                            dubPlayer.pause();
                          } else if (dubbed) listen(true);
                          else {
                            if (mode === 'clip' && (player.currentTime < range.start || player.currentTime >= range.end - 0.2)) seek(player, range.start);
                            player.play();
                          }
                        }}
                        accessibilityLabel={dubbed ? 'Tocar a prévia dublada' : 'Tocar prévia'}
                      >
                        <View style={s.playBtn}>
                          <Feather name="play" size={20} color="#fff" style={{ marginLeft: 3 }} />
                        </View>
                      </Pressable>
                      <View pointerEvents="none" style={s.chip}>
                        <Text style={s.chipText}>
                          {clock(length)} · {bytes(estimate)}
                        </Text>
                      </View>
                    </View>

                    <View style={s.tools}>
                      <ToolToggle
                        icon="scissors"
                        label={mode === 'clip' ? clock(range.end - range.start) : 'Cortar'}
                        active={mode === 'clip'}
                        hint="Mandar só um trecho"
                        onPress={() => setMode(mode === 'clip' ? 'whole' : 'clip')}
                      />
                      <ToolToggle icon="message-square" label="Legenda" active={withCaptions} hint="Gravar a legenda no vídeo" onPress={toggleCaptions} />
                      <ToolToggle
                        icon="zoom-in"
                        label={zoomed ? `${framing.zoom.toFixed(1).replace('.', ',')}x` : 'Zoom'}
                        active={zoomed}
                        hint={zoomed ? 'Toque para ajustar; segure para voltar ao original' : 'Aproximar e escolher a parte da imagem'}
                        onLongPress={zoomed ? () => setFraming(ORIGINAL) : undefined}
                        onPress={() => {
                          if (!zoomed) setFraming({ zoom: 1.5, panX: 0, panY: 0 });
                          openStudio('frame');
                        }}
                      />
                      <ToolToggle
                        icon="globe"
                        label={dubbed ? 'Dublado' : 'Dublar'}
                        active={dubOn || !!dubbed}
                        hint="Trocar a fala por vozes de IA em outro idioma"
                        onPress={() => {
                          player.pause();
                          setDubOn((v) => !v);
                        }}
                      />
                    </View>

                    {dubOn ? (
                      <DubPanel
                        path={file.path}
                        from={from}
                        to={to}
                        dubbed={dubbed?.result ?? null}
                        onDubbed={(r) => {
                          setDub(r ? { result: r, from, to } : null);
                          if (r) setCapSource((cs) => (withCaptions && cs.kind !== 'manual' ? { kind: 'dub' } : cs));
                          else if (capSource.kind === 'dub') setCapSource(hasYt ? { kind: 'youtube', pt: true } : { kind: 'transcribe', pt: true, ...savedTranscription(hasKey) });
                        }}
                        keepOriginal={keepOriginal}
                        onKeepOriginal={setKeepOriginal}
                        onBusy={(cancelDub) => setDubCancel(() => cancelDub)}
                        onError={onError}
                        onListen={listen}
                      />
                    ) : null}

                    {mode === 'clip' ? (
                      <Reveal>
                        <View style={s.panel}>
                          <Trimmer
                            peaks={null}
                            filmstrip={filmstrip}
                            duration={duration}
                            start={range.start}
                            end={range.end}
                            onChange={(a, b) => setRange({ start: a, end: b })}
                            playhead={null}
                            onScrubStart={() => player.pause()}
                            onScrubEnd={(a) => seek(player, a)}
                          />
                          {info.chapters.length > 1 ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
                              {info.chapters.map((ch, i) => {
                                const end = info.chapters[i + 1]?.start ?? duration;
                                const active = Math.abs(range.start - ch.start) < 0.5 && Math.abs(range.end - end) < 0.5;
                                return (
                                  <Pill
                                    key={`${ch.start}-${i}`}
                                    c={c}
                                    active={active}
                                    label={`${clock(ch.start)} ${ch.title}`}
                                    onPress={() => {
                                      setRange({ start: ch.start, end: Math.max(ch.start + MIN_CLIP, end) });
                                      seek(player, ch.start);
                                    }}
                                  />
                                );
                              })}
                            </ScrollView>
                          ) : null}
                        </View>
                      </Reveal>
                    ) : null}

                    {withCaptions ? (
                      <Reveal>
                        <View style={s.caps}>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {hasYt ? (
                              <>
                                <Pill c={c} icon="youtube" label="Português" active={capSource.kind === 'youtube' && capSource.pt} onPress={() => pickSource({ kind: 'youtube', pt: true })} />
                                <Pill c={c} label="Original" active={capSource.kind === 'youtube' && !capSource.pt} onPress={() => pickSource({ kind: 'youtube', pt: false })} />
                              </>
                            ) : null}
                            {dubbed ? <Pill c={c} icon="globe" label="Da dublagem" active={capSource.kind === 'dub'} onPress={() => pickSource({ kind: 'dub' })} /> : null}
                            <Pill c={c} icon="mic" label="Transcrever" active={capSource.kind === 'transcribe'} onPress={() => pickSource({ kind: 'transcribe', pt: true, ...transcription })} />
                            <Pill c={c} icon="edit-3" label="Escrever" active={capSource.kind === 'manual'} onPress={() => pickSource({ kind: 'manual' })} />
                          </ScrollView>

                          <Pressable
                            onPress={() => openStudio('look')}
                            android_ripple={{ color: c.hover }}
                            style={({ pressed }) => [s.capCard, pressed && { backgroundColor: c.hover }]}
                            accessibilityRole="button"
                            accessibilityLabel="Ajustar a legenda na tela"
                          >
                            <View style={[s.capPreview, { width: pw, height: ph }]}>
                              {poster ? <Image source={{ uri: poster }} style={posterStyle} /> : null}
                              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                                <CaptionLayer cue={sample} time={sample.start + 1.2} style={capStyle} cw={pw} ch={ph} />
                              </View>
                            </View>
                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                              <Text style={s.capTitle} numberOfLines={1}>
                                {lookName} · {FONTS[capStyle.font]?.label ?? 'Archivo'}
                              </Text>
                              <Text style={s.capBody} numberOfLines={1}>
                                {capSummary}
                                {motionName && capStyle.motion !== 'none' ? ` · ${motionName}` : ''}
                              </Text>
                              <Text style={s.capAction}>Ajustar</Text>
                            </View>
                            <Feather name="chevron-right" size={20} color={c.muted} />
                          </Pressable>

                          <LineLimit value={maxLinesOf(capStyle)} onChange={(maxLines) => setStyle({ ...capStyle, maxLines })} c={c} />

                          {capSource.kind === 'transcribe' && !cues && !status ? (
                            <Reveal>
                              <View style={s.trOpts}>
                                {hasKey ? (
                                  <View style={s.trRow}>
                                    <Text style={s.trLabel}>Onde</Text>
                                    <Pill c={c} icon="zap" label="ElevenLabs" active={capSource.engine === 'elevenlabs'} onPress={() => setTranscription({ engine: 'elevenlabs' })} />
                                    <Pill c={c} icon="smartphone" label="No celular" active={capSource.engine === 'device'} onPress={() => setTranscription({ engine: 'device' })} />
                                  </View>
                                ) : null}
                                {capSource.engine === 'device' ? (
                                  <View style={s.trRow}>
                                    <Text style={s.trLabel}>Modelo</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                      {(Object.keys(MODELS) as WhisperModel[]).map((m) => (
                                        <Pill
                                          key={m}
                                          c={c}
                                          icon={hasModel(m) ? 'check' : undefined}
                                          label={hasModel(m) ? MODELS[m].label : `${MODELS[m].label} · ${MODELS[m].mb} MB`}
                                          active={capSource.model === m}
                                          onPress={() => setTranscription({ model: m })}
                                        />
                                      ))}
                                    </ScrollView>
                                  </View>
                                ) : null}
                                <View style={s.trRow}>
                                  <Text style={s.trLabel}>Idioma</Text>
                                  {langOpen ? (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                      {SPOKEN.map((l) => (
                                        <Pill
                                          key={l.code}
                                          c={c}
                                          label={l.label}
                                          active={capSource.lang === l.code}
                                          onPress={() => {
                                            setTranscription({ lang: l.code });
                                            setLangOpen(false);
                                          }}
                                        />
                                      ))}
                                    </ScrollView>
                                  ) : (
                                    <Pill c={c} icon="chevron-down" label={SPOKEN.find((l) => l.code === capSource.lang)?.label ?? 'Automático'} active={false} onPress={() => setLangOpen(true)} />
                                  )}
                                </View>
                              </View>
                              <Button tone="neutral" compact icon="mic" label={`Transcrever ${mode === 'clip' ? 'o trecho' : 'o vídeo'}`} onPress={() => prefetch(capSource, true)} />
                              <Text style={s.note}>
                                {capSource.engine === 'elevenlabs'
                                  ? 'A mais precisa, em qualquer idioma. Usa a sua conta da ElevenLabs.'
                                  : hasModel(capSource.model)
                                    ? hasKey
                                      ? 'Roda no celular, sem internet.'
                                      : 'Roda no celular. Mais precisa com a chave da ElevenLabs nos Ajustes.'
                                    : `Na primeira vez baixa o modelo (${MODELS[capSource.model].mb} MB).`}
                              </Text>
                            </Reveal>
                          ) : null}
                        </View>
                      </Reveal>
                    ) : null}

                    {tooBig ? (
                      <View style={s.warn}>
                        <Feather name="alert-triangle" size={16} color={c.danger} style={{ marginTop: 2 }} />
                        <Text style={s.warnText}>Acima de 16 MB o WhatsApp manda como documento. Corte um trecho menor.</Text>
                      </View>
                    ) : null}

                    {busy ? (
                      <View style={s.busy}>
                        <Text style={s.busyText}>{busy.label}</Text>
                        <View style={s.track}>
                          <View style={[s.fill, { width: busy.fraction == null ? '35%' : `${Math.max(3, busy.fraction * 100)}%` }]} />
                        </View>
                        <Text onPress={() => (signal.current.cancelled = true)} style={s.cancel}>
                          Cancelar
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: 6 }}>
                        <Button tone="wa" icon="send" label={mode === 'clip' ? `Enviar trecho de ${clock(range.end - range.start)}` : 'Enviar no WhatsApp'} onPress={() => send(true)} />
                        <Button tone="ghost" icon="share-2" label="Outros apps" compact onPress={() => send(false)} />
                      </View>
                    )}
                  </View>
                </Reveal>
              ) : as === 'photo' ? (
                <Reveal key="photo">
                  <View style={s.stack}>
                    <View style={[s.photo, source && source.width > 0 && source.height > 0 ? { aspectRatio: Math.max(0.6, Math.min(1.8, source.width / source.height)) } : null]}>
                      <Image source={{ uri: toUri(file.path) }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="Foto que vai ser enviada" />
                      <View pointerEvents="none" style={s.chip}>
                        <Text style={s.chipText}>{bytes(file.size)}</Text>
                      </View>
                    </View>
                    <View style={{ gap: 6 }}>
                      <Button tone="wa" icon="send" label="Enviar no WhatsApp" onPress={() => onShare({ path: file.path, filename: file.filename, mime: file.mime, size: file.size }, true)} />
                      <Button tone="ghost" icon="share-2" label="Outros apps" compact onPress={() => onShare({ path: file.path, filename: file.filename, mime: file.mime, size: file.size }, false)} />
                    </View>
                  </View>
                </Reveal>
              ) : (
                <StickerPanel
                  key={as}
                  kind={as}
                  player={player}
                  file={file}
                  image={image}
                  size={source && source.width > 0 && source.height > 0 ? { width: source.width, height: source.height } : trackSize}
                  duration={duration}
                  filmstrip={filmstrip}
                  thumbAt={(t) => (source ? cachedThumb(source.path, thumbTimes[Math.min(11, Math.max(0, Math.floor((t / duration) * 12)))]) : undefined)}
                  title={info.title}
                  design={stickerDesign}
                  onDesign={setStickerDesign}
                  emoji={stickerEmoji}
                  onEmoji={setStickerEmoji}
                  onError={onError}
                  onNotice={onNotice}
                  onBusy={(cancel) => setStickerCancel(() => cancel)}
                  onOpenStickers={(folderId) => {
                    onClose();
                    router.push(`/figurinhas/${folderId}`);
                  }}
                />
              )}
            </ScrollView>
          </Animated.View>
        </>
      )}
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '94%', backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 24 },
    dragZone: { paddingHorizontal: 20, paddingBottom: 10 },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.lineStrong, marginTop: 10, marginBottom: 12 },
    content: { paddingHorizontal: 20, paddingTop: 2, gap: 16 },
    stack: { gap: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontFamily: font.bold, fontSize: 21, color: c.ink, letterSpacing: -0.3 },
    subtitle: { fontFamily: font.regular, fontSize: 14, color: c.muted, marginTop: 1 },
    video: { aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
    photo: { aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: c.dark ? '#000' : c.bg },
    trOpts: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.bg, marginBottom: 10 },
    trRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    trLabel: { width: 58, fontFamily: font.semibold, fontSize: 13, color: c.muted },
    playOver: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    playBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    chip: { position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
    chipText: { fontFamily: font.semibold, fontSize: 13, color: '#fff', fontVariant: ['tabular-nums'] },
    tools: { flexDirection: 'row', justifyContent: 'space-around' },
    panel: { paddingVertical: 14, borderRadius: 16, backgroundColor: c.bg, gap: 10 },
    caps: { gap: 10 },
    capCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingRight: 12, borderRadius: 16, backgroundColor: c.bg, overflow: 'hidden' },
    capPreview: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' },
    capTitle: { fontFamily: font.semibold, fontSize: 15, color: c.ink },
    capBody: { fontFamily: font.regular, fontSize: 13, color: c.muted },
    capAction: { fontFamily: font.semibold, fontSize: 13, color: c.accentInk, marginTop: 2 },
    note: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: c.muted, textAlign: 'center' },
    warn: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerLine },
    warnText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: c.ink },
    busy: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line },
    busyText: { fontFamily: font.medium, fontSize: 15, color: c.ink },
    track: { height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
    fill: { height: 4, borderRadius: 2, backgroundColor: c.accent },
    cancel: { fontFamily: font.semibold, fontSize: 14, color: c.danger, textAlign: 'center' },
  });
