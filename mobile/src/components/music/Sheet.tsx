import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ms } from '../../motion';
import { ease, usePalette } from '../../theme';
import { useSheetDrag } from '../SheetParts';

/** Folha que sobe de baixo, com a alça para arrastar e fechar (as escolhas da área de música). */
export function Sheet({ visible, onClose, children, label }: { visible: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [slide] = useState(() => new Animated.Value(0));
  const drag = useSheetDrag(onClose, true);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      slide.setValue(0);
      drag.reset();
      Animated.timing(slide, { toValue: 1, duration: ms(320), easing: ease.ios, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(slide, { toValue: 0, duration: ms(200), easing: ease.exit, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: slide }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[
          styles.sheet,
          { backgroundColor: c.surface, paddingBottom: insets.bottom + 12, transform: [{ translateY: Animated.add(slide.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }), drag.drag) }] },
        ]}
      >
        <View {...drag.handlers} style={styles.handleZone}>
          <View style={[styles.grabber, { backgroundColor: c.lineStrong }]} />
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, elevation: 24, overflow: 'hidden' },
  handleZone: { paddingTop: 10, paddingBottom: 6, alignItems: 'center' },
  grabber: { width: 40, height: 4, borderRadius: 2 },
});
