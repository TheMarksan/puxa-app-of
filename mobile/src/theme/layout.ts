/**
 * Grade de 4 pontos. Todo espaço do app sai desta escala: 4 e 8 entre coisas que andam juntas,
 * 12 e 16 dentro de um grupo, 24 entre grupos, 32 e 48 entre seções. O que é parente fica perto,
 * o que não é fica com o dobro de distância.
 */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const;

/** Margem lateral das telas e das folhas. */
export const gutter = space[6];

/** Cantos: 8 em miniaturas, 12 em peças pequenas, 16 em blocos e campos, 24 em cartões e folhas. */
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  /** Pílulas, círculos e barras finas. */
  full: 999,
} as const;

/** Altura dos controles. O alvo de toque nunca tem menos de 48. */
export const control = {
  sm: 40,
  md: 48,
  lg: 56,
} as const;

export const icon = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

/** Quanto falta para um alvo pequeno chegar a 48 de toque: `hitSlop={hit(32)}`. */
export const hit = (side: number) => Math.max(0, Math.ceil((48 - side) / 2));
