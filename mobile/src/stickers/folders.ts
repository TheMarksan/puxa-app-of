import { useEffect, useSyncExternalStore } from 'react';

import PuxaEngine, { type StickerFolder, type StickerPack } from '../../modules/puxa-engine';
import { getSettings, setSettings } from '../settings';

/** Máximo de figurinhas de cada tipo por pasta (regra do WhatsApp para um pacote). */
export const MAX_PER_PACK = 30;

/**
 * Pastas de figurinhas, compartilhadas entre o envio (onde a figurinha nasce) e a tela
 * Figurinhas. A lista vem do módulo nativo; aqui fica a cópia que a interface mostra.
 */
let folders: StickerFolder[] | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function refreshFolders(): Promise<StickerFolder[]> {
  return PuxaEngine.stickerFolders().then((list) => {
    folders = list;
    emit();
    return list;
  });
}

/** A primeira leitura em andamento: as dezenas de "+" do acervo esperam a mesma, em vez de cada um pedir a lista ao motor. */
let firstLoad: Promise<unknown> | null = null;

/** Lista das pastas (null enquanto carrega); busca na primeira vez. */
export function useFolders(): StickerFolder[] | null {
  const list = useSyncExternalStore(
    subscribe,
    () => folders,
    () => folders,
  );
  useEffect(() => {
    if (folders || firstLoad) return;
    firstLoad = refreshFolders()
      .catch(() => {})
      .finally(() => {
        firstLoad = null;
      });
  }, []);
  return list;
}

export function putFolder(f: StickerFolder) {
  const list = folders ?? [];
  folders = list.some((x) => x.id === f.id) ? list.map((x) => (x.id === f.id ? f : x)) : [...list, f];
  emit();
}

export function dropFolder(id: string) {
  folders = (folders ?? []).filter((f) => f.id !== id);
  emit();
}

/** A pasta usada da última vez (ou a primeira). */
export function lastFolderId(list: StickerFolder[] | null): string | null {
  if (!list?.length) return null;
  const saved = getSettings().stickerFolder;
  return list.some((f) => f.id === saved) ? saved! : list[0].id;
}

export function rememberFolder(id: string) {
  if (getSettings().stickerFolder !== id) setSettings({ stickerFolder: id });
}

export const packOf = (f: StickerFolder, animated: boolean): StickerPack | undefined => f.packs.find((p) => p.animated === animated);

/** Quantas de cada tipo cabem ainda. */
export const roomIn = (f: StickerFolder, animated: boolean) => MAX_PER_PACK - (packOf(f, animated)?.count ?? 0);

/** Pacotes da pasta que têm figurinha mas ainda não estão no WhatsApp. */
export const pendingPacks = (f: StickerFolder) => f.packs.filter((p) => p.count > 0 && !p.whatsapp);

/** Leva cada pacote pendente da pasta ao WhatsApp, um depois do outro. */
export async function folderToWhatsApp(f: StickerFolder): Promise<{ added: number; error: string | null; folder: StickerFolder }> {
  let added = 0;
  let next = f;
  for (const p of pendingPacks(f)) {
    const r = await PuxaEngine.stickerToWhatsApp(p.id);
    if (!r.added) return { added, error: r.error, folder: next };
    added++;
    next = { ...next, packs: next.packs.map((x) => (x.id === p.id ? { ...x, whatsapp: true } : x)) };
  }
  putFolder(next);
  return { added, error: null, folder: next };
}
