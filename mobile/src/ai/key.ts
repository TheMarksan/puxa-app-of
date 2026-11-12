import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { accountChanged } from '../events';

/**
 * Chave da API da ElevenLabs, digitada pela pessoa nos Ajustes (ou na hora de dublar). Fica no
 * cofre do Android (Keystore); o app só a usa para falar com a própria ElevenLabs.
 */
const NAME = 'elevenlabs_key';
let key: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load() {
  try {
    key = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(NAME) ?? null) : await SecureStore.getItemAsync(NAME);
  } catch {
    key = null;
  }
  loaded = true;
  emit();
}
load();

export function elevenKey(): string | null {
  return key;
}

export async function setElevenKey(value: string | null) {
  const v = value?.trim() || null;
  if (Platform.OS === 'web') {
    if (v) globalThis.localStorage?.setItem(NAME, v);
    else globalThis.localStorage?.removeItem(NAME);
  } else if (v) await SecureStore.setItemAsync(NAME, v);
  else await SecureStore.deleteItemAsync(NAME);
  key = v;
  emit();
  accountChanged('elevenlabs', !!v);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => (loaded ? (key ?? '') : null);

/** A chave ('' sem chave; null enquanto lê o cofre). */
export function useElevenKey(): string | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
