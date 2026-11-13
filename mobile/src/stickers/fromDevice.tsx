import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import PuxaEngine, { type DoneEvent, type VideoInfo } from '../../modules/puxa-engine';
import { useToast } from '../components/Toasts';
import { VideoSendSheet, type SendAs } from '../components/VideoSendSheet';
import { toPath, toUri } from '../editor/media';
import { newId } from '../editor/timeline';
import { rememberFolder } from './folders';

/**
 * Figurinha a partir de um arquivo do celular: foto vira figurinha parada; vídeo e GIF viram
 * animada (o GIF passa antes por um MP4, que o player e o recorte de trecho entendem). Depois é
 * o mesmo editor de figurinha do Início, com recorte, cantos, contorno e texto.
 */

export type DeviceMedia = { file: DoneEvent; info: VideoInfo; as: SendAs };

const dir = () => new Directory(Paths.cache, 'puxa', 'importados');

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp', mkv: 'video/x-matroska' };

/** GIF → MP4 (H.264): primeiro o codificador do aparelho, depois o de software. */
async function gifToMp4(src: string, out: string) {
  const vf = 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p';
  const tries = [
    ['-c:v', 'h264_mediacodec', '-b:v', '3M'],
    ['-c:v', 'libopenh264', '-b:v', '3M'],
  ];
  let last: unknown = null;
  for (const enc of tries) {
    try {
      await PuxaEngine.ffmpeg(newId('gif'), ['-y', '-v', 'error', '-i', src, '-vf', vf, '-an', '-movflags', '+faststart', ...enc, out], 0);
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('Não deu para abrir esse GIF.');
}

/** Abre a galeria (fotos, vídeos e GIFs). null quando a pessoa desiste. */
export async function pickDeviceMedia(): Promise<DeviceMedia | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1, allowsMultipleSelection: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const name = a.fileName ?? a.uri.split('/').pop() ?? 'arquivo';
  const ext = (name.split('.').pop() || (a.type === 'video' ? 'mp4' : 'jpg')).toLowerCase();
  const id = newId('imp');
  let mime = a.mimeType ?? MIME[ext] ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
  let path = a.uri;
  if (Platform.OS !== 'web') {
    const d = dir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const copy = new File(d, `${id}.${ext.length > 4 ? 'bin' : ext}`);
    await new File(a.uri).copy(copy);
    path = toPath(copy.uri);
    if (mime === 'image/gif') {
      const mp4 = toPath(new File(d, `${id}.mp4`).uri);
      await gifToMp4(path, mp4);
      path = mp4;
      mime = 'video/mp4';
    }
  }
  const video = mime.startsWith('video');
  let duration = a.duration ? a.duration / 1000 : 0;
  if (video && !duration && Platform.OS !== 'web') duration = (await PuxaEngine.probe(path)).duration;
  const size = Platform.OS === 'web' ? (a.fileSize ?? 0) : (new File(toUri(path)).info().size ?? 0);
  const title = name.replace(/\.[^.]+$/, '') || 'Do celular';
  const file: DoneEvent = { jobId: id, path, filename: video ? `${title}.mp4` : name, size, duration, mime };
  const info: VideoInfo = {
    id,
    title,
    channel: 'Do seu celular',
    duration,
    viewCount: null,
    uploadDate: null,
    thumbnail: video ? '' : toUri(path),
    options: { audio: [], video: [] },
    chapters: [],
    captions: [],
  };
  return { file, info, as: video ? 'animated' : 'still' };
}

/**
 * Liga a criação a partir do celular em qualquer tela: [start] abre a galeria (e, com
 * [folderId], já deixa essa pasta escolhida); [sheet] é a folha do editor para pôr na tela.
 */
export function useDeviceSticker() {
  const toast = useToast();
  const [media, setMedia] = useState<DeviceMedia | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = useCallback(
    async (folderId?: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const m = await pickDeviceMedia();
        if (!m) return;
        if (folderId) rememberFolder(folderId);
        setMedia(m);
        setVisible(true);
      } catch (e) {
        toast.show({ title: 'Não deu para abrir esse arquivo', body: (e as Error).message, tone: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [busy, toast],
  );

  const sheet = media ? (
    <VideoSendSheet
      key={media.file.path}
      file={media.file}
      info={media.info}
      mode={media.as}
      visible={visible}
      onClose={() => setVisible(false)}
      onShare={async (t, whatsapp) => {
        await PuxaEngine.share(t.path, t.mime, whatsapp, t.filename);
      }}
      onError={(message) => toast.show({ title: 'Algo não saiu', body: message, tone: 'error' })}
      onNotice={(title, body) => toast.show({ title, body, tone: 'success', duration: 5000 })}
    />
  ) : null;

  return { start, sheet, busy };
}
