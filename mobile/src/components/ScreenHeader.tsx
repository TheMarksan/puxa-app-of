import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gutter, type Palette, space, text, usePalette } from '../theme';
import { BackButton } from './BackButton';

/**
 * Topo das telas: voltar à esquerda, ações à direita e, embaixo, o nome da tela em letra de
 * pôster. [subtitle] é a linha de apoio (quantos itens, o que a tela faz).
 */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.top, { paddingTop: insets.top + space[2] }]}>
      <View style={s.bar}>
        <BackButton />
        <View style={s.actions}>{right}</View>
      </View>
      <Text style={s.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    top: { paddingHorizontal: gutter, paddingBottom: space[4] },
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    title: { ...text.display, color: c.ink, marginTop: space[4] },
    subtitle: { ...text.body, color: c.muted, marginTop: space[1] },
  });
