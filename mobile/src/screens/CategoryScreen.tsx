import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { packsIn } from '../community/core';
import { PosterHero } from '../community/PosterHero';
import { CATEGORIES } from '../community/seed';
import { useDB, useFetched } from '../community/store';
import { PackRow, PackRowsSkeleton } from '../community/ui';
import { useInstaller } from '../community/useInstaller';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/ui';
import { gutter, type Palette, space, usePalette } from '../theme';

/** Uma categoria do acervo: o pôster na cor dela e os pacotes, dos mais adicionados para baixo. */
export function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const db = useDB();
  const ready = useFetched(`categoria-${id}`);
  const { install, busy } = useInstaller();
  const cat = CATEGORIES.find((x) => x.id === id);
  if (!cat)
    return (
      <View style={s.root}>
        <ScreenHeader title="Categoria" />
        <EmptyState icon="grid" title="Categoria não encontrada" body="Volte e escolha outra." />
      </View>
    );
  const packs = packsIn(db, cat.id);
  const inner = width - gutter * 2;
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[8] }}>
        <PosterHero
          color={cat.color}
          kicker="Categoria"
          title={cat.name}
          meta={packs.length === 1 ? '1 pacote' : `${packs.length} pacotes`}
          art={packs.flatMap((p) => p.stickers.slice(0, 1).map((x) => x.img))}
        />
        <View style={s.body}>
          {!ready ? (
            <PackRowsSkeleton width={inner} />
          ) : packs.length ? (
            packs.map((p) => <PackRow key={p.id} pack={p} width={inner} busy={busy === p.id} onAdd={() => install(p)} />)
          ) : (
            <EmptyState icon="package" title="Nada aqui ainda" body="Seja a primeira pessoa a publicar um pacote nesta categoria: em Figurinhas, abra uma pasta e toque em Publicar." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    body: { paddingHorizontal: gutter, paddingTop: space[6], gap: space[6] },
  });
