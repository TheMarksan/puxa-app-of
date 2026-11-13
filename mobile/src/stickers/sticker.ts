/**
 * Figurinha do WhatsApp a partir de um vídeo: geometria (a mesma na prévia e no FFmpeg) e os
 * comandos que geram o WebP. Regras do WhatsApp: 512x512, até 100 KB parada e 500 KB animada,
 * animação de até 10 s com quadros de pelo menos 8 ms, repetindo sem parar.
 */

/** "crop": recorte quadrado do vídeo (os cantos vão de retos a círculo). "fit": o quadro inteiro. */
export type StickerShape = 'crop' | 'fit';
export type StickerKind = 'animated' | 'still';
export type StickerCrop = { zoom: number; panX: number; panY: number };
export type StickerTextColor = 'white' | 'yellow';
export type StickerDesign = {
  shape: StickerShape;
  crop: StickerCrop;
  /** Arredondamento dos cantos: 0 é reto, 1 é círculo (ou pílula, no quadro inteiro). */
  corner: number;
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

export const SHAPES: { id: StickerShape; label: string }[] = [
  { id: 'crop', label: 'Recorte' },
  { id: 'fit', label: 'Inteiro' },
];

/** Atalhos do arredondamento: reto, suave, bem redondo e círculo. */
export const CORNERS = [0, 0.28, 0.6, 1];
export const DEFAULT_CORNER = 0.28;

export const clampCorner = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_CORNER);

export const TEXT_COLORS: Record<StickerTextColor, string> = { white: '#FFFFFF', yellow: '#FFD60A' };

/** Emoji ligado à figurinha: é por ele que o WhatsApp sugere e busca a figurinha. */
export const EMOJIS = ['😂', '😍', '😮', '😢', '😡', '👍', '🔥', '❤️', '🙏', '😎', '🤔', '🎉'];

export function defaultDesign(): StickerDesign {
  return { shape: 'crop', crop: { zoom: 1, panX: 0, panY: 0 }, corner: DEFAULT_CORNER, outline: true, text: '', textPosition: 'bottom', textColor: 'white' };
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

export function stickerLayout(d: Pick<StickerDesign, 'shape' | 'crop' | 'outline'> & { corner?: number }, src: { width: number; height: number }): StickerLayout {
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
  // Cantos: fração da metade do lado menor (1 = círculo no recorte, pílula no quadro inteiro)
  const corner = clampCorner(d.corner ?? DEFAULT_CORNER);
  const radius = corner >= 0.995 ? Math.min(w, h) / 2 : Math.round((corner * Math.min(w, h)) / 2);
  const x = (CANVAS - w) / 2;
  const y = (CANVAS - h) / 2;
  return {
    content: { x, y, w, h, radius },
    // Cantos retos ficam retos também no contorno
    border: B ? { x: x - B, y: y - B, w: w + 2 * B, h: h + 2 * B, radius: radius > 0 ? radius + B : 0, width: B } : null,
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
  if (r < 1) return `255*lte(abs(X-${n((w - 1) / 2)})\\,${n((w - 1) / 2 + 0.01)})*lte(abs(Y-${n((h - 1) / 2)})\\,${n((h - 1) / 2 + 0.01)})`;
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
  if (b.radius < 1) return `255*lte(abs(X-${cx})\\,${n((b.w - 1) / 2 + 0.01)})*lte(abs(Y-${cy})\\,${n((b.h - 1) / 2 + 0.01)})`;
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

/**
 * [soft] é a nitidez do vídeo dentro da figurinha (1 = inteira). Abaixo de 1 o vídeo é reduzido
 * e ampliado de volta: fica mais macio e pesa bem menos, e o contorno e o texto continuam
 * nítidos, porque entram depois.
 */
function graph(d: StickerDesign, l: StickerLayout, inputs: Inputs, fps: number | null, final: 'rgba' | 'yuva420p', soft = 1): string {
  const { content: c, crop } = l;
  const parts: string[] = [];
  const size = soft < 1 ? `scale=${even(c.w * soft)}:${even(c.h * soft)}:flags=bilinear,scale=${c.w}:${c.h}:flags=bicubic` : `scale=${c.w}:${c.h}:flags=lanczos`;
  const fit = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},${size}` : size;
  // O vídeo começa no tempo zero, como o fundo e a máscara. Sem isso, arquivo com início deslocado
  // (comum no que vem do X e do Instagram) deixava o primeiro quadro, ou a figurinha parada, vazio.
  parts.push(`[0:v]setpts=PTS-STARTPTS,${fps ? `fps=${n(fps)},` : ''}${fit},setsar=1,format=rgba[v]`);
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
export function animatedArgs(d: StickerDesign, l: StickerLayout, inputs: Inputs, start: number, duration: number, fps: number, quality: number, out: string, soft = 1): string[] {
  const t = Math.min(duration, SAFE_DURATION);
  return [
    '-y',
    '-v',
    'error',
    ...inputArgs(inputs, false, start, t),
    '-filter_complex',
    graph(d, l, inputs, fps, 'yuva420p', soft),
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

/** Uma tentativa de animação: quadros por segundo, qualidade do WebP e nitidez do vídeo (1 = inteira). */
export type Try = { fps: number; quality: number; soft: number };

/**
 * O WebP animado guarda cada quadro inteiro, sem aproveitar o anterior: o peso é, quase em linha
 * reta, o número de quadros. Qualidade e nitidez mexem pouco (de q36 para q10 cai só um terço).
 * Por isso quem faz caber um trecho longo são os quadros por segundo.
 */
const FPS = [15, 12, 10, 9, 8, 7, 6.5, 6, 5.5, 5, 4.5, 4];
const MIN_FPS = 4;
const snapFps = (v: number) => FPS.find((f) => f <= v + 1e-6) ?? MIN_FPS;

/** Quantos quadros costumam caber em 500 KB numa figurinha quadrada comum, com qualidade boa. */
const FRAME_BUDGET = 60;
const BASE_QUALITY = 34;
/** Alvo do peso: um pouco abaixo do limite, porque a conta é aproximada. */
const TARGET = 0.92;
/** O peso cai com a qualidade elevada a este expoente (medido; de propósito, para o lado seguro). */
const Q_POWER = 0.27;

/**
 * Quanto a forma pesa em relação à figurinha comum (quadrada, cantos suaves, com contorno).
 * A borda curva e o contorno custam em todo quadro: um círculo pesa uns 30% a mais. Vídeo
 * "inteiro" ocupa menos área e pesa menos.
 */
export function shapeWeight(d: Pick<StickerDesign, 'outline'> & { corner?: number }, l: StickerLayout): number {
  const corner = clampCorner(d.corner ?? DEFAULT_CORNER);
  const edge = (d.outline ? 1 : 0.9) * (0.9 + 0.4 * Math.pow(corner, 1.5));
  const area = (l.content.w * l.content.h) / ((CANVAS - 40) * (CANVAS - 40));
  return edge * (0.25 + 0.75 * Math.min(1, area));
}

/**
 * Ponto de partida: os quadros por segundo que devem caber em 500 KB para a duração e a forma;
 * o que sobrar do orçamento (trechos curtos) vira qualidade.
 */
export function firstTry(duration: number, weight = 1): Try {
  const t = Math.max(0.5, Math.min(duration, SAFE_DURATION));
  const frames = FRAME_BUDGET / Math.max(0.5, weight);
  const fps = snapFps(frames / t);
  const slack = frames / (fps * t);
  const quality = Math.round(Math.min(60, Math.max(30, BASE_QUALITY * slack * slack)));
  return { fps, quality, soft: 1 };
}

/**
 * Próxima tentativa quando passou do limite, calculada a partir do peso que deu: primeiro a
 * qualidade até um piso que ainda fica bonito, depois os quadros por segundo (que é o que mais
 * resolve), e só no fim a nitidez. As contas erram para o lado seguro, para caber já na segunda
 * tentativa. Retorna null quando não dá para descer mais.
 */
export function nextTry(cur: Try, size: number, limit: number): Try | null {
  let left = (limit * TARGET) / Math.max(1, size);
  if (left >= 1) return null;
  let { fps, quality, soft } = cur;
  const lowerQuality = (to: number) => {
    if (left >= 1 || quality <= to) return;
    left /= Math.pow(to / quality, Q_POWER);
    quality = to;
  };
  lowerQuality(26);
  if (left < 1 && fps > MIN_FPS) {
    const f = snapFps(fps * left);
    left /= f / fps;
    fps = f;
  }
  // Daqui para baixo a imagem piora de verdade: só entra se ainda faltar mais que a folga do alvo
  const short = () => left < 0.96;
  if (short() && soft > 0.75) {
    left /= 0.9;
    soft = 0.75;
  }
  if (short()) lowerQuality(16);
  if (short() && soft > 0.5) {
    left /= 0.94;
    soft = 0.5;
  }
  if (short()) lowerQuality(8);
  if (fps === cur.fps && quality === cur.quality && soft === cur.soft) return null;
  return { fps, quality, soft };
}

/**
 * Quando a primeira tentativa ficou bem abaixo do limite, vale uma volta a mais para aproveitar
 * a folga: mais quadros por segundo (até um teto) e, com o que sobrar, mais qualidade. Retorna
 * null quando a melhora não compensa a espera.
 */
export function betterTry(cur: Try, size: number, limit: number): Try | null {
  const room = (limit * TARGET) / Math.max(1, size);
  if (room < 1.6 || cur.soft < 1) return null;
  const gain = Math.min(2, room * 0.92);
  const fps = Math.max(cur.fps, Math.min(15, snapFps(cur.fps * gain)));
  const rest = gain / (fps / cur.fps);
  const quality = Math.round(Math.min(80, cur.quality * Math.max(1, rest * rest)));
  if (fps === cur.fps && quality < cur.quality + 8) return null;
  return { fps, quality, soft: 1 };
}

/** Qualidades do WebP parado, da melhor para a mais leve. */
export const STILL_QUALITIES = [86, 76, 64, 52, 40, 28, 18];
