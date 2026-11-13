import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../../playlist/colors';
import { addToList, ALL_NAME, createList, removeFromList, useLists } from '../../playlist/lists';
import { gutter, radius, space, text, usePalette } from '../../theme';
import { Button } from '../Button';
import { PlaylistCover } from './Cover';
import { ListEditor } from './ListEditor';
import { Sheet } from './Sheet';

/**
 * "Salvar em": a música já está na biblioteca (Todas as músicas); aqui ela entra ou sai das
 * playlists com um toque, e dá para criar uma nova ali mesmo.
 */
export function ListPicker({ trackId, title, onClose, onOpen }: { trackId: string | null; title: string; onClose: () => void; onOpen?: (listId: string) => void }) {
  const c = usePalette();
  const lists = useLists();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Sheet visible={!!trackId && !creating} onClose={onClose} label="Salvar em playlist">
        <View style={s.head}>
          <Text style={[s.title, { color: c.ink }]} accessibilityRole="header">
            Salvar em
          </Text>
          <Text style={[s.sub, { color: c.muted }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <ScrollView contentContainerStyle={s.list} bounces={false}>
          <View style={s.row} accessibilityLabel={`${ALL_NAME}: a música sempre fica aqui`}>
            <PlaylistCover name="Todas" color="grafite" size={48} radius={radius.md} />
            <View style={s.rowText}>
              <Text style={[s.name, { color: c.ink }]}>{ALL_NAME}</Text>
              <Text style={[s.meta, { color: c.muted }]}>Sempre fica aqui</Text>
            </View>
            <View style={[s.check, { backgroundColor: c.sunken }]}>
              <Feather name="check" size={16} color={c.muted} />
            </View>
          </View>
          {lists.map((p) => {
            const on = !!trackId && p.trackIds.includes(trackId);
            const k = COLORS[p.color];
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  if (!trackId) return;
                  Haptics.selectionAsync().catch(() => {});
                  if (on) removeFromList(p.id, trackId);
                  else addToList(p.id, [trackId]);
                }}
                onLongPress={onOpen ? () => onOpen(p.id) : undefined}
                android_ripple={{ color: c.sunken }}
                style={s.row}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.name}, ${p.trackIds.length} músicas`}
              >
                <PlaylistCover name={p.name} color={p.color} size={48} radius={radius.md} image={p.cover} />
                <View style={s.rowText}>
                  <Text style={[s.name, { color: c.ink }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[s.meta, { color: c.muted }]}>{p.trackIds.length === 1 ? '1 música' : `${p.trackIds.length} músicas`}</Text>
                </View>
                <View style={[s.check, on ? { backgroundColor: k.bg } : { borderWidth: 2, borderColor: c.lineStrong }]}>{on ? <Feather name="check" size={16} color={k.ink} /> : null}</View>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setCreating(true)} android_ripple={{ color: c.sunken }} style={s.row} accessibilityRole="button" accessibilityLabel="Nova playlist">
            <View style={[s.newArt, { backgroundColor: c.accentSoft }]}>
              <Feather name="plus" size={20} color={c.accentInk} />
            </View>
            <Text style={[s.name, { color: c.ink, flex: 1 }]}>Nova playlist</Text>
          </Pressable>
        </ScrollView>
        <View style={s.foot}>
          <Button tone="accent" label="Pronto" onPress={onClose} />
        </View>
      </Sheet>
      <ListEditor
        visible={creating}
        onClose={() => setCreating(false)}
        onSave={(name, color, cover) => {
          const p = createList(name, color, cover);
          if (trackId) addToList(p.id, [trackId]);
          setCreating(false);
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: gutter, paddingBottom: space[2] },
  title: { ...text.title },
  sub: { ...text.caption },
  list: { paddingHorizontal: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.lg },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...text.bodyBold },
  meta: { ...text.caption },
  check: { width: 24, height: 24, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  newArt: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  foot: { paddingHorizontal: gutter, paddingTop: space[3] },
});
