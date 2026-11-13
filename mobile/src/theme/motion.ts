import { Easing } from 'react-native';

/** Curvas da stageshow: viagem (de um lugar a outro), chegada (algo novo aparece) e a do iOS para painéis. */
export const ease = {
  ui: Easing.bezier(0.2, 0.8, 0.2, 1),
  travel: Easing.bezier(0.45, 0, 0.1, 1),
  arrive: Easing.bezier(0.25, 0.8, 0.25, 1),
  ios: Easing.bezier(0.3, 0.75, 0.1, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
};

/** Três durações: resposta ao toque, troca de um elemento e superfícies grandes (folhas, telas). */
export const duration = {
  fast: 120,
  base: 220,
  slow: 360,
} as const;
