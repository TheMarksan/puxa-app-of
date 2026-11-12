import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * A playlist: links que viraram músicas no aparelho. Cada faixa guarda o link de onde veio, o
 * arquivo de áudio (quando já baixou) e o que aparece na lista e na notificação do player.
 */

export type TrackStatus = 'queued' | 'downloading' | 'ready' | 'error';

export type Track = {
  id: string;
  link: string;
  title: string;
  artist: string;
  source: 'youtube' | 'instagram' | 'x' | null;
  /** Capa: arquivo local quando já baixou, ou o link da miniatura. */
  thumbnail: string | null;
  duration: number;
  /** Arquivo de áudio no aparelho (sem file://). */
  path: string | null;
  size: number;
  added: number;
  status: TrackStatus;
  /** 0 a 1 enquanto baixa (não fica guardado). */
  progress?: number;
  error?: string;
};

const WEB_KEY = 'puxa-playlist';
const file = () => new File(Paths.document, 'playlist.json');

function load(): Track[] {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(WEB_KEY) : file().exists ? file().textSync() : null;
    if (!raw) return [];
    const list = JSON.parse(raw) as Track[];
    if (!Array.isArray(list)) return [];
    // O que estava baixando quando o app fechou volta para a fila
    return list.filter((t) => t && t.id && t.link).map((t) => (t.status === 'downloading' ? { ...t, status: 'queued' as const, progress: undefined } : t));
  } catch {
    return [];
  }
}

let tracks: Track[] = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const json = JSON.stringify(tracks.map(({ progress: _p, ...t }) => t));
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, json);
      else file().write(json);
    } catch {
      // Sem como gravar: a lista vale até o app fechar
    }
  }, 250);
}

function emit(save = true) {
  if (save) persist();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getTracks = () => tracks;

export function useTracks(): Track[] {
  return useSyncExternalStore(subscribe, getTracks, getTracks);
}

export function onTracksChange(l: () => void) {
  return subscribe(l);
}

export function putTrack(t: Track) {
  const i = tracks.findIndex((x) => x.id === t.id);
  tracks = i >= 0 ? tracks.map((x) => (x.id === t.id ? t : x)) : [...tracks, t];
  emit();
}

export function patchTrack(id: string, patch: Partial<Track>, save = true) {
  let changed = false;
  tracks = tracks.map((t) => {
    if (t.id !== id) return t;
    changed = true;
    return { ...t, ...patch };
  });
  if (changed) emit(save);
}

export function dropTrack(id: string) {
  tracks = tracks.filter((t) => t.id !== id);
  emit();
}

/** Troca a faixa de lugar (para cima ou para baixo). */
export function moveTrack(id: string, by: number) {
  const i = tracks.findIndex((t) => t.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= tracks.length) return;
  const next = [...tracks];
  const [t] = next.splice(i, 1);
  next.splice(j, 0, t);
  tracks = next;
  emit();
}

export function clearTracks() {
  tracks = [];
  emit();
}

export { sameLink, splitLinks } from './links';
