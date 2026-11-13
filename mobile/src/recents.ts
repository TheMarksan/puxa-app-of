import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { MAX_RECENTS, parseRecents, pushRecent, sameRecent, type Recent } from './recentList';

export { MAX_RECENTS, pushRecent, sameRecent, type Recent };

const WEB_KEY = 'puxa-recents';
const file = () => new File(Paths.document, 'recentes.json');

/** Os links recentes moram num arquivo do app (no navegador, no localStorage). */
function load(): Recent[] {
  try {
    return parseRecents(Platform.OS === 'web' ? globalThis.localStorage?.getItem(WEB_KEY) : file().exists ? file().textSync() : null);
  } catch {
    return [];
  }
}

let recents: Recent[] = load();
const listeners = new Set<() => void>();

function emit() {
  const json = JSON.stringify(recents);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, json);
    else file().write(json);
  } catch {
    // Sem como gravar: vale até o app fechar
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getRecents = () => recents;
export const useRecents = () => useSyncExternalStore(subscribe, getRecents, getRecents);

export function remember(item: Omit<Recent, 'at'>) {
  if (!item.link.trim()) return;
  recents = pushRecent(recents, { ...item, at: Date.now() });
  emit();
}

export function forgetRecent(link: string) {
  recents = recents.filter((r) => !sameRecent(r.link, link));
  emit();
}

export function clearRecents() {
  if (!recents.length) return;
  recents = [];
  emit();
}
