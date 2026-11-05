import { NativeModule, registerWebModule } from 'expo';

import type { ClipResult, PuxaEngineEvents, VideoInfo } from './PuxaEngine.types';

/**
 * Prévia web, só para ver a interface no navegador: não fala com o YouTube nem baixa nada.
 * Devolve um vídeo de exemplo e simula o progresso do preparo.
 */
class PuxaEnginePreview extends NativeModule<PuxaEngineEvents> {
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  async getInfo(text: string): Promise<VideoInfo> {
    await new Promise((r) => setTimeout(r, 700));
    if (!/youtu\.?be/.test(text)) {
      throw Object.assign(new Error('Esse link não é do YouTube. Cole um link de vídeo, Shorts ou YouTube Music.'), { code: 'invalid_url' });
    }
    return {
      id: 'preview0000',
      title: 'Ensaio aberto: violão e voz, gravado ao vivo no quintal',
      channel: 'Estúdio Quintal',
      duration: 219,
      viewCount: 48_300,
      uploadDate: '2026-09-12',
      thumbnail: '/preview-thumb.jpg',
      options: {
        audio: [
          { id: 'a:140', label: '128 kbps', note: 'Melhor', size: 3_500_000 },
          { id: 'a:139', label: '48 kbps', note: 'Compacto', size: 1_310_000 },
        ],
        video: [
          { id: 'v:137', label: '1080p', note: 'Full HD', size: 48_000_000 },
          { id: 'v:136', label: '720p', note: 'HD', size: 27_000_000 },
          { id: 'v:135', label: '480p', note: 'SD', size: 14_000_000 },
          { id: 'v:134', label: '360p', note: 'Baixa', size: 9_100_000 },
        ],
      },
    };
  }

  async startDownload(jobId: string, _videoId: string, optionId: string): Promise<void> {
    const total = optionId.startsWith('a:') ? 3_500_000 : 27_000_000;
    let downloaded = 0;
    const timer = setInterval(() => {
      downloaded = Math.min(total, downloaded + total / 14);
      const stage = downloaded >= total ? 'processing' : 'downloading';
      this.emit('onProgress', { jobId, stage, downloaded, total, speed: 1_450_000, eta: (total - downloaded) / 1_450_000 });
      if (downloaded >= total) {
        clearInterval(timer);
        setTimeout(() => {
          const audio = optionId.startsWith('a:');
          this.emit('onDone', {
            jobId,
            path: '/preview/media',
            filename: audio ? 'Ensaio aberto - violão e voz.m4a' : 'Ensaio aberto - violão e voz (720p).mp4',
            size: total,
            duration: 219,
            mime: audio ? 'audio/mp4' : 'video/mp4',
          });
        }, 900);
      }
    }, 300);
    this.timers.set(jobId, timer);
  }

  cancel(jobId: string) {
    clearInterval(this.timers.get(jobId));
    this.timers.delete(jobId);
  }

  async waveform(_path: string, buckets: number): Promise<number[]> {
    await new Promise((r) => setTimeout(r, 300));
    return Array.from({ length: buckets }, (_, i) => {
      const t = i / buckets;
      const phrase = 0.55 + 0.45 * Math.sin(t * 31) * Math.sin(t * 7.3);
      return Math.max(0.06, Math.abs(phrase) * (0.7 + 0.3 * Math.sin(i * 1.7)));
    });
  }

  async trim(_path: string, _start: number, _end: number, filename: string): Promise<ClipResult> {
    await new Promise((r) => setTimeout(r, 400));
    return { path: '/preview/clip', size: 480_000, filename, mime: 'audio/mp4' };
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
}

export default registerWebModule(PuxaEnginePreview, 'PuxaEngine');
