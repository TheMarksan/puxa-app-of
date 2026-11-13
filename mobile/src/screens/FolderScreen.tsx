import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine, { type StickerFolder, type StickerItem } from '../../modules/puxa-engine';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { Reveal } from '../components/SheetParts';
import { useToast } from '../components/Toasts';
import { EmptyState, Group, Hairline, IconButton } from '../components/ui';
import { toUri } from '../editor/media';
import { bytes } from '../format';
import { dropFolder, folderToWhatsApp, MAX_PER_PACK, packOf, pendingPacks, putFolder, roomIn, useFolders } from '../stickers/folders';
import { control, gutter, type Palette, radius, space, tabular, text, usePalette } from '../theme';

/** Uma pasta: as figurinhas (paradas e animadas juntas), o WhatsApp e as ações de cada uma. */
export function FolderScreen({ id }: { id: string }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const folders = useFolders();
  const folder = folders?.find((f) => f.id === id) ?? null;
  const [picked, setPicked] = useState<StickerItem | null>(null);
  const [moving, setMoving] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [width, setWidth] = useState(0);

  // Apagar espera alguns segundos (dá para desfazer); a figurinha some da grade na hora
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>());
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const p of [...map.values()]) {
        clearTimeout(p.timer);
        p.commit();
      }
      map.clear();
    };
  }, []);

  if (!folder) {
    return (
      <View style={s.root}>
        <View style={[s.top, { paddingTop: insets.top + space[2] }]}>
          <BackButton />
        </View>
        {folders ? <Text style={s.gone}>Essa pasta não existe mais.</Text> : null}
      </View>
    );
  }

  const stickers = folder.stickers.filter((st) => !hidden.has(st.file));
  const tile = width > 0 ? Math.floor((width - 2 * 10) / 3) : 0;
  const toAdd = pendingPacks(folder);
  const few = folder.packs.filter((p) => p.count > 0 && p.count < 3).length > 0;

  const remove = (st: StickerItem) => {
    setPicked(null);
    setHidden((h) => new Set(h).add(st.file));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const commit = () => {
      pending.current.delete(st.file);
      PuxaEngine.stickerRemove(folder.id, st.file)
        .then(putFolder)
        .catch((e: Error) => toast.show({ title: 'Não deu para apagar', body: e.message, tone: 'error' }));
    };
    pending.current.set(st.file, { timer: setTimeout(commit, 5000), commit });
    toast.show({
      title: 'Figurinha apagada',
      tone: 'info',
      duration: 4800,
      action: {
        label: 'Desfazer',
        onPress: () => {
          const p = pending.current.get(st.file);
          if (p) clearTimeout(p.timer);
          pending.current.delete(st.file);
          setHidden((h) => {
            const n = new Set(h);
            n.delete(st.file);
            return n;
          });
        },
      },
    });
  };

  const move = async (st: StickerItem, to: StickerFolder) => {
    try {
      const both = await PuxaEngine.stickerMove(folder.id, st.file, to.id);
      both.forEach(putFolder);
      setPicked(null);
      setMoving(false);
      toast.show({ title: `Movida para ${to.name}`, tone: 'success' });
    } catch (e) {
      toast.show({ title: 'Não deu para mover', body: (e as Error).message, tone: 'error' });
    }
  };

  const share = async (st: StickerItem) => {
    try {
      await PuxaEngine.share(st.path, 'image/webp', false, st.file);
    } catch (e) {
      toast.show({ title: 'Não deu para compartilhar', body: (e as Error).message, tone: 'error' });
    }
  };

  const toWhatsApp = async () => {
    setAdding(true);
    try {
      const r = await folderToWhatsApp(folder);
      if (r.error) toast.show({ title: 'O WhatsApp recusou o pacote', body: r.error, tone: 'error' });
      else if (r.added) toast.show({ title: 'No WhatsApp', body: `Procure ${folder.name} nas figurinhas da conversa.`, tone: 'success' });
    } catch (e) {
      toast.show({ title: 'Não deu para abrir o WhatsApp', body: (e as Error).message, tone: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const saveName = async () => {
    if (!name.trim()) return;
    try {
      putFolder(await PuxaEngine.stickerFolderRename(folder.id, name));
      setRenaming(false);
    } catch (e) {
      toast.show({ title: 'Não deu para renomear', body: (e as Error).message, tone: 'error' });
    }
  };

  const deleteFolder = async () => {
    try {
      await PuxaEngine.stickerFolderDelete(folder.id);
      dropFolder(folder.id);
      toast.show({ title: `Pasta ${folder.name} apagada`, tone: 'info' });
      router.back();
    } catch (e) {
      toast.show({ title: 'Não deu para apagar a pasta', body: (e as Error).message, tone: 'error' });
    }
  };

  const others = (folders ?? []).filter((f) => f.id !== folder.id);

  const counts = folder.packs.map((p) => `${p.count} de ${MAX_PER_PACK} ${p.animated ? 'animadas' : 'paradas'}`).join(' · ');
  const onWhatsApp = !toAdd.length && folder.stickers.length > 0;
  // O que fica preso embaixo: as ações da figurinha escolhida ou, sem escolha, o botão do WhatsApp
  const bottomBar = !!picked || toAdd.length > 0;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + (bottomBar ? space[16] + space[16] : space[8]) }]} keyboardShouldPersistTaps="handled">
        <View style={[s.top, { paddingTop: insets.top + space[2] }]}>
          <View style={s.bar}>
            <BackButton />
            <IconButton icon="more-vertical" label="Opções da pasta" onPress={() => setMenu((v) => !v)} />
          </View>
          {renaming ? (
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={saveName}
              onBlur={() => setRenaming(false)}
              selectionColor={c.accent}
              style={s.titleInput}
              accessibilityLabel="Nome da pasta"
            />
          ) : (
            <Text style={s.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">
              {folder.name}
            </Text>
          )}
          <View style={s.meta}>
            <Text style={s.count}>{counts}</Text>
            {onWhatsApp ? (
              <View style={s.added}>
                <Feather name="check" size={12} color={c.successInk} />
                <Text style={s.addedText}>No WhatsApp</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.body}>
          {menu ? (
            <Reveal>
              <Group>
                <MenuRow
                  icon="edit-3"
                  label="Renomear"
                  c={c}
                  onPress={() => {
                    setName(folder.name);
                    setRenaming(true);
                    setMenu(false);
                  }}
                />
                <Hairline inset={space[4] + 20 + space[3]} />
                <MenuRow
                  icon="trash-2"
                  label="Apagar pasta"
                  danger
                  c={c}
                  onPress={() => {
                    setMenu(false);
                    if (folder.stickers.length) setConfirmDelete(true);
                    else deleteFolder();
                  }}
                />
              </Group>
            </Reveal>
          ) : null}

          {confirmDelete ? (
            <Reveal>
              <View style={s.danger}>
                <Text style={s.dangerText}>
                  Apagar a pasta {folder.name} e as {folder.stickers.length} figurinhas dela? O WhatsApp deixa de mostrar o pacote.
                </Text>
                <View style={s.dangerRow}>
                  <Button tone="neutral" size="md" label="Manter" onPress={() => setConfirmDelete(false)} style={s.half} />
                  <Button tone="danger" size="md" icon="trash-2" label="Apagar" onPress={deleteFolder} style={s.half} />
                </View>
              </View>
            </Reveal>
          ) : null}

          {few ? <Text style={s.note}>Com menos de 3 figurinhas, o WhatsApp completa o pacote com repetidas.</Text> : null}

          {stickers.length ? (
          <View style={s.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {stickers.map((st) => {
              const on = picked?.file === st.file;
              return (
                <Pressable
                  key={st.file}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setMoving(false);
                    setPicked(on ? null : st);
                  }}
                  style={[s.tile, { width: tile, height: tile, backgroundColor: c.chat }, on && { borderColor: c.accent }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Figurinha ${st.animated ? 'animada' : 'parada'} ${st.emojis.join(' ')} ${st.label}`}
                >
                  <Image source={{ uri: toUri(st.path) }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                  {st.animated ? (
                    <View style={s.badge}>
                      <Feather name="repeat" size={12} color={c.onMedia} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          ) : (
            <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              <EmptyState icon="image" title="Pasta vazia" body="Na hora de fazer uma figurinha, escolha esta pasta e ela aparece aqui." />
            </View>
          )}
        </View>
      </ScrollView>

      {picked ? (
        <View style={[s.actions, { paddingBottom: insets.bottom + space[4] }]}>
          {moving ? (
            <Reveal>
              <Text style={s.moveLabel}>Mover para</Text>
              {others.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                  {others.map((f) => {
                    const full = roomIn(f, picked.animated) <= 0;
                    return (
                      <Pressable
                        key={f.id}
                        disabled={full}
                        onPress={() => move(picked, f)}
                        style={({ pressed }) => [s.chip, pressed && { backgroundColor: c.lineStrong }, full && { opacity: 0.4 }]}
                        accessibilityRole="button"
                        accessibilityLabel={full ? `${f.name}, cheia` : `Mover para ${f.name}`}
                      >
                        <Feather name="folder" size={16} color={c.muted} />
                        <Text style={s.chipText}>{f.name}</Text>
                        <Text style={s.chipCount}>{packOf(f, picked.animated)?.count ?? 0}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={s.note}>Crie outra pasta na tela anterior para mover.</Text>
              )}
            </Reveal>
          ) : (
            <View style={s.actionRow}>
              <Image source={{ uri: toUri(picked.path) }} style={s.actionImg} resizeMode="contain" />
              <View style={s.actionText}>
                <Text style={s.actionTitle} numberOfLines={1}>
                  {picked.emojis.join(' ')} {picked.label}
                </Text>
                <Text style={s.actionMeta}>
                  {picked.animated ? 'Animada' : 'Parada'} · {bytes(picked.size)}
                </Text>
              </View>
              <IconButton size={48} icon="share-2" label="Mandar em outro app" onPress={() => share(picked)} />
              <IconButton size={48} icon="folder" label="Mover para outra pasta" onPress={() => setMoving(true)} />
              <IconButton size={48} icon="trash-2" label="Apagar figurinha" tint={{ bg: c.dangerSoft, ink: c.danger }} onPress={() => remove(picked)} />
            </View>
          )}
        </View>
      ) : toAdd.length ? (
        <View style={[s.actions, { paddingBottom: insets.bottom + space[4] }]}>
          <Button whatsapp label="Adicionar ao WhatsApp" busy={adding} onPress={toWhatsApp} />
        </View>
      ) : null}
    </View>
  );
}

function MenuRow({ icon, label, onPress, danger, c }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; danger?: boolean; c: Palette }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [menu.row, pressed && { backgroundColor: c.sunken }]} accessibilityRole="button" accessibilityLabel={label}>
      <Feather name={icon} size={20} color={danger ? c.danger : c.ink} />
      <Text style={[text.bodyBold, { color: danger ? c.danger : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

const menu = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], height: control.lg, paddingHorizontal: space[4] },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { flexGrow: 1 },
    top: { paddingHorizontal: gutter, paddingBottom: space[4] },
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
    title: { ...text.display, color: c.ink, marginTop: space[4] },
    titleInput: { ...text.title, minHeight: control.lg, marginTop: space[4], paddingHorizontal: space[4], borderRadius: radius.lg, borderWidth: 2, borderColor: c.accent, backgroundColor: c.sunken, color: c.ink },
    meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2], marginTop: space[1] },
    count: { ...text.body, ...tabular, color: c.muted },
    added: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[2], height: 24, borderRadius: radius.full, backgroundColor: c.successSoft },
    addedText: { ...text.captionBold, lineHeight: 16, color: c.successInk },
    body: { paddingHorizontal: gutter, gap: space[4] },
    gone: { ...text.body, color: c.muted, textAlign: 'center', marginTop: space[12] },
    danger: { gap: space[3], padding: space[4], borderRadius: radius.xl, backgroundColor: c.dangerSoft },
    dangerText: { ...text.body, color: c.ink },
    dangerRow: { flexDirection: 'row', gap: space[2] },
    half: { flex: 1 },
    note: { ...text.caption, color: c.muted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    tile: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
    badge: { position: 'absolute', right: space[2], bottom: space[2], width: 24, height: 24, borderRadius: radius.full, backgroundColor: c.mediaScrim, alignItems: 'center', justifyContent: 'center' },
    actions: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: gutter,
      paddingTop: space[4],
      backgroundColor: c.dark ? c.raised : c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      boxShadow: c.shadow3,
    },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    actionImg: { width: 48, height: 48 },
    actionText: { flex: 1, minWidth: 0 },
    actionTitle: { ...text.bodyBold, color: c.ink },
    actionMeta: { ...text.caption, ...tabular, color: c.muted },
    moveLabel: { ...text.overline, color: c.muted, marginBottom: space[2] },
    chips: { gap: space[2] },
    chip: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: c.sunken },
    chipText: { ...text.captionBold, color: c.ink },
    chipCount: { ...text.caption, ...tabular, color: c.muted },
  });
