import { alpha, dark, media } from '../../theme/palette';

/**
 * O editor é sempre escuro, como os editores de vídeo: o vídeo é o que mais aparece. As cores
 * saem do tema escuro do app (o mesmo nanquim, o mesmo azul), com o fundo um tom mais fundo
 * para o vídeo se destacar.
 */
export const E = {
  bg: '#0B0C0F',
  panel: dark.surface,
  raised: dark.raised,
  raised2: '#2E3138',
  line: dark.line,
  lineStrong: dark.lineStrong,
  ink: dark.ink,
  muted: dark.muted,
  faint: dark.faint,
  accent: dark.accent,
  accentSoft: dark.accentSoft,
  /** Texto e ícones sobre o azul. */
  onAccent: dark.onAccent,
  onAccentSoft: alpha(dark.onAccent, 0.8),
  success: dark.success,
  danger: dark.danger,
  /** O quadro do vídeo. */
  stage: media.stage,
  /** Faixa de aviso por cima do vídeo. */
  veil: 'rgba(11, 12, 15, 0.82)',
  /** O cenário cinza das prévias de formato da legenda. */
  preview: '#3B4252',
  /** Sombra do botão de arrastar. */
  knob: '0 1px 4px rgba(0, 0, 0, 0.4)',
  // Cores das trilhas na linha do tempo
  clip: '#2A3147',
  text: '#8B5CF6',
  sticker: '#F59E0B',
  image: '#14B8A6',
  facecam: '#EC4899',
  captions: '#E5E7EB',
  music: '#22C55E',
  voice: '#F97316',
};

/** Cores da legenda que a pessoa escolhe: são conteúdo do vídeo, não da interface. */
export const SWATCHES = ['#FFFFFF', '#111318', '#FFD60A', '#FF4D4D', '#FF8A00', '#34C759', '#2EC4FF', '#4F6BFF', '#B26CFF', '#FF5FA2'];

/** A cor da palavra falada no karaokê, até a pessoa escolher outra. */
export const KARAOKE = '#FFD60A';

/** Fundos prontos da legenda: contorno preto, brilho rosa e a faixa escura translúcida. */
export const CAPTION_BG = { outline: '#000000FF', glow: '#FF2BD6FF', band: '#000000B3' };
