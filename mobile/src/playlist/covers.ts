import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import PuxaEngine from '../../modules/puxa-engine';
import { toPath } from '../editor/media';
import { newId } from '../editor/timeline';
import { colorFromPixels, type ListColor } from './colors';

/**
 * Capas próprias das playlists: a imagem escolhida na galeria (já recortada em quadrado) fica
 * guardada no app, e dela sai uma sugestão de cor que combina.
 */

const dir = () => new Directory(Paths.document, 'covers');

/** Abre a galeria (seletor de fotos do Android, sem pedir permissão) com recorte quadrado. */
export async function pickCover(): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
  if (r.canceled || !r.assets?.length) return null;
  const uri = r.assets[0].uri;
  if (Platform.OS === 'web') return uri;
  const d = dir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  const ext = (uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const dest = new File(d, `${newId('capa')}.${ext.length > 4 ? 'jpg' : ext}`);
  await new File(uri).copy(dest);
  return toPath(dest.uri);
}

/** Apaga uma capa que deixou de ser usada. */
export function dropCover(path: string | null | undefined) {
  if (!path || Platform.OS === 'web' || !path.includes('/covers/')) return;
  try {
    const f = new File(path.startsWith('file://') ? path : `file://${path}`);
    if (f.exists) f.delete();
  } catch {
    // já tinha saído
  }
}

/** Cor da paleta que combina com a imagem (lida em 8×8 pontos). null quando não deu para ler. */
export async function colorOfImage(path: string): Promise<ListColor | null> {
  if (Platform.OS === 'web') return null;
  const out = new File(Paths.cache, `${newId('cor')}.rgb`);
  try {
    await PuxaEngine.ffmpeg(newId('cor'), ['-y', '-v', 'error', '-i', path, '-vf', 'scale=8:8:flags=area,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', toPath(out.uri)], 0);
    return colorFromPixels(out.bytesSync());
  } catch {
    return null;
  } finally {
    try {
      if (out.exists) out.delete();
    } catch {
      // ignorado
    }
  }
}
