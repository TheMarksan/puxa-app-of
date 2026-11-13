import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { StickerFolder } from '../../modules/puxa-engine';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Sheet } from '../components/music/Sheet';
import { Segmented } from '../components/Segmented';
import { useToast } from '../components/Toasts';
import { Overline } from '../components/ui';
import { toUri } from '../editor/media';
import { COLORS } from '../playlist/colors';
import { control, gutter, type Palette, radius, space, text, usePalette } from '../theme';
import { CommunityError, MIN_PACK, MAX_PACK } from './core';
import { keep } from './images';
import { CATEGORIES } from './seed';
import { publish, useMe } from './store';
import type { CategoryId } from './types';

type Kind = 'still' | 'animated';

/**
 * Publicar uma pasta na comunidade: o nome, a categoria e as palavras para a busca. Um pacote
 * do WhatsApp é de um tipo só, então uma pasta com paradas e animadas publica uma das duas.
 */
export function PublishSheet({ folder, visible, onClose }: { folder: StickerFolder; visible: boolean; onClose: () => void }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const toast = useToast();
  const user = useMe();
  const still = folder.stickers.filter((x) => !x.animated);
  const moving = folder.stickers.filter((x) => x.animated);
  const [kind, setKind] = useState<Kind>(still.length >= moving.length ? 'still' : 'animated');
  const [name, setName] = useState(folder.name);
  const [category, setCategory] = useState<CategoryId>(moving.length > still.length ? 'animadas' : 'reacoes');
  const [tags, setTags] = useState('');
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = (kind === 'still' ? still : moving).slice(0, MAX_PACK);
  const enough = list.length >= MIN_PACK;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // Cópias da pasta: o pacote publicado não some se a figurinha sair da pasta depois
      const stickers = await Promise.all(
        list.map(async (st) => ({
          img: { uri: await keep(st.path, 'pacotes') },
          poster: st.animated && st.poster ? { uri: await keep(st.poster, 'pacotes') } : undefined,
          emojis: st.emojis,
          label: st.label,
        })),
      );
      const id = await publish({ name, category, tags: tags.split(/[,#]/).map((t) => t.trim()), animated: kind === 'animated', stickers });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show({ title: 'Publicado na comunidade', body: `${name.trim()} já aparece na busca e no seu perfil.`, tone: 'success', celebrate: true });
      onClose();
      router.push(`/pacote/${id}`);
    } catch (e) {
      const err = e as CommunityError;
      setError({ field: err.field, message: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} label="Publicar na comunidade">
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={s.title}>Publicar na comunidade</Text>
          <Text style={s.lede}>Qualquer pessoa vai poder achar, curtir e pôr no WhatsApp. Publique só o que você fez ou pode compartilhar.</Text>
        </View>
        {!user ? (
          <View style={s.gate}>
            <Text style={s.lede}>Para publicar, entre na sua conta.</Text>
            <Button
              size="md"
              icon="log-in"
              label="Entrar ou criar conta"
              onPress={() => {
                onClose();
                router.push('/entrar');
              }}
            />
          </View>
        ) : (
          <>
            {still.length && moving.length ? (
              <Segmented<Kind>
                accessibilityLabel="Tipo de figurinha"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'still', label: `Paradas ${still.length}` },
                  { value: 'animated', label: `Animadas ${moving.length}` },
                ]}
              />
            ) : null}
            {list.length ? (
              <View style={[s.strip, { backgroundColor: c.chat }]}>
                {list.slice(0, 5).map((st) => (
                  <Image key={st.file} source={{ uri: toUri(st.path) }} style={s.thumb} resizeMode="contain" />
                ))}
                {list.length > 5 ? <Text style={s.more}>+{list.length - 5}</Text> : null}
              </View>
            ) : null}
            {!enough ? (
              <Text style={s.error}>
                O WhatsApp pede pelo menos {MIN_PACK} figurinhas no pacote. Esta pasta tem {list.length}.
              </Text>
            ) : null}
            <Field label="Nome do pacote" value={name} onChangeText={setName} maxLength={40} error={error?.field === 'name' ? error.message : null} />
            <View style={s.group}>
              <Overline>Categoria</Overline>
              <View style={s.cats}>
                {CATEGORIES.map((cat) => {
                  const on = cat.id === category;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setCategory(cat.id)}
                      style={({ pressed }) => [s.cat, { backgroundColor: on ? COLORS[cat.color].bg : c.sunken }, pressed && { opacity: 0.72 }]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={cat.name}
                    >
                      <Text style={[s.catText, { color: on ? COLORS[cat.color].ink : c.ink }]}>{cat.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Field label="Palavras para a busca" value={tags} onChangeText={setTags} placeholder="kkkk, bom dia, gato" autoCapitalize="none" hint="Separe por vírgula. Ajuda as pessoas a acharem o pacote." />
            {error && error.field !== 'name' ? <Text style={s.error}>{error.message}</Text> : null}
          </>
        )}
      </ScrollView>
      {user ? (
        <View style={s.footer}>
          <Button icon="upload" label="Publicar" busy={busy} disabled={!enough || !name.trim()} onPress={submit} />
        </View>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    body: { paddingHorizontal: gutter, paddingBottom: space[4], gap: space[4] },
    title: { ...text.title, color: c.ink },
    lede: { ...text.caption, color: c.muted },
    gate: { gap: space[3] },
    strip: { flexDirection: 'row', alignItems: 'center', gap: space[1], padding: space[2], borderRadius: radius.lg, minHeight: 64 },
    thumb: { width: 48, height: 48 },
    more: { ...text.captionBold, color: c.muted, marginLeft: space[1] },
    group: { gap: space[2] },
    cats: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    cat: { height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full, justifyContent: 'center' },
    catText: { ...text.captionBold },
    error: { ...text.caption, color: c.danger },
    footer: { paddingHorizontal: gutter, paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong },
  });
