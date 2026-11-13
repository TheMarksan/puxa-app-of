import {
  ANIMATED_LIMIT,
  animatedArgs,
  baseArgs,
  betterTry,
  firstTry,
  maskArgs,
  nextTry,
  posterArgs,
  shapeWeight,
  STILL_LIMIT,
  STILL_QUALITIES,
  stickerLayout,
  stillArgs,
  textSpec,
  type StickerDesign,
  type StickerKind,
  type TextPng,
} from './sticker';

/** O que muda entre o aparelho e os testes no computador: rodar o FFmpeg, medir arquivo, desenhar texto. */
export type StickerIO = {
  /** Pasta de trabalho (caminho absoluto, sem file://). */
  dir: string;
  ffmpeg: (args: string[]) => Promise<void>;
  size: (path: string) => number;
  renderText: (spec: ReturnType<typeof textSpec>, dir: string) => Promise<TextPng>;
  /** Fonte da letra do texto (arquivo .ttf). */
  font: string;
  progress?: (label: string, fraction: number | null) => void;
  cancelled?: () => boolean;
};

export type StickerRequest = {
  kind: StickerKind;
  src: { path: string; width: number; height: number };
  /** Animada: início do trecho. Parada: o quadro escolhido. */
  start: number;
  duration: number;
  design: StickerDesign;
};

/** [soft]: nitidez do vídeo na animada (1 = inteira); [attempts]: quantas vezes o WebP foi montado. */
export type StickerResult = { webp: string; poster: string; size: number; quality: number; fps: number | null; soft?: number; attempts: number };

export class StickerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const check = (io: StickerIO) => {
  if (io.cancelled?.()) throw new StickerError('cancelled', 'Cancelado.');
};

/**
 * Monta a figurinha: máscara e contorno (PNG), texto (PNG), o primeiro quadro pronto e o WebP,
 * baixando qualidade e quadros por segundo até caber no limite do WhatsApp.
 */
export async function buildSticker(req: StickerRequest, io: StickerIO): Promise<StickerResult> {
  const { design: d } = req;
  const layout = stickerLayout(d, req.src);
  const at = (name: string) => `${io.dir}/${name}`;
  io.progress?.('Recortando o vídeo…', null);

  const mask = layout.content.radius > 0 ? at('mascara.png') : null;
  if (mask) await io.ffmpeg(maskArgs(layout, mask));
  const base = at('fundo.png');
  await io.ffmpeg(baseArgs(layout, base));
  const text = d.text.trim() ? await io.renderText(textSpec(d, io.font), io.dir) : null;
  const inputs = { src: req.src.path, mask, base, text };
  check(io);

  const poster = at('quadro.png');
  await io.ffmpeg(posterArgs(d, layout, inputs, req.start, poster));
  check(io);

  if (req.kind === 'still') {
    const out = at('figurinha.webp');
    let attempts = 0;
    for (const quality of STILL_QUALITIES) {
      attempts++;
      io.progress?.('Comprimindo a figurinha…', attempts / STILL_QUALITIES.length);
      await io.ffmpeg(stillArgs(poster, quality, out));
      const size = io.size(out);
      if (size <= STILL_LIMIT * 0.98) return { webp: out, poster, size, quality, fps: null, attempts };
      check(io);
    }
    throw new StickerError('too_big', 'A figurinha ficou pesada demais para o WhatsApp. Arredonde mais os cantos ou escolha outro quadro.');
  }

  // Animada: começa pelo que deve caber para a duração e a forma. Se passar de 500 KB, a próxima
  // tentativa sai da conta do peso que deu (menos quadros por segundo, sobretudo); se sobrar muito,
  // uma volta a mais aproveita a folga.
  const fits = (size: number) => size <= ANIMATED_LIMIT * 0.97;
  const encode = async (t: { fps: number; quality: number; soft: number }, name: string) => {
    const out = at(name);
    await io.ffmpeg(animatedArgs(d, layout, inputs, req.start, req.duration, t.fps, t.quality, out, t.soft));
    return { out, size: io.size(out) };
  };
  let cur = firstTry(req.duration, shapeWeight(d, layout));
  let best: StickerResult | null = null;
  const MAX_ATTEMPTS = 5;
  for (let attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
    io.progress?.(attempts === 1 ? 'Montando a animação…' : 'Deixando mais leve para o WhatsApp…', null);
    const { out, size } = await encode(cur, `figurinha-${attempts}.webp`);
    if (fits(size)) {
      best = { webp: out, poster, size, quality: cur.quality, fps: cur.fps, soft: cur.soft, attempts };
      const better = attempts === 1 ? betterTry(cur, size, ANIMATED_LIMIT) : null;
      if (better) {
        check(io);
        io.progress?.('Caprichando na qualidade…', null);
        const up = await encode(better, 'figurinha-melhor.webp');
        if (fits(up.size)) best = { webp: up.out, poster, size: up.size, quality: better.quality, fps: better.fps, soft: better.soft, attempts: 2 };
      }
      break;
    }
    check(io);
    const next = nextTry(cur, size, ANIMATED_LIMIT);
    if (!next) break;
    cur = next;
  }
  if (!best) throw new StickerError('too_big', 'A animação ficou pesada demais para o WhatsApp. Escolha um trecho mais curto.');
  return best;
}
