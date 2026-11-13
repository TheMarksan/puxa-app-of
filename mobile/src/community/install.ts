import PuxaEngine, { type StickerFolder } from '../../modules/puxa-engine';
import { folderToWhatsApp, pendingPacks, putFolder, refreshFolders, roomIn } from '../stickers/folders';
import { imgFile } from './images';
import { countDownload, getDB, setInstalled } from './store';
import type { Pack, Sticker } from './types';

/**
 * Do acervo para o celular: o pacote vira uma pasta de figurinhas do app (a mesma da tela
 * Figurinhas) e dela vai para o WhatsApp. Instalar de novo reaproveita a pasta e só copia o
 * que falta.
 */

export type InstallResult = { folder: StickerFolder; state: 'added' | 'already' | 'cancelled'; error: string | null };

async function folderFor(pack: Pack): Promise<StickerFolder> {
  const folders = await refreshFolders();
  const known = folders.find((f) => f.id === getDB().installed[pack.id]);
  if (known) return known;
  // Nome livre: "Oxente", ou "Oxente 2" se já existe uma pasta com esse nome
  let name = pack.name;
  for (let n = 2; folders.some((f) => f.name.toLowerCase() === name.toLowerCase()); n++) name = `${pack.name} ${n}`;
  const created = await PuxaEngine.stickerFolderCreate(name);
  putFolder(created);
  setInstalled(pack.id, created.id);
  return created;
}

export async function installPack(pack: Pack, onStep?: (done: number, total: number) => void): Promise<InstallResult> {
  let folder = await folderFor(pack);
  const have = new Set(folder.stickers.map((s) => s.label));
  const missing = pack.stickers.filter((s) => !have.has(s.id));
  for (let i = 0; i < missing.length; i++) {
    onStep?.(i, missing.length);
    folder = await addTo(folder.id, pack, missing[i]);
  }
  onStep?.(missing.length, missing.length);
  if (missing.length) countDownload(pack.id);
  if (!pendingPacks(folder).length) return { folder, state: 'already', error: null };
  const r = await folderToWhatsApp(folder);
  return { folder: r.folder, state: r.error ? 'cancelled' : r.added ? 'added' : 'cancelled', error: r.error };
}

async function addTo(folderId: string, pack: Pack, s: Sticker): Promise<StickerFolder> {
  const webp = await imgFile(s.img);
  const poster = s.poster ? await imgFile(s.poster) : webp;
  const f = await PuxaEngine.stickerAdd(folderId, pack.animated, webp, poster, s.emojis, s.id);
  putFolder(f);
  return f;
}

/** Uma figurinha do acervo numa pasta da pessoa. */
export async function addSticker(folder: StickerFolder, pack: Pack, s: Sticker): Promise<StickerFolder> {
  if (folder.stickers.some((x) => x.label === s.id)) return folder;
  if (roomIn(folder, pack.animated) <= 0) throw new Error(`A pasta ${folder.name} já tem 30 figurinhas ${pack.animated ? 'animadas' : 'paradas'}, o máximo do WhatsApp.`);
  return addTo(folder.id, pack, s);
}

/** Quantas figurinhas do pacote já estão na pasta em que ele foi instalado. */
export function installedCount(pack: Pack, folders: StickerFolder[] | null): number {
  const f = folders?.find((x) => x.id === getDB().installed[pack.id]);
  if (!f) return 0;
  const labels = new Set(f.stickers.map((s) => s.label));
  return pack.stickers.filter((s) => labels.has(s.id)).length;
}
