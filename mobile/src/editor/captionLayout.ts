import { clamp, defaultTextStyle } from './timeline';
import type { CaptionStyle } from './types';

/**
 * Onde a legenda fica no quadro. A faixa tem a largura do vídeo e uma folga em cima e embaixo
 * (para as animações não cortarem a letra). O mesmo cálculo serve para a prévia (em pontos da
 * tela) e para o vídeo final (em pixels).
 */

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

export type CaptionPlacement = {
  /** Canto da faixa no quadro (pode sair um pouco para fora quando a legenda é arrastada). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Folga dentro da faixa, acima e abaixo do texto. */
  margin: number;
  valign: 'top' | 'center' | 'bottom';
  /** Largura máxima da linha: perto da borda, a legenda quebra antes de sair do quadro. */
  maxWidth: number;
};

/** Faixa clássica de 30% da altura, em cima, no meio ou embaixo. */
export function captionBox(style: Pick<CaptionStyle, 'position'>, W: number, H: number): { height: number; y: number; valign: 'top' | 'center' | 'bottom' } {
  const height = even(H * 0.3);
  if (style.position === 'top') return { height, y: Math.round(H * 0.06), valign: 'top' };
  if (style.position === 'middle') return { height, y: Math.round((H - height) / 2), valign: 'center' };
  return { height, y: Math.round(H - height - H * 0.08), valign: 'bottom' };
}

export const isFree = (s: Pick<CaptionStyle, 'x' | 'y'>) => s.x != null && s.y != null;

/** Limites para arrastar: a legenda não encosta na borda. */
export const clampCaptionX = (x: number) => clamp(x, 0.12, 0.88);
export const clampCaptionY = (y: number) => clamp(y, 0.06, 0.94);

export function captionPlacement(style: CaptionStyle, W: number, H: number): CaptionPlacement {
  const margin = even(H * 0.05);
  if (isFree(style)) {
    const x = clampCaptionX(style.x!);
    const y = clampCaptionY(style.y!);
    const height = even(H * 0.3) + 2 * margin;
    return {
      x: Math.round(x * W - W / 2),
      y: Math.round(y * H - height / 2),
      width: W,
      height,
      margin,
      valign: 'center',
      maxWidth: Math.round(Math.min(W * 0.86, 2 * Math.min(x, 1 - x) * W * 0.96)),
    };
  }
  const box = captionBox(style, W, H);
  return { x: 0, y: box.y - margin, width: W, height: box.height + 2 * margin, margin, valign: box.valign, maxWidth: Math.round(W * 0.86) };
}

/**
 * Altura da legenda numa barra de 0 (embaixo) a 1 (em cima). As pontas e o meio são as posições
 * fixas (que crescem para dentro do quadro com mais linhas); entre elas, a legenda fica solta
 * naquela altura, como se tivesse sido arrastada.
 */
const LOW = 0.88;
const HIGH = 0.12;

export function captionHeight(style: Pick<CaptionStyle, 'position' | 'x' | 'y'>): number {
  if (isFree(style)) return clamp((LOW - clampCaptionY(style.y!)) / (LOW - HIGH), 0, 1);
  return style.position === 'top' ? 1 : style.position === 'middle' ? 0.5 : 0;
}

export function withCaptionHeight(style: CaptionStyle, h: number): CaptionStyle {
  const v = clamp(h, 0, 1);
  const { x, y: _y, ...rest } = style;
  const centered = x == null || Math.abs(x - 0.5) < 0.001;
  const preset = v <= 0.001 ? 'bottom' : Math.abs(v - 0.5) <= 0.001 ? 'middle' : v >= 0.999 ? 'top' : null;
  if (preset && centered) return { ...rest, position: preset };
  return { ...rest, x: x ?? 0.5, y: clampCaptionY(LOW - v * (LOW - HIGH)) };
}

/** Centro do texto quando a legenda ainda está numa posição fixa (para começar a arrastar dali). */
export function captionCenter(style: CaptionStyle, boxHeight: number, W: number, H: number): { x: number; y: number } {
  if (isFree(style)) return { x: clampCaptionX(style.x!), y: clampCaptionY(style.y!) };
  const p = captionPlacement(style, W, H);
  const top = p.valign === 'top' ? p.y + p.margin : p.valign === 'center' ? p.y + (p.height - boxHeight) / 2 : p.y + p.height - p.margin - boxHeight;
  return { x: 0.5, y: clampCaptionY((top + boxHeight / 2) / H) };
}

export function defaultCaptionStyle(): CaptionStyle {
  return { ...defaultTextStyle(), size: 0.058, background: 'line', bgColor: '#000000B3', position: 'bottom', uppercase: false, motion: 'none', highlight: '#FFD60A' };
}

/** Estilos prontos ("formatos") de legenda. Cada um só troca letra, cores e fundo. */
export const CAPTION_LOOKS: { id: string; label: string; style: Partial<CaptionStyle> }[] = [
  { id: 'band', label: 'Faixa', style: { background: 'line', color: '#FFFFFF', bgColor: '#000000B3', uppercase: false } },
  { id: 'classic', label: 'Clássica', style: { background: 'shadow', color: '#FFFFFF', bgColor: '#000000B3', uppercase: false } },
  { id: 'outline', label: 'Contorno', style: { background: 'outline', color: '#FFFFFF', bgColor: '#000000FF', uppercase: false } },
  { id: 'impact', label: 'Impacto', style: { background: 'outline', color: '#FFFFFF', bgColor: '#000000FF', uppercase: true, font: 'anton' } },
  { id: 'yellow', label: 'Amarela', style: { background: 'outline', color: '#FFE14D', bgColor: '#000000FF', uppercase: true, font: 'montserrat' } },
  { id: 'highlight', label: 'Marca-texto', style: { background: 'line', color: '#111318', bgColor: '#FFD60AF2', uppercase: false } },
  { id: 'pill', label: 'Pílula', style: { background: 'pill', color: '#111318', bgColor: '#FFFFFFF0', uppercase: false, font: 'poppins' } },
  { id: 'card', label: 'Cartão', style: { background: 'box', color: '#FFFFFF', bgColor: '#1C2030E6', uppercase: false } },
  { id: 'neon', label: 'Neon', style: { background: 'glow', color: '#FFFFFF', bgColor: '#FF2BD6FF', uppercase: false, font: 'fredoka' } },
  { id: 'clean', label: 'Simples', style: { background: 'none', color: '#FFFFFF', uppercase: false } },
];

/** Qual estilo pronto corresponde ao estilo atual (para marcar na lista). */
export function lookOf(style: CaptionStyle): string | null {
  const hit = CAPTION_LOOKS.find((l) =>
    (Object.keys(l.style) as (keyof CaptionStyle)[]).every((k) => k === 'font' || style[k] === l.style[k]),
  );
  return hit?.id ?? null;
}
