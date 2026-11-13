import { File, Paths } from 'expo-file-system';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { newId } from '../editor/timeline';
import * as core from './core';
import { CATEGORIES, seed } from './seed';
import type { CategoryId, DB, User } from './types';

/**
 * A comunidade simulada: o "servidor" mora num arquivo do app (no navegador, no localStorage) e
 * cada ação espera um pouco, como numa rede de verdade. Quando o servidor existir, só este
 * arquivo muda: as telas usam as mesmas funções.
 */

const WEB_KEY = 'puxa-comunidade';
const VERSION = 1;
const file = () => new File(Paths.document, 'comunidade.json');

function load(): DB {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(WEB_KEY) : file().exists ? file().textSync() : null;
    if (raw) {
      const db = JSON.parse(raw) as DB;
      if (db && db.version === VERSION && Array.isArray(db.users) && Array.isArray(db.packs)) return db;
    }
  } catch {
    // Arquivo estragado: começa dos dados de teste
  }
  return seed();
}

let db: DB = load();
const listeners = new Set<() => void>();

function commit(next: DB) {
  if (next === db) return;
  db = next;
  const json = JSON.stringify(db);
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

export const getDB = () => db;
export const useDB = () => useSyncExternalStore(subscribe, getDB, getDB);
export const useMe = (): User | null => core.me(useDB());

/** A espera de uma ida e volta ao servidor (simulada). */
const net = () => new Promise<void>((r) => setTimeout(r, 220 + Math.random() * 260));

/**
 * Se a tela [key] já "baixou" os dados nesta sessão. Na primeira vez espera a rede simulada: é
 * quando a tela mostra o esqueleto de carregando.
 */
const fetched = new Set<string>();
export function useFetched(key: string): boolean {
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (fetched.has(key)) return;
    let alive = true;
    net().then(() => {
      fetched.add(key);
      if (alive) setDone(key);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return fetched.has(key) || done === key;
}

export const categoryName = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.name ?? id;

// ---------- Ações ----------

export async function login(identifier: string, password: string) {
  await net();
  commit(core.login(db, identifier, password));
}

export async function signup(input: core.SignupInput) {
  await net();
  commit(core.signup(db, input, Date.now(), newId('u-')));
}

export function logout() {
  commit(core.logout(db));
}

export async function updateProfile(patch: core.ProfilePatch) {
  await net();
  commit(core.updateProfile(db, patch));
}

/** Seguir e curtir mudam na hora (a rede confirma por trás). */
export function follow(id: string) {
  commit(core.follow(db, id));
}

export function unfollow(id: string) {
  commit(core.unfollow(db, id));
}

export function toggleLike(packId: string) {
  commit(core.toggleLike(db, packId));
}

export function countDownload(packId: string) {
  commit(core.countDownload(db, packId));
}

export async function publish(input: core.PublishInput): Promise<string> {
  await net();
  const id = newId('p-');
  commit(core.publish(db, input, Date.now(), id));
  return id;
}

export async function unpublish(packId: string) {
  await net();
  commit(core.unpublish(db, packId));
}

export const rememberSearch = (q: string) => commit(core.rememberSearch(db, q));
export const forgetSearch = (q: string) => commit(core.forgetSearch(db, q));
export const clearSearches = () => commit(core.clearSearches(db));

/** O pacote do acervo foi instalado nesta pasta (ou saiu dela). */
export function setInstalled(packId: string, folderId: string | null) {
  const installed = { ...db.installed };
  if (folderId) installed[packId] = folderId;
  else delete installed[packId];
  commit({ ...db, installed });
}

/** Volta tudo aos dados de teste (sai da conta, desfaz seguir, curtir e publicar). */
export function resetCommunity() {
  fetched.clear();
  commit({ ...seed(), installed: db.installed });
}
