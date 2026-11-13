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
import { alpha, control, media, radius, space, tabular, text } from '../../theme';
import { imageUri, PlaylistCover, TrackArt } from './Cover';
import { ListPicker } from './ListPicker';
import { LyricsCard, LyricsFull, LyricsSearch } from './LyricsView';
import { SeekBar, useSmoothTime } from './Seek';
import { PlayIcon } from '../ui';

const W = media.on;
const W70 = media.onSoft;
const W25 = media.track;

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
  const [barH, setBarH] = useState(0);
  const t = tracks.find((x) => x.id === p.trackId) ?? null;
  const lyrics = useLyrics(visible ? t : null, req);
  const look = listLook(p.listId ?? ALL);
  const k = COLORS[look.color];
  const card = { bg: k.bg, ink: k.ink };
  const duration = p.duration || t?.duration || 0;
  const shown = drag ?? time;
  const art = Math.min(width - space[8] * 2, 336);

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
            <View pointerEvents="none" style={[st.glow, { opacity: 0.28, backgroundColor: k.bg, width: width * 2, height: width * 2, borderRadius: radius.full, left: -width * 0.5, top: -width * 1.05 }]} />
            <View pointerEvents="none" style={[st.glow, { opacity: 0.45, backgroundColor: k.bg, width: width * 1.5, height: width * 1.5, borderRadius: radius.full, left: -width * 0.25, top: -width * 0.9 }]} />
          </>
        ) : null}
        <View style={[st.top, { paddingTop: insets.top + space[2] }]}>
          <Pressable onPress={() => (view !== 'main' ? setView('main') : close())} hitSlop={8} style={st.iconBtn} accessibilityRole="button" accessibilityLabel={view !== 'main' ? 'Voltar ao player' : 'Fechar o player'}>
            <Feather name="chevron-down" size={24} color={view === 'main' ? W : k.ink} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[st.from, { color: view === 'main' ? W70 : alpha(k.ink, 0.8) }]} numberOfLines={1}>
              {view === 'main' ? 'Tocando de' : t.artist || 'Letra'}
            </Text>
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
            <LyricsFull lyrics={lyrics.lyrics} time={time} look={card} bottom={barH + space[12]} onSearch={() => setView('search')} />
            <View onLayout={(e) => setBarH(Math.round(e.nativeEvent.layout.height))} style={[st.lyricsBar, { paddingBottom: insets.bottom + space[4], backgroundColor: k.bg }]}>
              <SeekBar value={shown} max={duration} onScrub={setDrag} onSeek={(v) => { setDrag(null); seek(v); }} track={alpha(k.ink, 0.24)} fill={k.ink} thumb={12} />
              <View style={st.lyricsCtrls}>
                <Text style={[st.time, { color: k.ink }]}>{clock(shown)}</Text>
                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); toggle(); }} style={[st.smallPlay, { backgroundColor: k.ink }]} accessibilityRole="button" accessibilityLabel={p.playing ? 'Pausar' : 'Tocar'}>
                  <PlayIcon playing={p.playing} size={20} color={k.bg} />
                </Pressable>
                <Text style={[st.time, { color: k.ink }]}>{duration ? clock(duration) : '--:--'}</Text>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[st.body, { paddingBottom: insets.bottom + space[8] }]} showsVerticalScrollIndicator={false}>
            <View style={[st.artWrap, { width: art, height: art }]}>
              {t.thumbnail ? <TrackArt uri={imageUri(t.thumbnail)} size={art} radius={radius.xl} tint={k.bg} ink={k.ink} /> : <PlaylistCover name={t.title} color={look.color} size={art} radius={radius.xl} image={look.cover} />}
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
              <Ctrl icon="skip-back" label="Anterior" size={32} onPress={previous} />
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  toggle();
                }}
                style={({ pressed }) => [st.play, pressed && { transform: [{ scale: 0.94 }] }]}
                accessibilityRole="button"
                accessibilityLabel={p.playing ? 'Pausar' : 'Tocar'}
              >
                {p.buffering && p.playing ? <ActivityIndicator color={k.deep} /> : <PlayIcon playing={p.playing} size={32} color={k.deep} />}
              </Pressable>
              <Ctrl icon="skip-forward" label="Próxima" size={32} onPress={next} />
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

function Ctrl({ icon, label, onPress, on, badge, size = 24, dotColor }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; on?: boolean; badge?: string; size?: 24 | 32; dotColor?: string }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [st.ctrl, pressed && { backgroundColor: alpha(W, 0.12) }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={on != null ? { selected: on } : undefined}
    >
      <Feather name={icon} size={size} color={on === false ? W70 : W} />
      {badge ? <Text style={st.badge}>{badge}</Text> : null}
      {on ? <View style={[st.dot, { backgroundColor: dotColor === COLORS.grafite.bg ? W : dotColor }]} /> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  glow: { position: 'absolute' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingBottom: space[2], gap: space[2] },
  iconBtn: { width: control.md, height: control.md, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  from: { ...text.overline },
  fromName: { ...text.bodyBold },
  body: { paddingHorizontal: space[8], paddingTop: space[4], gap: space[6] },
  artWrap: { alignSelf: 'center', borderRadius: radius.xl, boxShadow: media.lift },
  titles: { gap: space[1] },
  title: { ...text.title, color: W },
  artist: { ...text.body, color: W70 },
  error: { flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.lg, backgroundColor: alpha(media.stage, 0.32) },
  errorText: { ...text.caption, flex: 1, color: W },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { ...text.caption, ...tabular, color: W70 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -space[2] },
  ctrl: { width: control.lg, height: control.lg, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  badge: { ...text.captionBold, position: 'absolute', top: space[2], right: space[2], color: W },
  dot: { position: 'absolute', bottom: space[1], width: 4, height: 4, borderRadius: radius.full },
  play: { width: 72, height: 72, borderRadius: radius.full, backgroundColor: W, alignItems: 'center', justifyContent: 'center' },
  lyricsBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space[6], paddingTop: space[3] },
  lyricsCtrls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallPlay: { width: control.lg, height: control.lg, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
