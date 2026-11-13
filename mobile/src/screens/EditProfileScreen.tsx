import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityError } from '../community/core';
import { imgSource, pickProfileImage } from '../community/images';
import { updateProfile, useMe } from '../community/store';
import type { Img } from '../community/types';
import { Avatar } from '../community/ui';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { ScreenHeader } from '../components/ScreenHeader';
import { useToast } from '../components/Toasts';
import { COLORS } from '../playlist/colors';
import { gutter, type Palette, radius, space, text, usePalette } from '../theme';

type Errors = Partial<Record<'name' | 'username' | 'form', string>>;

/** Foto, capa, nome, @ e a linha sobre você. Nada muda até tocar em Salvar. */
export function EditProfileScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const toast = useToast();
  const user = useMe();
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatar, setAvatar] = useState<Img | null>(user?.avatar ?? null);
  const [cover, setCover] = useState<Img | null>(user?.cover ?? null);
  const [picking, setPicking] = useState<'avatar' | 'cover' | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) router.replace('/entrar');
  }, [user, router]);
  if (!user) return <View style={s.root} />;

  const pick = async (kind: 'avatar' | 'cover') => {
    setPicking(kind);
    try {
      const img = await pickProfileImage(kind);
      if (!img) return;
      if (kind === 'avatar') setAvatar(img);
      else setCover(img);
    } catch {
      toast.show({ title: 'Não deu para abrir a imagem', tone: 'error' });
    } finally {
      setPicking(null);
    }
  };

  const save = async () => {
    setErrors({});
    setBusy(true);
    try {
      await updateProfile({ name, username, bio, avatar, cover });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show({ title: 'Perfil salvo', tone: 'success' });
      router.back();
    } catch (e) {
      const err = e as CommunityError;
      setErrors({ [err.field === 'name' || err.field === 'username' ? err.field : 'form']: err.message });
    } finally {
      setBusy(false);
    }
  };

  const coverH = Math.round((width - gutter * 2) * 0.4);
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Editar perfil" />
        <View style={s.body}>
          <Pressable onPress={() => pick('cover')} style={[s.cover, { height: coverH, backgroundColor: COLORS.azul.bg }]} accessibilityRole="button" accessibilityLabel={cover ? 'Trocar a capa' : 'Escolher uma capa'}>
            {cover ? <Image resizeMethod="resize" source={imgSource(cover)} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
            <View style={s.badge}>{picking === 'cover' ? <ActivityIndicator size="small" color={c.onMedia} /> : <Feather name="image" size={16} color={c.onMedia} />}</View>
          </Pressable>
          <Pressable onPress={() => pick('avatar')} style={s.avatar} accessibilityRole="button" accessibilityLabel={avatar ? 'Trocar a foto' : 'Escolher uma foto'}>
            <Avatar user={{ name, avatar }} size={96} ring={c.bg} />
            <View style={[s.badge, s.avatarBadge]}>{picking === 'avatar' ? <ActivityIndicator size="small" color={c.onMedia} /> : <Feather name="camera" size={16} color={c.onMedia} />}</View>
          </Pressable>
          {avatar || cover ? (
            <View style={s.removeRow}>
              {avatar ? <Button size="sm" tone="ghost" icon="x" label="Tirar a foto" onPress={() => setAvatar(null)} /> : null}
              {cover ? <Button size="sm" tone="ghost" icon="x" label="Tirar a capa" onPress={() => setCover(null)} /> : null}
            </View>
          ) : null}

          <Field label="Nome" value={name} onChangeText={setName} error={errors.name} maxLength={40} autoComplete="name" />
          <Field label="Nome de usuário" prefix="@" value={username} onChangeText={setUsername} error={errors.username} autoCapitalize="none" autoCorrect={false} maxLength={20} hint="Letras, números, ponto e sublinhado." />
          <Field label="Sobre você" value={bio} onChangeText={setBio} multiline maxLength={160} counter placeholder="Que figurinhas você faz?" />
          {errors.form ? <Text style={s.error}>{errors.form}</Text> : null}
        </View>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: insets.bottom + space[4] }]}>
        <Button label="Salvar" icon="check" busy={busy} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { paddingBottom: space[8] },
    body: { paddingHorizontal: gutter, gap: space[4] },
    cover: { borderRadius: radius.xl, overflow: 'hidden' },
    badge: { position: 'absolute', right: space[3], bottom: space[3], width: 32, height: 32, borderRadius: radius.full, backgroundColor: c.mediaScrim, alignItems: 'center', justifyContent: 'center' },
    // A foto (96) com o centro na borda de baixo da capa: sobe a metade dela mais o espaço do grupo
    avatar: { alignSelf: 'flex-start', marginTop: -space[16], marginLeft: space[4] },
    avatarBadge: { right: 0, bottom: 0 },
    removeRow: { flexDirection: 'row', gap: space[2], marginTop: -space[2] },
    error: { ...text.caption, color: c.danger },
    footer: { paddingHorizontal: gutter, paddingTop: space[3], backgroundColor: c.bg },
  });
