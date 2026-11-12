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
import { font, type Palette, usePalette } from '../theme';

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
  const toastBottom = hasPlayer && miniH ? miniH + 8 : insets.bottom + 16;
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => toast.setBottomInset(toastBottom), 60);
      return () => clearTimeout(t);
    }, [toast, toastBottom]),
  );

  const tile = Math.floor((width - 40 - 14) / 2);
  const ready = tracks.filter((t) => t.status === 'ready');
  const busy = tracks.filter((t) => t.status === 'queued' || t.status === 'downloading').length;

  return (
    <View style={s.root}>
      <ScreenHeader
        title="Playlists"
        right={
          <Pressable onPress={() => setCreating(true)} hitSlop={6} style={({ pressed }) => [s.headBtn, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel="Nova playlist">
            <Feather name="plus" size={24} color={c.ink} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: (hasPlayer ? 110 : 32) + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <AddLinks tint={c.accent} tintInk={c.onAccent} />

        {/* A biblioteca inteira: uma faixa larga, como um pôster deitado */}
        <Pressable onPress={() => router.push(`/playlist/${ALL}`)} style={({ pressed }) => [s.all, pressed && { transform: [{ scale: 0.99 }] }]} accessibilityRole="button" accessibilityLabel={`${ALL_NAME}, ${count(ready.length)}`}>
          <View style={StyleSheet.absoluteFill}>
            {[0.9, 0.62, 0.34].map((f, i) => (
              <View key={i} style={[s.allRing, { width: 240 * f, height: 240 * f, right: -60 * f - 10, top: -70 * f }]} />
            ))}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.allKicker}>BIBLIOTECA</Text>
            <Text style={s.allTitle}>{ALL_NAME}</Text>
            <Text style={s.allMeta}>
              {count(ready.length)}
              {total(tracks) ? ` · ${clock(total(tracks))}` : ''}
              {busy ? ` · ${busy} baixando` : ''}
            </Text>
          </View>
          {ready.length ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                playList(ALL);
              }}
              hitSlop={6}
              style={({ pressed }) => [s.allPlay, pressed && { transform: [{ scale: 0.94 }] }]}
              accessibilityRole="button"
              accessibilityLabel={`Tocar ${ALL_NAME}`}
            >
              <Feather name="play" size={22} color={COLORS.grafite.bg} style={{ marginLeft: 3 }} />
            </Pressable>
          ) : null}
        </Pressable>

        <View style={s.sectionHead}>
          <Text style={s.section}>Suas playlists</Text>
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
                style={({ pressed }) => [{ width: tile, gap: 8 }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${count(ts.length)}${playing ? ', tocando' : ''}`}
              >
                <View>
                  <PlaylistCover name={p.name} color={p.color} size={tile} radius={22} image={p.cover} />
                  {playing ? (
                    <View style={[s.live, { backgroundColor: COLORS[p.color].ink }]}>
                      <Feather name="volume-2" size={14} color={COLORS[p.color].bg} />
                    </View>
                  ) : null}
                </View>
                <View style={{ paddingHorizontal: 2 }}>
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
          <Pressable onPress={() => setCreating(true)} style={({ pressed }) => [{ width: tile, gap: 8 }, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Nova playlist">
            <View style={[s.newTile, { width: tile, height: tile }]}>
              <View style={s.newPlus}>
                <Feather name="plus" size={26} color={c.ink} />
              </View>
              <Text style={s.newHint}>{lists.length ? 'Nova playlist' : 'Treino, Estudos,\nViagem…'}</Text>
            </View>
            <Text style={[s.name, { paddingHorizontal: 2 }]}>Nova playlist</Text>
          </Pressable>
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    headBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingHorizontal: 20, paddingTop: 2, gap: 18 },
    all: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, minHeight: 132, padding: 18, borderRadius: 24, backgroundColor: COLORS.grafite.bg, overflow: 'hidden' },
    allRing: { position: 'absolute', borderRadius: 200, borderWidth: 9, borderColor: 'rgba(255,255,255,0.08)' },
    allKicker: { fontFamily: 'Anton_400Regular', fontSize: 12, letterSpacing: 1.6, color: 'rgba(255,255,255,0.6)' },
    allTitle: { fontFamily: 'Anton_400Regular', fontSize: 30, lineHeight: 36, color: '#FFFFFF', textTransform: 'uppercase', marginTop: 2 },
    allMeta: { fontFamily: font.medium, fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
    allPlay: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
    section: { fontFamily: font.bold, fontSize: 20, color: c.ink, letterSpacing: -0.3 },
    sectionMeta: { fontFamily: font.semibold, fontSize: 15, color: c.muted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 20 },
    name: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
    meta: { fontFamily: font.regular, fontSize: 13, color: c.muted, marginTop: 1 },
    live: { position: 'absolute', right: 10, top: 10, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    newTile: { borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 10 },
    newPlus: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.hover, alignItems: 'center', justifyContent: 'center' },
    newHint: { fontFamily: font.medium, fontSize: 13, color: c.muted, textAlign: 'center', lineHeight: 18 },
  });
