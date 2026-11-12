import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text } from 'react-native';

import { font, type Palette } from '../theme';

/** Opção em forma de pílula; a escolhida fica na cor principal. */
export function Pill({
  label,
  active,
  onPress,
  c,
  icon,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  c: Palette;
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
}) {
  const s = pill(c);
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      style={[s.base, active && { backgroundColor: c.accent, borderColor: c.accent }, disabled && { opacity: 0.45 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
    >
      {icon ? <Feather name={icon} size={15} color={active ? '#fff' : c.ink} /> : null}
      <Text style={[s.text, active && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const cache = new WeakMap<Palette, ReturnType<typeof make>>();
const pill = (c: Palette) => {
  let s = cache.get(c);
  if (!s) {
    s = make(c);
    cache.set(c, s);
  }
  return s;
};

const make = (c: Palette) =>
  StyleSheet.create({
    base: { flexDirection: 'row', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    text: { fontFamily: font.semibold, fontSize: 14, color: c.ink },
  });
