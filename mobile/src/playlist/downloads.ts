import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import PuxaEngine, { type VideoInfo } from '../../modules/puxa-engine';
import { newId } from '../editor/timeline';
import { onStorageCleared } from '../events';
import { itemInfo, resolveLink } from '../sources';
import { audioPlan } from './links';
import { addToList, inList } from './lists';
import { forgetLyrics } from './lyricsFetch';
import { clearTracks, dropTrack, getTracks, patchTrack, putTrack, sameLink, splitLinks, type Track } from './store';

export { audioPlan } from './links';

/**
 * Fila de downloads da playlist: um link por vez vira um arquivo de áudio guardado no aparelho
 * (M4A original do YouTube, ou o áudio tirado do vídeo do Instagram e do X, sem recodificar).
 */

export const playlistDir = () => new Directory(Paths.document, 'playlist');

const localPath = (uri: string) => decodeURI(uri.replace(/^file:\/\//, ''));

type Running = { trackId: string; jobId: string };
let running: Running | null = null;
let listening = false;

function trackFrom(info: VideoInfo, link: string, id = newId('t')): Track {
  return {
    id,
    link,
    title: info.title,
    artist: info.channel ?? '',
    source: info.source ?? 'youtube',
    thumbnail: info.thumbnail || null,
    duration: info.duration || 0,
    path: null,
    size: 0,
    added: Date.now(),
    status: 'queued',
  };
}

/** Já está na lista (pelo link): devolve a faixa existente. */
const existing = (link: string) => getTracks().find((t) => sameLink(t.link, link));

/** Vídeo aberto no Baixar: entra na biblioteca já com título e capa (e na playlist, se veio uma). */
export function addFromInfo(info: VideoInfo, link: string, listId?: string): { track: Track; duplicate: boolean } {
  const old = existing(link);
  if (old && old.status !== 'error') {
    if (listId) addToList(listId, [old.id]);
    return { track: old, duplicate: true };
  }
  const t = trackFrom(info, link, old?.id);
  pendingInfo.set(t.id, info);
  putTrack(t);
  if (listId) addToList(listId, [t.id]);
  pump();
  return { track: t, duplicate: false };
}

/** Informação já lida (vinda do Baixar), para não ler o link de novo. */
const pendingInfo = new Map<string, VideoInfo>();

/**
 * Links colados numa playlist: cada um entra na fila de downloads (e na playlist [listId]).
 * Um link que já está na biblioteca só entra na playlist. Devolve quantos entraram.
 */
export function addLinks(text: string, listId?: string): { added: number; reused: number; duplicates: number; invalid: boolean } {
  const links = splitLinks(text);
  let added = 0;
  let reused = 0;
  let duplicates = 0;
  const into: string[] = [];
  for (const link of links) {
    const old = existing(link);
    if (old && old.status !== 'error') {
      if (listId && !inList(listId, old.id) && !into.includes(old.id)) {
        into.push(old.id);
        reused++;
      } else duplicates++;
      continue;
    }
    const id = old?.id ?? newId('t');
    putTrack({ id, link, title: link.replace(/^https?:\/\/(www\.)?/, ''), artist: '', source: null, thumbnail: null, duration: 0, path: null, size: 0, added: Date.now(), status: 'queued' });
    into.push(id);
    added++;
  }
  if (listId && into.length) addToList(listId, into);
  if (added) pump();
  return { added, reused, duplicates, invalid: links.length === 0 };
}

export function retry(id: string) {
  patchTrack(id, { status: 'queued', error: undefined, progress: undefined });
  pump();
}

/** Tira da lista e apaga o arquivo. */
export function removeTrack(t: Track) {
  if (running?.trackId === t.id) {
    PuxaEngine.cancel(running.jobId);
    running = null;
  }
  pendingInfo.delete(t.id);
  forgetLyrics(t.id);
  if (Platform.OS !== 'web') {
    for (const p of [t.path, t.thumbnail?.startsWith('/') ? t.thumbnail : null]) {
      if (!p) continue;
      try {
        const f = new File(`file://${p}`);
        if (f.exists) f.delete();
      } catch {
        // Já não existia
      }
    }
  }
  dropTrack(t.id);
}

function listen() {
  if (listening) return;
  listening = true;
  PuxaEngine.addListener('onProgress', (e) => {
    if (!running || running.jobId !== e.jobId) return;
    const fraction = e.total > 0 ? Math.min(0.99, e.downloaded / e.total) : undefined;
    patchTrack(running.trackId, { progress: e.stage === 'downloading' ? fraction : 0.99 }, false);
  });
  PuxaEngine.addListener('onDone', (e) => {
    if (!running || running.jobId !== e.jobId) return;
    const { trackId } = running;
    running = null;
    finish(trackId, e.path, e.size, e.duration)
      .catch((err: Error) => patchTrack(trackId, { status: 'error', error: err.message, progress: undefined }))
      .finally(pump);
  });
  PuxaEngine.addListener('onError', (e) => {
    if (!running || running.jobId !== e.jobId) return;
    const { trackId } = running;
    running = null;
    patchTrack(trackId, { status: 'error', error: e.message, progress: undefined });
    pump();
  });
  // Ajustes > Armazenamento > Playlist apaga os arquivos: a lista some junto
  onStorageCleared((kind) => {
    if (kind !== 'playlist') return;
    if (running) PuxaEngine.cancel(running.jobId);
    running = null;
    pendingInfo.clear();
    clearTracks();
  });
}

/** Leva o arquivo baixado para a pasta da playlist e guarda uma capa local. */
async function finish(trackId: string, path: string, size: number, duration: number) {
  const t = getTracks().find((x) => x.id === trackId);
  if (!t) return;
  if (Platform.OS === 'web') {
    patchTrack(trackId, { status: 'ready', path, size, duration: duration || t.duration, progress: undefined });
    return;
  }
  const dir = playlistDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const ext = (path.split('.').pop() || 'm4a').toLowerCase();
  const dest = new File(dir, `${trackId}.${ext}`);
  if (dest.exists) dest.delete();
  new File(`file://${path}`).move(dest);
  let thumbnail = t.thumbnail;
  if (thumbnail && /^https?:/.test(thumbnail)) {
    try {
      const img = new File(dir, `${trackId}.jpg`);
      if (img.exists) img.delete();
      const got = await File.downloadFileAsync(thumbnail, img);
      thumbnail = localPath(got.uri);
    } catch {
      // Sem capa local: fica o link (a do Instagram expira, mas a música continua)
    }
  }
  patchTrack(trackId, { status: 'ready', path: localPath(dest.uri), size, duration: duration || t.duration, thumbnail, progress: undefined, error: undefined });
}

async function infoFor(t: Track): Promise<VideoInfo> {
  const ready = pendingInfo.get(t.id);
  if (ready) return ready;
  // Vídeo de carrossel: o link leva "#id" do item escolhido
  const [base, wanted] = t.link.split('#');
  const r = await resolveLink(base);
  if (r.type === 'youtube') return r.info;
  if (r.type === 'post') {
    const post = r.post;
    const picked = wanted ? post.items.findIndex((_, k) => itemInfo(post, k).id === wanted) : -1;
    const i = picked >= 0 ? picked : Math.max(0, post.items.findIndex((x, k) => k >= post.initial && x.kind === 'video'));
    const item = post.items[i];
    if (!item || item.kind !== 'video') throw new Error('Esse post só tem foto. Cole o link de um vídeo.');
    return itemInfo(post, i);
  }
  throw new Error('Isso é um perfil. Cole o link de um vídeo.');
}

/** Pega a próxima faixa da fila e baixa. */
async function pump() {
  listen();
  if (running) return;
  const t = getTracks().find((x) => x.status === 'queued');
  if (!t) return;
  const jobId = newId('pl');
  running = { trackId: t.id, jobId };
  patchTrack(t.id, { status: 'downloading', progress: 0, error: undefined }, false);
  try {
    const info = await infoFor(t);
    pendingInfo.delete(t.id);
    // Leu o link: agora a faixa tem nome, artista e capa
    const cur = getTracks().find((x) => x.id === t.id);
    if (!cur || running?.trackId !== t.id) return;
    patchTrack(t.id, { title: info.title, artist: info.channel ?? '', source: info.source ?? 'youtube', thumbnail: info.thumbnail || null, duration: info.duration || cur.duration });
    const plan = audioPlan(info);
    if (!plan) throw new Error('Esse link não tem áudio para virar música.');
    if (plan.kind === 'direct') await PuxaEngine.startUrlDownload(jobId, plan.url, info.headers ?? {}, 'm4a', info.title, false);
    else await PuxaEngine.startDownload(jobId, info.id, plan.optionId, false);
  } catch (e) {
    if (running?.jobId === jobId) running = null;
    patchTrack(t.id, { status: 'error', error: (e as Error).message, progress: undefined });
    pump();
  }
}

/** Retoma a fila (ao abrir o app). */
export function resumeQueue() {
  pump();
}
