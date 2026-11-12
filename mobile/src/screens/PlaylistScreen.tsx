import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine from '../../modules/puxa-engine';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal } from '../components/SheetParts';
import { useToast } from '../components/Toasts';
import { bytes, clock } from '../format';
import { ms } from '../motion';
import { addLinks, removeTrack, resumeQueue, retry } from '../playlist/downloads';
import { cycleLoop, next, playTrack, previous, seek, toggle, usePlayer } from '../playlist/player';
import { moveTrack, useTracks, type Track } from '../playlist/store';
import { font, type Palette, radius, usePalette } from '../theme';

const toImage = (p: string | null) => (p ? (p.startsWith('/') && !p.startsWith('/preview') ? `file://${p}` : p) : undefined);

/**
 * A playlist: cole links (um ou vários) e cada um vira uma música guardada no aparelho. Toca em
 * fila, com a tela desligada, e os controles aparecem na barra de notificação.
 */
export function PlaylistScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const tracks = useTracks();
  const player = usePlayer();
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [playerH, setPlayerH] = useState(0);

  useEffect(() => {
    resumeQueue();
  }, []);

  const add = (raw: string) => {
    const r = addLinks(raw);
    if (r.invalid) {
      toast.show({ title: 'Nenhum link aqui', body: 'Cole links do YouTube, do Instagram ou do X.', tone: 'info' });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setText('');
    if (r.added) toast.show({ title: r.added === 1 ? 'Na fila para virar música' : `${r.added} links na fila`, body: r.duplicates ? `${r.duplicates} já estava${r.duplicates > 1 ? 'm' : ''} na playlist.` : undefined, tone: 'success' });
    else toast.show({ title: 'Já está na playlist', tone: 'info' });
  };

  const paste = async () => {
    const got = (await Clipboard.getStringAsync()).trim();
    if (!got) {
      toast.show({ title: 'Nada copiado', body: 'Copie o link no app da rede e toque em Colar de novo.', tone: 'info' });
      return;
    }
    add(got);
  };

  const share = async (t: Track, whatsapp: boolean) => {
    if (!t.path) return;
    const ext = t.path.split('.').pop() ?? 'm4a';
    try {
      await PuxaEngine.share(t.path, ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4', whatsapp, `${t.title.slice(0, 80)}.${ext}`);
    } catch (e) {
      toast.show({ title: 'Não deu para enviar', body: (e as Error).message, tone: 'error' });
    }
  };

  const save = async (t: Track) => {
    if (!t.path) return;
    const ext = t.path.split('.').pop() ?? 'm4a';
    try {
      const where = await PuxaEngine.saveToDownloads(t.path, `${t.title.slice(0, 80)}.${ext}`, ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
      toast.show({ title: where === 'Download/Puxa' ? 'Salvo em Download/Puxa' : 'Salvo', body: t.title, tone: 'success' });
    } catch (e) {
      toast.show({ title: 'Não deu para salvar', body: (e as Error).message, tone: 'error' });
    }
  };

  const ready = tracks.filter((t) => t.status === 'ready');
  const current = tracks.find((t) => t.id === player.trackId) ?? null;
  const toastBottom = current && playerH ? playerH + 8 : insets.bottom + 16;

  // Os avisos sobem para cima do player (a tela de trás acerta a altura dela quando volta)
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => toast.setBottomInset(toastBottom), 60);
      return () => clearTimeout(t);
    }, [toast, toastBottom]),
  );
  const totalTime = ready.reduce((n, t) => n + (t.duration || 0), 0);

  return (
    <View style={s.root}>
      <ScreenHeader title="Playlist" />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: (current ? 210 : 40) + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={s.addCard}>
          <View style={s.field}>
            <Feather name="link" size={18} color={c.muted} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Links do YouTube, Instagram ou X"
              placeholderTextColor={c.disabledInk}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={() => text.trim() && add(text)}
              selectionColor={c.accent}
              accessibilityLabel="Links para a playlist"
            />
            {text ? (
              <Pressable onPress={() => setText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Limpar">
                <Feather name="x-circle" size={18} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
          <View style={s.addRow}>
            <Button tone="neutral" icon="clipboard" label="Colar" compact onPress={paste} />
            <View style={{ flex: 1 }}>
              <Button tone="accent" icon="plus" label="Adicionar" compact disabled={!text.trim()} onPress={() => add(text)} />
            </View>
          </View>
          <Text style={s.hint}>Cada link vira uma música no celular. Dá para colar vários de uma vez.</Text>
        </View>

        {tracks.length ? (
          <View style={s.listHead}>
            <Text style={s.listTitle}>
              {ready.length} {ready.length === 1 ? 'música' : 'músicas'}
              {totalTime ? <Text style={s.listMeta}> · {clock(totalTime)}</Text> : null}
            </Text>
            {ready.length ? (
              <Pressable onPress={() => (player.playing || current ? toggle() : playTrack(ready[0].id))} style={({ pressed }) => [s.playAll, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={player.playing ? 'Pausar' : 'Tocar a playlist'}>
                <Feather name={player.playing ? 'pause' : 'play'} size={16} color={c.onAccent} style={player.playing ? null : { marginLeft: 2 }} />
                <Text style={s.playAllText}>{player.playing ? 'Pausar' : current ? 'Continuar' : 'Tocar'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Feather name="music" size={28} color={c.accentInk} />
            </View>
            <Text style={s.emptyTitle}>Sua playlist está vazia</Text>
            <Text style={s.emptyBody}>Cole um link aqui em cima ou, no Baixar, toque em Playlist. As músicas tocam com a tela desligada, com controles na notificação.</Text>
          </View>
        )}

        <View style={{ gap: 8 }}>
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              t={t}
              index={i}
              count={tracks.length}
              playing={player.trackId === t.id}
              audible={player.trackId === t.id && player.playing}
              open={open === t.id}
              c={c}
              s={s}
              onPlay={() => {
                if (t.status === 'ready') {
                  if (player.trackId === t.id) toggle();
                  else playTrack(t.id);
                } else if (t.status === 'error') retry(t.id);
              }}
              onMenu={() => setOpen((o) => (o === t.id ? null : t.id))}
              onShare={(wa) => share(t, wa)}
              onSave={() => save(t)}
              onMove={(by) => moveTrack(t.id, by)}
              onRemove={() => {
                setOpen(null);
                removeTrack(t);
                toast.show({ title: 'Removida da playlist', body: t.title, tone: 'info' });
              }}
            />
          ))}
        </View>
      </ScrollView>

      {current ? <NowPlaying t={current} c={c} s={s} bottom={insets.bottom} onHeight={setPlayerH} /> : null}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function TrackRow({
  t,
  index,
  count,
  playing,
  audible,
  open,
  c,
  s,
  onPlay,
  onMenu,
  onShare,
  onSave,
  onMove,
  onRemove,
}: {
  t: Track;
  index: number;
  count: number;
  playing: boolean;
  audible: boolean;
  open: boolean;
  c: Palette;
  s: Styles;
  onPlay: () => void;
  onMenu: () => void;
  onShare: (whatsapp: boolean) => void;
  onSave: () => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const busy = t.status === 'queued' || t.status === 'downloading';
  const meta =
    t.status === 'ready'
      ? [t.artist, t.duration ? clock(t.duration) : null, t.size ? bytes(t.size) : null].filter(Boolean).join(' · ')
      : t.status === 'error'
        ? t.error || 'Não deu para baixar.'
        : t.status === 'queued'
          ? 'Na fila'
          : t.progress != null && t.progress > 0
            ? `Baixando ${Math.round(t.progress * 100)}%`
            : 'Lendo o link…';
  return (
    <View style={[s.track, playing && { borderColor: c.accent, backgroundColor: c.accentSoft }]}>
      <Pressable
        onPress={onPlay}
        android_ripple={{ color: c.hover }}
        style={s.trackMain}
        accessibilityRole="button"
        accessibilityLabel={t.status === 'ready' ? `${audible ? 'Pausar' : 'Tocar'} ${t.title}` : t.status === 'error' ? `Tentar de novo: ${t.title}` : `${t.title}, ${meta}`}
        disabled={busy}
      >
        <View style={s.cover}>
          {t.thumbnail ? <Image source={{ uri: toImage(t.thumbnail) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Feather name="music" size={20} color={c.muted} />}
          {playing ? (
            <View style={s.coverShade}>
              <Bars on={audible} />
            </View>
          ) : busy ? (
            <View style={s.coverShade}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={[s.trackTitle, playing && { color: c.accentInk }]} numberOfLines={1}>
            {t.title}
          </Text>
          <Text style={[s.trackMeta, t.status === 'error' && { color: c.danger }]} numberOfLines={t.status === 'error' ? 2 : 1}>
            {meta}
          </Text>
          {t.status === 'downloading' ? (
            <View style={s.bar}>
              <View style={[s.barFill, { width: `${Math.max(4, (t.progress ?? 0.05) * 100)}%` }]} />
            </View>
          ) : null}
        </View>
        {t.status === 'error' ? <Feather name="rotate-cw" size={18} color={c.accentInk} /> : null}
      </Pressable>
      <Pressable onPress={onMenu} hitSlop={6} style={({ pressed }) => [s.more, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel={`Mais opções: ${t.title}`} accessibilityState={{ expanded: open }}>
        <Feather name={open ? 'chevron-up' : 'more-vertical'} size={20} color={c.muted} />
      </Pressable>
      {open ? (
        <View style={s.actions}>
          <Reveal>
            <View style={s.actionsRow}>
          {t.status === 'ready' ? (
            <>
              <MiniAction icon="send" label="WhatsApp" onPress={() => onShare(true)} c={c} s={s} tone={c.waInk} />
              <MiniAction icon="share-2" label="Enviar" onPress={() => onShare(false)} c={c} s={s} />
              <MiniAction icon="download" label="Salvar" onPress={onSave} c={c} s={s} />
            </>
          ) : null}
          <MiniAction icon="arrow-up" label="Subir" disabled={index === 0} onPress={() => onMove(-1)} c={c} s={s} />
          <MiniAction icon="arrow-down" label="Descer" disabled={index === count - 1} onPress={() => onMove(1)} c={c} s={s} />
          <MiniAction icon="trash-2" label="Remover" onPress={onRemove} c={c} s={s} tone={c.danger} />
            </View>
          </Reveal>
        </View>
      ) : null}
    </View>
  );
}

function MiniAction({ icon, label, onPress, disabled, tone, c, s }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; disabled?: boolean; tone?: string; c: Palette; s: Styles }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [s.mini, pressed && { backgroundColor: c.hover }, disabled && { opacity: 0.35 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Feather name={icon} size={18} color={tone ?? c.ink} />
      <Text style={[s.miniText, tone ? { color: tone } : null]}>{label}</Text>
    </Pressable>
  );
}

/** Três barrinhas que dançam enquanto a música toca (paradas quando pausa). */
function Bars({ on }: { on: boolean }) {
  const [vals] = useState(() => [new Animated.Value(0.4), new Animated.Value(0.8), new Animated.Value(0.55)]);
  useEffect(() => {
    if (!on) {
      vals.forEach((v) => v.stopAnimation());
      return;
    }
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: ms(280 + i * 90), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: ms(320 + i * 70), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [on, vals]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 18 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: '#fff', transform: [{ scaleY: v }], transformOrigin: 'bottom' }} />
      ))}
    </View>
  );
}

/** O player fixo embaixo: capa, nome, barra de tempo e os controles. */
function NowPlaying({ t, c, s, bottom, onHeight }: { t: Track; c: Palette; s: Styles; bottom: number; onHeight: (h: number) => void }) {
  const p = usePlayer();
  const [drag, setDrag] = useState<number | null>(null);
  const duration = p.duration || t.duration || 0;
  const time = drag ?? p.time;
  const loopIcon = p.loop === 'single' ? 'repeat' : 'repeat';
  const loopLabel = p.loop === 'all' ? 'Repetir: a lista' : p.loop === 'single' ? 'Repetir: esta música' : 'Repetir: desligado';
  return (
    <View style={[s.player, { paddingBottom: bottom + 12 }]} onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}>
      <View style={s.playerTop}>
        <View style={s.playerCover}>{t.thumbnail ? <Image source={{ uri: toImage(t.thumbnail) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Feather name="music" size={20} color={c.muted} />}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.playerTitle} numberOfLines={1}>
            {t.title}
          </Text>
          <Text style={s.playerArtist} numberOfLines={1}>
            {t.artist || 'Playlist do Puxa'}
          </Text>
        </View>
        {p.buffering ? <ActivityIndicator color={c.accent} size="small" /> : null}
      </View>
      <SeekBar value={time} max={duration} onScrub={setDrag} onSeek={(v) => { setDrag(null); seek(v); }} c={c} />
      <View style={s.times}>
        <Text style={s.time}>{clock(time)}</Text>
        <Text style={s.time}>{duration ? clock(duration) : '--:--'}</Text>
      </View>
      <View style={s.controls}>
        <CtrlButton icon={loopIcon} label={loopLabel} onPress={cycleLoop} active={p.loop !== 'none'} badge={p.loop === 'single' ? '1' : undefined} c={c} s={s} />
        <CtrlButton icon="skip-back" label="Anterior" onPress={previous} c={c} s={s} />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            toggle();
          }}
          style={({ pressed }) => [s.bigPlay, pressed && { transform: [{ scale: 0.94 }] }]}
          accessibilityRole="button"
          accessibilityLabel={p.playing ? 'Pausar' : 'Tocar'}
        >
          <Feather name={p.playing ? 'pause' : 'play'} size={26} color={c.onAccent} style={p.playing ? null : { marginLeft: 3 }} />
        </Pressable>
        <CtrlButton icon="skip-forward" label="Próxima" onPress={next} c={c} s={s} />
        <View style={{ width: 48 }} />
      </View>
    </View>
  );
}

function CtrlButton({ icon, label, onPress, active, badge, c, s }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; active?: boolean; badge?: string; c: Palette; s: Styles }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => [s.ctrl, pressed && { backgroundColor: c.hover }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={22} color={active === false ? c.muted : active ? c.accentInk : c.ink} />
      {badge ? <Text style={[s.badge, { color: c.accentInk }]}>{badge}</Text> : null}
    </Pressable>
  );
}

/** Barra de tempo: tocar ou arrastar leva para o ponto. */
function SeekBar({ value, max, onScrub, onSeek, c }: { value: number; max: number; onScrub: (v: number) => void; onSeek: (v: number) => void; c: Palette }) {
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
  const x = max > 0 ? Math.min(1, value / max) * width : 0;
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
      <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' }}>
        <View style={{ width: x, height: 4, backgroundColor: c.accent }} />
      </View>
      {width > 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: x - 7, top: 7, width: 14, height: 14, borderRadius: 7, backgroundColor: c.accent }} /> : null}
      <View {...responder.panHandlers} style={[StyleSheet.absoluteFill, { top: -8, bottom: -8 }]} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
    addCard: { gap: 10, padding: 14, borderRadius: radius.list + 4, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.bg },
    input: { flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 16, color: c.ink, paddingVertical: 12 },
    addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    hint: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: c.muted },
    listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
    listTitle: { fontFamily: font.bold, fontSize: 18, color: c.ink, letterSpacing: -0.3 },
    listMeta: { fontFamily: font.regular, fontSize: 15, color: c.muted },
    playAll: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c.accent },
    playAllText: { fontFamily: font.semibold, fontSize: 15, color: c.onAccent },
    empty: { alignItems: 'center', gap: 10, padding: 24, marginTop: 8, borderRadius: radius.list + 4, borderWidth: 1, borderColor: c.line, borderStyle: 'dashed' },
    emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontFamily: font.bold, fontSize: 18, color: c.ink },
    emptyBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: c.muted, textAlign: 'center' },
    track: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', borderRadius: radius.list + 4, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden' },
    trackMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingRight: 4 },
    cover: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', backgroundColor: c.sk, alignItems: 'center', justifyContent: 'center' },
    coverShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
    trackTitle: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
    trackMeta: { fontFamily: font.regular, fontSize: 13, color: c.muted },
    bar: { height: 3, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden', marginTop: 3 },
    barFill: { height: 3, borderRadius: 2, backgroundColor: c.accent },
    more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
    actions: { width: '100%', paddingHorizontal: 8, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 8 },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
    mini: { width: '33.333%', alignItems: 'center', justifyContent: 'center', gap: 4, height: 56, borderRadius: 12 },
    miniText: { fontFamily: font.medium, fontSize: 12, color: c.ink },
    player: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: 14,
      paddingHorizontal: 20,
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      shadowColor: c.shadow,
      shadowOpacity: c.dark ? 0.5 : 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -6 },
      elevation: 16,
    },
    playerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    playerCover: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: c.sk, alignItems: 'center', justifyContent: 'center' },
    playerTitle: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
    playerArtist: { fontFamily: font.regular, fontSize: 13, color: c.muted, marginTop: 1 },
    times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
    time: { fontFamily: font.medium, fontSize: 12, color: c.muted, fontVariant: ['tabular-nums'] },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    ctrl: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    badge: { position: 'absolute', top: 8, right: 8, fontFamily: font.bold, fontSize: 10 },
    bigPlay: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent },
  });
