import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import PuxaEngine from '../../modules/puxa-engine';
import { toPath } from '../editor/media';
import { newId } from '../editor/timeline';
import { artworkArgs } from './artworkArgs';
import { COLORS } from './colors';
import { listLook } from './lists';
import type { Track } from './store';

/**
 * Arte da notificação do player na cara do app: a capa da música num quadro da cor da
 * playlist (ou a seta do Puxa, quando a música não tem capa). Fica guardada no cache.
 */

const dir = () => new Directory(Paths.cache, 'artwork');
const made = new Map<string, string>();
const making = new Map<string, Promise<string | null>>();
let mark: Promise<string | null> | null = null;

/** O desenho do ícone do app (seta branca), como arquivo para o ffmpeg. */
function markFile(): Promise<string | null> {
  mark ??= Asset.fromModule(require('../../assets/android-icon-foreground.png'))
    .downloadAsync()
    .then((a) => (a.localUri ? toPath(a.localUri) : null))
    .catch(() => null);
  return mark;
}

const localArt = (p: string | null | undefined) => (p && !/^https?:/.test(p) ? toPath(p) : null);

function keyOf(t: Track, listId: string): { key: string; color: string; art: string | null; darkInk: boolean } {
  const look = listLook(listId);
  const k = COLORS[look.color];
  const art = localArt(t.thumbnail) ?? localArt(look.cover);
  let h = 0x811c9dc5;
  for (const ch of `${t.id}|${k.bg}|${art ?? ''}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return { key: `art-${h.toString(36)}`, color: k.bg, art, darkInk: k.ink !== '#FFFFFF' };
}

/** A arte já pronta (endereço file://), se existe. */
export function readyArtwork(t: Track, listId: string): string | undefined {
  if (Platform.OS === 'web') return undefined;
  const { key } = keyOf(t, listId);
  const hit = made.get(key);
  if (hit) return hit;
  const f = new File(dir(), `${key}.jpg`);
  if (f.exists) {
    made.set(key, f.uri);
    return f.uri;
  }
  return undefined;
}

/** Monta a arte (uma vez por música e cor). null se não deu: fica a capa simples. */
export function makeArtwork(t: Track, listId: string): Promise<string | null> {
  if (Platform.OS === 'web') return Promise.resolve(null);
  const ready = readyArtwork(t, listId);
  if (ready) return Promise.resolve(ready);
  const { key, color, art, darkInk } = keyOf(t, listId);
  const running = making.get(key);
  if (running) return running;
  const job = (async () => {
    const d = dir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const out = new File(d, `${key}.jpg`);
    const logo = art ? null : await markFile();
    await PuxaEngine.ffmpeg(newId('arte'), artworkArgs({ color, art, out: toPath(out.uri), mark: logo, darkMark: darkInk }), 0);
    made.set(key, out.uri);
    return out.uri;
  })()
    .catch(() => null)
    .finally(() => making.delete(key));
  making.set(key, job);
  return job;
}
