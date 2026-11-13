import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddLinks } from '../components/music/AddLinks';
import { PlaylistCover } from '../components/music/Cover';
import { ListEditor } from '../components/music/ListEditor';
import { MiniPlayer } from '../components/music/MiniPlayer';
import { ScreenHeader } from '../components/ScreenHeader';
import { useToast } from '../components/Toasts';
import { clock } from '../format';
import { listInk, listSoft } from '../playlist/colors';
import { resumeQueue } from '../playlist/downloads';
import { ALL, ALL_NAME, createList, tracksOf, useLists } from '../playlist/lists';
import { usePlayerCore } from '../playlist/player';
import { useTracks, type Track } from '../playlist/store';
import { gutter, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { IconButton, Overline } from '../components/ui';

const total = (ts: Track[]) => ts.reduce((n, t) => n + (t.status === 'ready' ? t.duration || 0 : 0), 0);
const count = (n: number) => (n === 1 ? '1 música' : `${n} músicas`);

/**
 * Músicas: a biblioteca em linhas, como num app de música (todas as músicas, as playlists e a
 * nova playlist). Os links colados aqui entram na biblioteca; dentro de uma playlist, entram nela.
 */
export function LibraryScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const tracks = useTracks();
  const lists = useLists();
  const player = usePlayerCore();
  const [creating, setCreating] = useState(false);
  const [miniH, setMiniH] = useState(0);

  useEffect(() => {
    resumeQueue();
  }, []);

  const hasPlayer = !!player.trackId;
  const toastBottom = hasPlayer && miniH ? miniH + space[2] : insets.bottom + space[4];
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => toast.setBottomInset(toastBottom), 60);
      return () => clearTimeout(t);
    }, [toast, toastBottom]),
  );

  const ready = tracks.filter((t) => t.status === 'ready');
  const busy = tracks.filter((t) => t.status === 'queued' || t.status === 'downloading').length;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: (hasPlayer ? space[16] + space[12] : space[8]) + insets.bottom }} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Playlists"
          subtitle={ready.length ? `${count(ready.length)} no celular${busy ? ` · ${busy} baixando` : ''}` : 'Cole um link e ele vira música.'}
          right={<IconButton icon="plus" label="Nova playlist" onPress={() => setCreating(true)} />}
        />
        <View style={s.body}>
          <AddLinks tint={c.accent} tintInk={c.onAccent} />

          {/* A biblioteca em linhas, como a de um app de música: a capa de 56, o nome e o tamanho */}
          <View style={s.section}>
            <Overline>Sua biblioteca</Overline>
            <View style={s.rows}>
              <LibraryRow
                cover={
                  <View style={[s.allCover, { backgroundColor: listSoft('grafite', c.dark) }]}>
                    <Feather name="music" size={24} color={c.ink} />
                  </View>
                }
                name={ALL_NAME}
                meta={`Biblioteca · ${count(ready.length)}${total(tracks) ? ` · ${clock(total(tracks))}` : ''}`}
                playing={player.listId === ALL && player.playing}
                tint={c.ink}
                onPress={() => router.push(`/playlist/${ALL}`)}
                s={s}
              />
              {lists.map((p) => {
                const ts = tracksOf(p.id, tracks);
                return (
                  <LibraryRow
                    key={p.id}
                    cover={<PlaylistCover name={p.name} color={p.color} size={56} radius={radius.md} image={p.cover} />}
                    name={p.name}
                    meta={`Playlist · ${count(ts.length)}${total(ts) ? ` · ${clock(total(ts))}` : ''}`}
                    playing={player.listId === p.id && player.playing}
                    tint={listInk(p.color, c.dark)}
                    onPress={() => router.push(`/playlist/${p.id}`)}
                    s={s}
                  />
                );
              })}
              <LibraryRow
                cover={
                  <View style={[s.allCover, { backgroundColor: c.accentSoft }]}>
                    <Feather name="plus" size={24} color={c.accentInk} />
                  </View>
                }
                name="Nova playlist"
                meta={lists.length ? 'Nome, cor e capa' : 'Treino, Estudos, Viagem…'}
                playing={false}
                tint={c.accentInk}
                onPress={() => setCreating(true)}
                s={s}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <MiniPlayer onHeight={setMiniH} />
      <ListEditor
        visible={creating}
        onClose={() => setCreating(false)}
        onSave={(name, color, cover) => {
          const p = createList(name, color, cover);
          setCreating(false);
          router.push(`/playlist/${p.id}`);
        }}
      />
    </View>
  );
}

/** Uma linha da biblioteca: a capa, o nome, o tamanho e o alto-falante na cor dela quando toca. */
function LibraryRow({ cover, name, meta, playing, tint, onPress, s }: { cover: ReactNode; name: string; meta: string; playing: boolean; tint: string; onPress: () => void; s: Styles }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.72 }]} accessibilityRole="button" accessibilityLabel={`${name}, ${meta}${playing ? ', tocando' : ''}`}>
      {cover}
      <View style={s.rowText}>
        <Text style={s.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={s.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {playing ? <Feather name="volume-2" size={20} color={tint} /> : null}
    </Pressable>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    body: { paddingHorizontal: gutter, gap: space[6] },
    section: { gap: space[2] },
    rows: { gap: space[1] },
    // Linha de 72: 8 em cima e embaixo da capa de 56
    row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 72, paddingVertical: space[2] },
    rowText: { flex: 1, minWidth: 0, gap: space[1] },
    allCover: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    name: { ...text.bodyBold, color: c.ink },
    meta: { ...text.caption, ...tabular, color: c.muted },
  });
