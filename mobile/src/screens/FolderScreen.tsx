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
import { CHAT_BG } from '../components/StickerPanel';
import { useToast } from '../components/Toasts';
import { toUri } from '../editor/media';
import { bytes } from '../format';
import { dropFolder, folderToWhatsApp, MAX_PER_PACK, packOf, pendingPacks, putFolder, roomIn, useFolders } from '../stickers/folders';
import { font, type Palette, radius, usePalette } from '../theme';

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
        <View style={[s.top, { paddingTop: insets.top + 10 }]}>
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

  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + 10 }]}>
        <BackButton />
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
          <Text style={s.title} numberOfLines={1} accessibilityRole="header">
            {folder.name}
          </Text>
        )}
        <Pressable
          onPress={() => setMenu((v) => !v)}
          hitSlop={8}
          style={({ pressed }) => [s.headBtn, (pressed || menu) && { backgroundColor: c.hover }]}
          accessibilityRole="button"
          accessibilityLabel="Opções da pasta"
          accessibilityState={{ expanded: menu }}
        >
          <Feather name="more-vertical" size={20} color={c.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + (picked ? 140 : 32) }]} keyboardShouldPersistTaps="handled">
        {menu ? (
          <Reveal>
            <View style={s.menu}>
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
            </View>
          </Reveal>
        ) : null}

        {confirmDelete ? (
          <Reveal>
            <View style={s.danger}>
              <Text style={s.dangerText}>
                Apagar a pasta {folder.name} e as {folder.stickers.length} figurinhas dela? O WhatsApp deixa de mostrar o pacote.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button tone="neutral" compact label="Manter" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
                <Button tone="danger" compact icon="trash-2" label="Apagar" onPress={deleteFolder} style={{ flex: 1 }} />
              </View>
            </View>
          </Reveal>
        ) : null}

        <View style={s.summary}>
          <Text style={s.count}>
            {folder.packs.map((p) => `${p.count} de ${MAX_PER_PACK} ${p.animated ? 'animadas' : 'paradas'}`).join(' · ')}
          </Text>
          {toAdd.length ? (
            <Button tone="wa" icon="plus-circle" label="Adicionar ao WhatsApp" busy={adding} onPress={toWhatsApp} />
          ) : folder.stickers.length ? (
            <View style={s.added}>
              <Feather name="check" size={14} color={c.waInk} />
              <Text style={s.addedText}>No WhatsApp</Text>
            </View>
          ) : null}
          {few ? <Text style={s.note}>Com menos de 3, o WhatsApp mostra repetidas.</Text> : null}
        </View>

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
                  style={[s.tile, { width: tile, height: tile, backgroundColor: c.dark ? CHAT_BG.dark : CHAT_BG.light }, on && { borderColor: c.accent }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Figurinha ${st.animated ? 'animada' : 'parada'} ${st.emojis.join(' ')} ${st.label}`}
                >
                  <Image source={{ uri: toUri(st.path) }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                  {st.animated ? (
                    <View style={s.badge}>
                      <Feather name="repeat" size={11} color="#fff" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={s.empty} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <Feather name="image" size={26} color={c.muted} />
            <Text style={s.emptyBody}>Pasta vazia. Escolha esta pasta na hora de fazer uma figurinha.</Text>
          </View>
        )}
      </ScrollView>

      {picked ? (
        <View style={[s.actions, { paddingBottom: insets.bottom + 12 }]}>
          {moving ? (
            <Reveal>
              <Text style={s.moveLabel}>Mover para</Text>
              {others.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                  {others.map((f) => {
                    const full = roomIn(f, picked.animated) <= 0;
                    return (
                      <Pressable
                        key={f.id}
                        disabled={full}
                        onPress={() => move(picked, f)}
                        style={({ pressed }) => [s.chip, pressed && { backgroundColor: c.hover }, full && { opacity: 0.45 }]}
                        accessibilityRole="button"
                        accessibilityLabel={full ? `${f.name}, cheia` : `Mover para ${f.name}`}
                      >
                        <Feather name="folder" size={15} color={c.muted} />
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
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.actionTitle} numberOfLines={1}>
                  {picked.emojis.join(' ')} {picked.label}
                </Text>
                <Text style={s.actionMeta}>
                  {picked.animated ? 'Animada' : 'Parada'} · {bytes(picked.size)}
                </Text>
              </View>
              <IconAction icon="share-2" label="Mandar em outro app" onPress={() => share(picked)} c={c} />
              <IconAction icon="folder" label="Mover para outra pasta" onPress={() => setMoving(true)} c={c} />
              <IconAction icon="trash-2" label="Apagar figurinha" danger onPress={() => remove(picked)} c={c} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function MenuRow({ icon, label, onPress, danger, c }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; danger?: boolean; c: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: c.hover }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingHorizontal: 14 }, pressed && { backgroundColor: c.hover }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={18} color={danger ? c.danger : c.ink} />
      <Text style={{ fontFamily: font.semibold, fontSize: 16, color: danger ? c.danger : c.ink }}>{label}</Text>
    </Pressable>
  );
}

function IconAction({ icon, label, onPress, danger, c }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; danger?: boolean; c: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: c.hover }, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={19} color={danger ? c.danger : c.ink} />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
    title: { flex: 1, fontFamily: font.bold, fontSize: 21, color: c.ink, letterSpacing: -0.3 },
    titleInput: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.accent, backgroundColor: c.surface, fontFamily: font.bold, fontSize: 18, color: c.ink },
    headBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
    gone: { fontFamily: font.regular, fontSize: 15, color: c.muted, textAlign: 'center', marginTop: 40 },
    scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
    menu: { borderRadius: radius.list, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden' },
    danger: { gap: 12, padding: 14, borderRadius: radius.list, backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerLine },
    dangerText: { fontFamily: font.medium, fontSize: 15, lineHeight: 21, color: c.ink },
    summary: { gap: 10 },
    count: { fontFamily: font.semibold, fontSize: 14, color: c.muted, fontVariant: ['tabular-nums'] },
    added: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: c.waSoft },
    addedText: { fontFamily: font.semibold, fontSize: 13, color: c.waInk },
    note: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: c.muted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: { borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
    badge: { position: 'absolute', right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', gap: 10, padding: 28, borderRadius: radius.list + 4, borderWidth: 1, borderColor: c.line, borderStyle: 'dashed' },
    emptyBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: c.muted, textAlign: 'center' },
    actions: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: c.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
      elevation: 12,
      shadowColor: c.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 12,
    },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    actionImg: { width: 48, height: 48 },
    actionTitle: { fontFamily: font.semibold, fontSize: 15, color: c.ink },
    actionMeta: { fontFamily: font.regular, fontSize: 13, color: c.muted, marginTop: 2 },
    moveLabel: { fontFamily: font.semibold, fontSize: 14, color: c.ink, marginBottom: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.bg },
    chipText: { fontFamily: font.semibold, fontSize: 14, color: c.ink },
    chipCount: { fontFamily: font.medium, fontSize: 12, color: c.muted, fontVariant: ['tabular-nums'] },
  });
