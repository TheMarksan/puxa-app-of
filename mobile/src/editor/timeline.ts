import type { Aspect, Clip, FacecamLayer, Layer, MediaSource, Project, TextStyle } from './types';

/** Duração de um clipe na linha do tempo (a velocidade encurta ou estica). */
export function clipLength(c: Clip): number {
  return Math.max(0.1, (c.out - c.in) / c.speed);
}

/** Duração real da transição entre o clipe i e o i+1: nunca mais que metade de cada um. */
export function transitionLength(clips: Clip[], i: number): number {
  const c = clips[i];
  if (!c?.transition || i >= clips.length - 1) return 0;
  const limit = Math.min(clipLength(c), clipLength(clips[i + 1])) / 2;
  return Math.max(0, Math.min(c.transition.duration, limit - 0.05));
}

/** Onde cada clipe começa: as transições sobrepõem o fim de um ao começo do próximo. */
export function clipStarts(clips: Clip[]): number[] {
  const starts: number[] = [];
  let t = 0;
  clips.forEach((c, i) => {
    starts.push(t);
    t += clipLength(c) - transitionLength(clips, i);
  });
  return starts;
}

export function projectLength(p: Pick<Project, 'clips'>): number {
  if (!p.clips.length) return 0;
  const starts = clipStarts(p.clips);
  const last = p.clips.length - 1;
  return starts[last] + clipLength(p.clips[last]);
}

/** Clipe sob o tempo t (numa transição, o que está entrando quando [preferNext]). */
export function clipAt(clips: Clip[], t: number, preferNext = false): { index: number; start: number } | null {
  const starts = clipStarts(clips);
  let found: { index: number; start: number } | null = null;
  for (let i = 0; i < clips.length; i++) {
    const s = starts[i];
    const e = s + clipLength(clips[i]);
    if (t >= s - 1e-6 && t < e - 1e-6) {
      found = { index: i, start: s };
      if (!preferNext) break;
    }
  }
  if (!found && clips.length && t >= projectLength({ clips }) - 1e-6) {
    const i = clips.length - 1;
    found = { index: i, start: starts[i] };
  }
  return found;
}

/** Tempo no arquivo de origem correspondente ao tempo t da linha do tempo. */
export function sourceTime(c: Clip, clipStart: number, t: number): number {
  return Math.min(c.out, Math.max(c.in, c.in + (t - clipStart) * c.speed));
}

let seq = 0;
export function newId(prefix = 'x'): string {
  seq = (seq + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Divide o clipe em t (tempo da linha do tempo). Retorna null se t está perto demais de uma ponta. */
export function splitClip(clips: Clip[], t: number): Clip[] | null {
  const at = clipAt(clips, t);
  if (!at) return null;
  const c = clips[at.index];
  const cut = sourceTime(c, at.start, t);
  if (cut - c.in < 0.2 * c.speed || c.out - cut < 0.2 * c.speed) return null;
  const a: Clip = { ...c, out: cut, transition: null };
  const b: Clip = { ...c, id: newId('c'), in: cut };
  return [...clips.slice(0, at.index), a, b, ...clips.slice(at.index + 1)];
}

export function defaultClip(source: MediaSource, from = 0, to?: number): Clip {
  const isImage = source.kind === 'image';
  const end = isImage ? 3 : Math.min(source.duration, to ?? source.duration);
  return {
    id: newId('c'),
    sourceId: source.id,
    in: isImage ? 0 : from,
    out: isImage ? end : Math.max(from + 0.5, end),
    speed: 1,
    volume: 1,
    fit: 'fill',
    zoom: 1,
    panX: 0,
    panY: 0,
    rotate: 0,
    flip: false,
    filter: 'none',
    motion: isImage ? 'zoomin' : 'none',
    transition: null,
  };
}

const ASPECTS: Record<Exclude<Aspect, 'original'>, number> = { '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Tamanho do vídeo final. Em 720p o lado menor tem 720; em 1080p, 1080.
 * "original" segue a proporção do primeiro clipe.
 */
export function outputSize(aspect: Aspect, quality: 720 | 1080, first?: { width: number; height: number }): { width: number; height: number } {
  let ratio: number;
  if (aspect === 'original') {
    ratio = first && first.width > 0 && first.height > 0 ? first.width / first.height : 16 / 9;
  } else {
    ratio = ASPECTS[aspect];
  }
  // No formato original não adianta aumentar além do próprio vídeo (um 360p continua 360p)
  const short = aspect === 'original' && first && first.width > 0 ? Math.min(quality, Math.min(first.width, first.height)) : quality;
  if (ratio >= 1) return { width: even(short * ratio), height: even(short) };
  return { width: even(short), height: even(short / ratio) };
}

export function aspectRatio(p: Project): number {
  const first = p.clips[0] ? p.sources[p.clips[0].sourceId] : undefined;
  const s = outputSize(p.aspect, 720, first ? rotatedSize(first, p.clips[0].rotate) : undefined);
  return s.width / s.height;
}

export function rotatedSize(s: { width: number; height: number }, rotate: number): { width: number; height: number } {
  return rotate % 180 === 0 ? { width: s.width, height: s.height } : { width: s.height, height: s.width };
}

/**
 * Onde o quadro do clipe fica dentro do vídeo, em pixels de um vídeo W×H:
 * tamanho já escalado (sw×sh) e canto superior esquerdo (x, y). A prévia usa a mesma conta.
 */
export function placement(c: Pick<Clip, 'fit' | 'zoom' | 'panX' | 'panY' | 'rotate'>, src: { width: number; height: number }, W: number, H: number) {
  const r = rotatedSize(src, c.rotate);
  const iw = Math.max(1, r.width);
  const ih = Math.max(1, r.height);
  const base = c.fit === 'fill' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
  const s = base * c.zoom;
  const sw = even(iw * s);
  const sh = even(ih * s);
  const x = Math.round((W - sw) / 2 + (c.panX * Math.abs(W - sw)) / 2);
  const y = Math.round((H - sh) / 2 + (c.panY * Math.abs(H - sh)) / 2);
  return { sw, sh, x, y, covers: sw >= W && sh >= H };
}

export function defaultTextStyle(): TextStyle {
  return { font: 'archivo', size: 0.075, color: '#FFFFFF', background: 'shadow', bgColor: '#000000B3', align: 'center' };
}

/**
 * Base dos tamanhos de texto, legenda, figurinha, imagem e facecam: o lado menor do quadro.
 * Trocar de 9:16 para 16:9 mantém o tamanho das coisas em vez de deixar tudo quase 2x maior.
 */
export function sizeUnit(W: number, H: number): number {
  return Math.min(W, H);
}

/** Tamanho de base da facecam (diâmetro) como fração do lado menor do vídeo, antes da escala. */
export const FACECAM_BASE = 0.34;
export const STICKER_BASE = 0.16;
export const IMAGE_BASE = 0.42;

export function facecamSize(l: FacecamLayer, unit: number): number {
  return even(FACECAM_BASE * unit * l.scale);
}

/** Camadas visíveis no tempo t, na ordem de desenho. */
export function layersAt(layers: Layer[], t: number): Layer[] {
  return layers.filter((l) => t >= l.start && t < l.end);
}

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
