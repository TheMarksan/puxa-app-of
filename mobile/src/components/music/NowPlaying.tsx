import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clock } from '../../format';
import { COLORS } from '../../playlist/colors';
import { ALL, listLook } from '../../playlist/lists';
import { useLyrics } from '../../playlist/lyricsFetch';
import { cycleLoop, dismissError, next, previous, seek, toggle, toggleShuffle } from '../../playlist/player';
import { useTracks } from '../../playlist/store';
import { font } from '../../theme';
import { imageUri, PlaylistCover, TrackArt } from './Cover';
import { ListPicker } from './ListPicker';
import { LyricsCard, LyricsFull, LyricsSearch } from './LyricsView';
import { SeekBar, useSmoothTime } from './Seek';

const W = '#FFFFFF';
const W70 = 'rgba(255,255,255,0.72)';
const W25 = 'rgba(255,255,255,0.25)';

/**
 * O player em tela cheia: fundo escuro na cor da playlist, capa grande, controles e a letra.
 * A letra abre por cima, na cor da playlist, e segue a música.
 */
export function NowPlaying({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tracks = useTracks();
  const { time, p } = useSmoothTime();
  const [drag, setDrag] = useState<number | null>(null);
  const [view, setView] = useState<'main' | 'lyrics' | 'search'>('main');
  const [req, setReq] = useState({ n: 0, refresh: false });
  const [saving, setSaving] = useState(false);
  const t = tracks.find((x) => x.id === p.trackId) ?? null;
  const lyrics = useLyrics(visible ? t : null, req);
  const look = listLook(p.listId ?? ALL);
  const k = COLORS[look.color];
  const card = { bg: k.bg, ink: k.ink };
  const duration = p.duration || t?.duration || 0;
  const shown = drag ?? time;
  const art = Math.min(width - 56, 340);

  const close = () => {
    setView('main');
    onClose();
  };

  if (!t) return null;
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (view !== 'main' ? setView('main') : close())}>
      <View style={[st.root, { backgroundColor: view === 'main' ? k.deep : k.bg }]}>
        {view === 'main' ? (
          <>
            <View pointerEvents="none" style={[st.glow, { opacity: 0.28, backgroundColor: k.bg, width: width * 2, height: width * 2, borderRadius: width * 2, left: -width * 0.5, top: -width * 1.05 }]} />
            <View pointerEvents="none" style={[st.glow, { opacity: 0.45, backgroundColor: k.bg, width: width * 1.5, height: width * 1.5, borderRadius: width * 1.5, left: -width * 0.25, top: -width * 0.9 }]} />
          </>
        ) : null}
        <View style={[st.top, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => (view !== 'main' ? setView('main') : close())} hitSlop={8} style={st.iconBtn} accessibilityRole="button" accessibilityLabel={view !== 'main' ? 'Voltar ao player' : 'Fechar o player'}>
            <Feather name="chevron-down" size={28} color={view === 'main' ? W : k.ink} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[st.from, { color: view === 'main' ? W70 : k.ink }]}>{view === 'main' ? 'TOCANDO DE' : t.artist.toUpperCase() || 'LETRA'}</Text>
            <Text style={[st.fromName, { color: view === 'main' ? W : k.ink }]} numberOfLines={1}>
              {view === 'main' ? look.name : t.title}
            </Text>
          </View>
          <Pressable onPress={() => setSaving(true)} hitSlop={8} style={st.iconBtn} accessibilityRole="button" accessibilityLabel="Salvar em playlist">
            <Feather name="plus-circle" size={24} color={view === 'main' ? W : k.ink} />
          </Pressable>
        </View>

        {view === 'search' ? (
          <LyricsSearch
            track={t}
            look={card}
            onClose={() => setView(lyrics.status === 'ready' ? 'lyrics' : 'main')}
            onChosen={() => {
              setReq((r) => ({ n: r.n + 1, refresh: false }));
              setView('lyrics');
            }}
          />
        ) : view === 'lyrics' && lyrics.status === 'ready' ? (
          <View style={{ flex: 1 }}>
            <LyricsFull lyrics={lyrics.lyrics} time={time} look={card} onSearch={() => setView('search')} />
            <View style={[st.lyricsBar, { paddingBottom: insets.bottom + 14, backgroundColor: k.bg }]}>
              <SeekBar value={shown} max={duration} onScrub={setDrag} onSeek={(v) => { setDrag(null); seek(v); }} track={k.ink === W ? W25 : 'rgba(0,0,0,0.2)'} fill={k.ink} thumb={12} />
              <View style={st.lyricsCtrls}>
                <Text style={[st.time, { color: k.ink }]}>{clock(shown)}</Text>
                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); toggle(); }} style={[st.smallPlay, { backgroundColor: k.ink }]} accessibilityRole="button" accessibilityLabel={p.playing ? 'Pausar' : 'Tocar'}>
                  <Feather name={p.playing ? 'pause' : 'play'} size={22} color={k.bg} style={p.playing ? null : { marginLeft: 2 }} />
                </Pressable>
                <Text style={[st.time, { color: k.ink }]}>{duration ? clock(duration) : '--:--'}</Text>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
            <View style={[st.artWrap, { width: art, height: art }]}>
              {t.thumbnail ? <TrackArt uri={imageUri(t.thumbnail)} size={art} radius={22} tint={k.bg} /> : <PlaylistCover name={t.title} color={look.color} size={art} radius={22} image={look.cover} />}
            </View>
            <View style={st.titles}>
              <Text style={st.title} numberOfLines={2}>
                {t.title}
              </Text>
              <Text style={st.artist} numberOfLines={1}>
                {t.artist || 'Puxa'}
              </Text>
            </View>
            {p.error ? (
              <Pressable onPress={dismissError} style={st.error} accessibilityRole="button" accessibilityLabel={`${p.error} Toque para fechar.`}>
                <Feather name="alert-circle" size={16} color={W} />
                <Text style={st.errorText}>{p.error}</Text>
                <Feather name="x" size={16} color={W70} />
              </Pressable>
            ) : null}
            <View>
              <SeekBar value={shown} max={duration} onScrub={setDrag} onSeek={(v) => { setDrag(null); seek(v); }} track={W25} fill={W} />
              <View style={st.times}>
                <Text style={st.time}>{clock(shown)}</Text>
                <Text style={st.time}>{duration ? `-${clock(Math.max(0, duration - shown))}` : '--:--'}</Text>
              </View>
            </View>
            <View style={st.controls}>
              <Ctrl icon="shuffle" label={p.shuffle ? 'Aleatório: ligado' : 'Aleatório: desligado'} on={p.shuffle} dotColor={k.bg} onPress={toggleShuffle} />
              <Ctrl icon="skip-back" label="Anterior" size={30} onPress={previous} />
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  toggle();
                }}
                style={({ pressed }) => [st.play, pressed && { transform: [{ scale: 0.94 }] }]}
                accessibilityRole="button"
                accessibilityLabel={p.playing ? 'Pausar' : 'Tocar'}
              >
                {p.buffering && p.playing ? <ActivityIndicator color={k.deep} /> : <Feather name={p.playing ? 'pause' : 'play'} size={30} color={k.deep} style={p.playing ? null : { marginLeft: 3 }} />}
              </Pressable>
              <Ctrl icon="skip-forward" label="Próxima" size={30} onPress={next} />
              <Ctrl
                icon="repeat"
                label={p.loop === 'all' ? 'Repetir: a lista' : p.loop === 'single' ? 'Repetir: esta música' : 'Repetir: desligado'}
                on={p.loop !== 'none'}
                badge={p.loop === 'single' ? '1' : undefined}
                dotColor={k.bg}
                onPress={cycleLoop}
              />
            </View>
            <LyricsCard
              state={lyrics}
              time={time}
              look={card}
              onOpen={() => setView('lyrics')}
              onSearch={() => setView('search')}
              onRetry={() => setReq((r) => ({ n: r.n + 1, refresh: true }))}
            />
          </ScrollView>
        )}
      </View>
      <ListPicker trackId={saving ? t.id : null} title={t.title} onClose={() => setSaving(false)} />
    </Modal>
  );
}

function Ctrl({ icon, label, onPress, on, badge, size = 22, dotColor }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; on?: boolean; badge?: string; size?: number; dotColor?: string }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => [st.ctrl, pressed && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={on != null ? { selected: on } : undefined}
    >
      <Feather name={icon} size={size} color={on === false ? W70 : W} />
      {badge ? <Text style={st.badge}>{badge}</Text> : null}
      {on ? <View style={[st.dot, { backgroundColor: dotColor === '#2B2F36' ? W : dotColor }]} /> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  glow: { position: 'absolute' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6, gap: 8 },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  from: { fontFamily: font.semibold, fontSize: 11, letterSpacing: 1.4 },
  fromName: { fontFamily: font.bold, fontSize: 15, marginTop: 1 },
  body: { paddingHorizontal: 28, paddingTop: 18, gap: 22 },
  artWrap: { alignSelf: 'center', borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 18 },
  titles: { gap: 4 },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, color: W, letterSpacing: -0.4 },
  artist: { fontFamily: font.medium, fontSize: 16, color: W70 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.3)' },
  errorText: { flex: 1, fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: W },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
  time: { fontFamily: font.medium, fontSize: 12, color: W70, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -6 },
  ctrl: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 9, right: 9, fontFamily: font.bold, fontSize: 10, color: W },
  dot: { position: 'absolute', bottom: 6, width: 5, height: 5, borderRadius: 3 },
  play: { width: 74, height: 74, borderRadius: 37, backgroundColor: W, alignItems: 'center', justifyContent: 'center' },
  lyricsBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 10 },
  lyricsCtrls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallPlay: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
