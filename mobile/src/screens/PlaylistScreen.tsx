import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine from '../../modules/puxa-engine';
import { AddLinks } from '../components/music/AddLinks';
import { imageUri, PlaylistCover, TrackArt } from '../components/music/Cover';
import { ListEditor } from '../components/music/ListEditor';
import { ListPicker } from '../components/music/ListPicker';
import { MiniPlayer } from '../components/music/MiniPlayer';
import { Sheet } from '../components/music/Sheet';
import { TrackActions, type TrackAction } from '../components/music/TrackActions';
import { useToast } from '../components/Toasts';
import { bytes, clock } from '../format';
import { ms } from '../motion';
import { COLORS, motifOf } from '../playlist/colors';
import { removeTrack, resumeQueue, retry } from '../playlist/downloads';
import { addToList, ALL, deleteList, listLook, moveInList, removeFromList, tracksOf, updateList, useLists } from '../playlist/lists';
import { playList, playTrack, toggle, toggleShuffle, usePlayer } from '../playlist/player';
import { moveTrack, useTracks, type Track } from '../playlist/store';
import { font, type Palette, usePalette } from '../theme';

/** Cor da playlist que dá para ler sobre o fundo do app (no escuro, mais clara). */
function readable(hex: string, dark: boolean, ink: string): string {
  if (!dark) return hex === COLORS.amarelo.bg || hex === COLORS.lima.bg ? '#5B4A00' : hex;
  if (hex === COLORS.grafite.bg) return ink;
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.38);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/**
 * Uma playlist (ou Todas as músicas): o pôster no topo com o nome grande, tocar e aleatório, o
 * campo de links e as músicas. Tocar numa música toca a lista a partir dela.
 */
export function PlaylistScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = raw || ALL;
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const all = useTracks();
  const lists = useLists();
  const player = usePlayer();
  const [actions, setActions] = useState<Track | null>(null);
  const [saveTo, setSaveTo] = useState<Track | null>(null);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const [miniH, setMiniH] = useState(0);

  useEffect(() => {
    resumeQueue();
  }, []);

  const own = id === ALL ? null : (lists.find((p) => p.id === id) ?? null);
  const look = listLook(id);
  const k = COLORS[look.color];
  const tint = readable(k.bg, c.dark, c.ink);
  const tracks = tracksOf(id, all);
  const ready = tracks.filter((t) => t.status === 'ready');
  const time = ready.reduce((n, t) => n + (t.duration || 0), 0);
  const here = player.listId === id;
  const hasPlayer = !!player.trackId;

  const toastBottom = hasPlayer && miniH ? miniH + 8 : insets.bottom + 16;
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => toast.setBottomInset(toastBottom), 60);
      return () => clearTimeout(t);
    }, [toast, toastBottom]),
  );

  // A playlist foi apagada (em outra tela): volta para a lista
  const gone = id !== ALL && !own;
  useEffect(() => {
    if (gone) router.back();
  }, [gone, router]);
  if (gone) return <View style={s.root} />;

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

  const act = (a: TrackAction, t: Track) => {
    if (a === 'save-to') {
      setActions(null);
      setSaveTo(t);
      return;
    }
    if (a === 'up' || a === 'down') {
      if (id === ALL) moveTrack(t.id, a === 'up' ? -1 : 1);
      else moveInList(id, t.id, a === 'up' ? -1 : 1);
      return;
    }
    setActions(null);
    if (a === 'whatsapp' || a === 'share') share(t, a === 'whatsapp');
    else if (a === 'download') save(t);
    else if (a === 'retry') retry(t.id);
    else if (a === 'remove') {
      removeFromList(id, t.id);
      toast.show({ title: `Saiu de ${look.name}`, body: t.title, tone: 'info', action: { label: 'Desfazer', onPress: () => addToList(id, [t.id]) } });
    } else if (a === 'delete') {
      removeTrack(t);
      toast.show({ title: 'Apagada do celular', body: t.title, tone: 'info' });
    }
  };

  const onRow = (t: Track) => {
    if (t.status === 'error') {
      retry(t.id);
      return;
    }
    if (t.status !== 'ready') return;
    Haptics.selectionAsync().catch(() => {});
    if (here && player.trackId === t.id) toggle();
    else playTrack(id, t.id);
  };

  const playing = here && player.playing;
  const index = actions ? tracks.findIndex((x) => x.id === actions.id) : -1;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: (hasPlayer ? 110 : 32) + insets.bottom }} keyboardShouldPersistTaps="handled">
        {/* O pôster da playlist, de ponta a ponta */}
        <View style={[s.hero, { backgroundColor: k.bg, paddingTop: insets.top + 8 }]}>
          <HeroMotif kind={motifOf(look.name)} ink={k.ink} />
          <View style={s.heroTop}>
            <Pressable onPress={() => router.back()} hitSlop={6} style={[s.round, { backgroundColor: k.ink === '#FFFFFF' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.4)' }]} accessibilityRole="button" accessibilityLabel="Voltar">
              <Feather name="arrow-left" size={22} color={k.ink} />
            </Pressable>
            {own ? (
              <Pressable onPress={() => setMenu(true)} hitSlop={6} style={[s.round, { backgroundColor: k.ink === '#FFFFFF' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.4)' }]} accessibilityRole="button" accessibilityLabel="Opções da playlist">
                <Feather name="more-horizontal" size={22} color={k.ink} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[s.kicker, { color: k.ink }]}>{own ? 'PLAYLIST' : 'BIBLIOTECA'}</Text>
          <Text style={[s.heroTitle, { color: k.ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityRole="header">
            {look.name}
          </Text>
          <Text style={[s.heroMeta, { color: k.ink }]}>
            {tracks.length === 1 ? '1 música' : `${tracks.length} músicas`}
            {time ? ` · ${clock(time)}` : ''}
          </Text>
        </View>

        {/* Tocar e aleatório, encaixados na borda do pôster */}
        <View style={s.actionsRow}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              toggleShuffle();
            }}
            style={({ pressed }) => [s.chip, { borderColor: player.shuffle ? tint : c.line, backgroundColor: player.shuffle ? `${k.bg}22` : c.surface }, pressed && { opacity: 0.85 }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: player.shuffle }}
            accessibilityLabel="Aleatório"
          >
            <Feather name="shuffle" size={17} color={player.shuffle ? tint : c.ink} />
            <Text style={[s.chipText, { color: player.shuffle ? tint : c.ink }]}>Aleatório</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              if (here) toggle();
              else playList(id);
            }}
            disabled={!ready.length}
            style={({ pressed }) => [s.play, { backgroundColor: k.bg, borderColor: c.bg, opacity: ready.length ? 1 : 0.5 }, pressed && { transform: [{ scale: 0.94 }] }]}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pausar' : `Tocar ${look.name}`}
          >
            <Feather name={playing ? 'pause' : 'play'} size={30} color={k.ink} style={playing ? null : { marginLeft: 4 }} />
          </Pressable>
        </View>

        <View style={s.body}>
          <AddLinks listId={own ? id : undefined} tint={k.bg} tintInk={k.ink} />

          {tracks.length ? (
            <View style={{ gap: 2 }}>
              {tracks.map((t, i) => (
                <TrackRow
                  key={t.id}
                  t={t}
                  n={i + 1}
                  current={here && player.trackId === t.id}
                  audible={here && player.trackId === t.id && player.playing}
                  tint={tint}
                  art={k.bg}
                  c={c}
                  s={s}
                  onPress={() => onRow(t)}
                  onMore={() => setActions(t)}
                />
              ))}
            </View>
          ) : (
            <View style={s.empty}>
              <PlaylistCover name={own ? look.name : 'Vazia'} color={look.color} size={96} radius={20} />
              <Text style={s.emptyTitle}>{own ? 'Playlist vazia' : 'Nenhuma música ainda'}</Text>
              <Text style={s.emptyBody}>
                {own ? 'Cole links aqui em cima ou escolha músicas que já estão no celular.' : 'Cole um link aqui em cima ou, no Baixar, toque em Playlist. As músicas tocam com a tela desligada.'}
              </Text>
              {own && all.length ? (
                <Pressable onPress={() => setPicking(true)} style={({ pressed }) => [s.emptyBtn, { backgroundColor: k.bg }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Escolher da biblioteca">
                  <Feather name="list" size={17} color={k.ink} />
                  <Text style={[s.emptyBtnText, { color: k.ink }]}>Escolher da biblioteca</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          {own && tracks.length && all.length > tracks.length ? (
            <Pressable onPress={() => setPicking(true)} style={({ pressed }) => [s.more, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel="Adicionar músicas da biblioteca">
              <Feather name="plus" size={18} color={tint} />
              <Text style={[s.moreText, { color: tint }]}>Adicionar da biblioteca</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <MiniPlayer onHeight={setMiniH} />

      <TrackActions
        track={actions}
        inPlaylist={!!own}
        canUp={index > 0}
        canDown={index >= 0 && index < tracks.length - 1}
        tint={k.bg}
        onClose={() => setActions(null)}
        onAction={act}
      />
      <ListPicker trackId={saveTo?.id ?? null} title={saveTo?.title ?? ''} onClose={() => setSaveTo(null)} />
      {own ? (
        <>
          <ListEditor
            visible={editing}
            initial={{ name: own.name, color: own.color }}
            onClose={() => setEditing(false)}
            onSave={(name, color) => {
              updateList(own.id, { name, color });
              setEditing(false);
            }}
          />
          <ListMenu
            visible={menu}
            name={own.name}
            onClose={() => setMenu(false)}
            onEdit={() => {
              setMenu(false);
              setEditing(true);
            }}
            onDelete={() => {
              setMenu(false);
              deleteList(own.id);
              toast.show({ title: 'Playlist apagada', body: 'As músicas continuam no celular, em Todas as músicas.', tone: 'info' });
            }}
          />
          <LibraryPick visible={picking} listId={own.id} tint={k.bg} tintInk={k.ink} onClose={() => setPicking(false)} />
        </>
      ) : null}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function TrackRow({ t, n, current, audible, tint, art, c, s, onPress, onMore }: { t: Track; n: number; current: boolean; audible: boolean; tint: string; art: string; c: Palette; s: Styles; onPress: () => void; onMore: () => void }) {
  const busy = t.status === 'queued' || t.status === 'downloading';
  const meta =
    t.status === 'ready'
      ? [t.artist, t.duration ? clock(t.duration) : null].filter(Boolean).join(' · ')
      : t.status === 'error'
        ? t.error || 'Não deu para baixar. Toque para tentar de novo.'
        : t.status === 'queued'
          ? 'Na fila para virar música'
          : t.progress != null && t.progress > 0
            ? `Baixando ${Math.round(t.progress * 100)}%${t.size ? ` · ${bytes(t.size)}` : ''}`
            : 'Lendo o link…';
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      delayLongPress={300}
      android_ripple={{ color: c.hover }}
      style={[s.row, current && { backgroundColor: c.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)' }]}
      accessibilityRole="button"
      accessibilityLabel={t.status === 'ready' ? `${audible ? 'Pausar' : 'Tocar'} ${t.title}` : t.status === 'error' ? `Tentar de novo: ${t.title}` : `${t.title}, ${meta}`}
      accessibilityHint="Segure para mais opções"
    >
      <View style={s.num}>{current ? <Bars on={audible} color={tint} /> : busy ? <ActivityIndicator size="small" color={c.muted} /> : <Text style={s.numText}>{n}</Text>}</View>
      <TrackArt uri={imageUri(t.thumbnail)} size={48} radius={10} tint={art} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[s.title, current && { color: tint }]} numberOfLines={1}>
          {t.title}
        </Text>
        <Text style={[s.meta, t.status === 'error' && { color: c.danger }]} numberOfLines={t.status === 'error' ? 2 : 1}>
          {meta}
        </Text>
        {t.status === 'downloading' ? (
          <View style={s.bar}>
            <View style={[s.barFill, { backgroundColor: tint, width: `${Math.max(4, (t.progress ?? 0.05) * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      <Pressable onPress={onMore} hitSlop={6} style={({ pressed }) => [s.dots, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel={`Mais opções: ${t.title}`}>
        <Feather name="more-vertical" size={20} color={c.muted} />
      </Pressable>
    </Pressable>
  );
}

/** Três barrinhas que dançam enquanto a música toca (paradas quando pausa). */
function Bars({ on, color }: { on: boolean; color: string }) {
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
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 3.5, height: 16, borderRadius: 2, backgroundColor: color, transform: [{ scaleY: v }], transformOrigin: 'bottom' }} />
      ))}
    </View>
  );
}

/** Desenho de fundo do pôster do topo (o mesmo da capa, em tamanho grande). */
function HeroMotif({ kind, ink }: { kind: number; ink: string }) {
  const o = 0.14;
  if (kind === 0)
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[420, 300, 180].map((d, i) => (
          <View key={i} style={{ position: 'absolute', width: d, height: d, borderRadius: d, borderWidth: 14, borderColor: ink, opacity: o, right: -d * 0.3, top: -d * 0.35 }} />
        ))}
      </View>
    );
  if (kind === 1)
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ position: 'absolute', width: 700, height: 22, backgroundColor: ink, left: -120, top: 10 + i * 64, transform: [{ rotate: '-28deg' }] }} />
        ))}
      </View>
    );
  if (kind === 2)
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o + 0.04 }]}>
        {Array.from({ length: 24 }, (_, i) => (
          <View key={i} style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: ink, right: 24 + (i % 6) * 34, top: 70 + Math.floor(i / 6) * 30 }} />
        ))}
      </View>
    );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o }]}>
      <View style={{ position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: ink, right: -90, top: 10 }} />
    </View>
  );
}

/** Opções da playlist: editar nome e cor, ou apagar (as músicas continuam no celular). */
function ListMenu({ visible, name, onClose, onEdit, onDelete }: { visible: boolean; name: string; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const c = usePalette();
  const [armed, setArmed] = useState(false);
  if (!visible && armed) setArmed(false);
  return (
    <Sheet visible={visible} onClose={onClose} label={`Opções de ${name}`}>
      <View style={{ paddingBottom: 4 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 19, color: c.ink, paddingHorizontal: 22, paddingBottom: 8 }} numberOfLines={1}>
          {name}
        </Text>
        <Pressable onPress={onEdit} android_ripple={{ color: c.hover }} style={menuRow} accessibilityRole="button" accessibilityLabel="Editar nome e cor">
          <Feather name="edit-3" size={21} color={c.ink} />
          <Text style={{ fontFamily: font.medium, fontSize: 16, color: c.ink }}>Editar nome e cor</Text>
        </Pressable>
        <Pressable
          onPress={() => (armed ? onDelete() : setArmed(true))}
          android_ripple={{ color: c.hover }}
          style={menuRow}
          accessibilityRole="button"
          accessibilityLabel={armed ? 'Toque de novo para apagar a playlist' : 'Apagar playlist'}
        >
          <Feather name="trash-2" size={21} color={c.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 16, color: c.danger }}>{armed ? 'Toque de novo para apagar' : 'Apagar playlist'}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 13, color: c.muted }}>As músicas continuam no celular.</Text>
          </View>
        </Pressable>
      </View>
    </Sheet>
  );
}

const menuRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16, minHeight: 56, paddingHorizontal: 22 };

/** Escolher músicas que já estão no celular para esta playlist. */
function LibraryPick({ visible, listId, tint, tintInk, onClose }: { visible: boolean; listId: string; tint: string; tintInk: string; onClose: () => void }) {
  const c = usePalette();
  const all = useTracks();
  const lists = useLists();
  const inside = new Set(lists.find((p) => p.id === listId)?.trackIds ?? []);
  return (
    <Sheet visible={visible} onClose={onClose} label="Escolher da biblioteca">
      <Text style={{ fontFamily: font.bold, fontSize: 19, color: c.ink, paddingHorizontal: 20, paddingBottom: 8 }}>Da biblioteca</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}>
        {all.map((t) => {
          const on = inside.has(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (on) removeFromList(listId, t.id);
                else addToList(listId, [t.id]);
              }}
              android_ripple={{ color: c.hover }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t.title}
            >
              <TrackArt uri={imageUri(t.thumbnail)} size={44} radius={10} tint={tint} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 15, color: c.ink }} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={{ fontFamily: font.regular, fontSize: 13, color: c.muted }} numberOfLines={1}>
                  {t.artist || ' '}
                </Text>
              </View>
              <View style={[{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, on ? { backgroundColor: tint } : { borderWidth: 2, borderColor: c.lineStrong }]}>
                {on ? <Feather name="check" size={16} color={tintInk} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    hero: { paddingHorizontal: 20, paddingBottom: 46, overflow: 'hidden' },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
    round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    kicker: { fontFamily: 'Anton_400Regular', fontSize: 13, letterSpacing: 1.8, opacity: 0.75 },
    heroTitle: { fontFamily: 'Anton_400Regular', fontSize: 54, lineHeight: 60, textTransform: 'uppercase', marginTop: 2, includeFontPadding: false },
    heroMeta: { fontFamily: font.semibold, fontSize: 14, opacity: 0.85, marginTop: 4 },
    actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: -36, marginBottom: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, marginTop: 30 },
    chipText: { fontFamily: font.semibold, fontSize: 14 },
    play: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    body: { paddingHorizontal: 12, gap: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 4, paddingRight: 0, borderRadius: 14 },
    num: { width: 26, alignItems: 'center', justifyContent: 'center' },
    numText: { fontFamily: font.medium, fontSize: 14, color: c.muted, fontVariant: ['tabular-nums'] },
    title: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
    meta: { fontFamily: font.regular, fontSize: 13, color: c.muted },
    bar: { height: 3, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden', marginTop: 3 },
    barFill: { height: 3, borderRadius: 2 },
    dots: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 20 },
    emptyTitle: { fontFamily: font.bold, fontSize: 19, color: c.ink, marginTop: 6 },
    emptyBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: c.muted, textAlign: 'center' },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 18, borderRadius: 23, marginTop: 6 },
    emptyBtnText: { fontFamily: font.semibold, fontSize: 15 },
    more: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 14 },
    moreText: { fontFamily: font.semibold, fontSize: 15 },
  });
