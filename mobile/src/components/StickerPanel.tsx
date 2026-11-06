import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import PuxaEngine, { type DoneEvent, type StickerFolder, type StickerItem } from '../../modules/puxa-engine';
import { toUri } from '../editor/media';
import { videoFill } from '../editor/ui/kit';
import { TextVisual } from '../editor/ui/TextVisual';
import { bytes, clock } from '../format';
import { ms } from '../motion';
import { makeSticker, saveSticker } from '../stickers/device';
import { lastFolderId, MAX_PER_PACK, packOf, putFolder, rememberFolder, roomIn, useFolders } from '../stickers/folders';
import type { StickerError, StickerResult } from '../stickers/make';
import {
  CANVAS,
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
import { ease, font, type Palette, usePalette } from '../theme';
import { Button, Press } from './Button';
import { Reveal } from './SheetParts';
import { Trimmer } from './Trimmer';

/** Fundo da conversa do WhatsApp: a figurinha aparece como vai ficar lá (e o contorno branco aparece). */
export const CHAT_BG = { light: '#EFEAE2', dark: '#0B141A' };

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
};

/**
 * Figurinha do WhatsApp a partir do vídeo baixado: animada (um trecho de até 10 s) ou parada (um
 * quadro). A prévia mostra o recorte que vai sair; embaixo, só o essencial: formato, tempo,
 * texto e emoji.
 */
export function StickerPanel({ kind, player, file, image, size, duration, filmstrip, thumbAt, title, design, onDesign, emoji, onEmoji, onError, onNotice, onBusy, onOpenStickers }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const [range, setRange] = useState(() => {
    const start = clampT(player.currentTime, 0, Math.max(0, duration - MIN_ANIMATED));
    return { start, end: Math.min(duration, start + DEFAULT_ANIMATED) };
  });
  const [at, setAt] = useState(() => clampT(player.currentTime, 0, Math.max(0, duration - 0.05)));
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
    seek(player, live.current.start);
    player.play();
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const r = live.current;
      if (player.playing && (currentTime >= r.end || currentTime < r.start - 0.4)) seek(player, r.start);
    });
    return () => sub.remove();
  }, [kind, player, image]);

  // Parada: o vídeo para no quadro escolhido
  useEffect(() => {
    if (kind !== 'still' || image) return;
    player.pause();
    seek(player, at);
  }, [kind, player, at, image]);

  const length = range.end - range.start;
  const key = JSON.stringify({ kind, range: kind === 'animated' ? range : null, at: kind === 'still' ? at : null, design, emoji, folder: folder?.id });
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
      const result = await makeSticker(
        {
          kind,
          src: { path: file.path, width: size.width, height: size.height },
          start: image ? 0 : kind === 'animated' ? range.start : at,
          duration: kind === 'animated' ? length : 0,
          design,
        },
        (label, fraction) => setBusy({ label, fraction }),
        signal.current,
      );
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
    { id: 'square', label: 'Quadrado' },
    { id: 'circle', label: 'Círculo' },
    { id: 'fit', label: 'Inteiro' },
  ];

  return (
    <Reveal key={kind}>
      <View style={s.root}>
        <View style={s.previewWrap} onLayout={(e) => setBox(Math.floor(e.nativeEvent.layout.width))}>
          {P > 0 ? <StickerPreview player={player} image={image ? toUri(file.path) : undefined} design={design} size={size} box={P} c={c} onCrop={(crop) => patch({ crop })} /> : null}
        </View>

        <View style={s.swatches} accessibilityRole="radiogroup" accessibilityLabel="Formato da figurinha">
          {shapes.map((sh) => (
            <Swatch key={sh.id} label={sh.label} active={design.shape === sh.id} onPress={() => patch({ shape: sh.id })} c={c} role="radio">
              <ShapeThumb shape={sh.id} thumb={thumb} size={size} outline={design.outline} c={c} />
            </Swatch>
          ))}
          <View style={s.swatchSep} />
          <Swatch label="Contorno" active={design.outline} onPress={() => patch({ outline: !design.outline })} c={c} role="switch">
            <View style={[s.ring, { borderColor: design.outline ? '#FFFFFF' : 'transparent', backgroundColor: c.dark ? '#5A616B' : '#9AA1AB' }]} />
          </Swatch>
        </View>

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
              <View style={{ flex: 1 }}>
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
              placeholderTextColor={c.disabledInk}
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
                style={[s.emoji, emoji === e && { borderColor: c.accent, backgroundColor: c.accentSoft }]}
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

        {ready ? (
          <Reveal>
            <Pressable onPress={() => onOpenStickers(ready.folder.id)} style={s.made} accessibilityRole="button" accessibilityLabel={`Figurinha pronta na pasta ${ready.folder.name}. Abrir a pasta`}>
              <View style={[s.madeImg, { backgroundColor: c.dark ? CHAT_BG.dark : CHAT_BG.light }]}>
                <Image source={{ uri: toUri(ready.sticker?.path ?? ready.result.webp) }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.madeTitle}>Pronta · {bytes(ready.result.size)}</Text>
                <Text style={s.madeBody} numberOfLines={1}>
                  {ready.folder.name} · {count} de {MAX_PER_PACK}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={c.muted} />
            </Pressable>
          </Reveal>
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
            <Button tone="wa" icon="plus-circle" label={readyPack?.whatsapp ? 'Já está no WhatsApp' : 'Adicionar ao WhatsApp'} onPress={toWhatsApp} />
            <Button tone="ghost" icon="share-2" label="Outros apps" compact onPress={shareOther} />
          </View>
        )}
      </View>
    </Reveal>
  );
}

/** Opção desenhada (formato ou contorno), com o nome embaixo e um anel quando escolhida. */
function Swatch({ label, active, onPress, children, c, role }: { label: string; active: boolean; onPress: () => void; children: React.ReactNode; c: Palette; role: 'radio' | 'switch' }) {
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
      style={{ alignItems: 'center', gap: 6, width: 64 }}
    >
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: active ? c.accent : 'transparent',
          backgroundColor: c.dark ? CHAT_BG.dark : CHAT_BG.light,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
      <Text style={{ fontFamily: font.semibold, fontSize: 12, color: active ? c.accentInk : c.muted }} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

/** O próprio quadro do vídeo no formato: quadrado arredondado, círculo ou inteiro. */
function ShapeThumb({ shape, thumb, size, outline, c }: { shape: StickerShape; thumb: string | undefined; size: { width: number; height: number } | null; outline: boolean; c: Palette }) {
  const ar = size && size.height > 0 ? size.width / size.height : 16 / 9;
  const S = 38;
  const w = shape === 'fit' ? (ar >= 1 ? 44 : Math.round(44 * ar)) : S;
  const h = shape === 'fit' ? (ar >= 1 ? Math.round(44 / ar) : 44) : S;
  const radius = shape === 'circle' ? S / 2 : shape === 'square' ? 9 : 5;
  return (
    <View style={{ width: w, height: h, borderRadius: radius, overflow: 'hidden', borderWidth: outline ? 2 : 0, borderColor: '#FFFFFF', backgroundColor: c.dark ? '#2C3036' : '#C9CDD2' }}>
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
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.hover : c.dark ? c.hover : c.bg,
        borderWidth: 1,
        borderColor: c.line,
        opacity: disabled ? 0.4 : 1,
      })}
    >
      {icon ? <Feather name={icon} size={19} color={c.ink} /> : null}
      {dot ? <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: dot, borderWidth: 2, borderColor: c.dark ? '#000' : '#16191D' }} /> : null}
    </Pressable>
  );
}

function StepButton({ icon, label, onPress, c }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; c: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 40, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.line : c.hover })}
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
}: {
  player: VideoPlayer;
  image?: string;
  design: StickerDesign;
  size: { width: number; height: number } | null;
  box: number;
  c: Palette;
  onCrop: (crop: StickerDesign['crop']) => void;
}) {
  const src = size ?? { width: 16, height: 9 };
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
    <View style={{ width: box, height: box, borderRadius: 20, overflow: 'hidden', backgroundColor: c.dark ? CHAT_BG.dark : CHAT_BG.light }}>
      {L.border ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: L.border.x * k, top: L.border.y * k, width: L.border.w * k, height: L.border.h * k, borderRadius: L.border.radius * k, backgroundColor: '#FFFFFF' }}
        />
      ) : null}
      <View
        {...responder.panHandlers}
        accessibilityLabel="Prévia da figurinha. Arraste para escolher o recorte; com dois dedos, aproxima."
        style={{ position: 'absolute', left: ct.x * k, top: ct.y * k, width: ct.w * k, height: ct.h * k, borderRadius: ct.radius * k, overflow: 'hidden', backgroundColor: '#000' }}
      >
        <View pointerEvents="none" style={video}>
          {image ? (
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
          ) : (
            <VideoView player={player} style={videoFill} contentFit="fill" nativeControls={false} surfaceType="textureView" />
          )}
        </View>
      </View>
      {text ? (
        <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }, design.textPosition === 'top' ? { top: 10 * k } : { bottom: 10 * k }]}>
          <TextVisual
            text={text}
            uppercase
            style={{ font: 'anton', size: 0.11, color: TEXT_COLORS[design.textColor], background: 'outline', bgColor: '#000000', align: 'center' }}
            fontSize={CANVAS * 0.11 * k}
            maxWidth={CANVAS * 0.94 * k}
          />
        </View>
      ) : null}
      {design.shape !== 'fit' ? (
        <Animated.View pointerEvents="none" style={[pv.hint, { opacity: hint }]}>
          <Feather name="move" size={13} color="#fff" />
          <Text style={pv.hintText}>Arraste para ajustar</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const pv = StyleSheet.create({
  hint: { position: 'absolute', alignSelf: 'center', top: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)' },
  hintText: { fontFamily: font.semibold, fontSize: 13, color: '#fff' },
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
  const chip = (on: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: on ? c.accent : c.line,
    backgroundColor: on ? c.accentSoft : c.surface,
  });
  return (
    <View>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: c.ink, marginBottom: 8 }} nativeID="sticker-folder-label">
        Pasta
      </Text>
      {naming ? (
        <Reveal>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              placeholder="Nome da pasta"
              placeholderTextColor={c.disabledInk}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={create}
              selectionColor={c.accent}
              accessibilityLabel="Nome da nova pasta"
              style={{ flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.accent, backgroundColor: c.surface, fontFamily: font.medium, fontSize: 16, color: c.ink }}
            />
            <Button tone="accent" compact label="Criar" busy={saving} disabled={!name.trim()} onPress={create} />
            <Pressable onPress={() => setNaming(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancelar a pasta nova" style={{ padding: 8 }}>
              <Feather name="x" size={20} color={c.muted} />
            </Pressable>
          </View>
        </Reveal>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabelledBy="sticker-folder-label">
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
                <Feather name="folder" size={15} color={on ? c.accentInk : c.muted} />
                <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? c.accentInk : c.ink }} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={{ fontFamily: font.medium, fontSize: 12, color: n >= MAX_PER_PACK ? c.danger : c.muted, fontVariant: ['tabular-nums'] }}>{n}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setNaming(true)} style={[chip(false), { borderStyle: 'dashed' }]} accessibilityRole="button" accessibilityLabel="Nova pasta">
            <Feather name="plus" size={15} color={c.accentInk} />
            <Text style={{ fontFamily: font.semibold, fontSize: 14, color: c.accentInk }}>Nova</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

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
      <View pointerEvents="none" style={{ ...StyleSheet.absoluteFill, flexDirection: 'row', borderRadius: 10, overflow: 'hidden', backgroundColor: c.sk }}>
        {filmstrip.map((uri, i) => (
          <Image key={i} source={{ uri }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
        ))}
      </View>
      {width > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -5, bottom: -5, left: x - 3, width: 6, borderRadius: 3, backgroundColor: c.accent, borderWidth: 1.5, borderColor: '#fff' }} />
      ) : null}
      <View {...responder.panHandlers} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { gap: 18 },
    previewWrap: { alignItems: 'center' },
    swatches: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 4 },
    swatchSep: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: c.line, marginTop: 9, marginHorizontal: 6 },
    ring: { width: 34, height: 34, borderRadius: 10, borderWidth: 3.5 },
    card: { paddingTop: 12, paddingBottom: 12, borderRadius: 16, backgroundColor: c.bg, gap: 10 },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
    cardTitle: { fontFamily: font.semibold, fontSize: 14, color: c.ink },
    badge: { fontFamily: font.semibold, fontSize: 13, color: c.accentInk, fontVariant: ['tabular-nums'] },
    frameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
    label: { fontFamily: font.semibold, fontSize: 14, color: c.ink, marginBottom: 8 },
    textRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, fontFamily: font.medium, fontSize: 16, color: c.ink },
    emojiRow: { gap: 8, alignItems: 'center' },
    emoji: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    emojiText: { fontSize: 22 },
    made: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, paddingRight: 12, borderRadius: 16, backgroundColor: c.waSoft },
    madeImg: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden' },
    madeTitle: { fontFamily: font.semibold, fontSize: 15, color: c.ink },
    madeBody: { fontFamily: font.regular, fontSize: 13, color: c.muted, marginTop: 2 },
    busy: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line },
    busyText: { fontFamily: font.medium, fontSize: 15, color: c.ink },
    track: { height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
    fill: { height: 4, borderRadius: 2, backgroundColor: c.accent },
    cancel: { fontFamily: font.semibold, fontSize: 14, color: c.danger, textAlign: 'center' },
  });
