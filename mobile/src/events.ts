import type { StorageKind } from '../modules/puxa-engine';

type Listener = (kind: StorageKind) => void;
const listeners = new Set<Listener>();

/** Avisa quem guarda caminhos de arquivo (o Baixar, por exemplo) que um tipo de arquivo foi apagado. */
export function onStorageCleared(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function storageCleared(kind: StorageKind) {
  listeners.forEach((l) => l(kind));
}

type AccountListener = (account: 'instagram' | 'elevenlabs', connected: boolean) => void;
const accounts = new Set<AccountListener>();

/** Avisa quando uma conta entra ou sai (o Baixar tenta de novo o link que pedia login). */
export function onAccountChanged(l: AccountListener): () => void {
  accounts.add(l);
  return () => {
    accounts.delete(l);
  };
}

export function accountChanged(account: 'instagram' | 'elevenlabs', connected: boolean) {
  accounts.forEach((l) => l(account, connected));
}
