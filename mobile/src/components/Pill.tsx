import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text } from 'react-native';

import { control, hit, type Palette, radius, space, text } from '../theme';

/** Opção em forma de pílula. A escolhida vira peça escura; as outras ficam no poço. */
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
  const ink = active ? c.onInverse : c.ink;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      hitSlop={hit(control.sm)}
      style={({ pressed }) => [styles.base, { backgroundColor: active ? c.inverse : c.sunken, opacity: disabled ? 0.4 : pressed ? 0.72 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
    >
      {icon ? <Feather name={icon} size={16} color={ink} /> : null}
      <Text style={[styles.text, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', gap: space[2], height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  text: { ...text.captionBold },
});
