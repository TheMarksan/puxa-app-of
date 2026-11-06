import { NativeModule, requireNativeModule } from 'expo';

import type { ClipResult, Dirs, Probe, PuxaEngineEvents, SearchResult, StickerFolder, StorageKind, StorageUsage, VideoInfo } from './PuxaEngine.types';

declare class PuxaEngineModule extends NativeModule<PuxaEngineEvents> {
  /** Lê o link (ou um texto com o link dentro) e devolve título, capa e opções de qualidade. */
  getInfo(text: string): Promise<VideoInfo>;
  /** Começa o preparo; o andamento chega pelos eventos onProgress, onDone e onError. */
  /** Com [persistent], o arquivo fica na pasta de mídia dos projetos (não é limpo depois de 24 h). */
  startDownload(jobId: string, videoId: string, optionId: string, persistent: boolean): Promise<void>;
  /** Mídia de link direto (Instagram, X): mesmo andamento por eventos. [kind] audio converte para MP3. */
  startUrlDownload(jobId: string, url: string, headers: Record<string, string>, kind: 'video' | 'audio' | 'image', title: string, persistent: boolean): Promise<void>;
  cancel(jobId: string): void;
  waveform(path: string, buckets: number): Promise<number[]>;
  trim(path: string, start: number, end: number, filename: string): Promise<ClipResult>;
  /** Copia para Download/Puxa e devolve a pasta onde ficou. */
  saveToDownloads(path: string, filename: string, mime: string): Promise<string>;
  /** Abre o WhatsApp direto (ou o menu de compartilhar). Resolve true se foi direto para o WhatsApp. */
  share(path: string, mime: string, whatsapp: boolean, filename: string): Promise<boolean>;
  /** Texto recebido pelo menu de compartilhar do Android ao abrir o app. */
  takeSharedText(): string | null;

  // Modo Criar
  dirs(): Dirs;
  probe(path: string): Promise<Probe>;
  thumbnails(path: string, times: number[], height: number): Promise<string[]>;
  /** Desenha as camadas (JSON de OverlaySpec[]) em PNGs dentro de [dir]. */
  renderOverlays(dir: string, specsJson: string): Promise<{ path: string; width: number; height: number }[]>;
  /** Roda o FFmpeg; o progresso chega por onRenderProgress. Rejeita com código "cancelled" ou "render_failed". */
  ffmpeg(jobId: string, args: string[], totalSeconds: number): Promise<boolean>;
  cancelRender(jobId: string): void;
  search(query: string): Promise<SearchResult[]>;
  /** TTML de uma faixa de legenda; com [translateTo] ("pt"), pede a tradução do YouTube. */
  captionText(videoId: string, index: number, translateTo: string | null): Promise<string>;
  /** Tradução no aparelho (ML Kit), linha a linha. */
  translate(lines: string[], from: string, to: string): Promise<string[]>;
  fetchToFile(jobId: string, url: string, dest: string): Promise<string>;
  cancelFetch(jobId: string): void;

  // Figurinhas (em pastas)
  stickerFolders(): Promise<StickerFolder[]>;
  stickerFolderCreate(name: string): Promise<StickerFolder>;
  stickerFolderRename(id: string, name: string): Promise<StickerFolder>;
  stickerFolderDelete(id: string): Promise<boolean>;
  /** Guarda a figurinha (WebP) na pasta; [poster] é o primeiro quadro em PNG (ícone e lista). */
  stickerAdd(folderId: string, animated: boolean, webp: string, poster: string, emojis: string[], label: string): Promise<StickerFolder>;
  stickerRemove(folderId: string, file: string): Promise<StickerFolder>;
  /** Leva para outra pasta; devolve as duas pastas atualizadas. */
  stickerMove(fromId: string, file: string, toId: string): Promise<StickerFolder[]>;
  /** Abre o "adicionar pacote" do WhatsApp para um pacote da pasta. [error] vem quando o WhatsApp recusou. */
  stickerToWhatsApp(packId: string): Promise<{ added: boolean; error: string | null }>;

  // Ajustes
  storageUsage(): Promise<StorageUsage>;
  /** Apaga um tipo de arquivo e devolve quantos bytes liberou. */
  clearStorage(kind: StorageKind): Promise<number>;
  /** Fone conectado (com fio, USB ou Bluetooth). */
  headphones(): boolean;

  // Contas (login do Instagram no WebView)
  webCookies(url: string): string | null;
  clearWebCookies(): Promise<boolean>;
  flushWebCookies(): void;
}

export default requireNativeModule<PuxaEngineModule>('PuxaEngine');
