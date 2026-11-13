const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Uma cor com transparência. As variações de opacidade do nanquim é que fazem a hierarquia do texto. */
export const alpha = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** Sobre foto e vídeo as cores não mudam com o tema: branco em cima de um véu escuro. */
export const media = {
  on: '#FFFFFF',
  onSoft: 'rgba(255, 255, 255, 0.72)',
  scrim: 'rgba(10, 12, 15, 0.72)',
  /** Trilho de progresso por cima do vídeo. */
  track: 'rgba(255, 255, 255, 0.32)',
  /** O fundo do vídeo: preto de palco. */
  stage: '#000000',
  /** Sombra da capa grande sobre o fundo escuro do player. */
  lift: '0 16px 40px rgba(0, 0, 0, 0.4)',
} as const;

const INK = '#15161A';
const PAPER = '#F4F2EC';
const BLUE = '#2B4BFF';
/** Sombra tingida do papel (marrom bem escuro), nunca cinza ou preto puro. */
const SHADE = '31, 27, 16';

/**
 * Regra 60/30/10: 60% papel (fundos), 30% nanquim (texto e peças escuras) e 10% azul (a ação
 * principal e o que precisa ser visto primeiro). As cores fortes das playlists ficam em
 * `playlist/colors.ts` e pintam só o que é da playlist.
 */
export const light = {
  // 60%: papel
  bg: PAPER,
  surface: '#FFFFFF',
  /** Folhas, avisos e menus: o que flutua por cima da tela. */
  raised: '#FFFFFF',
  /** Poço: campos, trilhos e pílulas não escolhidas. Translúcido, serve sobre o papel e sobre o branco. */
  sunken: alpha(INK, 0.06),

  // 30%: nanquim. Títulos a 100%, texto corrido a 80%, apoio a 64%.
  ink: INK,
  body: alpha(INK, 0.8),
  muted: alpha(INK, 0.64),
  faint: alpha(INK, 0.4),
  line: alpha(INK, 0.08),
  lineStrong: alpha(INK, 0.16),
  /** Peça escura sobre o papel: a barra flutuante e as pílulas escolhidas. */
  inverse: INK,
  inversePressed: '#2C2E35',
  onInverse: '#FFFFFF',

  // 10%: azul
  accent: BLUE,
  accentPressed: '#1E3AE0',
  accentSoft: alpha(BLUE, 0.08),
  accentLine: alpha(BLUE, 0.16),
  /** Azul para texto e ícones sobre as superfícies (no escuro, mais claro para ter contraste). */
  accentInk: BLUE,
  onAccent: '#FFFFFF',

  // Estados: aparecem só quando significam alguma coisa
  success: '#0B7A45',
  successSoft: alpha('#0B7A45', 0.1),
  successInk: '#08693A',
  danger: '#B42318',
  dangerSoft: alpha('#B42318', 0.08),
  dangerLine: alpha('#B42318', 0.24),

  disabledBg: alpha(INK, 0.08),
  disabledInk: alpha(INK, 0.4),
  sk: alpha(INK, 0.08),
  wave: alpha(INK, 0.24),
  waveActive: INK,
  scrim: alpha(INK, 0.48),
  onMedia: media.on,
  onMediaSoft: media.onSoft,
  mediaScrim: media.scrim,
  mediaTrack: media.track,
  stage: media.stage,
  /** Toque sobre uma peça escura. */
  inverseVeil: 'rgba(255, 255, 255, 0.12)',
  /** O fundo de uma conversa do WhatsApp: é sobre ele que a figurinha vai aparecer. */
  chat: '#EFEAE2',

  // Sombras: suaves e na cor do fundo. São três alturas e o brilho do botão principal.
  shadow1: `0 1px 2px rgba(${SHADE}, 0.06), 0 2px 8px rgba(${SHADE}, 0.05)`,
  shadow2: `0 2px 6px rgba(${SHADE}, 0.08), 0 12px 28px rgba(${SHADE}, 0.14)`,
  shadow3: `0 -2px 12px rgba(${SHADE}, 0.06), 0 16px 48px rgba(${SHADE}, 0.2)`,
  /** Botão principal: um fio de luz por dentro, em cima, e a sombra na cor do próprio botão. */
  glow: `inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 8px 20px ${alpha(BLUE, 0.3)}`,
  /** Só o fio de luz por dentro (peças escuras e botões menores). */
  sheen: 'inset 0 1px 0 rgba(255, 255, 255, 0.16)',
  dark: false,
};

const D_INK = '#F2F1EC';
const D_BLUE = '#3A5BFF';

export const dark: typeof light = {
  bg: '#0F1012',
  surface: '#191B1F',
  raised: '#23262B',
  sunken: alpha(D_INK, 0.07),

  ink: D_INK,
  body: alpha(D_INK, 0.8),
  muted: alpha(D_INK, 0.64),
  faint: alpha(D_INK, 0.4),
  line: alpha(D_INK, 0.1),
  lineStrong: alpha(D_INK, 0.2),
  inverse: D_INK,
  inversePressed: '#D8D7D2',
  onInverse: INK,

  accent: D_BLUE,
  accentPressed: '#5674FF',
  accentSoft: alpha('#5C7BFF', 0.16),
  accentLine: alpha('#5C7BFF', 0.32),
  accentInk: '#93A6FF',
  onAccent: '#FFFFFF',

  success: '#12804A',
  successSoft: alpha('#5FD394', 0.14),
  successInk: '#5FD394',
  danger: '#F2877B',
  dangerSoft: alpha('#F2877B', 0.14),
  dangerLine: alpha('#F2877B', 0.32),

  disabledBg: alpha(D_INK, 0.1),
  disabledInk: alpha(D_INK, 0.4),
  sk: alpha(D_INK, 0.1),
  wave: alpha(D_INK, 0.28),
  waveActive: D_INK,
  scrim: 'rgba(0, 0, 0, 0.64)',
  onMedia: media.on,
  onMediaSoft: media.onSoft,
  mediaScrim: media.scrim,
  mediaTrack: media.track,
  stage: media.stage,
  inverseVeil: 'rgba(0, 0, 0, 0.08)',
  chat: '#0B141A',

  shadow1: '0 1px 2px rgba(0, 0, 0, 0.32)',
  shadow2: '0 2px 6px rgba(0, 0, 0, 0.32), 0 12px 28px rgba(0, 0, 0, 0.44)',
  shadow3: '0 -2px 12px rgba(0, 0, 0, 0.24), 0 16px 48px rgba(0, 0, 0, 0.56)',
  glow: `inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 8px 24px ${alpha(D_BLUE, 0.36)}`,
  sheen: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  dark: true,
};

export type Palette = typeof light;
