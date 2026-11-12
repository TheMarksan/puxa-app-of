import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { newId } from '../editor/timeline';
import { COLORS, isColor, nextColor, type ListColor } from './colors';
import { dropCover } from './covers';
import { moved } from './queue';
import { getTracks, onTracksChange, type Track } from './store';

/**
 * As playlists (Treino, Estudos...). As músicas ficam guardadas uma vez só (a biblioteca, que
 * aparece como "Todas as músicas"); cada playlist guarda só a ordem dos ids dela.
 */

/** [cover]: imagem escolhida pela pessoa (caminho no celular); sem ela, a capa é o pôster de cor. */
export type Playlist = { id: string; name: string; color: ListColor; trackIds: string[]; created: number; cover?: string | null };

/** "Todas as músicas": a biblioteca inteira, na ordem em que entraram. */
export const ALL = 'all';
export const ALL_NAME = 'Todas as músicas';

const WEB_KEY = 'puxa-playlists';
const file = () => new File(Paths.document, 'playlists.json');

function load(): Playlist[] {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(WEB_KEY) : file().exists ? file().textSync() : null;
    if (!raw) return [];
    const list = JSON.parse(raw) as Playlist[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => p && p.id && typeof p.name === 'string')
      .map((p) => ({
        ...p,
        color: isColor(p.color) ? p.color : 'azul',
        trackIds: Array.isArray(p.trackIds) ? p.trackIds.filter((x) => typeof x === 'string') : [],
        cover: typeof p.cover === 'string' ? p.cover : null,
      }));
  } catch {
    return [];
  }
}

let lists: Playlist[] = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const json = JSON.stringify(lists);
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, json);
      else file().write(json);
    } catch {
      // Sem como gravar: vale até o app fechar
    }
  }, 200);
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getLists = () => lists;
export const onListsChange = (l: () => void) => subscribe(l);

export function useLists(): Playlist[] {
  return useSyncExternalStore(subscribe, getLists, getLists);
}

export const findList = (id: string | null | undefined) => (id ? (lists.find((p) => p.id === id) ?? null) : null);

/** Nome, cor e capa de uma lista, inclusive "Todas as músicas". */
export function listLook(id: string): { name: string; color: ListColor; cover: string | null } {
  if (id === ALL) return { name: ALL_NAME, color: 'grafite', cover: null };
  const p = findList(id);
  return p ? { name: p.name, color: p.color, cover: p.cover ?? null } : { name: ALL_NAME, color: 'grafite', cover: null };
}

export const colorOf = (id: string) => COLORS[listLook(id).color];

/** Músicas de uma lista, na ordem dela (as que sumiram da biblioteca ficam de fora). */
export function tracksOf(id: string, all: Track[] = getTracks()): Track[] {
  if (id === ALL) return all;
  const p = findList(id);
  if (!p) return [];
  const byId = new Map(all.map((t) => [t.id, t]));
  return p.trackIds.map((x) => byId.get(x)).filter((t): t is Track => !!t);
}

/** Ids das músicas já baixadas de uma lista: é isso que toca. */
export const readyIds = (id: string) => tracksOf(id).filter((t) => t.status === 'ready' && t.path).map((t) => t.id);

export function createList(name: string, color?: ListColor, cover?: string | null): Playlist {
  const p: Playlist = { id: newId('pl'), name: name.trim().slice(0, 40) || 'Nova playlist', color: color ?? nextColor(lists.map((x) => x.color)), trackIds: [], created: Date.now(), cover: cover ?? null };
  lists = [...lists, p];
  emit();
  return p;
}

export function updateList(id: string, patch: Partial<Pick<Playlist, 'name' | 'color' | 'cover'>>) {
  const old = findList(id);
  // A capa trocada (ou tirada) sai do celular
  if (old?.cover && 'cover' in patch && patch.cover !== old.cover) dropCover(old.cover);
  lists = lists.map((p) => (p.id === id ? { ...p, ...patch, name: (patch.name ?? p.name).trim().slice(0, 40) || p.name } : p));
  emit();
}

export function deleteList(id: string) {
  dropCover(findList(id)?.cover);
  lists = lists.filter((p) => p.id !== id);
  emit();
}

export function addToList(id: string, trackIds: string[]) {
  if (id === ALL) return;
  lists = lists.map((p) => (p.id === id ? { ...p, trackIds: [...p.trackIds, ...trackIds.filter((x) => !p.trackIds.includes(x))] } : p));
  emit();
}

export function removeFromList(id: string, trackId: string) {
  lists = lists.map((p) => (p.id === id ? { ...p, trackIds: p.trackIds.filter((x) => x !== trackId) } : p));
  emit();
}

export const inList = (id: string, trackId: string) => id === ALL || !!findList(id)?.trackIds.includes(trackId);

export function moveInList(id: string, trackId: string, by: number) {
  lists = lists.map((p) => (p.id === id ? { ...p, trackIds: moved(p.trackIds, trackId, by) } : p));
  emit();
}

// Música apagada do celular: sai de todas as playlists
let known = new Set(getTracks().map((t) => t.id));
onTracksChange(() => {
  const now = new Set(getTracks().map((t) => t.id));
  const gone = [...known].filter((x) => !now.has(x));
  known = now;
  if (!gone.length || !lists.some((p) => p.trackIds.some((x) => gone.includes(x)))) return;
  lists = lists.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => !gone.includes(x)) }));
  emit();
});
