import { Easing, useColorScheme } from 'react-native';

/** Mesmas cores do site; o tema escuro segue o do sistema. */
export const light = {
  bg: '#FAFAF8',
  surface: '#FFFFFF',
  ink: '#16191D',
  muted: '#5B626B',
  line: '#E1E3E6',
  lineStrong: '#C9CDD2',
  accent: '#2547D0',
  accentPressed: '#1D3AB0',
  accentSoft: '#EBEFFC',
  onAccent: '#FFFFFF',
  wa: '#0E7A43',
  waPressed: '#0B6537',
  waSoft: '#E7F4EC',
  danger: '#B42318',
  dangerSoft: '#FDF0EE',
  dangerLine: '#F1C7C1',
  hover: '#F3F4F5',
  disabledBg: '#E6E8EB',
  disabledInk: '#7A818A',
  sk: '#ECEDEF',
  wave: '#C3C8CE',
  waveActive: '#16191D',
  toastBg: '#FFFFFF',
  scrim: 'rgba(22, 25, 29, 0.42)',
  shadow: '#16191D',
  dark: false,
};

export const dark: typeof light = {
  bg: '#15171A',
  surface: '#1C1F23',
  ink: '#ECEEF0',
  muted: '#9BA2AB',
  line: '#2C3036',
  lineStrong: '#3C424A',
  accent: '#3D5EEA',
  accentPressed: '#5371F0',
  accentSoft: '#1E2645',
  onAccent: '#FFFFFF',
  wa: '#12804A',
  waPressed: '#169355',
  waSoft: '#16291F',
  danger: '#F2877B',
  dangerSoft: '#2C1A18',
  dangerLine: '#5A2B26',
  hover: '#22262B',
  disabledBg: '#2A2E34',
  disabledInk: '#7D848D',
  sk: '#24282D',
  wave: '#3E444C',
  waveActive: '#ECEEF0',
  toastBg: '#23272C',
  scrim: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
  dark: true,
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const font = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  black: 'Archivo_800ExtraBold',
};

export const radius = { slot: 14, btn: 12, thumb: 10, list: 14, sheet: 24 };

/** Curvas da stageshow: viagem (de um lugar a outro), chegada (algo novo aparece) e a do iOS para painéis. */
export const ease = {
  ui: Easing.bezier(0.2, 0.8, 0.2, 1),
  travel: Easing.bezier(0.45, 0, 0.1, 1),
  arrive: Easing.bezier(0.25, 0.8, 0.25, 1),
  ios: Easing.bezier(0.3, 0.75, 0.1, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
};
