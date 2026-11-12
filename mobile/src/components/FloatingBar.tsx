import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ms } from '../motion';
import { ease, font, type Palette, usePalette } from '../theme';

export type BarItem = { key: string; icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void };

/**
 * Barra flutuante na cor principal, com os atalhos para Playlist, Figurinhas e Ajustes. Aparece no
 * começo do app e sai de cena (para baixo, mais rápido do que entra) quando há um vídeo aberto,
 * o teclado está na tela ou um envio está em andamento.
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
      style={[s.bar, { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }] }]}
      accessibilityRole="toolbar"
    >
      {items.map((it, i) => (
        <View key={it.key} style={s.slot}>
          {i > 0 ? <View style={s.divider} /> : null}
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              it.onPress();
            }}
            android_ripple={{ color: 'rgba(255,255,255,0.22)', borderless: false }}
            style={({ pressed }) => [s.item, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel={it.label}
          >
            <Feather name={it.icon} size={20} color="#FFFFFF" />
            <Text style={s.label} numberOfLines={1}>
              {it.label}
            </Text>
          </Pressable>
        </View>
      ))}
    </Animated.View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      height: 58,
      paddingHorizontal: 6,
      borderRadius: 29,
      backgroundColor: c.accent,
      shadowColor: c.accent,
      shadowOpacity: c.dark ? 0.5 : 0.36,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    slot: { flexDirection: 'row', alignItems: 'center' },
    divider: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: 'rgba(255,255,255,0.32)' },
    item: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 15, borderRadius: 24, overflow: 'hidden' },
    pressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
    label: { fontFamily: font.semibold, fontSize: 15, color: '#FFFFFF' },
  });
