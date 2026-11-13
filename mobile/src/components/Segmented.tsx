import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ms } from '../motion';
import { control, ease, type Palette, radius, space, text, usePalette } from '../theme';

type Option<T extends string> = { value: T; label: string; detail?: string; disabled?: boolean };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** sm: trilho de 40 de altura, para caber ao lado de outro controle. */
  size?: 'sm' | 'md';
};

/** Seletor de duas ou três opções: um trilho no poço e a escolhida numa peça clara que desliza. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel, size = 'md' }: Props<T>) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useState(() => new Animated.Value(index))[0];
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      x.setValue(index);
      return;
    }
    Animated.timing(x, { toValue: index, duration: ms(320), easing: ease.travel, useNativeDriver: true }).start();
  }, [index, x]);

  const segment = width > 0 ? (width - space[1] * 2) / options.length : 0;
  const height = options.some((o) => o.detail) ? control.lg : size === 'sm' ? control.sm - space[1] * 2 : control.sm;

  return (
    <View style={s.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {segment > 0 ? <Animated.View style={[s.thumb, { width: segment, transform: [{ translateX: Animated.multiply(x, segment) }] }]} pointerEvents="none" /> : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[s.option, { minHeight: height }]}
            hitSlop={{ top: space[2], bottom: space[2] }}
            disabled={o.disabled}
            onPress={() => !active && onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled: o.disabled }}
            accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}
          >
            <Text style={[s.label, { color: o.disabled ? c.disabledInk : active ? c.ink : c.muted }]}>{o.label}</Text>
            {o.detail ? <Text style={[s.detail, { color: o.disabled ? c.disabledInk : c.muted }]}>{o.detail}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    track: { flexDirection: 'row', padding: space[1], borderRadius: radius.full, backgroundColor: c.sunken },
    thumb: {
      position: 'absolute',
      top: space[1],
      bottom: space[1],
      left: space[1],
      borderRadius: radius.full,
      backgroundColor: c.dark ? c.raised : c.surface,
      boxShadow: c.shadow1,
    },
    option: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    label: { ...text.bodyBold },
    detail: { ...text.caption },
  });
