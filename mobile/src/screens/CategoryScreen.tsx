import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ART } from '../community/art';
import { packsIn } from '../community/core';
import { PosterHero } from '../community/PosterHero';
import { CATEGORIES } from '../community/seed';
import { useDB, useFetched } from '../community/store';
import type { Category } from '../community/types';
import { PackCards, PackCardsSkeleton, still } from '../community/ui';
import { useInstaller } from '../community/useInstaller';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/ui';
import { COLORS } from '../playlist/colors';
import { control, gutter, type Palette, radius, space, text, usePalette } from '../theme';

/**
 * Uma categoria do acervo: o pôster na cor dela, a fileira com todas as categorias (troca ali
 * mesmo, sem voltar ao Início) e os pacotes em duas colunas, dos mais adicionados para baixo,
 * cada um com a foto e o @ de quem fez.
 */
export function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const db = useDB();
  const ready = useFetched(`categoria-${id}`);
  const { install, busy } = useInstaller();
  const rail = useRef<ScrollViewInstance>(null);
  const xs = useRef<Record<string, number>>({});
  const placed = useRef(false);
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
  // Deixa a categoria escolhida à vista na fileira, com um pedaço da anterior aparecendo
  const reveal = (x: number, animated: boolean) => rail.current?.scrollTo({ x: Math.max(0, x - gutter * 2), animated });
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[8] }}>
        <PosterHero color={cat.color} kicker="Categoria" title={cat.name} meta={packs.length === 1 ? '1 pacote' : `${packs.length} pacotes`} art={packs.flatMap((p) => p.stickers.slice(0, 1).map(still))} />
        <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} style={s.rail} contentContainerStyle={s.railContent} accessibilityRole="tablist" accessibilityLabel="Categorias">
          {CATEGORIES.map((k) => (
            <CategoryPill
              key={k.id}
              category={k}
              active={k.id === cat.id}
              s={s}
              c={c}
              onLayout={(x) => {
                xs.current[k.id] = x;
                if (k.id === cat.id && !placed.current) {
                  placed.current = true;
                  reveal(x, false);
                }
              }}
              onPress={() => {
                if (k.id === cat.id) return;
                Haptics.selectionAsync().catch(() => {});
                reveal(xs.current[k.id] ?? 0, true);
                router.setParams({ id: k.id });
              }}
            />
          ))}
        </ScrollView>
        <View style={s.body}>
          {!ready ? (
            <PackCardsSkeleton width={inner} />
          ) : packs.length ? (
            <PackCards packs={packs} width={inner} meta="author" busy={busy} onAdd={install} />
          ) : (
            <EmptyState icon="package" title="Nada aqui ainda" body="Seja a primeira pessoa a publicar um pacote nesta categoria: em Figurinhas, abra uma pasta e toque em Publicar." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Uma categoria na fileira: a figurinha dela pequena e o nome. A escolhida fica na cor do pôster. */
function CategoryPill({ category, active, onPress, onLayout, s, c }: { category: Category; active: boolean; onPress: () => void; onLayout: (x: number) => void; s: Styles; c: Palette }) {
  const k = COLORS[category.color];
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x)}
      style={({ pressed }) => [s.pill, { backgroundColor: active ? k.bg : pressed ? c.lineStrong : c.sunken }]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={category.name}
    >
      <Image source={ART[category.cover]} style={s.pillArt} resizeMode="contain" resizeMethod="resize" accessibilityIgnoresInvertColors />
      <Text style={[s.pillText, { color: active ? k.ink : c.ink }]}>{category.name}</Text>
    </Pressable>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    rail: { marginTop: space[4] },
    railContent: { paddingHorizontal: gutter, gap: space[2] },
    pill: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: control.sm, paddingLeft: space[2], paddingRight: space[4], borderRadius: radius.full },
    pillArt: { width: 24, height: 24 },
    pillText: { ...text.captionBold },
    body: { paddingHorizontal: gutter, paddingTop: space[6] },
  });
