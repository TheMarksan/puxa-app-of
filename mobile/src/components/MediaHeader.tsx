import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from './BackButton';
import { control, gutter, type Palette, space, tabular, text, usePalette } from '../theme';

/** As cores dos botões redondos sobre o topo: brancos (ou elevados, no escuro), como os de um player. */
export type HeaderTint = { bg: string; ink: string };

/**
 * O topo das telas de mídia (playlist, pacote, categoria), no tom dos apps de música: um véu da
 * cor sobre o fundo, a capa no meio e, embaixo dela, o tipo, o nome e os números alinhados à
 * esquerda. [cover] é a capa já desenhada; [bottom] é o espaço embaixo (a playlist reserva a
 * metade do botão de tocar, que fica com o centro na borda).
 */
export function MediaHeader({
  tint,
  kicker,
  onKicker,
  title,
  meta,
  cover,
  right,
  bottom = space[6],
}: {
  tint: string;
  kicker: string;
  onKicker?: () => void;
  title: string;
  meta: string;
  cover?: ReactNode;
  right?: (tint: HeaderTint) => ReactNode;
  bottom?: number;
}) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const buttons: HeaderTint = { bg: c.dark ? c.raised : c.surface, ink: c.ink };
  return (
    <View style={[s.hero, { backgroundColor: tint, paddingTop: insets.top + space[2], paddingBottom: bottom }]}>
      <View style={s.bar}>
        <BackButton tint={buttons} />
        <View style={s.actions}>{right?.(buttons)}</View>
      </View>
      {cover ? <View style={s.cover}>{cover}</View> : null}
      <View style={s.text}>
        {onKicker ? (
          <Pressable onPress={onKicker} hitSlop={space[2]} style={s.kickerLink} accessibilityRole="link" accessibilityLabel={`Ver ${kicker}`}>
            <Text style={s.kicker}>{kicker}</Text>
          </Pressable>
        ) : (
          <Text style={s.kicker}>{kicker}</Text>
        )}
        <Text style={s.title} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        <Text style={s.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hero: { paddingHorizontal: gutter },
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: control.md },
    actions: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    cover: { alignItems: 'center', marginTop: space[2] },
    text: { marginTop: space[6], gap: space[1] },
    kickerLink: { alignSelf: 'flex-start' },
    kicker: { ...text.overline, color: c.muted },
    title: { ...text.title, color: c.ink },
    meta: { ...text.caption, ...tabular, color: c.muted },
  });
