import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { E } from '../editor/ui/palette';
import { control, hit, radius, usePalette } from '../theme';
import { Press } from './Button';

/**
 * O botão de voltar (ou fechar) de todas as telas: um círculo com a seta, sempre no mesmo lugar
 * e do mesmo tamanho. [dark] é a versão do editor, que é sempre escuro. [tint] troca as cores
 * (sobre a cor de uma playlist, por exemplo).
 */
export function BackButton({
  onPress,
  icon = 'back',
  dark,
  label,
  disabled,
  tint,
}: {
  onPress?: () => void;
  icon?: 'back' | 'close';
  dark?: boolean;
  label?: string;
  disabled?: boolean;
  tint?: { bg: string; ink: string };
}) {
  const c = usePalette();
  const router = useRouter();
  const bg = tint?.bg ?? (dark ? E.raised : c.sunken);
  const ink = tint?.ink ?? (dark ? E.ink : c.ink);
  return (
    <Press
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      disabled={disabled}
      scaleTo={0.92}
      hitSlop={hit(control.sm)}
      accessibilityRole="button"
      accessibilityLabel={label ?? (icon === 'close' ? 'Fechar' : 'Voltar')}
      style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }]}
    >
      {(pressed) => (
        <View style={[styles.inner, pressed && { opacity: 0.72 }]}>
          <Feather name={icon === 'close' ? 'x' : 'arrow-left'} size={20} color={ink} />
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  btn: { width: control.sm, height: control.sm, borderRadius: radius.full },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
