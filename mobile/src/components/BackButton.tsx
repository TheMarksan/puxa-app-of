import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { E } from '../editor/ui/palette';
import { usePalette } from '../theme';
import { Press } from './Button';

/**
 * O botão de voltar (ou fechar) de todas as telas: um círculo com a seta, sempre no mesmo lugar
 * e do mesmo tamanho. [dark] é a versão do editor, que é sempre escuro.
 */
export function BackButton({
  onPress,
  icon = 'back',
  dark,
  label,
  disabled,
}: {
  onPress?: () => void;
  icon?: 'back' | 'close';
  dark?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const c = usePalette();
  const router = useRouter();
  const bg = dark ? E.raised : c.dark ? c.hover : c.surface;
  const border = dark ? E.line : c.line;
  const ink = dark ? E.ink : c.ink;
  return (
    <Press
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      disabled={disabled}
      scaleTo={0.9}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label ?? (icon === 'close' ? 'Fechar' : 'Voltar')}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : 1 }]}
    >
      {(pressed) => (
        <View style={[styles.inner, pressed && { opacity: 0.7 }]}>
          <Feather name={icon === 'close' ? 'x' : 'arrow-left'} size={icon === 'close' ? 20 : 21} color={ink} />
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  btn: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
