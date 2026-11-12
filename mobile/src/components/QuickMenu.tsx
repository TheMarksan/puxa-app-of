import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ms } from '../motion';
import { ease, font, type Palette, usePalette } from '../theme';
import type { BarItem } from './FloatingBar';

/**
 * Atalho do topo para Playlist, Figurinhas e Ajustes enquanto a barra flutuante está fora de cena
 * (com um vídeo aberto): os destinos continuam a um toque, sem a barra cobrir o rodapé.
 */
export function QuickMenu({ items, visible }: { items: BarItem[]; visible: boolean }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [shown] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [pop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(shown, { toValue: visible ? 1 : 0, duration: ms(visible ? 240 : 150), easing: visible ? ease.arrive : ease.exit, useNativeDriver: true }).start();
  }, [visible, shown]);

  useEffect(() => {
    if (!open) return;
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: ms(220), easing: ease.arrive, useNativeDriver: true }).start();
  }, [open, pop]);

  const close = (then?: () => void) => {
    Animated.timing(pop, { toValue: 0, duration: ms(140), easing: ease.exit, useNativeDriver: true }).start(() => {
      setOpen(false);
      then?.();
    });
  };

  return (
    <>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={{ opacity: shown, transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setOpen(true);
          }}
          hitSlop={8}
          style={({ pressed }) => [s.button, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Menu: Playlist, Figurinhas e Ajustes"
          accessibilityState={{ expanded: open }}
        >
          <Feather name="grid" size={19} color={c.ink} />
        </Pressable>
      </Animated.View>
      {open ? (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Fechar o menu">
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }]} />
          </Pressable>
          <Animated.View
            style={[
              s.menu,
              { top: insets.top + 64, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
            ]}
          >
            {items.map((it) => (
              <Pressable
                key={it.key}
                onPress={() => close(it.onPress)}
                android_ripple={{ color: c.hover }}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: c.hover }]}
                accessibilityRole="button"
                accessibilityLabel={it.label}
              >
                <View style={s.icon}>
                  <Feather name={it.icon} size={18} color={c.accentInk} />
                </View>
                <Text style={s.label}>{it.label}</Text>
              </Pressable>
            ))}
          </Animated.View>
        </Modal>
      ) : null}
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    button: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.dark ? c.hover : c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    menu: {
      position: 'absolute',
      right: 16,
      minWidth: 210,
      paddingVertical: 6,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      shadowColor: c.shadow,
      shadowOpacity: c.dark ? 0.5 : 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 14,
      transformOrigin: 'top right',
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingHorizontal: 14 },
    icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
  });
