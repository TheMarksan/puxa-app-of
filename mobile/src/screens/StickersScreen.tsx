import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine, { type StickerFolder } from '../../modules/puxa-engine';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal } from '../components/SheetParts';
import { useToast } from '../components/Toasts';
import { EmptyState, Group, Hairline, IconButton } from '../components/ui';
import { toUri } from '../editor/media';
import { pendingPacks, putFolder, refreshFolders, useFolders } from '../stickers/folders';
import { useDeviceSticker } from '../stickers/fromDevice';
import { control, gutter, type Palette, radius, space, text, usePalette } from '../theme';

/** As pastas de figurinhas. Cada pasta abre na própria tela, com as figurinhas e o atalho do WhatsApp. */
export function StickersScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const folders = useFolders();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const device = useDeviceSticker();

  useFocusEffect(
    useCallback(() => {
      refreshFolders().catch(() => {});
    }, []),
  );

  const create = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const f = await PuxaEngine.stickerFolderCreate(name);
      putFolder(f);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNaming(false);
      setName('');
    } catch (e) {
      toast.show({ title: 'Não deu para criar a pasta', body: (e as Error).message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const total = folders?.reduce((n, f) => n + f.stickers.length, 0) ?? 0;
  const empty = !!folders && total === 0 && folders.length <= 1;

  const subtitle = !folders ? undefined : empty ? 'Suas figurinhas do WhatsApp moram aqui.' : `${total} ${total === 1 ? 'figurinha' : 'figurinhas'} em ${folders.length} ${folders.length === 1 ? 'pasta' : 'pastas'}`;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + space[16] + space[8] }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Figurinhas" subtitle={subtitle} right={<IconButton icon="folder-plus" label="Nova pasta" onPress={() => setNaming((v) => !v)} />} />
        <View style={s.body}>
          {naming ? (
            <Reveal>
              <View style={s.newRow}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  placeholder="Nome da pasta (Memes, Família…)"
                  placeholderTextColor={c.muted}
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={create}
                  selectionColor={c.accent}
                  style={s.input}
                  accessibilityLabel="Nome da nova pasta"
                />
                <Button size="md" label="Criar" busy={saving} disabled={!name.trim()} onPress={create} />
              </View>
            </Reveal>
          ) : null}

          {empty ? (
            <EmptyState icon="smile" title="Nenhuma figurinha ainda" body="Crie com uma foto ou um vídeo do celular, puxe de um link no Início ou adicione um pacote do acervo." />
          ) : null}

          {folders && !empty ? (
            <Group>
              {folders.map((f, i) => (
                <View key={f.id}>
                  {i > 0 ? <Hairline inset={space[3] + 64 + space[4]} /> : null}
                  <FolderRow f={f} c={c} s={s} onPress={() => router.push(`/figurinhas/${f.id}`)} />
                </View>
              ))}
            </Group>
          ) : null}
        </View>
      </ScrollView>
      {/* Criar fica sempre embaixo, ao alcance do polegar */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + space[4] }]}>
        <Button icon="image" label="Criar com foto ou vídeo" busy={device.busy} onPress={() => device.start()} />
      </View>
      {device.sheet}
    </View>
  );
}

function FolderRow({ f, c, s, onPress }: { f: StickerFolder; c: Palette; s: Styles; onPress: () => void }) {
  const still = f.stickers.filter((x) => !x.animated).length;
  const moving = f.stickers.length - still;
  const meta = f.stickers.length ? [still ? `${still} ${still === 1 ? 'parada' : 'paradas'}` : null, moving ? `${moving} ${moving === 1 ? 'animada' : 'animadas'}` : null].filter(Boolean).join(' · ') : 'Vazia';
  const pending = pendingPacks(f).length > 0;
  const onWhatsApp = f.stickers.length > 0 && !pending;
  const cover = f.stickers.slice(0, 4);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.folder, pressed && { backgroundColor: c.sunken }]}
      accessibilityRole="button"
      accessibilityLabel={`Pasta ${f.name}. ${meta}${onWhatsApp ? '. No WhatsApp' : ''}`}
    >
      <View style={[s.cover, { backgroundColor: c.chat }]}>
        {cover.length ? (
          cover.map((st) => <Image key={st.file} source={{ uri: toUri(st.path) }} style={cover.length === 1 ? s.coverOne : s.coverTile} resizeMode="contain" />)
        ) : (
          <View style={s.coverEmpty}>
            <Feather name="folder" size={24} color={c.muted} />
          </View>
        )}
      </View>
      <View style={s.folderText}>
        <Text style={s.folderName} numberOfLines={1}>
          {f.name}
        </Text>
        <Text style={s.folderMeta} numberOfLines={1}>
          {meta}
        </Text>
        {onWhatsApp ? (
          <View style={s.added}>
            <Feather name="check" size={12} color={c.successInk} />
            <Text style={s.addedText}>No WhatsApp</Text>
          </View>
        ) : null}
      </View>
      <Feather name="chevron-right" size={20} color={c.muted} />
    </Pressable>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { flexGrow: 1 },
    body: { paddingHorizontal: gutter, gap: space[4] },
    bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: gutter, paddingTop: space[3], backgroundColor: c.bg },
    newRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    input: { ...text.body, flex: 1, minHeight: control.md, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: c.sunken, color: c.ink },
    folder: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[3] },
    cover: { width: 64, height: 64, borderRadius: radius.lg, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignContent: 'center', justifyContent: 'center', overflow: 'hidden', padding: space[1] },
    coverEmpty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    coverTile: { width: 28, height: 28 },
    coverOne: { width: 56, height: 56 },
    folderText: { flex: 1, minWidth: 0 },
    folderName: { ...text.bodyBold, color: c.ink },
    folderMeta: { ...text.caption, color: c.muted },
    added: { flexDirection: 'row', alignItems: 'center', gap: space[1], alignSelf: 'flex-start', paddingHorizontal: space[2], height: 24, borderRadius: radius.full, backgroundColor: c.successSoft, marginTop: space[1] },
    addedText: { ...text.captionBold, lineHeight: 16, color: c.successInk },
  });
