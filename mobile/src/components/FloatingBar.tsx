import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { ms } from '../motion';
import { ease, type Palette, radius, space, text, usePalette } from '../theme';

export type BarItem = { key: string; icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void };

/**
 * Barra flutuante com os atalhos para Playlists, Figurinhas e Ajustes: uma peça escura sobre o
 * papel, ao alcance do polegar. Aparece no começo do app e sai de cena (para baixo, mais rápido
 * do que entra) quando há um vídeo aberto, o teclado está na tela ou um envio está em andamento.
 */
export function FloatingBar({ items, visible }: { items: BarItem[]; visible: boolean }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const [shown] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(shown, {
      toValue: visible ? 1 : 0,
      duration: ms(visible ? 300 : 180),
      delay: visible ? ms(60) : 0,
      easing: visible ? ease.arrive : ease.exit,
      useNativeDriver: true,
    }).start();
  }, [visible, shown]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!visible}
      style={[s.bar, { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [96, 0] }) }] }]}
      accessibilityRole="toolbar"
    >
      {items.map((it) => (
        <Pressable
          key={it.key}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            it.onPress();
          }}
          style={({ pressed }) => [s.item, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={it.label}
        >
          <Feather name={it.icon} size={20} color={c.onInverse} />
          <Text style={s.label} numberOfLines={1}>
            {it.label}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'stretch',
      height: 64,
      padding: space[1],
      borderRadius: radius.full,
      backgroundColor: c.inverse,
      boxShadow: c.shadow2,
    },
    item: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: space[1], borderRadius: radius.full },
    pressed: { backgroundColor: c.inverseVeil },
    label: { ...text.captionBold, lineHeight: 16, color: c.onInverse },
  });
