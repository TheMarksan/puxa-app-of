export type QualityOption = {
  id: string;
  label: string;
  note: string;
  size: number | null;
};

export type Chapter = { start: number; title: string };

export type CaptionTrack = { index: number; lang: string; name: string; auto: boolean };

export type SearchResult = { id: string; title: string; channel: string; duration: number; thumbnail: string };

export type Probe = {
  kind: 'video' | 'image' | 'audio';
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
  rotation: number;
};

export type Dirs = { cache: string; files: string; media: string };

export type RenderProgressEvent = { jobId: string; progress: number; speed: number };

export type FetchProgressEvent = { jobId: string; downloaded: number; total: number };

export type VideoInfo = {
  id: string;
  title: string;
  channel: string;
  duration: number;
  viewCount: number | null;
  uploadDate: string | null;
  thumbnail: string;
  /** [image]: só em fotos do Instagram e do X. */
  options: { audio: QualityOption[]; video: QualityOption[]; image?: QualityOption[] };
  chapters: Chapter[];
  captions: CaptionTrack[];
  /** De onde veio (sem o campo: YouTube). */
  source?: 'youtube' | 'instagram' | 'x';
  /** Link original (Instagram e X). */
  link?: string;
  /** É uma foto (Instagram e X). */
  image?: boolean;
  /** Link direto da mídia de cada opção (Instagram e X). */
  direct?: Record<string, { url: string; kind: 'video' | 'audio' | 'image' }>;
  /** Cabeçalhos para baixar a mídia direta. */
  headers?: Record<string, string>;
};

export type Stage = 'downloading' | 'processing';

export type ProgressEvent = {
  jobId: string;
  stage: Stage;
  downloaded: number;
  total: number;
  speed: number;
  eta: number | null;
};

export type DoneEvent = {
  jobId: string;
  path: string;
  filename: string;
  size: number;
  duration: number;
  mime: string;
};

export type ErrorEvent = { jobId: string; code: string; message: string };

export type ClipResult = { path: string; size: number; filename: string; mime: string };

export type PuxaEngineEvents = {
  onProgress: (event: ProgressEvent) => void;
  onDone: (event: DoneEvent) => void;
  onError: (event: ErrorEvent) => void;
  onSharedText: (event: { text: string }) => void;
  onRenderProgress: (event: RenderProgressEvent) => void;
  onFetchProgress: (event: FetchProgressEvent) => void;
};

export type StickerItem = {
  file: string;
  path: string;
  poster: string | null;
  size: number;
  emojis: string[];
  label: string;
  created: number;
  animated: boolean;
};

/**
 * Pacote do WhatsApp dentro de uma pasta: o WhatsApp não mistura paradas e animadas, então cada
 * pasta tem um de cada. [whatsapp]/[business]: já está lá (null quando não dá para saber).
 */
export type StickerPack = {
  id: string;
  name: string;
  animated: boolean;
  count: number;
  whatsapp: boolean | null;
  business: boolean | null;
};

/** Pasta de figurinhas. [stickers]: as duas espécies juntas, da mais nova para a mais antiga. */
export type StickerFolder = {
  id: string;
  name: string;
  created: number;
  packs: StickerPack[];
  stickers: StickerItem[];
};

export type StorageKind = 'downloads' | 'temp' | 'playlist' | 'stickers' | 'models';
export type StorageUsage = Record<StorageKind, number>;
