import { useColorScheme } from 'react-native';

import { useSettings } from '../settings';

import { dark, light, type Palette } from './palette';

/** O tema escuro segue o do sistema, a não ser que a pessoa escolha nos Ajustes. */
export function usePalette(): Palette {
  const system = useColorScheme();
  const { theme } = useSettings();
  const isDark = theme === 'system' ? system === 'dark' : theme === 'dark';
  return isDark ? dark : light;
}
