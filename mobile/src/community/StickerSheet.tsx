import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import PuxaEngine from '../../modules/puxa-engine';
import { Button } from '../components/Button';
import { Sheet } from '../components/music/Sheet';
import { useToast } from '../components/Toasts';
import { Hairline, Overline } from '../components/ui';
import { putFolder, roomIn, useFolders } from '../stickers/folders';
import { control, gutter, type Palette, radius, space, text, usePalette } from '../theme';
import { addSticker } from './install';
import { useDB } from './store';
import type { Pack, Sticker } from './types';
import { StickerImage, still } from './ui';
import { useInstaller } from './useInstaller';

/**
 * A prévia de uma figurinha do acervo: grande, sobre o fundo de conversa, com o pacote de onde
 * ela vem. Dá para pôr só ela numa pasta sua, ou o pacote inteiro no WhatsApp.
 */
export function StickerSheet({ item, onClose }: { item: { sticker: Sticker; pack: Pack } | null; onClose: () => void }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const toast = useToast();
  const folders = useFolders();
  const db = useDB();
  const { install, busy } = useInstaller();
  const [adding, setAdding] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  // Guarda o último item: a folha some com ele na tela enquanto desce
  const [shown, setShown] = useState(item);
  if (item && item !== shown) setShown(item);
  const cur = item ?? shown;
  if (!cur) return null;
  const { sticker, pack } = cur;
  const author = db.users.find((u) => u.id === pack.author);
  const kind = pack.animated ? 'animadas' : 'paradas';

  const addTo = async (folderId: string) => {
    const f = folders?.find((x) => x.id === folderId);
    if (!f || adding) return;
    setAdding(folderId);
    try {
      const next = await addSticker(f, pack, sticker);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show({ title: `Na pasta ${next.name}`, tone: 'success', action: { label: 'Ver', onPress: () => router.push(`/figurinhas/${next.id}`) } });
      onClose();
    } catch (e) {
      toast.show({ title: 'Não deu para adicionar', body: (e as Error).message, tone: 'error' });
    } finally {
      setAdding(null);
    }
  };

  const create = async () => {
    if (!name.trim() || adding) return;
    setAdding('nova');
    try {
      const f = await PuxaEngine.stickerFolderCreate(name);
      putFolder(f);
      setNaming(false);
      setName('');
      setAdding(null);
      await addTo(f.id);
    } catch (e) {
      toast.show({ title: 'Não deu para criar a pasta', body: (e as Error).message, tone: 'error' });
      setAdding(null);
    }
  };

  return (
    <Sheet visible={!!item} onClose={onClose} label="Figurinha">
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.stage}>
          <StickerImage img={sticker.img} size={224} />
        </View>
        <Pressable
          onPress={() => {
            onClose();
            router.push(`/pacote/${pack.id}`);
          }}
          style={({ pressed }) => [s.pack, pressed && { opacity: 0.72 }]}
          accessibilityRole="button"
          accessibilityLabel={`Do pacote ${pack.name}, de ${author?.name ?? 'alguém'}. Abrir o pacote`}
        >
          <View style={s.tray}>
            <StickerImage img={still(pack.stickers[0])} size={32} />
          </View>
          <View style={s.packText}>
            <Text style={s.packName} numberOfLines={1}>
              {pack.name}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              @{author?.username ?? 'alguem'} · {pack.stickers.length} figurinhas
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={c.muted} />
        </Pressable>

        <View style={s.section}>
          <Overline>Pôr numa pasta sua</Overline>
          <View style={s.group}>
            {folders === null ? (
              <View style={s.loading}>
                <ActivityIndicator color={c.muted} />
              </View>
            ) : (
              folders.map((f, i) => {
                const has = f.stickers.some((x) => x.label === sticker.id);
                const full = roomIn(f, pack.animated) <= 0;
                return (
                  <View key={f.id}>
                    {i > 0 ? <Hairline /> : null}
                    <Pressable
                      onPress={() => addTo(f.id)}
                      disabled={has || full || !!adding}
                      style={({ pressed }) => [s.folder, pressed && { backgroundColor: c.sunken }]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: has || full, busy: adding === f.id }}
                      accessibilityLabel={`${f.name}${has ? ', já está nela' : full ? `, cheia de figurinhas ${kind}` : ''}`}
                    >
                      <Feather name="folder" size={20} color={has || full ? c.faint : c.ink} />
                      <View style={s.packText}>
                        <Text style={[s.folderName, (has || full) && { color: c.muted }]} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Text style={s.meta}>{has ? 'Já está nesta pasta' : full ? `Sem espaço para ${kind}` : `${f.stickers.length} figurinhas`}</Text>
                      </View>
                      {adding === f.id ? <ActivityIndicator color={c.accentInk} /> : has ? <Feather name="check" size={20} color={c.successInk} /> : <Feather name="plus" size={20} color={full ? c.faint : c.accentInk} />}
                    </Pressable>
                  </View>
                );
              })
            )}
            <Hairline />
            {naming ? (
              <View style={s.newRow}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  placeholder="Nome da pasta"
                  placeholderTextColor={c.muted}
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={create}
                  selectionColor={c.accent}
                  style={s.input}
                  accessibilityLabel="Nome da nova pasta"
                />
                <Button size="sm" label="Criar" busy={adding === 'nova'} disabled={!name.trim()} onPress={create} />
              </View>
            ) : (
              <Pressable onPress={() => setNaming(true)} style={({ pressed }) => [s.folder, pressed && { backgroundColor: c.sunken }]} accessibilityRole="button" accessibilityLabel="Nova pasta">
                <Feather name="folder-plus" size={20} color={c.accentInk} />
                <Text style={[s.folderName, { color: c.accentInk }]}>Nova pasta</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Button icon="plus" label="Pacote inteiro no WhatsApp" busy={busy === pack.id} onPress={() => install(pack)} />
      </View>
    </Sheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    body: { paddingHorizontal: gutter, paddingBottom: space[4], gap: space[4] },
    stage: { height: 256, borderRadius: radius.xl, backgroundColor: c.chat, alignItems: 'center', justifyContent: 'center' },
    pack: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    tray: { width: control.sm, height: control.sm, borderRadius: radius.md, backgroundColor: c.chat, alignItems: 'center', justifyContent: 'center' },
    packText: { flex: 1, minWidth: 0 },
    packName: { ...text.bodyBold, color: c.ink },
    meta: { ...text.caption, color: c.muted },
    section: { gap: space[3] },
    group: { borderRadius: radius.lg, backgroundColor: c.dark ? c.surface : c.bg, overflow: 'hidden' },
    loading: { height: control.lg, alignItems: 'center', justifyContent: 'center' },
    folder: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: control.lg, paddingHorizontal: space[4], paddingVertical: space[2] },
    folderName: { ...text.bodyBold, color: c.ink },
    newRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[2], paddingLeft: space[4] },
    input: { ...text.body, flex: 1, minHeight: control.sm, color: c.ink },
    footer: { paddingHorizontal: gutter, paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong },
  });
