import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';

import PuxaEngine from '../../modules/puxa-engine';
import { safeName } from '../format';
import { fontFiles } from './fonts';
import { dirs, toUri } from './media';
import { buildCommand, planOverlays, plannedBitrate, type Encoder } from './render';
import { newId } from './timeline';
import type { Project } from './types';

export type ExportStage = 'preparing' | 'rendering';

export type ExportResult = { path: string; size: number; duration: number; filename: string };

export class RenderError extends Error {
  details: string;
  constructor(message: string, details: string) {
    super(message);
    this.details = details;
  }
}

/**
 * Monta o vídeo do projeto no aparelho. Tenta o codificador de vídeo do hardware primeiro
 * (rápido); se o aparelho recusar, refaz com o codificador por software (openh264).
 */
export async function exportProject(
  p: Project,
  onProgress: (stage: ExportStage, fraction: number) => void,
  jobId = newId('r'),
  opts: { maxVideoBitrate?: number } = {},
): Promise<ExportResult> {
  onProgress('preparing', 0);
  const fonts = await fontFiles();
  const plan = planOverlays(p, fonts);
  if (plan.total < 0.2) throw new RenderError('O projeto está vazio. Adicione pelo menos um vídeo ou foto.', '');
  if (Platform.OS === 'web') return previewExport(plan.total, jobId, onProgress);
  const folder = new Directory(toUri(dirs().cache), 'puxa', `render-${jobId}`);
  folder.create({ intermediates: true, idempotent: true });
  const dir = decodeURI(folder.uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
  const results = plan.specs.length ? await PuxaEngine.renderOverlays(dir, JSON.stringify(plan.specs)) : [];
  onProgress('preparing', 1);

  const filename = `${safeName(p.title || 'Puxa')}.mp4`;
  const out = `${dir}/${filename}`;
  const captionListPath = `${dir}/legendas.ffconcat`;
  let lastError = '';
  for (const encoder of ['hw', 'sw'] as Encoder[]) {
    // Com "caber no WhatsApp", o bitrate sai do tamanho-alvo; sem, vale o padrão da resolução
    const videoBitrate = plannedBitrate(plan.width, plan.height, plan.total, !!p.fitWhatsApp, opts.maxVideoBitrate);
    const cmd = buildCommand(p, plan, results, { out, encoder, captionListPath, videoBitrate });
    if (cmd.captionList) new File(toUri(captionListPath)).write(cmd.captionList);
    const sub = PuxaEngine.addListener('onRenderProgress', (e) => e.jobId === jobId && onProgress('rendering', e.progress));
    try {
      await PuxaEngine.ffmpeg(jobId, cmd.args, cmd.total);
      sub.remove();
      const info = new File(toUri(out)).info();
      return { path: out, size: info.size ?? 0, duration: cmd.total, filename };
    } catch (e) {
      sub.remove();
      const err = e as Error & { code?: string };
      if (err.code === 'cancelled' || /cancel/i.test(err.message)) throw Object.assign(new Error('Cancelado'), { code: 'cancelled' });
      lastError = err.message;
      onProgress('rendering', 0);
    }
  }
  const [message, details = ''] = lastError.split('\n---\n');
  throw new RenderError(message || 'Não deu para montar o vídeo.', details);
}

/** Prévia web: o motor de vídeo só existe no celular; aqui o progresso é simulado. */
async function previewExport(total: number, jobId: string, onProgress: (stage: ExportStage, fraction: number) => void): Promise<ExportResult> {
  const sub = PuxaEngine.addListener('onRenderProgress', (e) => e.jobId === jobId && onProgress('rendering', e.progress));
  try {
    await PuxaEngine.ffmpeg(jobId, [], total);
  } finally {
    sub.remove();
  }
  return { path: '/preview/sunset.mp4', size: 6_400_000, duration: total, filename: 'Projeto.mp4' };
}

export function cancelExport(jobId: string) {
  PuxaEngine.cancelRender(jobId);
}
