import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { compact, follows, likedBy, me } from '../community/core';
import { CATEGORIES } from '../community/seed';
import { follow, unfollow, toggleLike, unpublish, useDB } from '../community/store';
import { StickerSheet } from '../community/StickerSheet';
import type { Pack, Sticker } from '../community/types';
import { Avatar, FollowButton, StickerGrid, StickerImage, useInstalled, UserName } from '../community/ui';
import { useInstaller } from '../community/useInstaller';
import { Button } from '../components/Button';
import { MediaHeader } from '../components/MediaHeader';
import { Sheet } from '../components/music/Sheet';
import { useToast } from '../components/Toasts';
import { EmptyState, IconButton, Overline } from '../components/ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { listSoft } from '../playlist/colors';
import { gutter, type Palette, radius, space, tabular, text, usePalette } from '../theme';

const DAY = 86_400_000;
const since = (t: number) => {
  const d = Math.max(0, Math.floor((Date.now() - t) / DAY));
  return d === 0 ? 'hoje' : d === 1 ? 'ontem' : d < 30 ? `há ${d} dias` : d < 365 ? `há ${Math.floor(d / 30)} ${Math.floor(d / 30) === 1 ? 'mês' : 'meses'}` : 'há mais de um ano';
};

/** Um pacote do acervo: o pôster, quem fez, as figurinhas e o botão de pôr no WhatsApp. */
export function PackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const db = useDB();
  const pack = db.packs.find((p) => p.id === id) ?? null;
  if (!pack)
    return (
      <View style={s.root}>
        <ScreenHeader title="Pacote" />
        <EmptyState icon="package" title="Esse pacote saiu do ar" body="Quem publicou pode ter tirado da comunidade." />
      </View>
    );
  return <PackView pack={pack} />;
}

function PackView({ pack: p }: { pack: Pack }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const toast = useToast();
  const db = useDB();
  const [open, setOpen] = useState<{ sticker: Sticker; pack: Pack } | null>(null);
  const [menu, setMenu] = useState(false);
  const [footH, setFootH] = useState(0);
  const { install, busy, step } = useInstaller();
  const installed = useInstalled(p);
  const author = db.users.find((u) => u.id === p.author) ?? null;
  const cat = CATEGORIES.find((x) => x.id === p.category) ?? CATEGORIES[0];
  const user = me(db);
  const liked = likedBy(db, user?.id ?? null, p.id);
  const mine = user?.id === p.author;
  const following = !!user && !!author && follows(db, user.id, author.id);
  const working = busy === p.id;

  const needLogin = () => {
    router.push('/entrar');
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: footH + space[6] }}>
        <MediaHeader
          tint={listSoft(cat.color, c.dark)}
          kicker={cat.name}
          onKicker={() => router.push(`/categoria/${cat.id}`)}
          title={p.name}
          meta={`${p.stickers.length} figurinhas${p.animated ? ' animadas' : ''} · ${compact(p.downloads)} no WhatsApp`}
          cover={<View style={s.cover}>{p.stickers[0] ? <StickerImage img={p.stickers[0].img} size={128} /> : null}</View>}
          right={(t) => (
            <>
              <IconButton
                icon="heart"
                label={liked ? 'Descurtir' : 'Curtir'}
                tint={liked ? { bg: t.bg, ink: c.danger } : t}
                onPress={() => {
                  if (!user) return needLogin();
                  Haptics.selectionAsync().catch(() => {});
                  toggleLike(p.id);
                }}
              />
              {mine ? <IconButton icon="more-horizontal" label="Opções do pacote" tint={t} onPress={() => setMenu(true)} /> : null}
            </>
          )}
        />

        <View style={s.body}>
          {author ? (
            <View style={s.author}>
              <View style={s.authorMain}>
                <Avatar user={author} size={48} />
                <View style={s.authorText}>
                  <UserName user={author} style={null} />
                  <Text style={s.meta} numberOfLines={1}>
                    @{author.username} · publicado {since(p.created)}
                  </Text>
                </View>
              </View>
              {mine ? null : (
                <FollowButton
                  following={following}
                  tone="soft"
                  onPress={() => {
                    if (!user) return needLogin();
                    Haptics.selectionAsync().catch(() => {});
                    if (following) unfollow(author.id);
                    else follow(author.id);
                  }}
                />
              )}
            </View>
          ) : null}
          {author ? (
            <Text style={s.link} onPress={() => router.push(`/perfil/${author.id}`)} accessibilityRole="link">
              Ver perfil e outros pacotes
            </Text>
          ) : null}

          <View style={s.stats}>
            <Text style={s.stat}>
              <Text style={s.statValue}>{compact(p.likes)}</Text> curtidas
            </Text>
            <Text style={s.stat}>
              <Text style={s.statValue}>{compact(p.week)}</Text> adições na semana
            </Text>
          </View>

          <View style={s.section}>
            <Overline>{p.animated ? 'Figurinhas animadas' : 'Figurinhas'}</Overline>
            <StickerGrid items={p.stickers.map((x) => ({ sticker: x, pack: p }))} width={width - gutter * 2} animate onPress={(sticker) => setOpen({ sticker, pack: p })} />
            <Text style={s.note}>Toque numa figurinha para ver de perto ou pôr só ela numa pasta sua.</Text>
          </View>
        </View>
      </ScrollView>

      <View onLayout={(e) => setFootH(e.nativeEvent.layout.height)} style={[s.footer, { paddingBottom: insets.bottom + space[4] }]}>
        <Button
          whatsapp={!installed}
          icon={installed ? 'check' : undefined}
          tone={installed ? 'neutral' : 'accent'}
          busy={working}
          label={working ? (step && step.total ? `Copiando ${Math.min(step.done + 1, step.total)} de ${step.total}` : 'Preparando…') : installed ? 'Já está no WhatsApp' : 'Adicionar ao WhatsApp'}
          onPress={() => install(p)}
        />
      </View>

      <StickerSheet item={open} onClose={() => setOpen(null)} />
      <Sheet visible={menu} onClose={() => setMenu(false)} label="Opções do pacote">
        <View style={s.menu}>
          <Text style={s.menuTitle}>{p.name}</Text>
          <Text style={s.meta}>Tirar da comunidade apaga o pacote da busca e do seu perfil. As figurinhas continuam no seu celular.</Text>
          <Button
            tone="danger"
            icon="trash-2"
            label="Tirar da comunidade"
            onPress={async () => {
              setMenu(false);
              try {
                await unpublish(p.id);
                toast.show({
                  title: 'Pacote tirado da comunidade',
                  tone: 'info',
                });
                router.back();
              } catch (e) {
                toast.show({
                  title: 'Não deu para tirar',
                  body: (e as Error).message,
                  tone: 'error',
                });
              }
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    // A capa do pacote: a primeira figurinha num quadrado claro, como a capa de um álbum
    cover: { width: 160, height: 160, borderRadius: radius.xl, backgroundColor: c.dark ? c.raised : c.surface, alignItems: 'center', justifyContent: 'center', boxShadow: c.shadow1 },
    body: { paddingHorizontal: gutter, paddingTop: space[6], gap: space[4] },
    author: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    authorMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    authorText: { flex: 1, minWidth: 0 },
    meta: { ...text.caption, color: c.muted },
    link: { ...text.captionBold, color: c.accentInk, alignSelf: 'flex-start' },
    stats: { flexDirection: 'row', gap: space[6] },
    stat: { ...text.caption, ...tabular, color: c.muted },
    statValue: { ...text.captionBold, color: c.ink },
    section: { gap: space[4], marginTop: space[4] },
    note: { ...text.caption, color: c.muted },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: gutter,
      paddingTop: space[3],
      backgroundColor: c.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.lineStrong,
    },
    menu: { paddingHorizontal: gutter, paddingBottom: space[2], gap: space[3] },
    menuTitle: { ...text.title, color: c.ink },
  });
