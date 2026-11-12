/**
 * Modelo de um projeto do modo Criar. Tudo em segundos e em frações do quadro de saída
 * (0 a 1), para a prévia na tela e o vídeo final no FFmpeg usarem a mesma geometria.
 * Este arquivo e os vizinhos (timeline, captions, render) não importam nada do React Native:
 * rodam também no Node, nos testes.
 */

export type Aspect = '9:16' | '1:1' | '4:5' | '16:9' | 'original';
export type Fit = 'fill' | 'fit' | 'blur';
export type FilterId = 'none' | 'vivid' | 'warm' | 'cool' | 'bw' | 'cinema' | 'vintage';
export type Motion = 'none' | 'zoomin' | 'zoomout';
/** Nomes iguais aos do filtro xfade do FFmpeg. */
export type TransitionKind = 'fade' | 'fadeblack' | 'slideleft' | 'slideup' | 'wipeleft' | 'circleopen' | 'zoomin' | 'smoothleft';
export const FONT_ID_LIST = [
  'archivo',
  'montserrat',
  'poppins',
  'nunito',
  'fredoka',
  'bebas',
  'anton',
  'oswald',
  'lora',
  'playfair',
  'caveat',
  'marker',
  'pacifico',
  'bangers',
  'mono',
] as const;
export type FontId = (typeof FONT_ID_LIST)[number];
/** pill = caixa com as pontas redondas; glow = brilho colorido em volta da letra (neon). */
export type Background = 'none' | 'box' | 'line' | 'pill' | 'outline' | 'shadow' | 'glow';

export type MediaSource = {
  id: string;
  kind: 'video' | 'image' | 'audio';
  /** Caminho absoluto no aparelho, sem file:// */
  path: string;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  title: string;
  origin: 'youtube' | 'gallery' | 'camera' | 'mic' | 'music';
  youtubeId?: string;
  thumbnail?: string;
};

export type Transition = { kind: TransitionKind; duration: number };

export type Clip = {
  id: string;
  sourceId: string;
  /** Início e fim no arquivo de origem (em fotos, in = 0 e out = duração escolhida). */
  in: number;
  out: number;
  speed: number;
  volume: number;
  fit: Fit;
  /** 1 = o enquadramento natural do modo; até 4. */
  zoom: number;
  /** -1 a 1: quanto o conteúdo foi arrastado para os lados / para cima e para baixo. */
  panX: number;
  panY: number;
  rotate: 0 | 90 | 180 | 270;
  flip: boolean;
  filter: FilterId;
  motion: Motion;
  /** Transição para o PRÓXIMO clipe; null é corte seco. */
  transition: Transition | null;
};

export type TextStyle = {
  font: FontId;
  /** Tamanho da letra como fração da largura do vídeo. */
  size: number;
  color: string;
  background: Background;
  bgColor: string;
  align: 'center' | 'left' | 'right';
};

type LayerBase = {
  id: string;
  start: number;
  end: number;
  /** Centro da camada, em fração do quadro. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Entrada e saída suaves (0,25 s). */
  fade: boolean;
};

export type TextLayer = LayerBase & { kind: 'text'; text: string; style: TextStyle };
export type StickerLayer = LayerBase & { kind: 'sticker'; emoji: string };
export type ImageLayer = LayerBase & { kind: 'image'; sourceId: string; rounded: boolean; border: boolean };
export type FacecamLayer = LayerBase & {
  kind: 'facecam';
  sourceId: string;
  /** Onde a gravação começa a ser usada (normalmente 0). */
  in: number;
  shape: 'circle' | 'rounded' | 'square';
  border: boolean;
  borderColor: string;
  mirror: boolean;
  volume: number;
};
export type Layer = TextLayer | StickerLayer | ImageLayer | FacecamLayer;

export type Cue = { start: number; end: number; text: string };

/**
 * Como cada legenda entra: fade = surgir; rise = subir; pop = cresce com um pulo;
 * words = as palavras aparecem uma a uma; karaoke = a palavra falada muda de cor;
 * single = uma palavra por vez, no centro.
 */
export type CaptionMotion = 'none' | 'fade' | 'rise' | 'pop' | 'words' | 'karaoke' | 'single';

export type CaptionStyle = TextStyle & {
  position: 'bottom' | 'middle' | 'top';
  uppercase: boolean;
  /** Sem valor: 'none' (projetos antigos). */
  motion?: CaptionMotion;
  /** Centro da legenda em fração do quadro, quando arrastada. Sem valor: vale `position`. */
  x?: number;
  y?: number;
  /** Cor da palavra falada no karaokê. */
  highlight?: string;
  /** Quantas linhas uma legenda pode ocupar na tela; a mais longa vira várias em sequência. Sem valor: 2. */
  maxLines?: number;
};

export type Captions = { cues: Cue[]; style: CaptionStyle; label: string };

export type AudioTrack = {
  id: string;
  kind: 'music' | 'voice';
  sourceId: string;
  /** Onde entra na linha do tempo. */
  start: number;
  /** Trecho usado do arquivo. */
  in: number;
  out: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** Repete a música até o fim do vídeo. */
  loop: boolean;
  title: string;
};

export type Project = {
  id: string;
  title: string;
  aspect: Aspect;
  quality: 720 | 1080;
  clips: Clip[];
  layers: Layer[];
  audio: AudioTrack[];
  captions: Captions | null;
  /** Abaixa a música quando houver voz (narração ou facecam). */
  duck: boolean;
  /** Ajusta a qualidade para o arquivo ficar abaixo de 16 MB (limite de vídeo do WhatsApp). */
  fitWhatsApp?: boolean;
  sources: Record<string, MediaSource>;
  createdAt: number;
  updatedAt: number;
};

export const FPS = 30;
