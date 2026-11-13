import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddLinks } from '../components/music/AddLinks';
import { PlaylistCover } from '../components/music/Cover';
import { ListEditor } from '../components/music/ListEditor';
import { MiniPlayer } from '../components/music/MiniPlayer';
import { ScreenHeader } from '../components/ScreenHeader';
import { useToast } from '../components/Toasts';
import { clock } from '../format';
import { COLORS } from '../playlist/colors';
import { resumeQueue } from '../playlist/downloads';
import { ALL, ALL_NAME, createList, tracksOf, useLists } from '../playlist/lists';
import { playList, usePlayer } from '../playlist/player';
import { useTracks, type Track } from '../playlist/store';
import { alpha, gutter, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { IconButton, Overline, PlayIcon } from '../components/ui';

const total = (ts: Track[]) => ts.reduce((n, t) => n + (t.status === 'ready' ? t.duration || 0 : 0), 0);
const count = (n: number) => (n === 1 ? '1 música' : `${n} músicas`);

/**
 * Músicas: as playlists como pôsteres (cada uma com a sua cor) e a biblioteca inteira em cima.
 * Os links colados aqui entram na biblioteca; dentro de uma playlist, entram nela.
 */
export function LibraryScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const toast = useToast();
  const tracks = useTracks();
  const lists = useLists();
  const player = usePlayer();
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

  const tile = Math.floor((width - gutter * 2 - space[4]) / 2);
  const ready = tracks.filter((t) => t.status === 'ready');
  const busy = tracks.filter((t) => t.status === 'queued' || t.status === 'downloading').length;

  const grafite = COLORS.grafite;

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

          {/* A biblioteca inteira: uma faixa larga, como um pôster deitado */}
          <Pressable onPress={() => router.push(`/playlist/${ALL}`)} style={({ pressed }) => [s.all, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${ALL_NAME}, ${count(ready.length)}`}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {[0.9, 0.62, 0.34].map((f, i) => (
                <View key={i} style={[s.allRing, { width: 240 * f, height: 240 * f, right: -60 * f - 8, top: -72 * f }]} />
              ))}
            </View>
            <View style={s.allText}>
              <Text style={s.allKicker}>Biblioteca</Text>
              <Text style={s.allTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                {ALL_NAME}
              </Text>
              <Text style={s.allMeta}>
                {count(ready.length)}
                {total(tracks) ? ` · ${clock(total(tracks))}` : ''}
              </Text>
            </View>
            {ready.length ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  playList(ALL);
                }}
                hitSlop={space[1]}
                style={({ pressed }) => [s.allPlay, pressed && { transform: [{ scale: 0.94 }] }]}
                accessibilityRole="button"
                accessibilityLabel={`Tocar ${ALL_NAME}`}
              >
                <PlayIcon playing={false} size={24} color={grafite.bg} />
              </Pressable>
            ) : null}
          </Pressable>

          <View style={s.section}>
            <View style={s.sectionHead}>
              <Overline>Suas playlists</Overline>
              {lists.length ? <Text style={s.sectionMeta}>{lists.length}</Text> : null}
            </View>

            <View style={s.grid}>
              {lists.map((p) => {
                const ts = tracksOf(p.id, tracks);
                const playing = player.listId === p.id && player.playing;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push(`/playlist/${p.id}`)}
                    style={({ pressed }) => [s.tile, { width: tile }, pressed && { opacity: 0.88 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name}, ${count(ts.length)}${playing ? ', tocando' : ''}`}
                  >
                    <View>
                      <PlaylistCover name={p.name} color={p.color} size={tile} radius={radius.xl} image={p.cover} />
                      {playing ? (
                        <View style={[s.live, { backgroundColor: COLORS[p.color].ink }]}>
                          <Feather name="volume-2" size={16} color={COLORS[p.color].bg} />
                        </View>
                      ) : null}
                    </View>
                    <View>
                      <Text style={s.name} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={s.meta} numberOfLines={1}>
                        {count(ts.length)}
                        {total(ts) ? ` · ${clock(total(ts))}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setCreating(true)} style={({ pressed }) => [s.tile, { width: tile }, pressed && { opacity: 0.72 }]} accessibilityRole="button" accessibilityLabel="Nova playlist">
                <View style={[s.newTile, { width: tile, height: tile }]}>
                  <View style={s.newPlus}>
                    <Feather name="plus" size={24} color={c.accentInk} />
                  </View>
                </View>
                <View>
                  <Text style={s.name}>Nova playlist</Text>
                  <Text style={s.meta}>{lists.length ? 'Nome, cor e capa' : 'Treino, Estudos, Viagem…'}</Text>
                </View>
              </Pressable>
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

const makeStyles = (c: Palette) => {
  const k = COLORS.grafite;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    body: { paddingHorizontal: gutter, gap: space[6] },
    all: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3], minHeight: 152, padding: space[4], borderRadius: radius.xl, backgroundColor: k.bg, overflow: 'hidden' },
    allRing: { position: 'absolute', borderRadius: radius.full, borderWidth: 8, borderColor: alpha(k.ink, 0.08) },
    allText: { flex: 1, minWidth: 0 },
    allKicker: { ...text.overline, color: alpha(k.ink, 0.64) },
    allTitle: { ...text.display, color: k.ink },
    allMeta: { ...text.caption, ...tabular, color: alpha(k.ink, 0.8) },
    allPlay: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: k.ink, alignItems: 'center', justifyContent: 'center' },
    section: { gap: space[4] },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    sectionMeta: { ...text.overline, ...tabular, color: c.faint },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[6] },
    tile: { gap: space[2] },
    name: { ...text.bodyBold, color: c.ink },
    meta: { ...text.caption, ...tabular, color: c.muted },
    live: { position: 'absolute', right: space[3], top: space[3], width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
    newTile: { borderRadius: radius.xl, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    newPlus: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  });
};
