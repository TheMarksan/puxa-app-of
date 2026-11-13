import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PersonRow } from '../community/Acervo';
import { compact, countsOf, followersOf, followingOf, follows, me, packsBy, userById } from '../community/core';
import { imgSource } from '../community/images';
import { follow, logout, unfollow, useDB, useFetched } from '../community/store';
import { Avatar, FollowButton, PackRows, PackRowsSkeleton, Stat, UserName } from '../community/ui';
import { useInstaller } from '../community/useInstaller';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { Sheet } from '../components/music/Sheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { Segmented } from '../components/Segmented';
import { useToast } from '../components/Toasts';
import { EmptyState, IconButton } from '../components/ui';
import { COLORS } from '../playlist/colors';
import { control, gutter, type Palette, radius, space, text, usePalette } from '../theme';

type Tab = 'packs' | 'liked';

/**
 * O perfil de alguém (ou o seu, com id "eu"): capa, foto, nome, os números (pacotes, seguidores,
 * seguindo) e os pacotes publicados ou curtidos.
 */
export function ProfileScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const toast = useToast();
  const db = useDB();
  const viewer = me(db);
  const id = raw === 'eu' ? viewer?.id : raw;
  const user = id ? userById(db, id) : null;
  const ready = useFetched(`perfil-${id}`);
  const [tab, setTab] = useState<Tab>('packs');
  const [menu, setMenu] = useState(false);
  const { install, busy } = useInstaller();

  // "Meu perfil" sem conta: vai para o entrar
  useEffect(() => {
    if (raw === 'eu' && !viewer) router.replace('/entrar');
  }, [raw, viewer, router]);

  if (!user)
    return (
      <View style={s.root}>
        <ScreenHeader title="Perfil" />
        {raw === 'eu' ? null : <EmptyState icon="user-x" title="Perfil não encontrado" body="A conta pode ter mudado de nome ou saído do Puxa." />}
      </View>
    );

  const mine = viewer?.id === user.id;
  const n = countsOf(db, user.id);
  const following = !!viewer && follows(db, viewer.id, user.id);
  const followsYou = !!viewer && !mine && follows(db, user.id, viewer.id);
  const coverH = Math.round(width * 0.4);
  const packs = tab === 'packs' ? packsBy(db, user.id) : db.packs.filter((p) => (db.liked[user.id] ?? []).includes(p.id));
  const fallback = COLORS.azul;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[8] }}>
        <View style={[s.cover, { height: coverH + insets.top, backgroundColor: fallback.bg }]}>
          {user.cover ? <Image resizeMethod="resize" source={imgSource(user.cover)} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
          <View style={[s.coverBar, { marginTop: insets.top + space[2] }]}>
            <BackButton tint={{ bg: c.mediaScrim, ink: c.onMedia }} />
            {mine ? <IconButton icon="more-horizontal" tone="media" label="Opções da conta" onPress={() => setMenu(true)} /> : null}
          </View>
        </View>

        <View style={s.body}>
          <View style={s.headRow}>
            <View style={s.avatarWrap}>
              <Avatar user={user} size={96} ring={c.bg} />
            </View>
            {/* O botão com o centro na borda da capa, como a foto, num anel da cor do fundo */}
            <View style={s.headAction}>
              {mine ? (
                <Button size="sm" tone="neutral" icon="edit-2" label="Editar perfil" onPress={() => router.push('/perfil/editar')} />
              ) : (
                <FollowButton
                  following={following}
                  onPress={() => {
                    if (!viewer) {
                      router.push('/entrar');
                      return;
                    }
                    Haptics.selectionAsync().catch(() => {});
                    if (following) unfollow(user.id);
                    else follow(user.id);
                  }}
                />
              )}
            </View>
          </View>

          <View style={s.names}>
            <UserName user={user} style={null} numberOfLines={2} size="title" />
            <View style={s.handleRow}>
              <Text style={s.handle}>@{user.username}</Text>
              {followsYou ? (
                <View style={s.chip}>
                  <Text style={s.chipText}>Segue você</Text>
                </View>
              ) : null}
            </View>
            {user.bio ? <Text style={s.bio}>{user.bio}</Text> : mine ? <Text style={s.empty}>Conte em uma linha que figurinhas você faz.</Text> : null}
          </View>

          <View style={s.stats}>
            <Stat value={compact(n.packs)} label={n.packs === 1 ? 'pacote' : 'pacotes'} />
            <Stat value={compact(n.followers)} label={n.followers === 1 ? 'seguidor' : 'seguidores'} onPress={() => router.push(`/perfil/${user.id}/conexoes?tipo=seguidores`)} />
            <Stat value={compact(n.following)} label="seguindo" onPress={() => router.push(`/perfil/${user.id}/conexoes?tipo=seguindo`)} />
            <Stat value={compact(n.downloads)} label="no WhatsApp" />
          </View>

          <Segmented<Tab>
            accessibilityLabel="Pacotes do perfil"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'packs', label: mine ? 'Meus pacotes' : 'Pacotes' },
              { value: 'liked', label: 'Curtidos' },
            ]}
          />

          {!ready ? (
            <PackRowsSkeleton rows={2} />
          ) : packs.length ? (
            <PackRows packs={packs} busy={busy} onAdd={install} />
          ) : tab === 'packs' ? (
            <EmptyState
              icon="package"
              title={mine ? 'Publique seu primeiro pacote' : 'Nenhum pacote ainda'}
              body={mine ? 'Em Figurinhas, abra uma pasta com 3 figurinhas ou mais e toque em Publicar.' : `${user.name.split(' ')[0]} ainda não publicou figurinhas.`}
            >
              {mine ? <Button size="md" tone="soft" icon="folder" label="Ir para Figurinhas" onPress={() => router.push('/figurinhas')} /> : null}
            </EmptyState>
          ) : (
            <EmptyState icon="heart" title="Nada curtido ainda" body={mine ? 'Toque no coração de um pacote para guardar aqui.' : 'Os pacotes curtidos aparecem aqui.'} />
          )}
        </View>
      </ScrollView>

      <Sheet visible={menu} onClose={() => setMenu(false)} label="Opções da conta">
        <View style={s.menu}>
          <Text style={s.menuTitle}>{user.name}</Text>
          <Button
            size="md"
            tone="neutral"
            icon="edit-2"
            label="Editar perfil"
            onPress={() => {
              setMenu(false);
              router.push('/perfil/editar');
            }}
          />
          <Button
            size="md"
            tone="danger"
            icon="log-out"
            label="Sair da conta"
            onPress={() => {
              setMenu(false);
              logout();
              toast.show({ title: 'Você saiu da conta', body: 'Suas figurinhas e playlists continuam no celular.', tone: 'info' });
              router.back();
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

type Kind = 'seguidores' | 'seguindo';

/** Quem segue e quem é seguido, com o botão de seguir de volta. */
export function ConnectionsScreen() {
  const { id, tipo } = useLocalSearchParams<{ id: string; tipo?: string }>();
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useDB();
  const viewer = me(db);
  const user = userById(db, id);
  const [kind, setKind] = useState<Kind>(tipo === 'seguindo' ? 'seguindo' : 'seguidores');
  const ready = useFetched(`conexoes-${id}-${kind}`);
  if (!user)
    return (
      <View style={s.root}>
        <ScreenHeader title="Perfil" />
      </View>
    );
  const ids = kind === 'seguidores' ? followersOf(db, user.id) : followingOf(db, user.id);
  const people = ids.map((x) => userById(db, x)).filter((u): u is NonNullable<typeof u> => !!u);
  const extra = kind === 'seguidores' ? (user.extraFollowers ?? 0) : 0;
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[8] }}>
        <ScreenHeader title={user.name} subtitle={`@${user.username}`} />
        <View style={s.connBody}>
          <Segmented<Kind>
            accessibilityLabel="Seguidores ou seguindo"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'seguidores', label: `Seguidores ${compact(followersOf(db, user.id).length + (user.extraFollowers ?? 0))}` },
              { value: 'seguindo', label: `Seguindo ${compact(followingOf(db, user.id).length)}` },
            ]}
          />
          {!ready ? null : people.length ? (
            <View style={s.people}>
              {people.map((u) => (
                <PersonRow key={u.id} user={u} me={viewer} following={!!viewer && follows(db, viewer.id, u.id)} onOpen={() => router.push(`/perfil/${u.id}`)} />
              ))}
              {extra ? <Text style={s.more}>E mais {compact(extra)} pessoas.</Text> : null}
            </View>
          ) : (
            <EmptyState
              icon="users"
              title={kind === 'seguidores' ? 'Ninguém segue ainda' : 'Não segue ninguém ainda'}
              body={kind === 'seguidores' ? 'Quem seguir aparece aqui.' : 'Os criadores seguidos aparecem aqui, e os pacotes deles chegam no Início.'}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    cover: { overflow: 'hidden' },
    // Barra de 48 a 8 da área segura, como nas outras telas: o voltar fica no mesmo lugar em todo o app
    coverBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: control.md, paddingHorizontal: gutter },
    body: { paddingHorizontal: gutter, gap: space[4] },
    // A foto (96) sobe a metade dela: o centro da foto e o do botão ficam na borda da capa
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -space[12] },
    avatarWrap: { borderRadius: radius.full },
    headAction: { padding: space[1], borderRadius: radius.full, backgroundColor: c.bg },
    names: { gap: space[1] },
    handleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    handle: { ...text.caption, color: c.muted },
    chip: { height: 24, paddingHorizontal: space[2], borderRadius: radius.full, backgroundColor: c.sunken, justifyContent: 'center' },
    chipText: { ...text.captionBold, lineHeight: 16, color: c.body },
    bio: { ...text.body, color: c.body, marginTop: space[1] },
    empty: { ...text.body, color: c.faint, marginTop: space[1] },
    stats: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
    menu: { paddingHorizontal: gutter, paddingBottom: space[2], gap: space[3] },
    menuTitle: { ...text.title, color: c.ink },
    connBody: { paddingHorizontal: gutter, gap: space[6] },
    people: { gap: space[4] },
    more: { ...text.caption, color: c.muted },
  });
