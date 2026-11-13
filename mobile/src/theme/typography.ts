import type { TextStyle } from 'react-native';

/**
 * Duas famílias, cada uma com um papel: Anton é a letra de pôster (só em títulos grandes, em
 * maiúsculas) e Archivo é a letra de leitura, em dois pesos.
 */
export const font = {
  regular: 'Archivo_400Regular',
  bold: 'Archivo_700Bold',
  display: 'Anton_400Regular',
};

/**
 * A escala inteira: quatro tamanhos (40, 22, 16 e 13) e dois pesos. A hierarquia vem do tamanho,
 * do peso e da opacidade do nanquim (`ink`, `body`, `muted`), nunca de um tamanho novo.
 * As alturas de linha ficam na grade de 4.
 */
export const text = {
  /** Título de pôster: o nome da tela, da playlist, um número grande. */
  display: { fontFamily: font.display, fontSize: 40, lineHeight: 48, letterSpacing: 0.4, textTransform: 'uppercase', includeFontPadding: false },
  /** Título de folha, de seção em destaque, da música que está tocando. */
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  /** Botões, nomes nas listas e valores. */
  bodyBold: { fontFamily: font.bold, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 20 },
  /** Rótulos pequenos, pílulas e selos. */
  captionBold: { fontFamily: font.bold, fontSize: 13, lineHeight: 20 },
  /** Nome de seção: pequeno, em maiúsculas e espaçado. */
  overline: { fontFamily: font.bold, fontSize: 13, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

/** Números que mudam (tempo, tamanho, porcentagem) não dançam: todos os algarismos com a mesma largura. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export type TextName = keyof typeof text;
