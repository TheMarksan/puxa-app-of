import type { CaptionMotion, Cue } from './types';

/**
 * Animações das legendas, em funções puras: a prévia na tela calcula o quadro do instante atual
 * e a exportação amostra os mesmos quadros (30 por segundo nos trechos animados) para desenhar
 * os PNGs. Assim o vídeo final mexe igual ao que a pessoa viu.
 */

export const MOTIONS: { id: CaptionMotion; label: string }[] = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'fade', label: 'Surgir' },
  { id: 'rise', label: 'Subir' },
  { id: 'pop', label: 'Pop' },
  { id: 'words', label: 'Palavra a palavra' },
  { id: 'karaoke', label: 'Karaokê' },
  { id: 'single', label: 'Uma por vez' },
];

/** Um estado da legenda: o texto visível e como ele está desenhado. */
export type CaptionFrame = {
  text: string;
  /** Texto usado para medir o tamanho da letra (o texto inteiro, para a letra não mudar no meio). */
  fit: string;
  opacity: number;
  scale: number;
  /** Deslocamento vertical, em pixels do quadro. */
  dy: number;
  /** Trecho [de, até) do texto com a cor de destaque (karaokê). */
  hl: [number, number] | null;
};

export type WordSpan = { start: number; end: number; from: number; to: number };

/** Uma legenda é animada quando o texto ou o desenho muda durante ela. */
export function isAnimated(motion: CaptionMotion | undefined): boolean {
  return !!motion && motion !== 'none';
}

/**
 * Tempo de cada palavra. Sem marcação palavra a palavra, a duração da legenda é repartida pelo
 * tamanho das palavras; pontuação no fim conta como uma pausa curta.
 */
export function wordSpans(cue: Cue): WordSpan[] {
  const words: { from: number; to: number; w: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cue.text))) {
    const word = m[0];
    const letters = word.replace(/[.,!?;:…"'“”()[\]-]/g, '').length;
    words.push({ from: m.index, to: m.index + word.length, w: Math.max(2, letters) + (/[.,!?;:…]$/.test(word) ? 3 : 1) });
  }
  const total = words.reduce((a, b) => a + b.w, 0) || 1;
  const dur = Math.max(0.05, cue.end - cue.start);
  let t = cue.start;
  return words.map((x) => {
    const d = (dur * x.w) / total;
    const span = { start: t, end: t + d, from: x.from, to: x.to };
    t += d;
    return span;
  });
}

const ENTER = 0.26;
const EXIT = 0.15;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
const easeInOut = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export type MotionOptions = {
  /** Início da próxima legenda: colada nesta, não há saída (evita piscar entre as duas). */
  next?: number;
  /** Distância da animação "subir", em pixels do quadro. */
  rise: number;
};

function hasExit(cue: Cue, motion: CaptionMotion, next?: number) {
  if (motion !== 'fade' && motion !== 'rise' && motion !== 'pop') return false;
  if (cue.end - cue.start < ENTER + EXIT + 0.1) return false;
  return next == null || next - cue.end > 0.08;
}

function currentWord(spans: WordSpan[], t: number): number {
  let k = 0;
  for (let i = 0; i < spans.length; i++) if (spans[i].start <= t + 1e-6) k = i;
  return k;
}

/** O quadro da legenda no instante [t]; null fora do tempo dela. */
export function frameAt(cue: Cue, motion: CaptionMotion | undefined, t: number, opts: MotionOptions): CaptionFrame | null {
  if (t < cue.start || t >= cue.end) return null;
  const m = motion ?? 'none';
  const base: CaptionFrame = { text: cue.text, fit: cue.text, opacity: 1, scale: 1, dy: 0, hl: null };
  const u = t - cue.start;
  if (m === 'none') return base;

  if (m === 'words' || m === 'karaoke' || m === 'single') {
    const spans = wordSpans(cue);
    if (!spans.length) return base;
    const k = currentWord(spans, t);
    const w = spans[k];
    if (m === 'words') return { ...base, text: cue.text.slice(0, w.to) };
    if (m === 'karaoke') return { ...base, hl: [w.from, w.to] };
    // Uma palavra por vez, com um pulinho a cada troca
    const word = cue.text.slice(w.from, w.to);
    const p = (t - w.start) / 0.1;
    return { ...base, text: word, fit: word, scale: p < 1 ? 0.86 + 0.14 * easeOut(p) : 1 };
  }

  let opacity = 1;
  let scale = 1;
  let dy = 0;
  if (m === 'fade') opacity = easeInOut(u / 0.2);
  if (m === 'rise') {
    opacity = clamp01(u / 0.16);
    dy = (1 - easeOut(u / ENTER)) * opts.rise;
  }
  if (m === 'pop') {
    opacity = clamp01(u / 0.08);
    scale = u < 0.14 ? 0.72 + 0.36 * easeOut(u / 0.14) : u < ENTER ? 1.08 - 0.08 * easeInOut((u - 0.14) / (ENTER - 0.14)) : 1;
  }
  if (hasExit(cue, m, opts.next)) opacity *= clamp01((cue.end - t) / EXIT);
  return { ...base, opacity, scale, dy };
}

const q = (v: number, step: number) => Math.round(v / step) * step;

function sameFrame(a: CaptionFrame, b: CaptionFrame) {
  return a.text === b.text && a.fit === b.fit && a.opacity === b.opacity && a.scale === b.scale && a.dy === b.dy && a.hl?.[0] === b.hl?.[0] && a.hl?.[1] === b.hl?.[1];
}

/**
 * A legenda inteira em trechos de quadro fixo, para a exportação: cada trecho vira um PNG na
 * lista do concat. Nos trechos animados, um quadro a cada 1/[fps] s; entre eles, um só.
 */
export function frameSegments(cue: Cue, motion: CaptionMotion | undefined, opts: MotionOptions & { fps: number }): { start: number; end: number; frame: CaptionFrame }[] {
  const m = motion ?? 'none';
  const step = 1 / opts.fps;
  // Instantes de troca de quadro (sem arredondar: arredondar podia cair antes do início da palavra)
  const byKey = new Map<number, number>([[Math.round(cue.start * 1e4), cue.start]]);
  const add = (t: number) => {
    const k = Math.round(t * 1e4);
    if (t > cue.start + 1e-4 && t < cue.end - 1e-4 && !byKey.has(k)) byKey.set(k, t);
  };
  if (m === 'fade' || m === 'rise' || m === 'pop') {
    for (let t = cue.start + step; t < cue.start + ENTER + step; t += step) add(t);
    if (hasExit(cue, m, opts.next)) for (let t = cue.end - EXIT; t < cue.end; t += step) add(t);
  } else if (m === 'words' || m === 'karaoke' || m === 'single') {
    for (const w of wordSpans(cue)) {
      add(w.start);
      if (m === 'single') for (let i = 1; i <= 3; i++) add(w.start + i * step);
    }
  }
  const sorted = [...byKey.values()].sort((a, b) => a - b);
  const out: { start: number; end: number; frame: CaptionFrame }[] = [];
  sorted.forEach((t, i) => {
    const f = frameAt(cue, m, t + 1e-6, opts);
    if (!f) return;
    const frame: CaptionFrame = { ...f, opacity: q(f.opacity, 0.02), scale: q(f.scale, 0.005), dy: Math.round(f.dy) };
    const end = sorted[i + 1] ?? cue.end;
    const last = out[out.length - 1];
    if (last && sameFrame(last.frame, frame)) last.end = end;
    else out.push({ start: t, end, frame });
  });
  return out;
}
