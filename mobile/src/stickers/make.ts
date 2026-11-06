import {
  ANIMATED_LIMIT,
  animatedArgs,
  baseArgs,
  firstTry,
  maskArgs,
  nextTry,
  posterArgs,
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

export type StickerResult = { webp: string; poster: string; size: number; quality: number; fps: number | null; attempts: number };

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
    throw new StickerError('too_big', 'A figurinha ficou pesada demais para o WhatsApp. Tente o formato Círculo ou outro quadro.');
  }

  // Animada: começa pelo que costuma caber e desce até ficar abaixo de 500 KB
  let cur = firstTry(req.duration);
  let best: StickerResult | null = null;
  for (let attempts = 1; attempts <= 5; attempts++) {
    const out = at(`figurinha-${attempts}.webp`);
    io.progress?.(attempts === 1 ? 'Montando a animação…' : 'Deixando mais leve para o WhatsApp…', null);
    await io.ffmpeg(animatedArgs(d, layout, inputs, req.start, req.duration, cur.fps, cur.quality, out));
    const size = io.size(out);
    if (size <= ANIMATED_LIMIT * 0.97) {
      best = { webp: out, poster, size, quality: cur.quality, fps: cur.fps, attempts };
      // Trecho curto que ficou bem abaixo do limite: uma volta a mais com qualidade melhor
      if (attempts === 1 && req.duration <= 4.5 && size < ANIMATED_LIMIT * 0.55 && cur.quality < 75) {
        const better = { fps: cur.fps, quality: Math.min(80, cur.quality + 18) };
        const out2 = at('figurinha-melhor.webp');
        io.progress?.('Caprichando na qualidade…', null);
        await io.ffmpeg(animatedArgs(d, layout, inputs, req.start, req.duration, better.fps, better.quality, out2));
        const size2 = io.size(out2);
        if (size2 <= ANIMATED_LIMIT * 0.97) best = { webp: out2, poster, size: size2, quality: better.quality, fps: better.fps, attempts: 2 };
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
