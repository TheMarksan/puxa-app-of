import * as Haptics from 'expo-haptics';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { type Palette, radius, space, text } from '../theme';

export type SnapStop = {
  value: number;
  label: string;
  /** Desenho pequeno acima do nome (cantos, altura…). */
  glyph: (on: boolean) => ReactNode;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Barra de 0 a 1 que gruda nos pontos marcados (com vibração), e os mesmos pontos como botões
 * embaixo, para quem prefere um toque. Usada nos cantos da figurinha e na altura da legenda.
 */
export function SnapSlider({
  title,
  value,
  onChange,
  stops,
  valueText,
  accessibilityLabel,
  c,
}: {
  title: string;
  value: number;
  onChange: (v: number) => void;
  stops: SnapStop[];
  valueText: (v: number) => string;
  accessibilityLabel: string;
  c: Palette;
}) {
  const [width, setWidth] = useState(0);
  const points = stops.map((p) => p.value);
  const live = useRef({ width, onChange, points });
  useLayoutEffect(() => {
    live.current = { width, onChange, points };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let x0 = 0;
    let last = -1;
    const set = (x: number) => {
      const { width: w, onChange: emit, points: snaps } = live.current;
      if (w <= 0) return;
      let v = clamp(x / w, 0, 1);
      const snap = snaps.find((p) => Math.abs(p - v) < 0.035);
      if (snap != null) v = snap;
      v = Math.round(v * 100) / 100;
      if (v === last) return;
      if (snap != null) Haptics.selectionAsync().catch(() => {});
      last = v;
      emit(v);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        x0 = e.nativeEvent.locationX;
        last = -1;
        set(x0);
      },
      onPanResponderMove: (_, g) => set(x0 + g.dx),
    });
  });
  const x = clamp(value, 0, 1) * width;
  // Leitor de tela: sobe ou desce até o próximo ponto marcado
  const step = (d: number) => {
    const next = d > 0 ? points.find((p) => p > value + 0.001) : [...points].reverse().find((p) => p < value - 0.001);
    onChange(clamp(next ?? (d > 0 ? 1 : 0), 0, 1));
  };
  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
        <Text style={[styles.value, { color: c.accentInk }]}>{valueText(value)}</Text>
      </View>
      <View
        style={styles.track}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: valueText(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        <View pointerEvents="none" style={[styles.rail, { backgroundColor: c.line }]}>
          <View style={{ width: x, height: 8, backgroundColor: c.accent }} />
        </View>
        {width > 0
          ? points.map((p) => <View key={p} pointerEvents="none" style={[styles.dot, { left: p * width - 2, backgroundColor: p <= value ? c.onAccent : c.lineStrong }]} />)
          : null}
        {width > 0 ? <View pointerEvents="none" style={[styles.thumb, { left: x - 14, backgroundColor: c.surface, borderColor: c.accent, boxShadow: c.shadow1 }]} /> : null}
        <View {...responder.panHandlers} style={[StyleSheet.absoluteFill, { top: -8, bottom: -8 }]} />
      </View>
      <View style={styles.stops}>
        {stops.map((p) => {
          const on = Math.abs(value - p.value) < 0.02;
          return (
            <Pressable
              key={p.value}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(p.value);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${title}: ${p.label}`}
              accessibilityState={{ selected: on }}
              style={styles.stop}
            >
              {p.glyph(on)}
              <Text style={[styles.stopText, { color: on ? c.accentInk : c.muted }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...text.captionBold },
  value: { ...text.captionBold, fontVariant: ['tabular-nums'] },
  // As pontas ficam no centro do primeiro e do último botão: o polegar nunca passa da borda
  track: { height: 36, justifyContent: 'center', marginHorizontal: space[8] },
  rail: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: radius.full, top: 16 },
  thumb: { position: 'absolute', top: 4, width: 28, height: 28, borderRadius: radius.full, borderWidth: 2 },
  stops: { flexDirection: 'row', justifyContent: 'space-between' },
  stop: { alignItems: 'center', gap: space[1], minWidth: 56, paddingVertical: space[1] },
  stopText: { ...text.caption },
});
