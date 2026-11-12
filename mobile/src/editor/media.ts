import PuxaEngine, { type DoneEvent, type ProgressEvent, type VideoInfo } from '../../modules/puxa-engine';
import { newId } from './timeline';
import type { MediaSource } from './types';

let cachedDirs: { cache: string; files: string; media: string } | null = null;

export function dirs() {
  if (!cachedDirs) cachedDirs = PuxaEngine.dirs();
  return cachedDirs;
}

export const toPath = (uri: string) => decodeURI(uri.replace(/^file:\/\//, ''));
export const toUri = (path: string) => (path.startsWith('file://') || path.startsWith('http') || path.startsWith('/preview') ? path : `file://${path}`);

/** Espera um download do motor terminar, repassando o progresso. */
export function awaitJob(jobId: string, onProgress?: (e: ProgressEvent) => void): Promise<DoneEvent> {
  return new Promise((resolve, reject) => {
    const subs = [
      PuxaEngine.addListener('onProgress', (e) => e.jobId === jobId && onProgress?.(e)),
      PuxaEngine.addListener('onDone', (e) => {
        if (e.jobId !== jobId) return;
        subs.forEach((s) => s.remove());
        resolve(e);
      }),
      PuxaEngine.addListener('onError', (e) => {
        if (e.jobId !== jobId) return;
        subs.forEach((s) => s.remove());
        reject(Object.assign(new Error(e.message), { code: e.code }));
      }),
    ];
  });
}

/** Melhor vídeo até [maxHeight] (720 por padrão: equilíbrio entre nitidez, espaço e velocidade). */
export function pickVideoOption(info: VideoInfo, maxHeight = 720): string | null {
  const opts = info.options.video;
  const sized = opts.map((o) => ({ o, h: parseInt(o.label, 10) || 0 }));
  const fit = sized.filter((x) => x.h <= maxHeight).sort((a, b) => b.h - a.h)[0] ?? sized.sort((a, b) => a.h - b.h)[0];
  return fit?.o.id ?? null;
}

export function bestM4a(info: VideoInfo): string | null {
  return info.options.audio.find((o) => o.id.startsWith('a:'))?.id ?? null;
}

/** Baixa do YouTube direto para a pasta de mídia dos projetos e devolve a mídia pronta. */
export async function youtubeSource(
  info: VideoInfo,
  optionId: string,
  onProgress?: (fraction: number, stage: string) => void,
  jobId = newId('j'),
): Promise<MediaSource> {
  const done = awaitJob(jobId, (e) => onProgress?.(e.total > 0 ? e.downloaded / e.total : 0, e.stage));
  await PuxaEngine.startDownload(jobId, info.id, optionId, true);
  const file = await done;
  return sourceFromFile(file.path, {
    title: info.title,
    origin: optionId.startsWith('v:') ? 'youtube' : 'music',
    youtubeId: info.id,
    thumbnail: info.thumbnail,
  });
}

export async function sourceFromFile(path: string, extra: Partial<MediaSource> = {}): Promise<MediaSource> {
  const p = await PuxaEngine.probe(path);
  return {
    id: newId('s'),
    kind: p.kind,
    path: toPath(path),
    duration: p.duration,
    width: p.width,
    height: p.height,
    hasAudio: p.hasAudio,
    title: extra.title ?? path.split('/').pop() ?? 'mídia',
    origin: extra.origin ?? 'gallery',
    ...extra,
  };
}

// ---------- Miniaturas e ondas (com cache em memória) ----------

const thumbCache = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();

const thumbKey = (path: string, t: number) => `${path}@${Math.round(t * 2) / 2}`;

export function cachedThumb(path: string, t: number): string | undefined {
  return thumbCache.get(thumbKey(path, t));
}

/** Os arquivos das miniaturas foram apagados (limpeza do cache): elas são geradas de novo. */
export function forgetThumbs() {
  thumbCache.clear();
}

/** Pede ao motor os quadros que faltam (arredondados a 0,5 s) e avisa quando chegam. */
export function loadThumbs(src: MediaSource, times: number[], onReady: () => void) {
  const missing = [...new Set(times.map((t) => Math.round(t * 2) / 2))].filter((t) => !thumbCache.has(thumbKey(src.path, t)));
  if (!missing.length) return;
  const key = `${src.path}:${missing.join(',')}`;
  if (inflight.has(key)) return;
  const job = PuxaEngine.thumbnails(src.path, missing, 96)
    .then((paths) => {
      paths.forEach((p, i) => thumbCache.set(thumbKey(src.path, missing[i]), toUri(p)));
      onReady();
    })
    .catch(() => {})
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
}

const waveCache = new Map<string, number[]>();

export async function waveform(path: string): Promise<number[]> {
  const hit = waveCache.get(path);
  if (hit) return hit;
  try {
    const peaks = await PuxaEngine.waveform(path, 240);
    waveCache.set(path, peaks);
    return peaks;
  } catch {
    return [];
  }
}
