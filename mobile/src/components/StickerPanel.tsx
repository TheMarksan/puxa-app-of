import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import PuxaEngine, { type DoneEvent, type StickerFolder, type StickerItem } from '../../modules/puxa-engine';
import { shownCues } from '../editor/captionLayout';
import { slice } from '../editor/captions';
import { exportProject } from '../editor/exporter';
import { toUri } from '../editor/media';
import { defaultClip, outputSize } from '../editor/timeline';
import type { CaptionStyle, Cue, MediaSource, Project } from '../editor/types';
import { CaptionLayer } from '../editor/ui/CaptionLayer';
import { usePlayerTime } from '../editor/ui/usePlayerTime';
import { videoFill } from '../editor/ui/kit';
import { TextVisual } from '../editor/ui/TextVisual';
import { bytes, clock } from '../format';
import { ms } from '../motion';
import { makeSticker, saveSticker } from '../stickers/device';
import { lastFolderId, MAX_PER_PACK, packOf, putFolder, rememberFolder, roomIn, useFolders } from '../stickers/folders';
import type { StickerError, StickerResult } from '../stickers/make';
import {
  CANVAS,
  clampCorner,
  CORNERS,
  DEFAULT_ANIMATED,
  EMOJIS,
  MAX_ANIMATED,
  MIN_ANIMATED,
  stickerLayout,
  TEXT_COLORS,
  type StickerDesign,
  type StickerKind,
  type StickerShape,
} from '../stickers/sticker';
import { control, ease, gutter, media, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { Button, Press } from './Button';
import { BusyCard, SendRow } from './ui';
import { Reveal } from './SheetParts';
import { SnapSlider } from './SnapSlider';
import { cueAt } from './SendPreview';
import { Trimmer } from './Trimmer';

/** Fundo da conversa do WhatsApp: a figurinha aparece como vai ficar lá (e o contorno branco aparece). */

// O player vem do painel de envio; estes ajudantes mexem nele fora da renderização
const seek = (p: VideoPlayer, t: number) => {
  p.currentTime = t;
};
const mute = (p: VideoPlayer, on: boolean) => {
  p.muted = on;
};

const clampT = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const seconds = (v: number) => `${v.toFixed(1).replace('.', ',')} s`;

type Made = { key: string; result: StickerResult; folder: StickerFolder; sticker: StickerItem | null };

type Props = {
  /** O que vem no topo da rolagem (a escolha do que mandar). */
  header?: ReactNode;
  kind: StickerKind;
  player: VideoPlayer;
  file: DoneEvent;
  /** Foto (Instagram, X): a prévia mostra a imagem e não há quadro para escolher. */
  image?: boolean;
  /** Tamanho do vídeo já com a rotação aplicada (null enquanto carrega). */
  size: { width: number; height: number } | null;
  duration: number;
  filmstrip: string[];
  /** Miniatura do quadro mais perto de um tempo (para desenhar os formatos com o próprio vídeo). */
  thumbAt: (t: number) => string | undefined;
  title: string;
  /** Formato, texto e emoji ficam no painel de envio: trocar entre animada e parada mantém a escolha. */
  design: StickerDesign;
  onDesign: (d: StickerDesign) => void;
  emoji: string;
  onEmoji: (e: string) => void;
  onError: (message: string) => void;
  onNotice: (title: string, body?: string) => void;
  /** Enquanto monta: a função que cancela (o painel de envio usa no voltar do Android). */
  onBusy: (cancel: (() => void) | null) => void;
  /** Abre a pasta onde a figurinha ficou. */
  onOpenStickers: (folderId: string) => void;
  /** O vídeo de origem (para gravar a legenda antes de virar figurinha). */
  source?: MediaSource | null;
  /** Legenda ligada no envio do vídeo: a figurinha mostra (e grava) a mesma. */
  captions?: { cues: Cue[]; style: CaptionStyle } | null;
  /** Onde o trecho começa (o corte feito no vídeo, quando houver). */
  startAt?: number;
};

/**
 * Figurinha do WhatsApp a partir do vídeo baixado: animada (um trecho de até 10 s) ou parada (um
 * quadro). A prévia mostra o recorte que vai sair; embaixo, só o essencial: formato, tempo,
 * texto e emoji.
 */
export function StickerPanel({ header, kind, player, file, image, size, duration, filmstrip, thumbAt, title, design, onDesign, emoji, onEmoji, onError, onNotice, onBusy, onOpenStickers, source, captions, startAt }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const [range, setRange] = useState(() => {
    const start = clampT(startAt ?? player.currentTime, 0, Math.max(0, duration - MIN_ANIMATED));
    return { start, end: Math.min(duration, start + DEFAULT_ANIMATED) };
  });
  const [at, setAt] = useState(() => clampT(startAt ?? player.currentTime, 0, Math.max(0, duration - 0.05)));
  // A legenda do vídeo vem junto; dá para tirar só da figurinha
  const [capOn, setCapOn] = useState(true);
  const span: [number, number] = kind === 'animated' ? [range.start, range.end] : [Math.max(0, at - 0.6), at + 0.4];
  const capCues = !image && captions && capOn ? captions.cues.filter((q) => q.text.trim() && q.end > span[0] && q.start < span[1]) : [];
  const hasCaptions = !image && !!captions && captions.cues.some((q) => q.text.trim());
  const [busy, setBusy] = useState<{ label: string; fraction: number | null } | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [box, setBox] = useState(0);
  const signal = useRef({ cancelled: false });
  const folders = useFolders();
  const [picked, setPicked] = useState<string | null>(null);
  const folder = folders?.find((f) => f.id === (picked ?? lastFolderId(folders))) ?? folders?.[0] ?? null;
  const live = useRef(range);
  useEffect(() => {
    live.current = range;
  });

  // A figurinha não tem som: o vídeo fica mudo enquanto este painel está aberto
  useEffect(() => {
    if (image) return;
    mute(player, true);
    return () => {
      mute(player, false);
      player.pause();
    };
  }, [player, image]);

  // Animada: o trecho toca em repetição, como a figurinha vai ficar
  useEffect(() => {
    if (kind !== 'animated' || image) return;
    // Começa depois que a prévia nova já está na tela (a anterior acabou de sair)
    const t = setTimeout(() => {
      seek(player, live.current.start);
      player.play();
    }, 150);
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const r = live.current;
      if (player.playing && (currentTime >= r.end || currentTime < r.start - 0.4)) seek(player, r.start);
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [kind, player, image]);

  // Parada: o vídeo para no quadro escolhido
  useEffect(() => {
    if (kind !== 'still' || image) return;
    player.pause();
    seek(player, at);
  }, [kind, player, at, image]);

  const length = range.end - range.start;
  const key = JSON.stringify({ kind, range: kind === 'animated' ? range : null, at: kind === 'still' ? at : null, design, emoji, folder: folder?.id, cap: capCues.length ? [capCues, captions?.style] : null });
  const ready = made?.key === key ? made : null;
  const thumb = image ? toUri(file.path) : thumbAt(kind === 'animated' ? range.start : at);

  const patch = (p: Partial<StickerDesign>) => onDesign({ ...design, ...p });

  const create = async (): Promise<Made | null> => {
    if (ready) return ready;
    if (!size) {
      onError('O vídeo ainda está carregando. Tente de novo em instantes.');
      return null;
    }
    if (folder && roomIn(folder, kind === 'animated') <= 0) {
      onError(`A pasta ${folder.name} já tem ${MAX_PER_PACK} figurinhas ${kind === 'animated' ? 'animadas' : 'paradas'}, o máximo do WhatsApp. Escolha outra pasta.`);
      return null;
    }
    signal.current = { cancelled: false };
    setBusy({ label: 'Preparando…', fraction: null });
    onBusy(() => (signal.current.cancelled = true));
    if (!image) player.pause();
    try {
      let req = {
        kind,
        src: { path: file.path, width: size.width, height: size.height },
        start: image ? 0 : kind === 'animated' ? range.start : at,
        duration: kind === 'animated' ? length : 0,
        design,
      };
      // Com legenda: o trecho é montado antes com a legenda gravada (no recorte, já quadrado,
      // para a legenda caber nele), e a figurinha sai desse vídeo
      if (capCues.length && captions && source) {
        const crop = design.shape === 'crop';
        const aspect = crop ? ('1:1' as const) : ('original' as const);
        const project: Project = {
          id: 'figurinha',
          title: 'figurinha-legenda',
          aspect,
          quality: 720,
          clips: [{ ...defaultClip(source, span[0], span[1]), fit: 'fill', zoom: crop ? design.crop.zoom : 1, panX: crop ? -design.crop.panX : 0, panY: crop ? -design.crop.panY : 0, volume: 0 }],
          layers: [],
          audio: [],
          captions: { cues: slice(capCues, span[0], span[1]), style: captions.style, label: 'figurinha' },
          duck: false,
          fitWhatsApp: false,
          sources: { [source.id]: source },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const out = await exportProject(project, (stage, f) => setBusy({ label: 'Gravando a legenda…', fraction: stage === 'rendering' ? f : null }));
        if (signal.current.cancelled) throw Object.assign(new Error('Cancelado.'), { code: 'cancelled' });
        const o = outputSize(aspect, 720, source);
        req = { ...req, src: { path: out.path, width: o.width, height: o.height }, start: kind === 'animated' ? 0 : at - span[0], design: crop ? { ...design, crop: { zoom: 1, panX: 0, panY: 0 } } : design };
      }
      const result = await makeSticker(req, (label, fraction) => setBusy({ label, fraction }), signal.current);
      const saved = await saveSticker(folder?.id ?? 'puxa', kind, result, emoji, design.text.trim() || title.slice(0, 60));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const newest = saved.stickers.find((x) => x.animated === (kind === 'animated')) ?? null;
      const entry = { key, result, folder: saved, sticker: newest };
      setMade(entry);
      return entry;
    } catch (e) {
      const err = e as StickerError;
      if (err.code !== 'cancelled') onError(err.message);
      return null;
    } finally {
      setBusy(null);
      onBusy(null);
      if (kind === 'animated' && !image) player.play();
    }
  };

  const toWhatsApp = async () => {
    const m = await create();
    if (!m) return;
    const pack = packOf(m.folder, kind === 'animated');
    if (!pack) return;
    if (pack.whatsapp) {
      onNotice('Está no WhatsApp', `No pacote ${pack.name}.`);
      return;
    }
    try {
      const r = await PuxaEngine.stickerToWhatsApp(pack.id);
      if (r.added) {
        const next = { ...m.folder, packs: m.folder.packs.map((p) => (p.id === pack.id ? { ...p, whatsapp: true } : p)) };
        putFolder(next);
        setMade({ ...m, folder: next });
        onNotice('Pacote no WhatsApp', `Procure ${pack.name} nas figurinhas da conversa.`);
      } else if (r.error) onError(`O WhatsApp recusou o pacote: ${r.error}`);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const shareOther = async () => {
    const m = await create();
    if (!m) return;
    try {
      // Nome próprio de cada figurinha: a cópia de envio de uma não serve para outra
      await PuxaEngine.share(m.sticker?.path ?? m.result.webp, 'image/webp', false, m.sticker?.file ?? 'figurinha-puxa.webp');
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const readyPack = ready ? packOf(ready.folder, kind === 'animated') : undefined;
  const count = readyPack?.count ?? 0;
  const P = Math.min(box, 300);
  const hasText = !!design.text.trim();
  const shapes: { id: StickerShape; label: string }[] = [
    { id: 'crop', label: 'Recorte' },
    { id: 'fit', label: 'Inteiro' },
  ];

  return (
    <>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} bounces={false} keyboardShouldPersistTaps="handled">
        {header}
        <Reveal key={kind}>
      <View style={s.root}>
        <View style={s.previewWrap} onLayout={(e) => setBox(Math.floor(e.nativeEvent.layout.width))}>
          {P > 0 ? (
            <StickerPreview
              player={player}
              image={image ? toUri(file.path) : undefined}
              design={design}
              size={size}
              box={P}
              c={c}
              onCrop={(crop) => patch({ crop })}
              captions={hasCaptions && capOn && captions ? captions : null}
            />
          ) : null}
        </View>

        <View style={s.swatches} accessibilityRole="radiogroup" accessibilityLabel="Formato da figurinha">
          {shapes.map((sh) => (
            <Swatch key={sh.id} label={sh.label} active={design.shape === sh.id} onPress={() => patch({ shape: sh.id })} c={c} role="radio">
              <ShapeThumb shape={sh.id} corner={design.corner} thumb={thumb} size={size} outline={design.outline} c={c} />
            </Swatch>
          ))}
          <View style={s.swatchSep} />
          <Swatch label="Contorno" active={design.outline} onPress={() => patch({ outline: !design.outline })} c={c} role="switch">
            <View style={[s.ring, { borderRadius: 4 + 12 * clampCorner(design.corner), borderColor: design.outline ? media.on : 'transparent', backgroundColor: c.faint /* arte: o canto acompanha o que a pessoa escolheu */ }]} />
          </Swatch>
          {hasCaptions ? (
            <Swatch label="Legenda" active={capOn} onPress={() => setCapOn((v) => !v)} c={c} role="switch">
              <View style={[s.ring, s.ringCaption, { backgroundColor: c.faint }]}>
                <View style={[s.ringBar, { width: 20, backgroundColor: capOn ? media.on : media.track }]} />
                <View style={[s.ringBar, { width: 12, backgroundColor: capOn ? media.on : media.track }]} />
              </View>
            </Swatch>
          ) : null}
        </View>

        <CornerSlider value={clampCorner(design.corner)} onChange={(corner) => patch({ corner })} c={c} />

        {image ? null : (
        <View style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.cardTitle}>{kind === 'animated' ? 'Trecho' : 'Quadro'}</Text>
            <Text style={s.badge}>{kind === 'animated' ? `${seconds(length)} de ${MAX_ANIMATED} s` : `${clock(at)},${Math.floor((at % 1) * 10)}`}</Text>
          </View>
          {kind === 'animated' ? (
            <Trimmer
              peaks={null}
              filmstrip={filmstrip}
              duration={duration}
              start={range.start}
              end={range.end}
              maxLength={MAX_ANIMATED}
              onChange={(a, b) => setRange({ start: a, end: b })}
              playhead={null}
              onScrubStart={() => player.pause()}
              onScrubEnd={() => {
                seek(player, live.current.start);
                player.play();
              }}
            />
          ) : (
            <View style={s.frameRow}>
              <StepButton icon="chevron-left" label="Quadro anterior" onPress={() => setAt((t) => clampT(t - 0.1, 0, duration - 0.05))} c={c} />
              <View style={s.framePick}>
                <FramePicker filmstrip={filmstrip} duration={duration} value={at} onChange={setAt} c={c} />
              </View>
              <StepButton icon="chevron-right" label="Próximo quadro" onPress={() => setAt((t) => clampT(t + 0.1, 0, duration - 0.05))} c={c} />
            </View>
          )}
        </View>
        )}

        <View>
          <Text style={s.label} nativeID="sticker-text-label">
            Texto
          </Text>
          <View style={s.textRow}>
            <TextInput
              value={design.text}
              onChangeText={(text) => patch({ text })}
              placeholder="Opcional"
              placeholderTextColor={c.muted}
              maxLength={40}
              style={s.input}
              selectionColor={c.accent}
              returnKeyType="done"
              accessibilityLabelledBy="sticker-text-label"
              accessibilityLabel="Texto na figurinha"
            />
            <IconToggle
              icon={design.textPosition === 'top' ? 'arrow-up' : 'arrow-down'}
              label={design.textPosition === 'top' ? 'Texto em cima' : 'Texto embaixo'}
              disabled={!hasText}
              onPress={() => patch({ textPosition: design.textPosition === 'top' ? 'bottom' : 'top' })}
              c={c}
            />
            <IconToggle
              dot={TEXT_COLORS[design.textColor]}
              label={design.textColor === 'white' ? 'Cor do texto: branco' : 'Cor do texto: amarelo'}
              disabled={!hasText}
              onPress={() => patch({ textColor: design.textColor === 'white' ? 'yellow' : 'white' })}
              c={c}
            />
          </View>
        </View>

        <View>
          <Text style={s.label}>Emoji</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.emojiRow}>
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onEmoji(e);
                }}
                style={[s.emoji, emoji === e && { borderColor: c.accentLine, backgroundColor: c.accentSoft }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: emoji === e }}
                accessibilityLabel={`Emoji ${e}`}
              >
                <Text style={s.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <FolderChips
          folders={folders}
          value={folder?.id ?? null}
          kind={kind}
          onChange={(id) => {
            setPicked(id);
            rememberFolder(id);
          }}
          onError={onError}
          c={c}
        />

      </View>
        </Reveal>
      </ScrollView>
      {/* O que acabou de ficar pronto e a ação principal ficam fixos embaixo, ao alcance do polegar */}
      <View style={s.footer}>
        {ready ? (
          <Pressable
            onPress={() => onOpenStickers(ready.folder.id)}
            style={({ pressed }) => [s.made, pressed && { opacity: 0.72 }]}
            accessibilityRole="button"
            accessibilityLabel={`Figurinha pronta na pasta ${ready.folder.name}. Abrir a pasta`}
          >
            <View style={[s.madeImg, { backgroundColor: c.chat }]}>
              <Image source={{ uri: toUri(ready.sticker?.path ?? ready.result.webp) }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </View>
            <View style={s.madeText}>
              <Text style={s.madeTitle}>Pronta · {bytes(ready.result.size)}</Text>
              <Text style={s.madeBody} numberOfLines={1}>
                {ready.folder.name} · {count} de {MAX_PER_PACK}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={c.successInk} />
          </Pressable>
        ) : null}
        {busy ? (
          <BusyCard label={busy.label} fraction={busy.fraction} onCancel={() => (signal.current.cancelled = true)} />
        ) : (
          <SendRow label={readyPack?.whatsapp ? 'Já está no WhatsApp' : 'Adicionar ao WhatsApp'} onSend={toWhatsApp} onOther={shareOther} />
        )}
      </View>
    </>
  );
}

/** Opção desenhada (formato ou contorno), com o nome embaixo e um anel quando escolhida. */
function Swatch({ label, active, onPress, children, c, role }: { label: string; active: boolean; onPress: () => void; children: ReactNode; c: Palette; role: 'radio' | 'switch' }) {
  return (
    <Press
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      scaleTo={0.92}
      accessibilityRole={role}
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      style={sw.root}
    >
      <View style={[sw.tile, { borderColor: active ? c.accent : 'transparent', backgroundColor: c.chat }]}>{children}</View>
      <Text style={[text.captionBold, { color: active ? c.accentInk : c.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

const sw = StyleSheet.create({
  root: { alignItems: 'center', gap: space[1], width: 64 },
  tile: { width: 56, height: 56, borderRadius: radius.lg, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  round: { width: control.md, height: control.md, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  step: { width: control.sm, height: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});

/** O próprio quadro do vídeo no formato: recorte quadrado ou inteiro, com os cantos escolhidos. */
function ShapeThumb({ shape, corner, thumb, size, outline, c }: { shape: StickerShape; corner: number; thumb: string | undefined; size: { width: number; height: number } | null; outline: boolean; c: Palette }) {
  const ar = size && size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const S = 38;
  const w = shape === 'fit' ? (ar >= 1 ? 44 : Math.round(44 * ar)) : S;
  const h = shape === 'fit' ? (ar >= 1 ? Math.round(44 / ar) : 44) : S;
  const round = (clampCorner(corner) * Math.min(w, h)) / 2;
  return (
    <View style={{ width: w, height: h, borderRadius: round, overflow: 'hidden', borderWidth: outline ? 2 : 0, borderColor: media.on, backgroundColor: c.faint /* arte: o canto acompanha o que a pessoa escolheu */ }}>
      {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

/** Botão redondo pequeno ao lado do campo de texto: posição (seta) ou cor (bolinha). */
function IconToggle({ icon, dot, label, onPress, disabled, c }: { icon?: keyof typeof Feather.glyphMap; dot?: string; label: string; onPress: () => void; disabled?: boolean; c: Palette }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [sw.round, { backgroundColor: pressed ? c.lineStrong : c.sunken, opacity: disabled ? 0.4 : 1 }]}
    >
      {icon ? <Feather name={icon} size={20} color={c.ink} /> : null}
      {dot ? <View style={{ width: 20, height: 20, borderRadius: radius.full, backgroundColor: dot, borderWidth: 2, borderColor: c.ink }} /> : null}
    </Pressable>
  );
}

const CORNER_NAMES = ['Retos', 'Suaves', 'Redondos', 'Círculo'];
const cornerName = (v: number) => {
  if (v >= 0.995) return 'Círculo';
  const i = CORNERS.findIndex((p) => Math.abs(p - v) < 0.02);
  return i >= 0 ? CORNER_NAMES[i] : `${Math.round(v * 100)}%`;
};

/**
 * Arredondamento dos cantos, de reto a círculo: arrastar a bolinha (gruda nos atalhos) ou tocar
 * num dos quatro desenhos embaixo.
 */
function CornerSlider({ value, onChange, c }: { value: number; onChange: (v: number) => void; c: Palette }) {
  return (
    <SnapSlider
      title="Cantos"
      value={value}
      onChange={onChange}
      valueText={cornerName}
      accessibilityLabel="Arredondamento dos cantos"
      c={c}
      stops={CORNERS.map((p, i) => ({
        value: p,
        label: CORNER_NAMES[i],
        glyph: (on) => <View style={{ width: 24, height: 24, borderRadius: 12 * p, borderWidth: 2, borderColor: on ? c.accentInk : c.muted }} />, // arte: o desenho mostra o próprio arredondamento
      }))}
    />
  );
}

function StepButton({ icon, label, onPress, c }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; c: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [sw.step, { backgroundColor: pressed ? c.lineStrong : c.surface }]}
    >
      <Feather name={icon} size={20} color={c.ink} />
    </Pressable>
  );
}

/** A figurinha em tamanho de tela, sobre o fundo da conversa; arrastar escolhe o recorte. */
function StickerPreview({
  player,
  image,
  design,
  size,
  box,
  c,
  onCrop,
  captions,
}: {
  player: VideoPlayer;
  image?: string;
  design: StickerDesign;
  size: { width: number; height: number } | null;
  box: number;
  c: Palette;
  onCrop: (crop: StickerDesign['crop']) => void;
  captions: { cues: Cue[]; style: CaptionStyle } | null;
}) {
  const src = size ?? { width: 16, height: 8 };
  const L = stickerLayout(design, src);
  const k = box / CANVAS;
  const ct = L.content;
  const f = L.crop ? (ct.w * k) / L.crop.w : 1;
  const [hint] = useState(() => new Animated.Value(1));
  const live = useRef({ design, src, f, onCrop, hint });
  useLayoutEffect(() => {
    live.current = { design, src, f, onCrop, hint };
  });
  // A dica some sozinha depois de uns segundos, ou no primeiro toque
  useEffect(() => {
    const t = setTimeout(() => Animated.timing(hint, { toValue: 0, duration: ms(300), easing: ease.exit, useNativeDriver: true }).start(), 3200);
    return () => clearTimeout(t);
  }, [hint]);
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let o = { zoom: 1, panX: 0, panY: 0 };
    let pinch: { d0: number; z0: number } | null = null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.design.shape !== 'fit',
      onMoveShouldSetPanResponder: () => live.current.design.shape !== 'fit',
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        o = { ...live.current.design.crop };
        pinch = null;
        live.current.hint.setValue(0);
      },
      onPanResponderMove: (e, g) => {
        const r = live.current;
        const t = e.nativeEvent.touches;
        if (t.length >= 2) {
          const d = Math.hypot(t[1].pageX - t[0].pageX, t[1].pageY - t[0].pageY);
          if (!pinch) pinch = { d0: d, z0: r.design.crop.zoom };
          r.onCrop({ ...r.design.crop, zoom: clampT((pinch.z0 * d) / Math.max(1, pinch.d0), 1, 4) });
          return;
        }
        if (pinch) return;
        const side = Math.min(r.src.width, r.src.height) / o.zoom;
        const rx = (r.src.width - side) / 2;
        const ry = (r.src.height - side) / 2;
        // Arrastar o vídeo para a direita mostra o que está à esquerda: o recorte anda ao contrário
        const panX = rx > 1 ? clampT(o.panX - g.dx / r.f / rx, -1, 1) : o.panX;
        const panY = ry > 1 ? clampT(o.panY - g.dy / r.f / ry, -1, 1) : o.panY;
        r.onCrop({ zoom: o.zoom, panX, panY });
      },
    });
  });

  const video = L.crop
    ? { position: 'absolute' as const, left: -L.crop.x * f, top: -L.crop.y * f, width: src.width * f, height: src.height * f }
    : StyleSheet.absoluteFill;
  const text = design.text.trim();
  return (
    <View style={{ width: box, height: box, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.chat }}>
      {L.border ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: L.border.x * k, top: L.border.y * k, width: L.border.w * k, height: L.border.h * k, borderRadius: L.border.radius * k, backgroundColor: media.on }} // arte: a forma da figurinha
        />
      ) : null}
      <View
        {...responder.panHandlers}
        accessibilityLabel="Prévia da figurinha. Arraste para escolher o recorte; com dois dedos, aproxima."
        style={{ position: 'absolute', left: ct.x * k, top: ct.y * k, width: ct.w * k, height: ct.h * k, borderRadius: ct.radius * k, overflow: 'hidden', backgroundColor: media.stage }} // arte: a forma da figurinha
      >
        <View pointerEvents="none" style={video}>
          {image ? (
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
          ) : (
            <VideoView player={player} style={videoFill} contentFit="fill" nativeControls={false} surfaceType="textureView" />
          )}
        </View>
        {captions && !image ? <StickerCaption player={player} captions={captions} cw={ct.w * k} ch={ct.h * k} /> : null}
      </View>
      {text ? (
        <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }, design.textPosition === 'top' ? { top: 10 * k } : { bottom: 10 * k }]}>
          <TextVisual
            text={text}
            uppercase
            style={{ font: 'anton', size: 0.11, color: TEXT_COLORS[design.textColor], background: 'outline', bgColor: media.stage, align: 'center' }}
            fontSize={CANVAS * 0.11 * k}
            maxWidth={CANVAS * 0.94 * k}
          />
        </View>
      ) : null}
      {design.shape !== 'fit' ? (
        <Animated.View pointerEvents="none" style={[pv.hint, { opacity: hint }]}>
          <Feather name="move" size={12} color={media.on} />
          <Text style={pv.hintText}>Arraste para ajustar</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A legenda do vídeo por cima da prévia, no recorte da figurinha (como vai ficar gravada). */
function StickerCaption({ player, captions, cw, ch }: { player: VideoPlayer; captions: { cues: Cue[]; style: CaptionStyle }; cw: number; ch: number }) {
  const { time } = usePlayerTime(player, null);
  const cues = shownCues(captions.cues, captions.style, cw, ch);
  // Só a fala que está na tela naquele instante (a parada grava exatamente esse quadro)
  const cur = cueAt(cues, time, true);
  if (!cur.cue) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <CaptionLayer cue={cur.cue} next={cur.next} time={cur.at} style={captions.style} cw={cw} ch={ch} />
    </View>
  );
}

const pv = StyleSheet.create({
  hint: { position: 'absolute', alignSelf: 'center', top: space[3], flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], height: 32, borderRadius: radius.full, backgroundColor: media.scrim },
  hintText: { ...text.captionBold, color: media.on },
});

/**
 * Onde a figurinha vai ficar: as pastas em fichas, com a contagem do tipo que está sendo feito
 * (o WhatsApp aceita 30 de cada). "Nova" abre o campo do nome ali mesmo.
 */
function FolderChips({
  folders,
  value,
  kind,
  onChange,
  onError,
  c,
}: {
  folders: StickerFolder[] | null;
  value: string | null;
  kind: StickerKind;
  onChange: (id: string) => void;
  onError: (message: string) => void;
  c: Palette;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const create = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const f = await PuxaEngine.stickerFolderCreate(name);
      putFolder(f);
      onChange(f.id);
      setNaming(false);
      setName('');
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const chip = (on: boolean) => [chips.chip, { backgroundColor: on ? c.inverse : c.sunken }];
  return (
    <View>
      <Text style={[text.overline, chips.label, { color: c.muted }]} nativeID="sticker-folder-label">
        Pasta
      </Text>
      {naming ? (
        <Reveal>
          <View style={chips.naming}>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              placeholder="Nome da pasta"
              placeholderTextColor={c.muted}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={create}
              selectionColor={c.accent}
              accessibilityLabel="Nome da nova pasta"
              style={[text.body, chips.input, { borderColor: c.accent, backgroundColor: c.sunken, color: c.ink }]}
            />
            <Button tone="accent" size="md" label="Criar" busy={saving} disabled={!name.trim()} onPress={create} />
            <Pressable onPress={() => setNaming(false)} hitSlop={space[3]} accessibilityRole="button" accessibilityLabel="Cancelar a pasta nova">
              <Feather name="x" size={20} color={c.muted} />
            </Pressable>
          </View>
        </Reveal>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chips.row} accessibilityRole="radiogroup" accessibilityLabelledBy="sticker-folder-label">
          {(folders ?? []).map((f) => {
            const on = f.id === value;
            const n = packOf(f, kind === 'animated')?.count ?? 0;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onChange(f.id);
                }}
                style={chip(on)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Pasta ${f.name}, ${n} de ${MAX_PER_PACK}`}
              >
                <Feather name="folder" size={16} color={on ? c.onInverse : c.muted} />
                <Text style={[text.captionBold, { color: on ? c.onInverse : c.ink }]} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={[text.caption, tabular, { color: n >= MAX_PER_PACK ? c.danger : on ? c.onInverse : c.muted }]}>{n}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setNaming(true)} style={[chips.chip, { backgroundColor: c.accentSoft }]} accessibilityRole="button" accessibilityLabel="Nova pasta">
            <Feather name="plus" size={16} color={c.accentInk} />
            <Text style={[text.captionBold, { color: c.accentInk }]}>Nova</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const chips = StyleSheet.create({
  label: { marginBottom: space[2] },
  row: { gap: space[2] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full },
  naming: { flexDirection: 'row', gap: space[2], alignItems: 'center' },
  input: { flex: 1, minHeight: control.md, paddingHorizontal: space[4], borderRadius: radius.lg, borderWidth: 2 },
});

/** Tira de quadros com uma alça: arrastar escolhe o quadro da figurinha parada. */
function FramePicker({ filmstrip, duration, value, onChange, c }: { filmstrip: string[]; duration: number; value: number; onChange: (t: number) => void; c: Palette }) {
  const [width, setWidth] = useState(0);
  const live = useRef({ width, duration, onChange });
  useLayoutEffect(() => {
    live.current = { width, duration, onChange };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let x0 = 0;
    const set = (x: number) => {
      const { width: w, duration: d, onChange: emit } = live.current;
      if (w > 0) emit(Math.round(clampT(x / w, 0, 1) * Math.max(0, d - 0.05) * 10) / 10);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        x0 = e.nativeEvent.locationX;
        set(x0);
        Haptics.selectionAsync().catch(() => {});
      },
      onPanResponderMove: (_, g) => set(x0 + g.dx),
    });
  });
  const x = duration > 0 ? (value / duration) * width : 0;
  return (
    <View style={{ height: 64 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel={`Quadro em ${clock(value)}`}>
      <View pointerEvents="none" style={{ ...StyleSheet.absoluteFill, flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.sk }}>
        {filmstrip.map((uri, i) => (
          <Image key={i} source={{ uri }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
        ))}
      </View>
      {width > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -space[1], bottom: -space[1], left: x - 4, width: 8, borderRadius: radius.full, backgroundColor: c.accent, borderWidth: 2, borderColor: media.on }} />
      ) : null}
      <View {...responder.panHandlers} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    scroll: { flexShrink: 1 },
    content: { paddingHorizontal: gutter, paddingBottom: space[4], gap: space[4] },
    footer: { paddingHorizontal: gutter, paddingTop: space[3], gap: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong },
    root: { gap: space[6] },
    previewWrap: { alignItems: 'center' },
    swatches: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: space[1] },
    swatchSep: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: c.lineStrong, marginTop: space[2], marginHorizontal: space[2] },
    ring: { width: 32, height: 32, borderRadius: radius.md, borderWidth: 4 },
    ringCaption: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: space[1], gap: space[1], borderWidth: 0 },
    ringBar: { height: 4, borderRadius: radius.full },
    card: { paddingVertical: space[3], borderRadius: radius.lg, backgroundColor: c.sunken, gap: space[3] },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4] },
    cardTitle: { ...text.overline, color: c.muted },
    badge: { ...text.captionBold, ...tabular, color: c.accentInk },
    frameRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3] },
    framePick: { flex: 1 },
    label: { ...text.overline, color: c.muted, marginBottom: space[2] },
    textRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    input: { ...text.body, flex: 1, minHeight: control.md, paddingHorizontal: space[4], borderRadius: radius.lg, backgroundColor: c.sunken, color: c.ink },
    emojiRow: { gap: space[2], alignItems: 'center' },
    emoji: { width: control.md, height: control.md, borderRadius: radius.full, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken },
    emojiText: { ...text.title },
    made: { flexDirection: 'row', gap: space[3], alignItems: 'center', padding: space[2], paddingRight: space[3], borderRadius: radius.lg, backgroundColor: c.successSoft },
    madeImg: { width: 48, height: 48, borderRadius: radius.md, overflow: 'hidden' },
    madeText: { flex: 1, minWidth: 0 },
    madeTitle: { ...text.bodyBold, color: c.ink },
    madeBody: { ...text.caption, color: c.muted },
  });
