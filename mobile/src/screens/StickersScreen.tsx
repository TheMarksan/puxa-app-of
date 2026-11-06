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
import { CHAT_BG } from '../components/StickerPanel';
import { useToast } from '../components/Toasts';
import { toUri } from '../editor/media';
import { pendingPacks, putFolder, refreshFolders, useFolders } from '../stickers/folders';
import { font, type Palette, radius, usePalette } from '../theme';

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

  return (
    <View style={s.root}>
      <ScreenHeader
        title="Figurinhas"
        right={
          <Pressable
            onPress={() => setNaming((v) => !v)}
            hitSlop={8}
            style={({ pressed }) => [s.headBtn, pressed && { backgroundColor: c.hover }]}
            accessibilityRole="button"
            accessibilityLabel="Nova pasta"
          >
            <Feather name="folder-plus" size={20} color={c.ink} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        {naming ? (
          <Reveal>
            <View style={s.newCard}>
              <Text style={s.label} nativeID="new-folder-label">
                Nova pasta
              </Text>
              <View style={s.newRow}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  placeholder="Ex.: Memes, Família"
                  placeholderTextColor={c.disabledInk}
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={create}
                  selectionColor={c.accent}
                  style={s.input}
                  accessibilityLabelledBy="new-folder-label"
                />
                <Button tone="accent" compact label="Criar" busy={saving} disabled={!name.trim()} onPress={create} />
              </View>
            </View>
          </Reveal>
        ) : null}

        {empty ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Feather name="smile" size={28} color={c.accentInk} />
            </View>
            <Text style={s.emptyTitle}>Nenhuma figurinha ainda</Text>
            <Text style={s.emptyBody}>Cole um link no Baixar e toque em Figurinha.</Text>
            <Button tone="accent" icon="download" label="Ir para o Baixar" compact onPress={() => router.back()} />
          </View>
        ) : null}

        {folders && !empty
          ? folders.map((f) => <FolderRow key={f.id} f={f} c={c} s={s} onPress={() => router.push(`/figurinhas/${f.id}`)} />)
          : null}
      </ScrollView>
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
      android_ripple={{ color: c.hover }}
      style={({ pressed }) => [s.folder, pressed && { backgroundColor: c.hover }]}
      accessibilityRole="button"
      accessibilityLabel={`Pasta ${f.name}. ${meta}${onWhatsApp ? '. No WhatsApp' : ''}`}
    >
      <View style={[s.cover, { backgroundColor: c.dark ? CHAT_BG.dark : CHAT_BG.light }]}>
        {cover.length ? (
          cover.map((st) => <Image key={st.file} source={{ uri: toUri(st.path) }} style={cover.length === 1 ? s.coverOne : s.coverTile} resizeMode="contain" />)
        ) : (
          <Feather name="folder" size={26} color={c.muted} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={s.folderName} numberOfLines={1}>
          {f.name}
        </Text>
        <Text style={s.folderMeta} numberOfLines={1}>
          {meta}
        </Text>
        {onWhatsApp ? (
          <View style={s.added}>
            <Feather name="check" size={13} color={c.waInk} />
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
    scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 12 },
    headBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
    label: { fontFamily: font.semibold, fontSize: 14, color: c.ink, marginBottom: 8 },
    newCard: { padding: 14, borderRadius: radius.list + 4, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    newRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.bg, fontFamily: font.medium, fontSize: 16, color: c.ink },
    empty: { alignItems: 'center', gap: 10, padding: 24, marginTop: 24, borderRadius: radius.list + 4, borderWidth: 1, borderColor: c.line, borderStyle: 'dashed' },
    emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontFamily: font.bold, fontSize: 18, color: c.ink },
    emptyBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: c.muted, textAlign: 'center', marginBottom: 6 },
    folder: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: radius.list + 4, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden' },
    cover: { width: 72, height: 72, borderRadius: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4 },
    coverTile: { width: 32, height: 32 },
    coverOne: { width: 60, height: 60 },
    folderName: { fontFamily: font.bold, fontSize: 17, color: c.ink },
    folderMeta: { fontFamily: font.regular, fontSize: 14, color: c.muted },
    added: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: c.waSoft, marginTop: 2 },
    addedText: { fontFamily: font.semibold, fontSize: 12, color: c.waInk },
  });
