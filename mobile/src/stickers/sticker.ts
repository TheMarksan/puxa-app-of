/**
 * Figurinha do WhatsApp a partir de um vídeo: geometria (a mesma na prévia e no FFmpeg) e os
 * comandos que geram o WebP. Regras do WhatsApp: 512x512, até 100 KB parada e 500 KB animada,
 * animação de até 10 s com quadros de pelo menos 8 ms, repetindo sem parar.
 */

export type StickerShape = 'square' | 'fit' | 'circle';
export type StickerKind = 'animated' | 'still';
export type StickerCrop = { zoom: number; panX: number; panY: number };
export type StickerTextColor = 'white' | 'yellow';
export type StickerDesign = {
  shape: StickerShape;
  crop: StickerCrop;
  outline: boolean;
  text: string;
  textPosition: 'top' | 'bottom';
  textColor: StickerTextColor;
};

export const CANVAS = 512;
export const STILL_LIMIT = 100 * 1024;
export const ANIMATED_LIMIT = 500 * 1024;
/** Limite do WhatsApp para a animação (com uma folga para o último quadro). */
export const MAX_ANIMATED = 10;
export const MIN_ANIMATED = 1;
export const DEFAULT_ANIMATED = 3;
const SAFE_DURATION = 9.8;

export const SHAPES: { id: StickerShape; label: string; icon: 'square' | 'maximize' | 'circle' }[] = [
  { id: 'square', label: 'Quadrado', icon: 'square' },
  { id: 'circle', label: 'Círculo', icon: 'circle' },
  { id: 'fit', label: 'Inteiro', icon: 'maximize' },
];

export const TEXT_COLORS: Record<StickerTextColor, string> = { white: '#FFFFFF', yellow: '#FFD60A' };

/** Emoji ligado à figurinha: é por ele que o WhatsApp sugere e busca a figurinha. */
export const EMOJIS = ['😂', '😍', '😮', '😢', '😡', '👍', '🔥', '❤️', '🙏', '😎', '🤔', '🎉'];

export function defaultDesign(): StickerDesign {
  return { shape: 'square', crop: { zoom: 1, panX: 0, panY: 0 }, outline: true, text: '', textPosition: 'bottom', textColor: 'white' };
}

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export type Box = { x: number; y: number; w: number; h: number; radius: number };
export type StickerLayout = {
  /** Onde o vídeo aparece no quadro de 512, já com o canto arredondado. */
  content: Box;
  /** Contorno branco (por trás do vídeo), ou null sem contorno. */
  border: (Box & { width: number }) | null;
  /** Recorte do vídeo em pixels do arquivo (quadrado e círculo); null usa o quadro inteiro. */
  crop: { x: number; y: number; w: number; h: number } | null;
};

/** Contorno e margem, no quadro de 512. O WhatsApp recomenda um contorno branco de uns 8 px. */
const BORDER = 12;
const MARGIN = 8;

export function stickerLayout(d: Pick<StickerDesign, 'shape' | 'crop' | 'outline'>, src: { width: number; height: number }): StickerLayout {
  const W = Math.max(2, src.width);
  const H = Math.max(2, src.height);
  const B = d.outline ? BORDER : 0;
  const S = CANVAS - 2 * (MARGIN + B);
  let w = S;
  let h = S;
  let crop: StickerLayout['crop'] = null;
  if (d.shape === 'fit') {
    const ar = W / H;
    if (ar >= 1) h = even(S / ar);
    else w = even(S * ar);
  } else {
    const side = Math.min(W, H) / clamp(d.crop.zoom, 1, 4);
    const cx = W / 2 + clamp(d.crop.panX, -1, 1) * ((W - side) / 2);
    const cy = H / 2 + clamp(d.crop.panY, -1, 1) * ((H - side) / 2);
    const cs = Math.min(even(side), Math.floor(Math.min(W, H) / 2) * 2);
    crop = {
      x: clamp(Math.round(cx - cs / 2), 0, W - cs),
      y: clamp(Math.round(cy - cs / 2), 0, H - cs),
      w: cs,
      h: cs,
    };
  }
  const radius = d.shape === 'circle' ? w / 2 : d.shape === 'square' ? Math.round(w * 0.14) : Math.round(Math.min(w, h) * 0.1);
  const x = (CANVAS - w) / 2;
  const y = (CANVAS - h) / 2;
  return {
    content: { x, y, w, h, radius },
    border: B ? { x: x - B, y: y - B, w: w + 2 * B, h: h + 2 * B, radius: radius + B, width: B } : null,
    crop,
  };
}

/** Número curto para o FFmpeg (sem notação científica). */
function n(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(3);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/**
 * Alfa de um retângulo arredondado centrado no quadro (círculo quando o raio é metade do lado),
 * com meio pixel de suavização na borda. Mesma conta para a máscara e para o contorno.
 */
function roundedAlpha(w: number, h: number, r: number): string {
  const hw = n(w / 2 - r);
  const hh = n(h / 2 - r);
  return `255*clip(${n(r)}+0.5-hypot(max(abs(X-${n((w - 1) / 2)})-${hw}\\,0)\\,max(abs(Y-${n((h - 1) / 2)})-${hh}\\,0))\\,0\\,1)`;
}

/** Máscara (branco = visível) no tamanho do vídeo dentro da figurinha. */
export function maskArgs(l: StickerLayout, out: string): string[] {
  const { w, h, radius } = l.content;
  return ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}:d=1`, '-vf', `format=gray,geq=lum=${roundedAlpha(w, h, radius)}`, '-frames:v', '1', out];
}

/** Fundo de 512x512: transparente, com o contorno branco desenhado (ou vazio, sem contorno). */
export function baseArgs(l: StickerLayout, out: string): string[] {
  const b = l.border;
  // O contorno fica centrado no quadro, como o vídeo: a forma é a mesma, só maior
  const alpha = b ? roundedAlphaAt(b) : '0';
  return [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=white:s=${CANVAS}x${CANVAS}:d=1`,
    '-vf',
    `format=rgba,geq=r=255:g=255:b=255:a=${alpha}`,
    '-frames:v',
    '1',
    out,
  ];
}

function roundedAlphaAt(b: Box): string {
  // Mesma fórmula do roundedAlpha, com o centro no meio do quadro de 512
  const hw = n(b.w / 2 - b.radius);
  const hh = n(b.h / 2 - b.radius);
  const cx = n(b.x + (b.w - 1) / 2);
  const cy = n(b.y + (b.h - 1) / 2);
  return `255*clip(${n(b.radius)}+0.5-hypot(max(abs(X-${cx})-${hw}\\,0)\\,max(abs(Y-${cy})-${hh}\\,0))\\,0\\,1)`;
}

export type TextPng = { path: string; width: number; height: number };

/** Especificação do texto da figurinha para o desenhista de PNG do app (o mesmo dos vídeos). */
export function textSpec(d: StickerDesign, font: string) {
  return {
    name: 'figurinha-texto.png',
    kind: 'text' as const,
    text: d.text.trim().toUpperCase(),
    font,
    size: CANVAS * 0.11,
    color: TEXT_COLORS[d.textColor],
    background: 'outline',
    bgColor: '#000000',
    align: 'center',
    maxWidth: CANVAS * 0.94,
    rotation: 0,
  };
}

/** Onde o texto fica: em cima ou embaixo, centrado, com uma folga da borda. */
export function textPlacement(d: StickerDesign, png: { width: number; height: number }): { x: number; y: number } {
  const x = Math.round((CANVAS - png.width) / 2);
  const y = d.textPosition === 'top' ? 10 : CANVAS - png.height - 10;
  return { x: Math.max(0, x), y: clamp(Math.round(y), 0, CANVAS - Math.min(CANVAS, png.height)) };
}

type Inputs = { src: string; mask: string | null; base: string; text: TextPng | null };

function graph(d: StickerDesign, l: StickerLayout, inputs: Inputs, fps: number | null, final: 'rgba' | 'yuva420p'): string {
  const { content: c, crop } = l;
  const parts: string[] = [];
  const fit = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${c.w}:${c.h}:flags=lanczos` : `scale=${c.w}:${c.h}:flags=lanczos`;
  parts.push(`[0:v]${fps ? `fps=${n(fps)},` : ''}${fit},setsar=1,format=rgba[v]`);
  let k = 1;
  let video = 'v';
  if (inputs.mask) {
    parts.push(`[${k}:v]format=gray[m]`);
    parts.push(`[v][m]alphamerge[cut]`);
    video = 'cut';
    k++;
  }
  const baseIndex = k++;
  parts.push(`[${baseIndex}:v][${video}]overlay=x=${c.x}:y=${c.y}:format=auto:shortest=1[o]`);
  let last = 'o';
  if (inputs.text) {
    const p = textPlacement(d, inputs.text);
    parts.push(`[o][${k}:v]overlay=x=${p.x}:y=${p.y}:format=auto:shortest=1[t]`);
    last = 't';
    k++;
  }
  parts.push(`[${last}]format=${final}[out]`);
  return parts.join(';');
}

function inputArgs(inputs: Inputs, still: boolean, start: number, duration: number): string[] {
  const loop = (p: string) => (still ? ['-i', p] : ['-loop', '1', '-t', n(duration), '-i', p]);
  return [
    '-ss',
    n(start),
    ...(still ? [] : ['-t', n(duration)]),
    '-i',
    inputs.src,
    ...(inputs.mask ? loop(inputs.mask) : []),
    ...loop(inputs.base),
    ...(inputs.text ? loop(inputs.text.path) : []),
  ];
}

/** Primeiro quadro já montado (PNG 512x512 com transparência): vira a figurinha parada e o ícone do pacote. */
export function posterArgs(d: StickerDesign, l: StickerLayout, inputs: Inputs, at: number, out: string): string[] {
  return ['-y', '-v', 'error', ...inputArgs(inputs, true, at, 0), '-filter_complex', graph(d, l, inputs, null, 'rgba'), '-map', '[out]', '-frames:v', '1', out];
}

/** WebP parado a partir do PNG montado. */
export function stillArgs(poster: string, quality: number, out: string): string[] {
  return ['-y', '-v', 'error', '-i', poster, '-c:v', 'libwebp', '-lossless', '0', '-quality', n(quality), '-compression_level', '6', '-preset', 'picture', out];
}

/** WebP animado: repete sem parar (-loop 0), sem som. */
export function animatedArgs(d: StickerDesign, l: StickerLayout, inputs: Inputs, start: number, duration: number, fps: number, quality: number, out: string): string[] {
  const t = Math.min(duration, SAFE_DURATION);
  return [
    '-y',
    '-v',
    'error',
    ...inputArgs(inputs, false, start, t),
    '-filter_complex',
    graph(d, l, inputs, fps, 'yuva420p'),
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libwebp_anim',
    '-lossless',
    '0',
    '-quality',
    n(quality),
    '-compression_level',
    '4',
    '-loop',
    '0',
    '-t',
    n(t),
    out,
  ];
}

/** Ponto de partida da animação: quadros por segundo e qualidade conforme a duração. */
export function firstTry(duration: number): { fps: number; quality: number } {
  if (duration <= 2.5) return { fps: 15, quality: 60 };
  if (duration <= 4.5) return { fps: 12, quality: 50 };
  if (duration <= 7) return { fps: 10, quality: 42 };
  return { fps: 8, quality: 36 };
}

/**
 * Próxima tentativa quando passou do limite: o tamanho cai mais ou menos junto com o número de
 * quadros e um pouco mais devagar que a qualidade. Retorna null quando não dá para descer mais.
 */
export function nextTry(cur: { fps: number; quality: number }, size: number, limit: number): { fps: number; quality: number } | null {
  const need = (limit * 0.9) / Math.max(1, size);
  if (need >= 1) return null;
  let { fps, quality } = cur;
  if (need < 0.6 && fps > 8) fps = Math.max(8, Math.round(fps * Math.max(0.6, need * 1.25)));
  const left = need / (fps / cur.fps);
  if (left < 1) quality = Math.round(quality * Math.max(0.45, Math.pow(left, 1.3)));
  if (quality < 8) quality = 8;
  if (fps === cur.fps && quality === cur.quality) return null;
  return { fps, quality };
}

/** Qualidades do WebP parado, da melhor para a mais leve. */
export const STILL_QUALITIES = [86, 76, 64, 52, 40, 28, 18];
