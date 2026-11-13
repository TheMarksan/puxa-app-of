import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ReactNode, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, PressableProps, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { ms } from '../motion';
import { control, ease, radius, space, tabular, text, usePalette } from '../theme';

type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Layout do alvo de toque em si (flex, margens), fora da parte que encolhe. */
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode | ((pressed: boolean) => ReactNode);
  /** Quanto o elemento encolhe no toque: 0.97 para botões; 1 para linhas largas, que só mudam de fundo. */
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
        if (scaleTo !== 1) to(scaleTo, 90);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (scaleTo !== 1) to(1, 160);
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

/**
 * accent: a ação principal da tela (uma só). soft: a segunda opção, no azul bem claro.
 * neutral: ações de apoio. ghost: só o texto. danger: apagar. inverse: peça escura.
 */
type Tone = 'accent' | 'soft' | 'neutral' | 'ghost' | 'danger' | 'inverse';
type Size = 'lg' | 'md' | 'sm';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  tone?: Tone;
  size?: Size;
  icon?: keyof typeof Feather.glyphMap;
  /** Ação que termina no WhatsApp: leva o símbolo dele no lugar do ícone. */
  whatsapp?: boolean;
  busy?: boolean;
  disabled?: boolean;
  detail?: string;
  style?: StyleProp<ViewStyle>;
  /** Cor da playlist no lugar do azul: o botão principal segue a cor de onde está. */
  tint?: { bg: string; ink: string };
  accessibilityLabel?: string;
};

export function Button({ label, onPress, tone = 'accent', size = 'lg', icon, whatsapp, busy, disabled, detail, style, tint, accessibilityLabel }: ButtonProps) {
  const c = usePalette();
  const off = disabled || busy;
  const tones: Record<Tone, { bg: string; pressed: string; ink: string; border?: string; shadow?: string }> = {
    accent: { bg: c.accent, pressed: c.accentPressed, ink: c.onAccent, shadow: c.glow },
    soft: { bg: c.accentSoft, pressed: c.accentLine, ink: c.accentInk, border: c.accentLine },
    neutral: { bg: c.sunken, pressed: c.lineStrong, ink: c.ink },
    ghost: { bg: 'transparent', pressed: c.sunken, ink: c.ink },
    danger: { bg: c.dangerSoft, pressed: c.dangerLine, ink: c.danger, border: c.dangerLine },
    inverse: { bg: c.inverse, pressed: c.inversePressed, ink: c.onInverse, shadow: c.sheen },
  };
  const p = tint && tone === 'accent' ? { bg: tint.bg, pressed: tint.bg, ink: tint.ink, shadow: c.sheen, border: undefined } : tones[tone];
  const ink = disabled ? c.disabledInk : p.ink;
  const glyph = size === 'sm' ? 16 : 20;
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
            styles[size],
            {
              backgroundColor: disabled ? c.disabledBg : pressed ? p.pressed : p.bg,
              borderColor: disabled ? 'transparent' : p.border ?? 'transparent',
              boxShadow: disabled ? undefined : p.shadow,
              opacity: pressed && tint ? 0.88 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={ink} size="small" />
          ) : whatsapp ? (
            <FontAwesome name="whatsapp" size={glyph} color={ink} />
          ) : icon ? (
            <Feather name={icon} size={glyph} color={ink} />
          ) : null}
          <Text numberOfLines={1} style={[size === 'sm' ? styles.labelSm : styles.label, { color: ink }]}>
            {label}
          </Text>
          {detail ? (
            <Text numberOfLines={1} style={[styles.detail, { color: ink }]}>
              {detail}
            </Text>
          ) : null}
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: radius.full, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  lg: { minHeight: control.lg, paddingHorizontal: space[6] },
  md: { minHeight: control.md, paddingHorizontal: space[4] },
  sm: { minHeight: control.sm, paddingHorizontal: space[4], gap: space[1] },
  label: { ...text.bodyBold, flexShrink: 1 },
  labelSm: { ...text.captionBold, flexShrink: 1 },
  detail: { ...text.caption, ...tabular, opacity: 0.8 },
});
