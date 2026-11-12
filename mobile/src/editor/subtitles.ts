import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';

import PuxaEngine, { type CaptionTrack } from '../../modules/puxa-engine';
import { scribe } from '../ai/elevenlabs';
import { fromWords, iso1 } from '../ai/words';
import { chunk, fromWhisper, parseTTML } from './captions';
import { dirs, toUri } from './media';
import { newId } from './timeline';
import type { Cue } from './types';

/**
 * De onde vêm as legendas:
 * - do YouTube (faixa original, ou tradução: primeiro a do YouTube; se ele limitar, o tradutor
 *   do aparelho);
 * - da transcrição do áudio, quando o vídeo não tem legenda: no próprio celular (Whisper) ou,
 *   com a chave da pessoa, na ElevenLabs (Scribe), bem mais precisa em outros idiomas.
 */

export const isPortuguese = (lang: string) => /^pt\b|^pt-/i.test(lang);

export type CaptionProgress = (label: string, fraction: number | null) => void;

/** Melhor faixa para cada pedido: manual antes de automática; pt antes de traduzir. */
export function chooseTrack(tracks: CaptionTrack[], wantPortuguese: boolean): { track: CaptionTrack; translate: boolean } | null {
  if (!tracks.length) return null;
  const manual = (t: CaptionTrack) => (t.auto ? 1 : 0);
  if (wantPortuguese) {
    const pt = [...tracks].filter((t) => isPortuguese(t.lang)).sort((a, b) => manual(a) - manual(b))[0];
    if (pt) return { track: pt, translate: false };
  }
  const original = [...tracks].sort((a, b) => manual(a) - manual(b))[0];
  return { track: original, translate: wantPortuguese };
}

export async function youtubeCues(videoId: string, track: CaptionTrack, translate: boolean, progress?: CaptionProgress): Promise<{ cues: Cue[]; how: string }> {
  if (translate) {
    progress?.('Pedindo a tradução ao YouTube…', null);
    try {
      const xml = await PuxaEngine.captionText(videoId, track.index, 'pt');
      const cues = parseTTML(xml);
      if (cues.length) return { cues: chunk(cues), how: 'Tradução do YouTube' };
    } catch {
      // O YouTube limita muito a tradução: cai para o tradutor do aparelho
    }
  }
  progress?.('Baixando a legenda…', null);
  const cues = parseTTML(await PuxaEngine.captionText(videoId, track.index, null));
  if (!cues.length) throw new Error('A legenda deste vídeo veio vazia.');
  if (!translate) return { cues: chunk(cues), how: track.auto ? `Automática (${track.name})` : track.name };
  progress?.('Traduzindo no aparelho (na primeira vez baixa o tradutor, uns 30 MB)…', null);
  const lines = await PuxaEngine.translate(cues.map((c) => c.text.replace(/\n/g, ' ')), track.lang, 'pt');
  return { cues: chunk(cues.map((c, i) => ({ ...c, text: lines[i] ?? c.text }))), how: `Traduzida de ${track.name} no aparelho` };
}

// ---------- Transcrição (Whisper, no aparelho) ----------

export type WhisperModel = 'base' | 'small' | 'turbo';

export const MODELS: Record<WhisperModel, { label: string; detail: string; mb: number; file: string; url: string; size: number; beam: number }> = {
  base: {
    label: 'Rápida',
    detail: 'Boa para fala clara · 60 MB',
    mb: 60,
    file: 'ggml-base-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    size: 59_707_625,
    beam: 5,
  },
  small: {
    label: 'Precisa',
    detail: 'Melhor com sotaque e outros idiomas · 190 MB',
    mb: 190,
    file: 'ggml-small-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    size: 190_085_487,
    beam: 5,
  },
  turbo: {
    label: 'Máxima',
    detail: 'A mais precisa no celular, mais lenta · 550 MB',
    mb: 550,
    file: 'ggml-large-v3-turbo-q5_0.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    size: 573_600_000,
    beam: 3,
  },
};

/** Idiomas para escolher o falado (o automático erra mais em trechos curtos e com música). */
export const SPOKEN: { code: string; label: string }[] = [
  { code: 'auto', label: 'Automático' },
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'Inglês' },
  { code: 'es', label: 'Espanhol' },
  { code: 'fr', label: 'Francês' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Alemão' },
  { code: 'ja', label: 'Japonês' },
  { code: 'ko', label: 'Coreano' },
  { code: 'zh', label: 'Chinês' },
  { code: 'ru', label: 'Russo' },
  { code: 'ar', label: 'Árabe' },
  { code: 'hi', label: 'Hindi' },
  { code: 'tr', label: 'Turco' },
];

/** Frase de abertura que puxa a pontuação e o idioma certos no Whisper. */
const PROMPTS: Record<string, string> = {
  pt: 'Olá! Tudo bem? Hoje a gente vai conversar sobre isso.',
  en: 'Hello! How are you? Today we are going to talk about this.',
  es: '¡Hola! ¿Qué tal? Hoy vamos a hablar de esto.',
  fr: "Bonjour ! Comment ça va ? Aujourd'hui, on va parler de ça.",
  it: 'Ciao! Come stai? Oggi parliamo di questo.',
  de: 'Hallo! Wie geht es dir? Heute sprechen wir darüber.',
};

export type Engine = 'device' | 'elevenlabs';
export { iso1 };

function modelFile(m: WhisperModel): File {
  const d = new Directory(toUri(dirs().files), 'whisper');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return new File(d, MODELS[m].file);
}

export function hasModel(m: WhisperModel): boolean {
  if (Platform.OS === 'web') return true;
  const f = modelFile(m);
  return f.exists && (f.info().size ?? 0) > MODELS[m].size * 0.9;
}

type WhisperSegment = { text: string; t0: number; t1: number };
type WhisperContext = {
  transcribe: (
    file: string,
    options: {
      language?: string;
      maxThreads?: number;
      beamSize?: number;
      bestOf?: number;
      temperature?: number;
      temperatureInc?: number;
      prompt?: string;
      onProgress?: (p: number) => void;
    },
  ) => { stop: () => Promise<void>; promise: Promise<{ result: string; language: string; segments: WhisperSegment[]; isAborted: boolean }> };
};
const contexts = new Map<WhisperModel, Promise<WhisperContext>>();

async function context(m: WhisperModel): Promise<WhisperContext> {
  const hit = contexts.get(m);
  if (hit) return hit;
  // Carregado só quando alguém transcreve (o módulo nativo do Whisper não sobe com o app).
  // whisper.rn não declara a raiz do pacote em "exports"; o subcaminho /index é o publicado.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initWhisper } = require('whisper.rn/index') as { initWhisper: (o: { filePath: string }) => Promise<WhisperContext> };
  const ctx = initWhisper({ filePath: modelFile(m).uri });
  contexts.set(m, ctx);
  ctx.catch(() => contexts.delete(m));
  return ctx;
}

export type TranscribeOptions = {
  path: string;
  /** Trecho do arquivo, em segundos (padrão: inteiro). */
  from?: number;
  to?: number;
  /** No aparelho (Whisper) ou na ElevenLabs (Scribe, com a chave da pessoa). */
  engine?: Engine;
  model: WhisperModel;
  /** "auto" ou código do idioma falado (pt, en, es…). */
  language: string;
  toPortuguese: boolean;
};

const cancelled = () => Object.assign(new Error('Cancelado'), { code: 'cancelled' });

/** Tira o áudio do trecho num arquivo pequeno: WAV 16 kHz para o Whisper, MP3 leve para enviar. */
export async function extractSpeech(o: { path: string; from?: number; to?: number }, kind: 'wav' | 'mp3'): Promise<string> {
  new Directory(toUri(dirs().cache), 'puxa').create({ intermediates: true, idempotent: true });
  const out = `${dirs().cache}/puxa/fala-${newId('a')}.${kind}`;
  const range = [...(o.from ? ['-ss', o.from.toFixed(3)] : []), ...(o.to ? ['-to', o.to.toFixed(3)] : [])];
  const codec = kind === 'wav' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'libmp3lame', '-b:a', '64k'];
  await PuxaEngine.ffmpeg(newId('fala'), ['-y', '-v', 'error', ...range, '-i', o.path, '-vn', '-ac', '1', '-ar', '16000', ...codec, out], 0);
  return out;
}

const forget = (path: string) => {
  try {
    new File(toUri(path)).delete();
  } catch {
    // ignorado
  }
};

export async function transcribe(o: TranscribeOptions, progress: CaptionProgress, signal: { cancelled: boolean }): Promise<{ cues: Cue[]; language: string }> {
  if (Platform.OS === 'web') return { cues: sampleCues(o.from ?? 0, o.to ?? 30), language: 'pt' };
  if (o.engine === 'elevenlabs') return transcribeCloud(o, progress, signal);
  const model = modelFile(o.model);
  if (!hasModel(o.model)) {
    const job = newId('w');
    const sub = PuxaEngine.addListener('onFetchProgress', (e) => e.jobId === job && progress('Baixando o modelo de transcrição (só na primeira vez)…', e.total > 0 ? e.downloaded / e.total : null));
    try {
      await PuxaEngine.fetchToFile(job, MODELS[o.model].url, decodeURI(model.uri.replace(/^file:\/\//, '')));
    } finally {
      sub.remove();
    }
  }
  if (signal.cancelled) throw cancelled();

  progress('Separando o áudio…', null);
  const wav = await extractSpeech(o, 'wav');
  if (signal.cancelled) throw cancelled();

  progress('Carregando o modelo…', null);
  const ctx = await context(o.model);
  progress('Transcrevendo no aparelho…', 0);
  const m = MODELS[o.model];
  const { stop, promise } = ctx.transcribe(toUri(wav), {
    language: o.language,
    maxThreads: 4,
    // Busca em feixe: mais lenta, mas erra bem menos palavras (principalmente fora do inglês)
    beamSize: m.beam,
    bestOf: m.beam,
    temperature: 0,
    temperatureInc: 0.2,
    prompt: PROMPTS[o.language],
    onProgress: (p: number) => progress('Transcrevendo no aparelho…', p / 100),
  });
  const timer = setInterval(() => signal.cancelled && stop(), 300);
  try {
    const res = await promise;
    if (res.isAborted || signal.cancelled) throw cancelled();
    const cues = chunk(fromWhisper(res.segments, 0));
    const lang = res.language || o.language;
    return { cues: await toPortuguese(cues, lang, o.toPortuguese, progress), language: lang };
  } finally {
    clearInterval(timer);
    forget(wav);
  }
}

async function toPortuguese(cues: Cue[], lang: string, want: boolean, progress: CaptionProgress): Promise<Cue[]> {
  if (!want || isPortuguese(lang) || lang === 'auto' || !cues.length) return cues;
  progress('Traduzindo no aparelho (na primeira vez baixa o tradutor, uns 30 MB)…', null);
  const lines = await PuxaEngine.translate(cues.map((c) => c.text.replace(/\n/g, ' ')), lang, 'pt');
  return chunk(cues.map((c, i) => ({ ...c, text: lines[i] ?? c.text })));
}

/** Transcrição na ElevenLabs: manda um MP3 leve do trecho e volta com as palavras e os tempos. */
async function transcribeCloud(o: TranscribeOptions, progress: CaptionProgress, signal: { cancelled: boolean }): Promise<{ cues: Cue[]; language: string }> {
  progress('Separando o áudio…', null);
  const mp3 = await extractSpeech(o, 'mp3');
  try {
    if (signal.cancelled) throw cancelled();
    progress('Enviando para a ElevenLabs…', 0);
    const r = await scribe(mp3, {
      language: o.language,
      diarize: false,
      onProgress: (f) => progress(f >= 0.99 ? 'Transcrevendo na ElevenLabs…' : 'Enviando para a ElevenLabs…', f >= 0.99 ? null : f),
    });
    if (signal.cancelled) throw cancelled();
    const lang = iso1(r.language || o.language);
    return { cues: await toPortuguese(fromWords(r.words), lang, o.toPortuguese, progress), language: lang };
  } finally {
    forget(mp3);
  }
}

/** Só para a prévia web, que não roda o Whisper. */
function sampleCues(from: number, to: number): Cue[] {
  const phrases = ['Olha só que lugar bonito', 'A gente chegou bem na hora do pôr do sol', 'Ninguém acreditou quando eu contei', 'Fica até o final que tem surpresa'];
  const out: Cue[] = [];
  let t = 0.4;
  let i = 0;
  while (t < to - from - 1) {
    out.push({ start: t, end: Math.min(to - from, t + 2.2), text: phrases[i++ % phrases.length] });
    t += 2.6;
  }
  return out;
}
