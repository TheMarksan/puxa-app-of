import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clock } from '../../format';
import type { Track } from '../../playlist/store';
import { font, usePalette } from '../../theme';
import { imageUri, TrackArt } from './Cover';
import { Sheet } from './Sheet';

export type TrackAction = 'save-to' | 'whatsapp' | 'share' | 'download' | 'up' | 'down' | 'remove' | 'delete' | 'retry';

/** O que dá para fazer com uma música (segurar a linha ou tocar nos três pontos). */
export function TrackActions({
  track,
  inPlaylist,
  canUp,
  canDown,
  tint,
  onClose,
  onAction,
}: {
  track: Track | null;
  /** Numa playlist (não em Todas): tirar daqui e apagar do celular são coisas diferentes. */
  inPlaylist: boolean;
  canUp: boolean;
  canDown: boolean;
  tint: string;
  onClose: () => void;
  onAction: (a: TrackAction, t: Track) => void;
}) {
  const c = usePalette();
  const t = track;
  const ready = t?.status === 'ready';
  // Apagar o arquivo pede um segundo toque
  const [armed, setArmed] = useState<string | null>(null);
  if (armed && armed !== t?.id) setArmed(null);
  const rows: { a: TrackAction; icon: keyof typeof Feather.glyphMap; label: string; tone?: string; show: boolean }[] = [
    { a: 'retry', icon: 'rotate-cw', label: 'Tentar baixar de novo', show: t?.status === 'error' },
    { a: 'save-to', icon: 'plus-circle', label: 'Salvar em playlist', show: true },
    { a: 'whatsapp', icon: 'send', label: 'Enviar no WhatsApp', tone: c.waInk, show: ready },
    { a: 'share', icon: 'share-2', label: 'Enviar para outros apps', show: ready },
    { a: 'download', icon: 'download', label: 'Salvar em Download/Puxa', show: ready },
    { a: 'up', icon: 'arrow-up', label: 'Subir na lista', show: canUp },
    { a: 'down', icon: 'arrow-down', label: 'Descer na lista', show: canDown },
    { a: 'remove', icon: 'minus-circle', label: 'Tirar desta playlist', show: inPlaylist },
    { a: 'delete', icon: 'trash-2', label: armed === t?.id ? 'Toque de novo para apagar' : 'Apagar do celular', tone: c.danger, show: true },
  ];
  return (
    <Sheet visible={!!t} onClose={onClose} label="Opções da música">
      {t ? (
        <View style={s.body}>
          <View style={s.head}>
            <TrackArt uri={imageUri(t.thumbnail)} size={52} radius={12} tint={tint} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.title, { color: c.ink }]} numberOfLines={2}>
                {t.title}
              </Text>
              <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
                {[t.artist, t.duration ? clock(t.duration) : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          <View style={[s.sep, { backgroundColor: c.line }]} />
          {rows
            .filter((r) => r.show)
            .map((r) => (
              <Pressable
                key={r.a}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (r.a === 'delete' && armed !== t.id) {
                    setArmed(t.id);
                    return;
                  }
                  onAction(r.a, t);
                }}
                android_ripple={{ color: c.hover }}
                style={s.row}
                accessibilityRole="button"
                accessibilityLabel={r.label}
              >
                <Feather name={r.icon} size={21} color={r.tone ?? c.ink} />
                <Text style={[s.label, { color: r.tone ?? c.ink }]}>{r.label}</Text>
              </Pressable>
            ))}
        </View>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  body: { paddingBottom: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontFamily: font.semibold, fontSize: 16, lineHeight: 21 },
  meta: { fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingHorizontal: 22 },
  label: { fontFamily: font.medium, fontSize: 16 },
});
