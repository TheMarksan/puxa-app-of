import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ms } from '../motion';
import { ease, font, Palette, usePalette } from '../theme';

type Option<T extends string> = { value: T; label: string; detail?: string; disabled?: boolean };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Seletor de duas ou três opções; o destaque desliza até a escolhida. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
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

  const segment = width > 0 ? (width - 8) / options.length : 0;

  return (
    <View style={s.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {segment > 0 ? (
        <Animated.View
          style={[s.thumb, { width: segment, transform: [{ translateX: Animated.multiply(x, segment) }] }]}
          pointerEvents="none"
        />
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={s.option}
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
    track: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: 16,
      backgroundColor: c.dark ? c.bg : c.hover,
      borderWidth: 1,
      borderColor: c.line,
    },
    thumb: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: c.dark ? 1 : 0,
      borderColor: c.lineStrong,
      shadowColor: c.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    option: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 1 },
    label: { fontFamily: font.semibold, fontSize: 16 },
    detail: { fontFamily: font.regular, fontSize: 13 },
  });
