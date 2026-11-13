import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine from '../../modules/puxa-engine';
import { AddLinks } from '../components/music/AddLinks';
import { Equalizer, HeroMotif, imageUri, PlaylistCover, TrackArt } from '../components/music/Cover';
import { ListEditor } from '../components/music/ListEditor';
import { ListPicker } from '../components/music/ListPicker';
import { MiniPlayer } from '../components/music/MiniPlayer';
import { Sheet } from '../components/music/Sheet';
import { TrackActions, type TrackAction } from '../components/music/TrackActions';
import { useToast } from '../components/Toasts';
import { bytes, clock } from '../format';
import { COLORS, listInk, motifOf } from '../playlist/colors';
import { removeTrack, resumeQueue, retry } from '../playlist/downloads';
import { addToList, ALL, deleteList, listLook, moveInList, removeFromList, tracksOf, updateList, useLists } from '../playlist/lists';
import { playList, playTrack, toggle, toggleShuffle, usePlayer } from '../playlist/player';
import { moveTrack, useTracks, type Track } from '../playlist/store';
import { alpha, control, gutter, hit, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { EmptyState, IconButton, PlayIcon } from '../components/ui';

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
  const { width } = useWindowDimensions();
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
  /** A cor da playlist como texto e ícone sobre o fundo do app. */
  const tint = listInk(look.color, c.dark);
  /** Peças redondas sobre o pôster: um véu da cor da letra. */
  const veil = { bg: alpha(k.ink, 0.16), ink: k.ink };
  const tracks = tracksOf(id, all);
  const ready = tracks.filter((t) => t.status === 'ready');
  const time = ready.reduce((n, t) => n + (t.duration || 0), 0);
  const here = player.listId === id;
  const hasPlayer = !!player.trackId;

  const toastBottom = hasPlayer && miniH ? miniH + space[2] : insets.bottom + space[4];
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
  const count = tracks.length === 1 ? '1 música' : `${tracks.length} músicas`;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: (hasPlayer && miniH ? miniH + space[6] : space[8] + insets.bottom) }} keyboardShouldPersistTaps="handled">
        {/* O pôster da playlist, de ponta a ponta */}
        <View style={[s.hero, { backgroundColor: k.bg, paddingTop: insets.top + space[2] }]}>
          <HeroMotif kind={motifOf(look.name)} ink={k.ink} width={width} />
          <View style={s.heroTop}>
            <BackButton tint={veil} />
            {own ? <IconButton icon="more-horizontal" label="Opções da playlist" tint={veil} onPress={() => setMenu(true)} /> : null}
          </View>
          {look.cover ? (
            <Pressable onPress={() => setEditing(true)} style={s.heroArt} accessibilityRole="button" accessibilityLabel="Trocar a capa">
              <Image source={{ uri: imageUri(look.cover) }} style={s.heroImage} resizeMode="cover" />
            </Pressable>
          ) : null}
          <Text style={[s.kicker, { color: alpha(k.ink, 0.8) }]}>{own ? 'Playlist' : 'Biblioteca'}</Text>
          <Text style={[s.heroTitle, { color: k.ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityRole="header">
            {look.name}
          </Text>
          <Text style={[s.heroMeta, { color: alpha(k.ink, 0.8) }]}>
            {count}
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
            hitSlop={hit(control.sm)}
            style={({ pressed }) => [s.shuffle, { backgroundColor: player.shuffle ? k.bg : c.sunken }, pressed && { opacity: 0.72 }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: player.shuffle }}
            accessibilityLabel="Aleatório"
          >
            <Feather name="shuffle" size={16} color={player.shuffle ? k.ink : c.ink} />
            <Text style={[s.shuffleText, { color: player.shuffle ? k.ink : c.ink }]}>Aleatório</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              if (here) toggle();
              else playList(id);
            }}
            disabled={!ready.length}
            style={({ pressed }) => [s.play, { backgroundColor: k.bg, borderColor: c.bg, opacity: ready.length ? 1 : 0.4 }, pressed && { transform: [{ scale: 0.94 }] }]}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pausar' : `Tocar ${look.name}`}
          >
            <PlayIcon playing={playing} size={32} color={k.ink} />
          </Pressable>
        </View>

        <View style={s.field}>
          <AddLinks listId={own ? id : undefined} tint={k.bg} tintInk={k.ink} />
        </View>

        {tracks.length ? (
          <View style={s.list}>
            {tracks.map((t, i) => (
              <TrackRow
                key={t.id}
                t={t}
                n={i + 1}
                current={here && player.trackId === t.id}
                audible={here && player.trackId === t.id && player.playing}
                tint={tint}
                art={k.bg}
                artInk={k.ink}
                c={c}
                s={s}
                onPress={() => onRow(t)}
                onMore={() => setActions(t)}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="music"
            art={<PlaylistCover name={own ? look.name : 'Vazia'} color={look.color} size={96} radius={radius.xl} image={look.cover} />}
            title={own ? 'Playlist vazia' : 'Nenhuma música ainda'}
            body={own ? 'Cole links aqui em cima ou escolha músicas que já estão no celular.' : 'Cole um link aqui em cima ou, no Início, toque em Playlist. As músicas tocam com a tela desligada.'}
          >
            {own && all.length ? <Button icon="list" label="Escolher da biblioteca" tint={{ bg: k.bg, ink: k.ink }} onPress={() => setPicking(true)} /> : null}
          </EmptyState>
        )}
        {own && tracks.length && all.length > tracks.length ? (
          <View style={s.field}>
            <Button tone="neutral" size="md" icon="plus" label="Adicionar da biblioteca" onPress={() => setPicking(true)} style={s.more} />
          </View>
        ) : null}
      </ScrollView>

      <MiniPlayer onHeight={setMiniH} />

      <TrackActions
        track={actions}
        inPlaylist={!!own}
        canUp={index > 0}
        canDown={index >= 0 && index < tracks.length - 1}
        tint={k.bg}
        tintInk={k.ink}
        onClose={() => setActions(null)}
        onAction={act}
      />
      <ListPicker trackId={saveTo?.id ?? null} title={saveTo?.title ?? ''} onClose={() => setSaveTo(null)} />
      {own ? (
        <>
          <ListEditor
            visible={editing}
            initial={{ name: own.name, color: own.color, cover: own.cover }}
            onClose={() => setEditing(false)}
            onSave={(name, color, cover) => {
              updateList(own.id, { name, color, cover });
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

type RowProps = { t: Track; n: number; current: boolean; audible: boolean; tint: string; art: string; artInk: string; c: Palette; s: Styles; onPress: () => void; onMore: () => void };

function TrackRow({ t, n, current, audible, tint, art, artInk, c, s, onPress, onMore }: RowProps) {
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
      android_ripple={{ color: c.sunken }}
      style={({ pressed }) => [s.row, (current || pressed) && { backgroundColor: c.sunken }]}
      accessibilityRole="button"
      accessibilityLabel={t.status === 'ready' ? `${audible ? 'Pausar' : 'Tocar'} ${t.title}` : t.status === 'error' ? `Tentar de novo: ${t.title}` : `${t.title}, ${meta}`}
      accessibilityHint="Segure para mais opções"
    >
      <View style={s.num}>{current ? <Equalizer on={audible} color={tint} /> : busy ? <ActivityIndicator size="small" color={c.muted} /> : <Text style={s.numText}>{n}</Text>}</View>
      <TrackArt uri={imageUri(t.thumbnail)} size={48} radius={radius.sm} tint={art} ink={artInk} />
      <View style={s.rowText}>
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
      <IconButton icon="more-vertical" tone="plain" label={`Mais opções: ${t.title}`} onPress={onMore} />
    </Pressable>
  );
}

/** Opções da playlist: editar nome e cor, ou apagar (as músicas continuam no celular). */
function ListMenu({ visible, name, onClose, onEdit, onDelete }: { visible: boolean; name: string; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const c = usePalette();
  const [armed, setArmed] = useState(false);
  if (!visible && armed) setArmed(false);
  return (
    <Sheet visible={visible} onClose={onClose} label={`Opções de ${name}`}>
      <View style={{ paddingBottom: space[1] }}>
        <Text style={{ ...text.title, color: c.ink, paddingHorizontal: gutter, paddingBottom: space[2] }} numberOfLines={1}>
          {name}
        </Text>
        <Pressable onPress={onEdit} android_ripple={{ color: c.sunken }} style={menuRow} accessibilityRole="button" accessibilityLabel="Editar nome, cor e capa">
          <Feather name="edit-3" size={20} color={c.ink} />
          <Text style={{ ...text.body, color: c.ink }}>Editar nome, cor e capa</Text>
        </Pressable>
        <Pressable
          onPress={() => (armed ? onDelete() : setArmed(true))}
          android_ripple={{ color: c.sunken }}
          style={menuRow}
          accessibilityRole="button"
          accessibilityLabel={armed ? 'Toque de novo para apagar a playlist' : 'Apagar playlist'}
        >
          <Feather name="trash-2" size={20} color={c.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...text.body, color: c.danger }}>{armed ? 'Toque de novo para apagar' : 'Apagar playlist'}</Text>
            <Text style={{ ...text.caption, color: c.muted }}>As músicas continuam no celular.</Text>
          </View>
        </Pressable>
      </View>
    </Sheet>
  );
}

const menuRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space[4], minHeight: control.lg, paddingHorizontal: gutter };

/** Escolher músicas que já estão no celular para esta playlist. */
function LibraryPick({ visible, listId, tint, tintInk, onClose }: { visible: boolean; listId: string; tint: string; tintInk: string; onClose: () => void }) {
  const c = usePalette();
  const all = useTracks();
  const lists = useLists();
  const inside = new Set(lists.find((p) => p.id === listId)?.trackIds ?? []);
  return (
    <Sheet visible={visible} onClose={onClose} label="Escolher da biblioteca">
      <Text style={{ ...text.title, color: c.ink, paddingHorizontal: gutter, paddingBottom: space[2] }}>Da biblioteca</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[2], paddingBottom: space[2] }}>
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
              android_ripple={{ color: c.sunken }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.lg }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t.title}
            >
              <TrackArt uri={imageUri(t.thumbnail)} size={48} radius={radius.sm} tint={tint} ink={tintInk} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...text.bodyBold, color: c.ink }} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={{ ...text.caption, color: c.muted }} numberOfLines={1}>
                  {t.artist || ' '}
                </Text>
              </View>
              <View style={[{ width: 24, height: 24, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' }, on ? { backgroundColor: tint } : { borderWidth: 2, borderColor: c.lineStrong }]}>
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
    hero: { paddingHorizontal: gutter, paddingBottom: space[12], overflow: 'hidden' },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: control.md, marginBottom: space[8] },
    heroArt: { width: 144, height: 144, borderRadius: radius.lg, overflow: 'hidden', marginBottom: space[4], boxShadow: c.shadow2 },
    heroImage: { width: 144, height: 144 },
    kicker: { ...text.overline },
    heroTitle: { ...text.display, marginTop: space[1] },
    heroMeta: { ...text.captionBold, ...tabular, marginTop: space[1] },
    // O play entra 24 no pôster; o aleatório fica embaixo, na linha de baixo do play, com 8 de folga
    actionsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: gutter, marginTop: -space[6] },
    shuffle: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full },
    shuffleText: { ...text.captionBold },
    play: { width: 72, height: 72, borderRadius: radius.full, borderWidth: 4, alignItems: 'center', justifyContent: 'center', boxShadow: c.shadow2 },
    field: { paddingHorizontal: gutter, paddingTop: space[4] },
    list: { paddingHorizontal: space[4], paddingTop: space[4] },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], paddingLeft: space[2], borderRadius: radius.lg },
    rowText: { flex: 1, minWidth: 0 },
    num: { width: 24, alignItems: 'center', justifyContent: 'center' },
    numText: { ...text.caption, ...tabular, color: c.muted },
    title: { ...text.bodyBold, color: c.ink },
    meta: { ...text.caption, color: c.muted },
    bar: { height: 4, borderRadius: radius.full, backgroundColor: c.sunken, overflow: 'hidden', marginTop: space[1] },
    barFill: { height: 4, borderRadius: radius.full },
    more: { alignSelf: 'flex-start' },
  });
