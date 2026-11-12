import { NativeModule, registerWebModule } from 'expo';

import type { ClipResult, Dirs, Probe, PuxaEngineEvents, SearchResult, StickerFolder, StickerItem, StorageKind, StorageUsage, VideoInfo } from './PuxaEngine.types';

/**
 * Prévia web, só para ver a interface no navegador: não fala com o YouTube, não baixa nem
 * monta vídeo de verdade. Usa as mídias de exemplo em public/preview e simula o progresso.
 */
const MEDIA: Record<string, Probe> = {
  sunset: { kind: 'video', duration: 10, width: 1280, height: 720, hasAudio: true, hasVideo: true, rotation: 0 },
  sea: { kind: 'video', duration: 8, width: 720, height: 1280, hasAudio: true, hasVideo: true, rotation: 0 },
  song: { kind: 'audio', duration: 20, width: 0, height: 0, hasAudio: true, hasVideo: false, rotation: 0 },
};

const nameOf = (path: string) => (path.split('/').pop() ?? '').replace(/\.[^.]+$/, '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TTML = `<tt><body><div>
<p begin="00:00:00.400" end="00:00:02.600">Look at this beautiful place</p>
<p begin="00:00:02.900" end="00:00:05.200">We arrived right at sunset</p>
<p begin="00:00:05.500" end="00:00:07.800">Nobody believed me when I told them</p>
<p begin="00:00:08.000" end="00:00:09.800">Stay until the end</p>
</div></body></tt>`;

const PT: Record<string, string> = {
  'Look at this beautiful place': 'Olha só que lugar bonito',
  'We arrived right at sunset': 'A gente chegou bem na hora do pôr do sol',
  'Nobody believed me when I told them': 'Ninguém acreditou quando eu contei',
  'Stay until the end': 'Fica até o final',
};

type PreviewFolder = { id: string; name: string; created: number; stickers: StickerItem[]; added: Record<string, boolean> };

class PuxaEnginePreview extends NativeModule<PuxaEngineEvents> {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private folders: PreviewFolder[] = [{ id: 'puxa', name: 'Puxa', created: 0, stickers: [], added: {} }];
  private usage: StorageUsage = { downloads: 38_400_000, temp: 12_900_000, playlist: 164_000_000, stickers: 0, models: 59_700_000 };

  private view(f: PreviewFolder): StickerFolder {
    const pack = (animated: boolean) => {
      const id = animated ? `${f.id}_animadas` : f.id;
      const count = f.stickers.filter((s) => s.animated === animated).length;
      return { id, name: animated ? `${f.name} · animadas` : f.name, animated, count, whatsapp: count ? !!f.added[id] : null, business: null };
    };
    return { id: f.id, name: f.name, created: f.created, packs: [pack(false), pack(true)], stickers: [...f.stickers].reverse() };
  }

  private find(id: string): PreviewFolder {
    const f = this.folders.find((x) => x.id === id);
    if (!f) throw Object.assign(new Error('Essa pasta não existe mais.'), { code: 'sticker_folder' });
    return f;
  }

  async stickerFolders(): Promise<StickerFolder[]> {
    await sleep(120);
    return this.folders.map((f) => this.view(f));
  }

  async stickerFolderCreate(name: string): Promise<StickerFolder> {
    const clean = name.trim();
    if (!clean) throw Object.assign(new Error('Dê um nome para a pasta.'), { code: 'sticker_name' });
    if (this.folders.some((f) => f.name.toLowerCase() === clean.toLowerCase())) throw Object.assign(new Error('Já existe uma pasta com esse nome.'), { code: 'sticker_name' });
    const f: PreviewFolder = { id: `p${Date.now().toString(36)}`, name: clean, created: Date.now(), stickers: [], added: {} };
    this.folders.push(f);
    return this.view(f);
  }

  async stickerFolderRename(id: string, name: string): Promise<StickerFolder> {
    const f = this.find(id);
    f.name = name.trim() || f.name;
    return this.view(f);
  }

  async stickerFolderDelete(id: string): Promise<boolean> {
    this.folders = this.folders.filter((f) => f.id !== id);
    return true;
  }

  async stickerAdd(folderId: string, animated: boolean, webp: string, poster: string, emojis: string[], label: string): Promise<StickerFolder> {
    await sleep(200);
    const f = this.folders.find((x) => x.id === folderId) ?? this.folders[0];
    const file = `s_${Date.now().toString(36)}.webp`;
    const size = animated ? 312_000 : 64_000;
    f.stickers.push({ file, path: webp, poster, size, emojis, label, created: Date.now(), animated });
    this.usage.stickers += size;
    return this.view(f);
  }

  async stickerRemove(folderId: string, file: string): Promise<StickerFolder> {
    const f = this.find(folderId);
    f.stickers = f.stickers.filter((s) => s.file !== file);
    return this.view(f);
  }

  async stickerMove(fromId: string, file: string, toId: string): Promise<StickerFolder[]> {
    const a = this.find(fromId);
    const b = this.find(toId);
    const s = a.stickers.find((x) => x.file === file);
    if (s && a !== b) {
      a.stickers = a.stickers.filter((x) => x.file !== file);
      b.stickers.push(s);
    }
    return [this.view(a), this.view(b)];
  }

  async stickerToWhatsApp(packId: string): Promise<{ added: boolean; error: string | null }> {
    await sleep(500);
    const f = this.folders.find((x) => packId === x.id || packId === `${x.id}_animadas`);
    if (f) f.added[packId] = true;
    return { added: true, error: null };
  }

  webCookies(): string | null {
    return null;
  }

  async clearWebCookies(): Promise<boolean> {
    return true;
  }

  flushWebCookies() {}

  async storageUsage(): Promise<StorageUsage> {
    await sleep(250);
    return { ...this.usage };
  }

  async clearStorage(kind: StorageKind): Promise<number> {
    await sleep(400);
    const freed = this.usage[kind];
    this.usage[kind] = 0;
    if (kind === 'stickers') this.folders = [{ id: 'puxa', name: 'Puxa', created: 0, stickers: [], added: {} }];
    return freed;
  }

  headphones(): boolean {
    return false;
  }

  async getInfo(text: string): Promise<VideoInfo> {
    await sleep(600);
    if (!/youtu\.?be|^[\w-]{11}$/.test(text)) {
      throw Object.assign(new Error('Esse link não é do YouTube. Cole um link de vídeo, Shorts ou YouTube Music.'), { code: 'invalid_url' });
    }
    return {
      id: 'preview0000',
      title: 'Ensaio aberto: violão e voz, gravado ao vivo no quintal',
      channel: 'Estúdio Quintal',
      duration: 10,
      viewCount: 48_300,
      uploadDate: '2026-09-12',
      thumbnail: '/preview/thumbs/sunset-5.jpg',
      options: {
        audio: [
          { id: 'm:140', label: 'MP3 192 kbps', note: 'Toca em tudo', size: 240_000 },
          { id: 'a:140', label: 'M4A 128 kbps', note: 'Original', size: 160_000 },
          { id: 'a:139', label: 'M4A 48 kbps', note: 'Compacto', size: 60_000 },
        ],
        video: [
          { id: 'v:137', label: '1080p', note: 'Full HD', size: 9_800_000 },
          { id: 'v:136', label: '720p', note: 'HD', size: 5_400_000 },
          { id: 'v:135', label: '480p', note: 'SD', size: 2_800_000 },
          { id: 'v:134', label: '360p', note: 'Baixa', size: 1_800_000 },
        ],
      },
      chapters: [
        { start: 0, title: 'Abertura' },
        { start: 3, title: 'O mar' },
        { start: 6.5, title: 'Pôr do sol' },
      ],
      captions: [{ index: 0, lang: 'en', name: 'English', auto: false }],
    };
  }

  async startDownload(jobId: string, _videoId: string, optionId: string): Promise<void> {
    const audio = optionId.startsWith('a:') || optionId.startsWith('m:');
    const total = audio ? 3_500_000 : 5_400_000;
    let downloaded = 0;
    const timer = setInterval(() => {
      downloaded = Math.min(total, downloaded + total / 10);
      const stage = downloaded >= total ? 'processing' : 'downloading';
      this.emit('onProgress', { jobId, stage, downloaded, total, speed: 1_450_000, eta: (total - downloaded) / 1_450_000 });
      if (downloaded >= total) {
        clearInterval(timer);
        setTimeout(() => {
          const mp3 = optionId.startsWith('m:');
          this.emit('onDone', {
            jobId,
            path: audio ? '/preview/song.m4a' : '/preview/sunset.mp4',
            filename: audio ? `Ensaio aberto - violão e voz.${mp3 ? 'mp3' : 'm4a'}` : 'Ensaio aberto - violão e voz (720p).mp4',
            size: total,
            duration: audio ? 20 : 10,
            mime: audio ? (mp3 ? 'audio/mpeg' : 'audio/mp4') : 'video/mp4',
          });
        }, 600);
      }
    }, 250);
    this.timers.set(jobId, timer);
  }

  async startUrlDownload(jobId: string, url: string, _headers: Record<string, string>, asked: 'video' | 'audio' | 'm4a' | 'image', title: string): Promise<void> {
    const kind = asked === 'm4a' ? 'audio' : asked;
    const total = kind === 'image' ? 420_000 : 3_900_000;
    let downloaded = 0;
    const timer = setInterval(() => {
      downloaded = Math.min(total, downloaded + total / 8);
      const stage = downloaded >= total && kind === 'audio' ? 'processing' : 'downloading';
      this.emit('onProgress', { jobId, stage, downloaded, total, speed: 1_800_000, eta: (total - downloaded) / 1_800_000 });
      if (downloaded >= total) {
        clearInterval(timer);
        setTimeout(() => {
          const path = kind === 'audio' ? '/preview/song.m4a' : url.split('#')[0];
          const ext = kind === 'image' ? 'jpg' : kind === 'audio' ? 'mp3' : 'mp4';
          this.emit('onDone', {
            jobId,
            path,
            filename: `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.${ext}`,
            size: total,
            duration: kind === 'image' ? 0 : path.includes('sea') ? 8 : 10,
            mime: kind === 'image' ? 'image/jpeg' : kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
          });
        }, 400);
      }
    }, 220);
    this.timers.set(jobId, timer);
  }

  cancel(jobId: string) {
    clearInterval(this.timers.get(jobId));
    this.timers.delete(jobId);
  }

  async waveform(_path: string, buckets: number): Promise<number[]> {
    await sleep(200);
    return Array.from({ length: buckets }, (_, i) => {
      const t = i / buckets;
      return Math.max(0.06, Math.abs(0.55 + 0.45 * Math.sin(t * 31) * Math.sin(t * 7.3)) * (0.7 + 0.3 * Math.sin(i * 1.7)));
    });
  }

  async trim(_path: string, _start: number, _end: number, filename: string): Promise<ClipResult> {
    await sleep(300);
    return { path: '/preview/song.m4a', size: 480_000, filename, mime: 'audio/mp4' };
  }

  async saveToDownloads(): Promise<string> {
    return 'Download/Puxa';
  }

  async share(): Promise<boolean> {
    return true;
  }

  takeSharedText(): string | null {
    return null;
  }

  dirs(): Dirs {
    return { cache: '/preview/cache', files: '/preview/files', media: '/preview/media' };
  }

  async probe(path: string): Promise<Probe> {
    const m = MEDIA[nameOf(path)];
    if (m) return m;
    if (/\.(jpe?g|png|webp)$/i.test(path)) return { kind: 'image', duration: 0, width: 1280, height: 720, hasAudio: false, hasVideo: false, rotation: 0 };
    return MEDIA.sunset;
  }

  async thumbnails(path: string, times: number[]): Promise<string[]> {
    const name = nameOf(path);
    const count = name === 'sea' ? 8 : 10;
    if (/\.(jpe?g|png|webp)$/i.test(path)) return times.map(() => path);
    return times.map((t) => `/preview/thumbs/${name === 'sea' ? 'sea' : 'sunset'}-${Math.min(count, Math.max(1, Math.floor(t) + 1))}.jpg`);
  }

  async renderOverlays(_dir: string, specsJson: string): Promise<{ path: string; width: number; height: number }[]> {
    return (JSON.parse(specsJson) as unknown[]).map(() => ({ path: '/preview/none.png', width: 100, height: 40 }));
  }

  async ffmpeg(jobId: string, _args: string[], totalSeconds: number): Promise<boolean> {
    const steps = Math.max(8, Math.round(totalSeconds * 2));
    for (let i = 1; i <= steps; i++) {
      await sleep(120);
      this.emit('onRenderProgress', { jobId, progress: i / steps, speed: 2.4 });
    }
    return true;
  }

  cancelRender() {}

  async search(query: string): Promise<SearchResult[]> {
    await sleep(500);
    const genre = query.split(' ')[0];
    return [
      { id: 'm1', title: `Golden Hour — ${genre} sem direitos autorais`, channel: 'Audio Livre', duration: 154, thumbnail: '/preview/thumbs/sunset-7.jpg' },
      { id: 'm2', title: `Maré Calma (${genre})`, channel: 'Trilhas para Vídeo', duration: 201, thumbnail: '/preview/thumbs/sea-3.jpg' },
      { id: 'm3', title: 'Café da Manhã — música de fundo para vlog', channel: 'NoCopyright BR', duration: 128, thumbnail: '/preview/thumbs/sunset-2.jpg' },
      { id: 'm4', title: 'Caminho de Casa', channel: 'Audio Livre', duration: 176, thumbnail: '/preview/thumbs/sea-6.jpg' },
      { id: 'm5', title: 'Neon Avenue', channel: 'Free Beats', duration: 143, thumbnail: '/preview/thumbs/sunset-9.jpg' },
    ];
  }

  async captionText(_videoId: string, _index: number, translateTo: string | null): Promise<string> {
    await sleep(400);
    // Pedido em português: a tradução automática do YouTube
    return translateTo === 'pt' ? Object.entries(PT).reduce((x, [en, pt]) => x.replace(`>${en}<`, `>${pt}<`), TTML) : TTML;
  }

  async translate(lines: string[]): Promise<string[]> {
    await sleep(500);
    return lines.map((l) => PT[l] ?? l);
  }

  async fetchToFile(jobId: string, _url: string, dest: string): Promise<string> {
    for (let i = 1; i <= 10; i++) {
      await sleep(100);
      this.emit('onFetchProgress', { jobId, downloaded: i * 6_000_000, total: 60_000_000 });
    }
    return dest;
  }

  cancelFetch() {}
}

export default registerWebModule(PuxaEnginePreview, 'PuxaEngine');
