import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../../playlist/colors';
import { ALL, listLook } from '../../playlist/lists';
import { next, toggle, usePlayer } from '../../playlist/player';
import { useTracks } from '../../playlist/store';
import { font } from '../../theme';
import { imageUri, TrackArt } from './Cover';
import { NowPlaying } from './NowPlaying';

/**
 * O player pequeno, flutuando embaixo da tela de músicas, na cor da playlist que está tocando.
 * Tocar nele abre o player inteiro, com a letra.
 */
export function MiniPlayer({ onHeight }: { onHeight?: (h: number) => void }) {
  const insets = useSafeAreaInsets();
  const p = usePlayer();
  const tracks = useTracks();
  const [open, setOpen] = useState(false);
  const t = tracks.find((x) => x.id === p.trackId) ?? null;
  if (!t) return null;
  const k = COLORS[listLook(p.listId ?? ALL).color];
  const sub = k.ink === '#FFFFFF' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.62)';
  const progress = p.duration > 0 ? Math.min(1, p.time / p.duration) : 0;
  return (
    <>
      <View style={[s.wrap, { bottom: insets.bottom + 10 }]} onLayout={(e) => onHeight?.(Math.round(e.nativeEvent.layout.height + insets.bottom + 10))}>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [s.bar, { backgroundColor: k.bg }, pressed && { opacity: 0.94 }]}
          accessibilityRole="button"
          accessibilityLabel={`Tocando ${t.title}. Abrir o player`}
        >
          <TrackArt uri={imageUri(t.thumbnail)} size={44} radius={10} tint={k.deep} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.title, { color: k.ink }]} numberOfLines={1}>
              {t.title}
            </Text>
            <Text style={[s.artist, { color: sub }]} numberOfLines={1}>
              {p.error ? p.error : t.artist || 'Puxa'}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              toggle();
            }}
            hitSlop={6}
            style={s.btn}
            accessibilityRole="button"
            accessibilityLabel={p.playing ? 'Pausar' : 'Tocar'}
          >
            {p.buffering && p.playing ? <ActivityIndicator color={k.ink} size="small" /> : <Feather name={p.playing ? 'pause' : 'play'} size={24} color={k.ink} />}
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              next();
            }}
            hitSlop={6}
            style={s.btn}
            accessibilityRole="button"
            accessibilityLabel="Próxima"
          >
            <Feather name="skip-forward" size={22} color={k.ink} />
          </Pressable>
          <View pointerEvents="none" style={[s.track, { backgroundColor: k.ink === '#FFFFFF' ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.18)' }]}>
            <View style={{ width: `${progress * 100}%`, height: 3, backgroundColor: k.ink }} />
          </View>
        </Pressable>
      </View>
      <NowPlaying visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 8,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  title: { fontFamily: font.semibold, fontSize: 15 },
  artist: { fontFamily: font.regular, fontSize: 13, marginTop: 1 },
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: 12, right: 12, bottom: 0, height: 3, borderRadius: 2, overflow: 'hidden' },
});
