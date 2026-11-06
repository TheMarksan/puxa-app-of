import { Asset } from 'expo-asset';

import type { FontId } from './types';

/**
 * As fontes das legendas e textos. A prévia usa a família carregada pelo expo-font; o desenho
 * dos PNGs no aparelho usa o próprio arquivo .ttf, então o vídeo final tem a mesma letra.
 */
// A ordem é a da lista na tela: sem serifa, condensadas, com serifa, manuscritas e divertidas.
// O nome aparece escrito na própria fonte, então ele mesmo mostra o estilo.
export const FONTS: Record<FontId, { label: string; family: string; module: number }> = {
  archivo: { label: 'Archivo', family: 'Archivo_800ExtraBold', module: require('@expo-google-fonts/archivo/800ExtraBold/Archivo_800ExtraBold.ttf') },
  montserrat: { label: 'Montserrat', family: 'Montserrat_900Black', module: require('@expo-google-fonts/montserrat/900Black/Montserrat_900Black.ttf') },
  poppins: { label: 'Poppins', family: 'Poppins_800ExtraBold', module: require('@expo-google-fonts/poppins/800ExtraBold/Poppins_800ExtraBold.ttf') },
  nunito: { label: 'Nunito', family: 'Nunito_900Black', module: require('@expo-google-fonts/nunito/900Black/Nunito_900Black.ttf') },
  fredoka: { label: 'Fredoka', family: 'Fredoka_700Bold', module: require('@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf') },
  bebas: { label: 'Bebas', family: 'BebasNeue_400Regular', module: require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf') },
  anton: { label: 'Anton', family: 'Anton_400Regular', module: require('@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf') },
  oswald: { label: 'Oswald', family: 'Oswald_700Bold', module: require('@expo-google-fonts/oswald/700Bold/Oswald_700Bold.ttf') },
  lora: { label: 'Lora', family: 'Lora_700Bold', module: require('@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf') },
  playfair: { label: 'Playfair', family: 'PlayfairDisplay_800ExtraBold', module: require('@expo-google-fonts/playfair-display/800ExtraBold/PlayfairDisplay_800ExtraBold.ttf') },
  caveat: { label: 'Caveat', family: 'Caveat_700Bold', module: require('@expo-google-fonts/caveat/700Bold/Caveat_700Bold.ttf') },
  marker: { label: 'Marker', family: 'PermanentMarker_400Regular', module: require('@expo-google-fonts/permanent-marker/400Regular/PermanentMarker_400Regular.ttf') },
  pacifico: { label: 'Pacifico', family: 'Pacifico_400Regular', module: require('@expo-google-fonts/pacifico/400Regular/Pacifico_400Regular.ttf') },
  bangers: { label: 'Bangers', family: 'Bangers_400Regular', module: require('@expo-google-fonts/bangers/400Regular/Bangers_400Regular.ttf') },
  mono: { label: 'Mono', family: 'SpaceMono_700Bold', module: require('@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf') },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];

/** Para o useFonts: { família: módulo }. */
export const FONT_MAP: Record<string, number> = Object.fromEntries(FONT_IDS.map((id) => [FONTS[id].family, FONTS[id].module]));

let files: Promise<Record<FontId, string>> | null = null;

/** Caminhos dos .ttf no aparelho (o Asset copia do APK para o cache na primeira vez). */
export function fontFiles(): Promise<Record<FontId, string>> {
  if (!files) {
    files = Promise.all(
      FONT_IDS.map(async (id) => {
        const asset = await Asset.fromModule(FONTS[id].module).downloadAsync();
        return [id, (asset.localUri ?? asset.uri).replace(/^file:\/\//, '')] as const;
      }),
    )
      .then((pairs) => Object.fromEntries(pairs) as Record<FontId, string>)
      .catch((e) => {
        files = null;
        throw e;
      });
  }
  return files;
}
