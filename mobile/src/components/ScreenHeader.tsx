import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, type Palette, usePalette } from '../theme';
import { BackButton } from './BackButton';

/** Topo das telas secundárias: voltar, título e, se houver, uma ação à direita. */
export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.top, { paddingTop: insets.top + 10 }]}>
      <BackButton />
      <Text style={s.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    top: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
    title: { flex: 1, minWidth: 0, fontFamily: font.bold, fontSize: 21, color: c.ink, letterSpacing: -0.4 },
  });
