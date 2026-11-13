import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '../components/BackButton';
import { COLORS, type ListColor } from '../playlist/colors';
import { alpha, control, gutter, radius, space, tabular, text } from '../theme';
import type { Img } from './types';
import { StickerImage } from './ui';

/**
 * O topo de pôster do acervo (pacote e categoria): a cor de ponta a ponta, os anéis, até três
 * figurinhas inclinadas à direita e o nome grande. Mesma linguagem do topo das playlists.
 */
export function PosterHero({
  color,
  kicker,
  onKicker,
  title,
  meta,
  art,
  right,
}: {
  color: ListColor;
  kicker: string;
  onKicker?: () => void;
  title: string;
  meta: string;
  art: Img[];
  right?: (veil: { bg: string; ink: string }) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const k = COLORS[color];
  const veil = { bg: alpha(k.ink, 0.16), ink: k.ink };
  const s = useMemo(() => makeStyles(k.ink), [k.ink]);
  const spots = [
    { right: space[16] + space[6], top: space[12], rotate: '-10deg' },
    { right: space[1], top: space[16] + space[2], rotate: '9deg' },
    { right: space[12], top: space[16] + space[16] + space[2], rotate: '-4deg' },
  ];
  return (
    <View style={[s.hero, { backgroundColor: k.bg, paddingTop: insets.top + space[2] }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[1, 0.66, 0.36].map((f, i) => (
          <View key={i} style={[s.ring, { width: 360 * f, height: 360 * f, right: -112 * f, top: -64 * f }]} />
        ))}
        {art.slice(0, 3).map((img, i) => (
          <View key={i} style={[s.art, { right: spots[i].right, top: insets.top + spots[i].top, transform: [{ rotate: spots[i].rotate }] }]}>
            <StickerImage img={img} size={96} />
          </View>
        ))}
      </View>
      <View style={s.bar}>
        <BackButton tint={veil} />
        <View style={s.actions}>{right?.(veil)}</View>
      </View>
      <View style={s.text}>
        {onKicker ? (
          <Pressable onPress={onKicker} hitSlop={space[2]} accessibilityRole="link" accessibilityLabel={`Categoria ${kicker}`}>
            <Text style={s.kicker}>{kicker}</Text>
          </Pressable>
        ) : (
          <Text style={s.kicker}>{kicker}</Text>
        )}
        <Text style={s.title} numberOfLines={3} accessibilityRole="header">
          {title}
        </Text>
        <Text style={s.meta}>{meta}</Text>
      </View>
    </View>
  );
}

const makeStyles = (ink: string) =>
  StyleSheet.create({
    hero: { paddingHorizontal: gutter, paddingBottom: space[8], overflow: 'hidden' },
    ring: { position: 'absolute', borderRadius: radius.full, borderWidth: 16, borderColor: alpha(ink, 0.1) },
    art: { position: 'absolute' },
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: control.md },
    actions: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    text: { marginTop: space[16] + space[8], maxWidth: '72%' },
    kicker: { ...text.overline, color: alpha(ink, 0.8) },
    title: { ...text.display, color: ink, marginTop: space[1] },
    meta: { ...text.captionBold, ...tabular, color: alpha(ink, 0.8), marginTop: space[1] },
  });
