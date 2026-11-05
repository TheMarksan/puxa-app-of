import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { QualityOption } from '../../modules/puxa-engine';
import { bytes } from '../format';
import { ms } from '../motion';
import { ease, font, Palette, radius, usePalette } from '../theme';

const ROW = 58;

type Props = {
  options: QualityOption[];
  value: string | null;
  onChange: (id: string) => void;
  /** Muda quando o formato muda, para a lista entrar de novo. */
  group: string;
};

/** Lista de qualidades; o destaque desliza de uma linha para a outra. */
export function QualityList({ options, value, onChange, group }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const y = useState(() => new Animated.Value(index * ROW))[0];
  const fade = useState(() => new Animated.Value(1))[0];
  const height = useState(() => new Animated.Value(options.length * ROW))[0];
  const [shownGroup, setShownGroup] = useState(group);
  const mounted = useRef(false);

  // Trocar de formato: as linhas novas já nascem transparentes (ainda na renderização,
  // antes da pintura), a lista muda de altura junto e elas aparecem
  if (shownGroup !== group) {
    setShownGroup(group);
    y.setValue(index * ROW);
    fade.setValue(0);
  }
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    Animated.parallel([
      Animated.timing(height, { toValue: options.length * ROW, duration: ms(280), easing: ease.travel, useNativeDriver: false }),
      Animated.timing(fade, { toValue: 1, duration: ms(220), delay: ms(60), easing: ease.arrive, useNativeDriver: false }),
    ]).start();
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escolher outra qualidade: o destaque viaja até ela
  useEffect(() => {
    Animated.timing(y, { toValue: index * ROW, duration: ms(260), easing: ease.travel, useNativeDriver: false }).start();
  }, [index, y]);

  return (
    <Animated.View style={[s.list, { height: Animated.add(height, 2) }]} accessibilityRole="radiogroup" accessibilityLabel="Qualidade">
      <Animated.View pointerEvents="none" style={[s.indicator, { opacity: fade, transform: [{ translateY: y }] }]} />
      <Animated.View style={{ opacity: fade }}>
        {options.map((o, i) => {
          const active = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => !active && onChange(o.id)}
              style={({ pressed }) => [s.row, i > 0 && s.divider, pressed && !active && { backgroundColor: c.hover }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={[o.label, o.note, bytes(o.size)].filter(Boolean).join(', ')}
            >
              <View style={[s.radio, active && { borderColor: c.accent }]}>{active ? <View style={s.dot} /> : null}</View>
              <Text style={[s.label, active && { color: c.ink }]}>{o.label}</Text>
              {o.note ? (
                <View style={[s.chip, active && { backgroundColor: c.surface }]}>
                  <Text style={s.chipText}>{o.note}</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }} />
              <Text style={s.size}>{o.size ? bytes(o.size) : '—'}</Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: {
      borderRadius: radius.list,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    indicator: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: ROW,
      backgroundColor: c.accentSoft,
      borderLeftWidth: 3,
      borderLeftColor: c.accent,
    },
    row: { height: ROW, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
    label: { fontFamily: font.semibold, fontSize: 16, color: c.ink, fontVariant: ['tabular-nums'] },
    chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.hover },
    chipText: { fontFamily: font.medium, fontSize: 12, color: c.muted },
    size: { fontFamily: font.medium, fontSize: 15, color: c.muted, fontVariant: ['tabular-nums'] },
  });
