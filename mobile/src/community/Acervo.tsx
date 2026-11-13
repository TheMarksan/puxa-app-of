import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Segmented } from '../components/Segmented';
import { EmptyState } from '../components/ui';
import { gutter, hit, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { countsOf, feed, follows, matchAt, me, plural, search, shortcuts, type Shortcut } from './core';
import { CATEGORIES, TRENDING } from './seed';
import { categoryName, clearSearches, follow, forgetSearch, rememberSearch, unfollow, useDB, useFetched } from './store';
import { StickerSheet } from './StickerSheet';
import type { Pack, Sticker, User } from './types';
import { Avatar, Bone, CategoryArt, CategoryCircle, CreateCircle, FollowButton, PackRows, PackRowsSkeleton, PackThumb, PackTile, SectionHead, StickerGrid, TILE, UserName } from './ui';
import { useInstaller } from './useInstaller';

/**
 * O acervo no Início: [top] (os links) primeiro, depois categorias, o pacote em alta como pôster,
 * os mais adicionados da semana, de quem você segue, os populares e os novos. [width] é a largura
 * útil (tela menos as margens). Memorizado: o Início muda a cada letra digitada e a cada
 * progresso de download, e o acervo não tem nada a ver com isso.
 */
export const AcervoFeed = memo(function AcervoFeed({ width, top, onCreate, creating }: { width: number; top?: ReactNode; onCreate?: () => void; creating?: boolean }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const db = useDB();
  const ready = useFetched('inicio');
  const f = useMemo(() => feed(db), [db]);
  const { install, busy } = useInstaller();
  const router = useRouter();
  const user = me(db);

  return (
    <View style={s.feed}>
      {top}

      <View style={s.section}>
        <SectionHead title="Categorias" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.circles}>
          {onCreate ? <CreateCircle onPress={onCreate} busy={creating} /> : null}
          {CATEGORIES.map((cat) => (
            <CategoryCircle key={cat.id} category={cat} />
          ))}
        </ScrollView>
      </View>

      {!ready ? (
        <View style={s.section}>
          <View style={s.railSkeleton}>
            {[0, 1, 2].map((i) => (
              <Bone key={i} width={TILE} height={TILE} />
            ))}
          </View>
          <PackRowsSkeleton rows={3} />
        </View>
      ) : (
        <>
          {/* O destaque da semana é o primeiro do trilho, e não um pôster: o Início fica no tom de uma lista de músicas */}
          <View style={s.section}>
            <SectionHead title="Em alta na semana" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.rail}>
              {(f.featured ? [f.featured, ...f.trending] : f.trending).map((p) => (
                <PackTile key={p.id} pack={p} />
              ))}
            </ScrollView>
          </View>

          {user && f.following.length ? (
            <View style={s.section}>
              <SectionHead title="De quem você segue" />
              <PackRows packs={f.following} busy={busy} onAdd={install} />
            </View>
          ) : null}

          <View style={s.section}>
            <SectionHead title="Mais adicionados" />
            <PackRows packs={f.popular} busy={busy} onAdd={install} />
          </View>

          {!user ? (
            <Pressable
              onPress={() => router.push('/entrar')}
              style={({ pressed }) => [s.join, pressed && { opacity: 0.88 }]}
              accessibilityRole="button"
              accessibilityLabel="Entrar ou criar conta para seguir criadores e publicar seus pacotes"
            >
              <View style={s.joinIcon}>
                <Feather name="users" size={20} color={c.accentInk} />
              </View>
              <View style={s.joinText}>
                <Text style={s.joinTitle}>Siga quem faz figurinhas</Text>
                <Text style={s.joinBody}>Entre para seguir criadores, curtir e publicar seus pacotes.</Text>
              </View>
              <Feather name="chevron-right" size={20} color={c.muted} />
            </Pressable>
          ) : null}

          <View style={s.section}>
            <SectionHead title="Novos na comunidade" />
            <PackRows packs={f.fresh} busy={busy} onAdd={install} />
          </View>
        </>
      )}
    </View>
  );
});

/** Campo focado e vazio: as buscas recentes deste aparelho e o que está em alta. */
export function SearchSuggestions({ onPick }: { onPick: (q: string) => void }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const db = useDB();
  return (
    <View style={s.feed}>
      {db.searches.length ? (
        <View style={s.section}>
          <SectionHead title="Buscas recentes" action="Limpar" onAction={clearSearches} />
          <View>
            {db.searches.map((q) => (
              <View key={q} style={s.recentRow}>
                <Pressable onPress={() => onPick(q)} style={({ pressed }) => [s.recentMain, pressed && { opacity: 0.72 }]} accessibilityRole="button" accessibilityLabel={`Buscar ${q}`}>
                  <View style={s.recentIcon}>
                    <Feather name="clock" size={16} color={c.muted} />
                  </View>
                  <Text style={s.recentText} numberOfLines={1}>
                    {q}
                  </Text>
                </Pressable>
                <Pressable onPress={() => forgetSearch(q)} hitSlop={hit(24)} style={s.recentX} accessibilityRole="button" accessibilityLabel={`Tirar ${q} das buscas recentes`}>
                  <Feather name="x" size={16} color={c.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={s.section}>
        <SectionHead title="Em alta" />
        <View style={s.trends}>
          {TRENDING.map((q, i) => (
            <Pressable key={q} onPress={() => onPick(q)} style={({ pressed }) => [s.trend, pressed && { backgroundColor: c.lineStrong }]} accessibilityRole="button" accessibilityLabel={`Em alta, número ${i + 1}: ${q}`}>
              <Text style={s.trendRank}>{i + 1}</Text>
              <Text style={s.trendText}>{q}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

type Tab = 'stickers' | 'packs' | 'people';

/** Resultado da busca em três abas: figurinhas soltas, pacotes e pessoas. */
export function SearchResults({ query, width }: { query: string; width: number }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const db = useDB();
  const router = useRouter();
  const r = useMemo(() => search(db, query, categoryName), [db, query]);
  const [tab, setTab] = useState<Tab>('stickers');
  const [open, setOpen] = useState<{ sticker: Sticker; pack: Pack } | null>(null);
  const { install, busy } = useInstaller();
  const user = me(db);
  // A aba escolhida sem resultado (e outra com): mostra a que tem
  const counts = { stickers: r.stickers.length, packs: r.packs.length, people: r.people.length };
  const shown: Tab = counts[tab] ? tab : counts.stickers ? 'stickers' : counts.packs ? 'packs' : counts.people ? 'people' : tab;
  const none = !counts.stickers && !counts.packs && !counts.people;
  const hits = useMemo(() => shortcuts(db, query, CATEGORIES), [db, query]);

  if (none) return <EmptyState icon="search" title="Nada com esse nome" body={`Nenhuma figurinha, pacote ou pessoa para "${query.trim()}". Tente outra palavra, como as que estão em alta.`} style={s.empty} />;

  return (
    <View style={[s.results, hits.length ? s.resultsNear : null]}>
      {hits.length ? <Shortcuts items={hits} query={query} /> : null}
      <Segmented<Tab>
        size="sm"
        accessibilityLabel="Tipo de resultado"
        value={shown}
        onChange={(v) => {
          Haptics.selectionAsync().catch(() => {});
          setTab(v);
        }}
        options={[
          { value: 'stickers', label: `Figurinhas ${counts.stickers}`, disabled: !counts.stickers },
          { value: 'packs', label: `Pacotes ${counts.packs}`, disabled: !counts.packs },
          { value: 'people', label: `Pessoas ${counts.people}`, disabled: !counts.people },
        ]}
      />
      {shown === 'stickers' ? (
        <StickerGrid items={r.stickers.slice(0, 40)} width={width} onPress={(sticker, pack) => setOpen({ sticker, pack })} />
      ) : shown === 'packs' ? (
        <PackRows packs={r.packs} busy={busy} onAdd={install} />
      ) : (
        <View style={s.people}>
          {r.people.map((u) => (
            <PersonRow key={u.id} user={u} me={user} following={!!user && follows(db, user.id, u.id)} onOpen={() => router.push(`/perfil/${u.id}`)} />
          ))}
        </View>
      )}
      <StickerSheet item={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/**
 * Os atalhos, num painel colado no campo como uma lista de sugestões: o mais certeiro primeiro,
 * cada linha com a peça do tipo (a cor da categoria, a foto da pessoa, a capa do pacote), o nome
 * com o pedaço digitado em negrito e embaixo o que é aquilo.
 */
function Shortcuts({ items, query }: { items: Shortcut[]; query: string }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const db = useDB();
  const go = (path: string) => {
    Haptics.selectionAsync().catch(() => {});
    rememberSearch(query);
    router.push(path);
  };
  return (
    <View style={s.panel}>
      {items.map((it) => {
        const row =
          it.kind === 'category'
            ? {
                key: `c:${it.category.id}`,
                title: it.category.name,
                meta: `Categoria · ${plural(it.packs, 'pacote', 'pacotes')}`,
                path: `/categoria/${it.category.id}`,
                tile: <CategoryArt category={it.category} size={48} />,
              }
            : it.kind === 'person'
              ? { key: `u:${it.user.id}`, title: it.user.name, meta: `Perfil · @${it.user.username}`, path: `/perfil/${it.user.id}`, tile: <Avatar user={it.user} size={48} /> }
              : {
                  key: `p:${it.pack.id}`,
                  title: it.pack.name,
                  meta: `Pacote · @${db.users.find((u) => u.id === it.pack.author)?.username ?? 'alguem'}`,
                  path: `/pacote/${it.pack.id}`,
                  tile: <PackThumb pack={it.pack} size={48} />,
                };
        return (
          <Pressable key={row.key} onPress={() => go(row.path)} style={({ pressed }) => [s.shortcut, pressed && { backgroundColor: c.sunken }]} accessibilityRole="button" accessibilityLabel={`${row.title}. ${row.meta}`}>
            {row.tile}
            <View style={s.shortcutText}>
              <Marked value={row.title} query={query} />
              <Text style={s.shortcutMeta} numberOfLines={1}>
                {row.meta}
              </Text>
            </View>
            {it.kind === 'person' && it.user.verified ? <Feather name="check-circle" size={16} color={c.accentInk} accessibilityLabel="Conta verificada" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** O nome com o pedaço que bate com a busca em negrito. */
function Marked({ value, query }: { value: string; query: string }) {
  const c = usePalette();
  const at = matchAt(value, query);
  const base = [text.body, { color: c.ink }];
  if (!at) {
    return (
      <Text style={base} numberOfLines={1}>
        {value}
      </Text>
    );
  }
  return (
    <Text style={base} numberOfLines={1}>
      {value.slice(0, at[0])}
      <Text style={text.bodyBold}>{value.slice(at[0], at[1])}</Text>
      {value.slice(at[1])}
    </Text>
  );
}

/** Uma pessoa numa lista: foto, nome, @ e seguidores, com o botão de seguir. */
export function PersonRow({ user, me: viewer, following, onOpen }: { user: User; me: User | null; following: boolean; onOpen: () => void }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const db = useDB();
  const router = useRouter();
  const n = countsOf(db, user.id);
  return (
    <View style={s.person}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [s.personMain, pressed && { opacity: 0.72 }]}
        accessibilityRole="button"
        accessibilityLabel={`${user.name}, @${user.username}, ${plural(n.followers, 'seguidor', 'seguidores')}. Abrir o perfil`}
      >
        <Avatar user={user} size={48} />
        <View style={s.personText}>
          <UserName user={user} style={null} />
          <Text style={s.personMeta} numberOfLines={1}>
            @{user.username} · {plural(n.followers, 'seguidor', 'seguidores')}
          </Text>
        </View>
      </Pressable>
      {viewer?.id === user.id ? null : (
        <FollowButton
          following={following}
          tone="soft"
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
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    feed: { gap: space[8], marginTop: space[6] },
    section: { gap: space[4] },
    bleed: { marginHorizontal: -gutter },
    rail: { paddingHorizontal: gutter, gap: space[3] },
    // Os círculos de 64 ficam a 8 um do outro (a peça tem 72 para o nome caber embaixo)
    circles: { paddingHorizontal: gutter, gap: space[2] },
    railSkeleton: { flexDirection: 'row', gap: space[3] },
    join: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: c.dark ? c.raised : c.surface },
    joinIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    joinText: { flex: 1, minWidth: 0 },
    joinTitle: { ...text.bodyBold, color: c.ink },
    joinBody: { ...text.caption, color: c.body },
    recentRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
    recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 },
    recentIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' },
    recentText: { ...text.body, flex: 1, color: c.ink },
    recentX: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    trends: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    trend: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: 40, paddingLeft: space[2], paddingRight: space[4], borderRadius: radius.full, backgroundColor: c.sunken },
    trendRank: { ...text.captionBold, ...tabular, minWidth: 24, height: 24, lineHeight: 24, borderRadius: radius.full, textAlign: 'center', overflow: 'hidden', backgroundColor: c.inverse, color: c.onInverse },
    trendText: { ...text.captionBold, color: c.ink },
    results: { gap: space[4], marginTop: space[6] },
    // Com atalhos, o painel encosta no campo (é dele) e os resultados ficam um grupo abaixo
    resultsNear: { marginTop: space[3] },
    panel: { padding: space[2], marginBottom: space[2], borderRadius: radius.xl, backgroundColor: c.dark ? c.raised : c.surface, boxShadow: c.shadow1 },
    shortcut: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingHorizontal: space[2], borderRadius: radius.lg },
    shortcutText: { flex: 1, minWidth: 0 },
    shortcutMeta: { ...text.caption, color: c.muted },
    people: { gap: space[4] },
    empty: { marginTop: space[6] },
    person: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    personMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space[3] },
    personText: { flex: 1, minWidth: 0 },
    personMeta: { ...text.caption, ...tabular, color: c.muted },
  });
