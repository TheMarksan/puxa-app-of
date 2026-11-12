import { clamp, defaultTextStyle } from './timeline';
import type { CaptionStyle, Cue } from './types';

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

// ---------- Linhas no máximo ----------

export const DEFAULT_MAX_LINES = 2;
export const LINE_OPTIONS = [1, 2, 3] as const;

export const maxLinesOf = (style: Pick<CaptionStyle, 'maxLines'>) => Math.max(1, Math.round(style.maxLines ?? DEFAULT_MAX_LINES));

/**
 * Quantas letras cabem numa linha da legenda, numa conta segura (letra média um pouco larga, e
 * mais larga ainda em maiúsculas). Depende só da proporção do quadro, então a prévia (em pontos
 * da tela) e o vídeo final (em pixels) chegam ao mesmo número.
 */
export function charsPerLine(style: CaptionStyle, W: number, H: number): number {
  if (W <= 0 || H <= 0) return Infinity;
  const font = style.size * Math.min(W, H);
  const room = captionPlacement(style, W, H).maxWidth - font * 0.4;
  const letter = font * (style.uppercase ? 0.7 : 0.58);
  return Math.max(6, Math.floor(room / letter));
}

/** Quebra as palavras em linhas de até [perLine] letras (palavra maior que a linha fica sozinha). */
export function wrapWords(words: string[], perLine: number): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const w of words) {
    const add = cur.length ? len + 1 + w.length : w.length;
    if (cur.length && add > perLine) {
      lines.push(cur);
      cur = [w];
      len = w.length;
    } else {
      cur.push(w);
      len = add;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** Divide as palavras em [parts] pedaços de tamanho parecido (sem deixar um resto curtinho no fim). */
function balance(words: string[], parts: number): string[][] {
  const total = words.reduce((a, w) => a + w.length + 1, 0);
  const out: string[][] = [];
  let cur: string[] = [];
  let done = 0;
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    done += words[i].length + 1;
    const left = words.length - i - 1;
    const goal = (total * (out.length + 1)) / parts;
    if (out.length < parts - 1 && left >= parts - out.length - 1 && done >= goal - words[i].length / 2) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Legendas que não passam de [maxLines] linhas: a que ficaria maior vira duas ou mais em
 * sequência, com o tempo dividido pelo tamanho de cada pedaço. As que cabem ficam como estão.
 */
export function limitLines(cues: Cue[], maxLines: number, perLine: number): Cue[] {
  if (!Number.isFinite(perLine) || perLine <= 0 || maxLines <= 0) return cues;
  const out: Cue[] = [];
  for (const c of cues) {
    const words = c.text.split(/\s+/).filter(Boolean);
    const lines = wrapWords(words, perLine);
    if (lines.length <= maxLines) {
      out.push(c);
      continue;
    }
    // Menos pedaços possível; aumenta se o equilíbrio deixar algum maior que o limite
    let parts = Math.ceil(lines.length / maxLines);
    let chunks = balance(words, parts);
    while (chunks.some((ch) => wrapWords(ch, perLine).length > maxLines) && parts < words.length) {
      parts++;
      chunks = balance(words, parts);
    }
    const weight = chunks.map((ch) => ch.join(' ').length + 2);
    const sum = weight.reduce((a, b) => a + b, 0);
    let t = c.start;
    chunks.forEach((ch, i) => {
      const end = i === chunks.length - 1 ? c.end : t + ((c.end - c.start) * weight[i]) / sum;
      out.push({ start: t, end, text: ch.join(' ') });
      t = end;
    });
  }
  return out;
}

/** As legendas como vão aparecer num quadro W x H, já respeitando o limite de linhas do estilo. */
export const shownCues = (cues: Cue[], style: CaptionStyle, W: number, H: number): Cue[] => limitLines(cues, maxLinesOf(style), charsPerLine(style, W, H));
