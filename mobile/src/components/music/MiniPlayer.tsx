import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../playlist/colors';
import { ALL, listLook } from '../../playlist/lists';
import { next, toggle, usePlayer } from '../../playlist/player';
import { useTracks } from '../../playlist/store';
import { alpha, control, gutter, hit, radius, space, text, usePalette } from '../../theme';
import { PlayIcon } from '../ui';
import { imageUri, TrackArt } from './Cover';
import { NowPlaying } from './NowPlaying';

/**
 * O player pequeno, flutuando embaixo da tela de músicas, na cor da playlist que está tocando.
 * Tocar nele abre o player inteiro, com a letra. Os cantos são concêntricos: 24 por fora,
 * 16 na capa, com 8 de folga entre os dois.
 */
export function MiniPlayer({ onHeight }: { onHeight?: (h: number) => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const p = usePlayer();
  const tracks = useTracks();
  const [open, setOpen] = useState(false);
  const t = tracks.find((x) => x.id === p.trackId) ?? null;
  if (!t) return null;
  const look = listLook(p.listId ?? ALL);
  const k = COLORS[look.color];
  const progress = p.duration > 0 ? Math.min(1, p.time / p.duration) : 0;
  const bottom = insets.bottom + space[4];
  return (
    <>
      <View style={[s.wrap, { bottom }]} onLayout={(e) => onHeight?.(Math.round(e.nativeEvent.layout.height + bottom))}>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [s.bar, { backgroundColor: k.bg, boxShadow: c.shadow2 }, pressed && { opacity: 0.94 }]}
          accessibilityRole="button"
          accessibilityLabel={`Tocando ${t.title}. Abrir o player`}
        >
          <TrackArt uri={imageUri(t.thumbnail ?? look.cover)} size={48} radius={radius.lg} tint={k.deep} />
          <View style={s.text}>
            <Text style={[s.title, { color: k.ink }]} numberOfLines={1}>
              {t.title}
            </Text>
            <Text style={[s.artist, { color: alpha(k.ink, 0.8) }]} numberOfLines={1}>
              {p.error ? p.error : t.artist || 'Puxa'}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              toggle();
            }}
            hitSlop={hit(control.md)}
            style={({ pressed }) => [s.btn, pressed && { backgroundColor: alpha(k.ink, 0.16) }]}
            accessibilityRole="button"
            accessibilityLabel={p.playing ? 'Pausar' : 'Tocar'}
          >
            {p.buffering && p.playing ? <ActivityIndicator color={k.ink} size="small" /> : <PlayIcon playing={p.playing} size={24} color={k.ink} />}
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              next();
            }}
            style={({ pressed }) => [s.btn, pressed && { backgroundColor: alpha(k.ink, 0.16) }]}
            accessibilityRole="button"
            accessibilityLabel="Próxima"
          >
            <Feather name="skip-forward" size={20} color={k.ink} />
          </Pressable>
          <View pointerEvents="none" style={[s.track, { backgroundColor: alpha(k.ink, 0.24) }]}>
            <View style={[s.fill, { width: `${progress * 100}%`, backgroundColor: k.ink }]} />
          </View>
        </Pressable>
      </View>
      <NowPlaying visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: space[4], right: space[4] },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[2], borderRadius: radius.xl, overflow: 'hidden' },
  text: { flex: 1, minWidth: 0 },
  title: { ...text.bodyBold },
  artist: { ...text.caption },
  btn: { width: control.md, height: control.md, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: gutter, right: gutter, bottom: 0, height: 2, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: 2 },
});
