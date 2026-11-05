import Feather from '@expo/vector-icons/Feather';
import { ReactNode, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, PressableProps, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { ms } from '../motion';
import { ease, font, radius, usePalette } from '../theme';

type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Layout do alvo de toque em si (flex, margens), fora da parte que encolhe. */
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode | ((pressed: boolean) => ReactNode);
  /** Quanto o elemento encolhe no toque; 0.97 para botões, 0.99 para linhas largas. */
  scaleTo?: number;
};

/** Toque com resposta física: encolhe um pouco ao apertar e volta ao soltar. */
export function Press({ style, containerStyle, children, scaleTo = 0.97, onPressIn, onPressOut, disabled, ...rest }: PressProps) {
  const scale = useState(() => new Animated.Value(1))[0];
  const to = (value: number, duration: number) =>
    Animated.timing(scale, { toValue: value, duration: ms(duration), easing: ease.ui, useNativeDriver: true }).start();
  return (
    <Pressable
      {...rest}
      style={containerStyle}
      disabled={disabled}
      onPressIn={(e) => {
        to(scaleTo, 90);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1, 160);
        onPressOut?.(e);
      }}
    >
      {({ pressed }) => (
        <Animated.View style={[style, { transform: [{ scale }] }]}>
          {typeof children === 'function' ? children(pressed) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}

type Tone = 'accent' | 'wa' | 'neutral' | 'ghost' | 'danger';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  tone?: Tone;
  icon?: keyof typeof Feather.glyphMap;
  busy?: boolean;
  disabled?: boolean;
  detail?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  accessibilityLabel?: string;
};

export function Button({ label, onPress, tone = 'accent', icon, busy, disabled, detail, style, compact, accessibilityLabel }: ButtonProps) {
  const c = usePalette();
  const off = disabled || busy;
  const palette: Record<Tone, { bg: string; pressed: string; ink: string; border?: string }> = {
    accent: { bg: c.accent, pressed: c.accentPressed, ink: c.onAccent },
    wa: { bg: c.wa, pressed: c.waPressed, ink: '#FFFFFF' },
    neutral: { bg: c.surface, pressed: c.hover, ink: c.ink, border: c.lineStrong },
    ghost: { bg: 'transparent', pressed: c.hover, ink: c.ink },
    danger: { bg: c.surface, pressed: c.dangerSoft, ink: c.danger, border: c.dangerLine },
  };
  const p = palette[tone];
  return (
    <Press
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (detail ? `${label}, ${detail}` : label)}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      containerStyle={style}
    >
      {(pressed) => (
        <View
          style={[
            styles.button,
            compact && styles.compact,
            {
              backgroundColor: disabled ? c.disabledBg : pressed ? p.pressed : p.bg,
              borderColor: disabled ? c.disabledBg : p.border ?? 'transparent',
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={p.ink} size="small" />
          ) : icon ? (
            <Feather name={icon} size={compact ? 17 : 19} color={disabled ? c.disabledInk : p.ink} />
          ) : null}
          <Text numberOfLines={1} style={[styles.label, compact && styles.labelCompact, { color: disabled ? c.disabledInk : p.ink }]}>
            {label}
          </Text>
          {detail ? (
            <Text numberOfLines={1} style={[styles.detail, { color: disabled ? c.disabledInk : p.ink }]}>
              {detail}
            </Text>
          ) : null}
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.btn,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 9,
  },
  compact: { minHeight: 46, paddingHorizontal: 14, gap: 7 },
  label: { fontFamily: font.semibold, fontSize: 16, letterSpacing: -0.1 },
  labelCompact: { fontSize: 15 },
  detail: { fontFamily: font.medium, fontSize: 15, opacity: 0.78, fontVariant: ['tabular-nums'] },
});
