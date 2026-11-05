import { NativeModule, requireNativeModule } from 'expo';

import type { ClipResult, PuxaEngineEvents, VideoInfo } from './PuxaEngine.types';

declare class PuxaEngineModule extends NativeModule<PuxaEngineEvents> {
  /** Lê o link (ou um texto com o link dentro) e devolve título, capa e opções de qualidade. */
  getInfo(text: string): Promise<VideoInfo>;
  /** Começa o preparo; o andamento chega pelos eventos onProgress, onDone e onError. */
  startDownload(jobId: string, videoId: string, optionId: string): Promise<void>;
  cancel(jobId: string): void;
  waveform(path: string, buckets: number): Promise<number[]>;
  trim(path: string, start: number, end: number, filename: string): Promise<ClipResult>;
  /** Copia para Download/Puxa e devolve a pasta onde ficou. */
  saveToDownloads(path: string, filename: string, mime: string): Promise<string>;
  /** Abre o WhatsApp direto (ou o menu de compartilhar). Resolve true se foi direto para o WhatsApp. */
  share(path: string, mime: string, whatsapp: boolean, filename: string): Promise<boolean>;
  /** Texto recebido pelo menu de compartilhar do Android ao abrir o app. */
  takeSharedText(): string | null;
}

export default requireNativeModule<PuxaEngineModule>('PuxaEngine');
