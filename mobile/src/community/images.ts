import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import type { ImageSourcePropType } from 'react-native';
import { Platform } from 'react-native';

import { toPath, toUri } from '../editor/media';
import { newId } from '../editor/timeline';
import { ART } from './art';
import type { Img } from './types';

/** Para o <Image>: a arte que vem no app ou o arquivo do aparelho. */
export const imgSource = (img: Img): ImageSourcePropType => ('art' in img ? ART[img.art] : { uri: toUri(img.uri) });

/** Caminho de arquivo da imagem (a arte do app é copiada para o cache na primeira vez). */
export async function imgFile(img: Img): Promise<string> {
  if (!('art' in img)) return toPath(img.uri);
  const a = Asset.fromModule(ART[img.art]);
  await a.downloadAsync();
  return Platform.OS === 'web' ? (a.localUri ?? a.uri) : toPath(a.localUri ?? a.uri);
}

const dir = (name: string) => new Directory(Paths.document, 'comunidade', name);

/** Guarda uma cópia do arquivo no app (o original pode sumir da galeria ou da pasta). */
export async function keep(path: string, folder: string): Promise<string> {
  if (Platform.OS === 'web') return path;
  const d = dir(folder);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  const ext = (path.split('?')[0].split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const dest = new File(d, `${newId('img')}.${ext.length > 4 ? 'jpg' : ext}`);
  await new File(toUri(path)).copy(dest);
  return toPath(dest.uri);
}

/** Abre a galeria para a foto de perfil (quadrada) ou a capa (larga). null quando a pessoa desiste. */
export async function pickProfileImage(kind: 'avatar' | 'cover'): Promise<Img | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: kind === 'avatar' ? [1, 1] : [5, 2], quality: 0.85 });
  if (r.canceled || !r.assets?.length) return null;
  return { uri: await keep(r.assets[0].uri, 'perfil') };
}
