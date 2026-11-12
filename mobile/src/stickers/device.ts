import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';

import PuxaEngine, { type StickerFolder } from '../../modules/puxa-engine';
import { fontFiles } from '../editor/fonts';
import { cachedThumb, dirs, toUri } from '../editor/media';
import { newId } from '../editor/timeline';
import { buildSticker, StickerError, type StickerRequest, type StickerResult } from './make';
import { putFolder, rememberFolder } from './folders';
import type { StickerKind } from './sticker';

const localPath = (uri: string) => decodeURI(uri.replace(/^file:\/\//, '')).replace(/\/$/, '');

/**
 * Gera a figurinha no aparelho com o FFmpeg do app. [signal.cancelled] interrompe entre as etapas
 * (e o FFmpeg em andamento).
 */
export async function makeSticker(req: StickerRequest, onProgress: (label: string, fraction: number | null) => void, signal: { cancelled: boolean }): Promise<StickerResult> {
  if (Platform.OS === 'web') return previewSticker(req, onProgress);
  const jobId = newId('fig');
  const folder = new Directory(toUri(dirs().cache), 'puxa', `sticker-${jobId}`);
  folder.create({ intermediates: true, idempotent: true });
  const dir = localPath(folder.uri);
  const fonts = await fontFiles();
  let running = false;
  const watch = setInterval(() => {
    if (signal.cancelled && running) PuxaEngine.cancelRender(jobId);
  }, 150);
  try {
    return await buildSticker(req, {
      dir,
      font: fonts.anton,
      progress: onProgress,
      cancelled: () => signal.cancelled,
      size: (p) => new File(toUri(p)).info().size ?? 0,
      renderText: async (spec, d) => {
        const [png] = await PuxaEngine.renderOverlays(d, JSON.stringify([spec]));
        return png;
      },
      ffmpeg: async (args) => {
        running = true;
        try {
          await PuxaEngine.ffmpeg(jobId, args, 0);
        } catch (e) {
          const err = e as Error & { code?: string };
          if (signal.cancelled || err.code === 'cancelled') throw new StickerError('cancelled', 'Cancelado.');
          const [message] = err.message.split('\n---\n');
          throw new StickerError('render_failed', message.replace('montar o vídeo', 'montar a figurinha'));
        } finally {
          running = false;
        }
      },
    });
  } finally {
    clearInterval(watch);
  }
}

/** Guarda na pasta (no pacote do tipo da figurinha: paradas ou animadas). */
export async function saveSticker(folderId: string, kind: StickerKind, r: StickerResult, emoji: string, label: string): Promise<StickerFolder> {
  const f = await PuxaEngine.stickerAdd(folderId, kind === 'animated', r.webp, r.poster, [emoji], label);
  putFolder(f);
  rememberFolder(f.id);
  return f;
}

/** Prévia web: sem FFmpeg, a "figurinha" é a miniatura do quadro. */
async function previewSticker(req: StickerRequest, onProgress: (label: string, fraction: number | null) => void): Promise<StickerResult> {
  onProgress('Montando a figurinha…', null);
  await new Promise((r) => setTimeout(r, 900));
  const thumb = cachedThumb(req.src.path, req.start) ?? '/preview/thumbs/sunset-4.jpg';
  return { webp: thumb, poster: thumb, size: req.kind === 'animated' ? 312_000 : 64_000, quality: 50, fps: req.kind === 'animated' ? 12 : null, attempts: 1 };
}
