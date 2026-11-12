import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import { reduceMotion } from '../motion';
import { usePalette } from '../theme';

const BLOBS = [
  { src: require('../../assets/aurora-blue.png'), x: -0.25, y: -0.35, size: 1.1, dx: 0.12, dy: 0.06, period: 17000 },
  { src: require('../../assets/aurora-violet.png'), x: 0.45, y: -0.4, size: 0.95, dx: -0.1, dy: 0.08, period: 21000 },
  { src: require('../../assets/aurora-teal.png'), x: 0.1, y: -0.05, size: 0.8, dx: 0.08, dy: -0.05, period: 25000 },
];

/**
 * Luz suave atrás do topo da tela: três manchas de cor que se movem devagar (17 a 25 s por ciclo).
 * Fica parada quando o sistema pede menos movimento.
 */
export function Aurora() {
  const c = usePalette();
  const { width } = useWindowDimensions();
  const [t] = useState(() => BLOBS.map(() => new Animated.Value(0)));

  useEffect(() => {
    if (reduceMotion()) return;
    const loops = t.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: BLOBS[i].period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: BLOBS[i].period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [t]);

  return (
    <View pointerEvents="none" style={[styles.wrap, { height: width * 0.95, opacity: c.dark ? 0.5 : 0.32 }]}>
      {BLOBS.map((b, i) => (
        <Animated.Image
          key={i}
          source={b.src}
          style={{
            position: 'absolute',
            left: b.x * width,
            top: b.y * width,
            width: b.size * width,
            height: b.size * width,
            transform: [
              { translateX: t[i].interpolate({ inputRange: [0, 1], outputRange: [0, b.dx * width] }) },
              { translateY: t[i].interpolate({ inputRange: [0, 1], outputRange: [0, b.dy * width] }) },
              { scale: t[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});
