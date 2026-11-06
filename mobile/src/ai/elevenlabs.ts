import { File, UploadType } from 'expo-file-system';

import { toUri } from '../editor/media';
import { elevenKey } from './key';
import type { ScribeWord } from './words';

export type { ScribeWord };

/**
 * ElevenLabs: transcrição (Scribe) e voz (texto para fala) com a chave da própria pessoa. Tudo
 * vai direto do celular para a API da ElevenLabs; o Puxa não tem servidor no meio.
 */

const API = 'https://api.elevenlabs.io/v1';

/** Duas vozes da biblioteca padrão (existem em qualquer conta) que falam bem português no modelo multilíngue. */
export const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', detail: 'feminina' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', detail: 'masculina' },
] as const;

export type VoiceId = (typeof VOICES)[number]['id'];

export const TTS_MODEL = 'eleven_multilingual_v2';
export const STT_MODEL = 'scribe_v2';

export class ElevenError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function requireKey(k?: string | null): string {
  const key = k ?? elevenKey();
  if (!key) throw new ElevenError('no_key', 'Coloque a chave da ElevenLabs nos Ajustes para usar a transcrição precisa e a dublagem.');
  return key;
}

/** Erro da API → frase que a pessoa entende. */
export function explain(status: number, body: string): ElevenError {
  let detail: { status?: string; message?: string } | string | undefined;
  try {
    detail = (JSON.parse(body) as { detail?: { status?: string; message?: string } | string }).detail;
  } catch {
    detail = undefined;
  }
  const code = typeof detail === 'object' ? (detail?.status ?? '') : '';
  const msg = typeof detail === 'object' ? (detail?.message ?? '') : (detail ?? '');
  if (code === 'quota_exceeded' || /quota|credits/i.test(msg)) return new ElevenError('quota', 'Os créditos da sua conta da ElevenLabs acabaram neste mês.');
  if (code === 'invalid_api_key' || status === 401) return new ElevenError('bad_key', 'A ElevenLabs não aceitou a chave. Confira a chave nos Ajustes.');
  if (code === 'detected_unusual_activity') return new ElevenError('blocked', 'A ElevenLabs bloqueou o uso gratuito desta conta ou rede. Tente outra rede ou um plano pago.');
  if (code === 'missing_permissions') return new ElevenError('permission', 'A chave não tem permissão para isso. Crie uma chave com acesso a texto para fala e transcrição.');
  if (status === 429) return new ElevenError('busy', 'A ElevenLabs está cheia agora. Tente de novo em instantes.');
  return new ElevenError('api', msg || `A ElevenLabs respondeu com erro ${status}.`);
}

/** Confere a chave e quantos créditos sobram no mês. */
export async function account(k?: string): Promise<{ tier: string; used: number; limit: number }> {
  const key = requireKey(k);
  let res: Response;
  try {
    res = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': key } });
  } catch {
    throw new ElevenError('network', 'Sem resposta da ElevenLabs. Confira a internet.');
  }
  const body = await res.text();
  if (!res.ok) throw explain(res.status, body);
  const j = JSON.parse(body) as { tier?: string; character_count?: number; character_limit?: number };
  return { tier: j.tier ?? '', used: j.character_count ?? 0, limit: j.character_limit ?? 0 };
}

export type ScribeResult = { language: string; words: ScribeWord[] };

/** Transcreve um áudio (MP3 curto feito pelo app). [language]: código ISO ou "auto". */
export async function scribe(path: string, opts: { language: string; diarize: boolean; onProgress?: (f: number) => void }): Promise<ScribeResult> {
  const key = requireKey();
  const params: Record<string, string> = {
    model_id: STT_MODEL,
    timestamps_granularity: 'word',
    tag_audio_events: 'false',
    diarize: opts.diarize ? 'true' : 'false',
  };
  if (opts.language && opts.language !== 'auto') params.language_code = opts.language;
  let r: { status: number; body: string };
  try {
    r = await new File(toUri(path)).upload(`${API}/speech-to-text`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'audio/mpeg',
      headers: { 'xi-api-key': key },
      parameters: params,
      onProgress: (p) => opts.onProgress?.(p.totalBytes > 0 ? p.bytesSent / p.totalBytes : 0),
    });
  } catch {
    throw new ElevenError('network', 'O envio do áudio para a ElevenLabs falhou. Confira a internet.');
  }
  if (r.status === 422 && /model/i.test(r.body) && params.model_id !== 'scribe_v1') {
    // Conta sem o modelo novo: o anterior também transcreve bem
    return scribeWith(path, { ...params, model_id: 'scribe_v1' }, key);
  }
  if (r.status < 200 || r.status >= 300) throw explain(r.status, r.body);
  return parseScribe(r.body);
}

async function scribeWith(path: string, params: Record<string, string>, key: string): Promise<ScribeResult> {
  const r = await new File(toUri(path)).upload(`${API}/speech-to-text`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'audio/mpeg',
    headers: { 'xi-api-key': key },
    parameters: params,
  });
  if (r.status < 200 || r.status >= 300) throw explain(r.status, r.body);
  return parseScribe(r.body);
}

export function parseScribe(body: string): ScribeResult {
  const j = JSON.parse(body) as { language_code?: string; words?: { text?: string; start?: number; end?: number; type?: string; speaker_id?: string }[] };
  return {
    language: j.language_code ?? 'auto',
    words: (j.words ?? []).map((w) => ({
      text: w.text ?? '',
      start: w.start ?? 0,
      end: w.end ?? w.start ?? 0,
      type: w.type === 'spacing' || w.type === 'audio_event' ? w.type : 'word',
      speaker: w.speaker_id,
    })),
  };
}

/**
 * Fala [text] com a voz e grava o MP3 em [dest]. Devolve a duração e quando a fala termina de
 * fato (sem o silêncio do fim), pelo alinhamento que a API manda junto.
 */
export async function speak(text: string, voice: string, dest: string, ctx: { previous?: string; next?: string }): Promise<{ path: string; duration: number; speechEnd: number }> {
  const key = requireKey();
  let res: Response;
  try {
    res = await fetch(`${API}/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        previous_text: ctx.previous || undefined,
        next_text: ctx.next || undefined,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      }),
    });
  } catch {
    throw new ElevenError('network', 'Sem resposta da ElevenLabs. Confira a internet.');
  }
  const body = await res.text();
  if (!res.ok) throw explain(res.status, body);
  const j = JSON.parse(body) as { audio_base64?: string; alignment?: { character_end_times_seconds?: number[] } | null };
  if (!j.audio_base64) throw new ElevenError('api', 'A ElevenLabs não mandou o áudio.');
  await new File(toUri(dest)).write(j.audio_base64, { encoding: 'base64' });
  const ends = j.alignment?.character_end_times_seconds ?? [];
  const end = ends.length ? ends[ends.length - 1] : 0;
  return { path: dest, duration: end, speechEnd: end };
}

const previews = new Map<string, string>();

/** Link da amostra de uma voz (para ouvir antes de escolher). */
export async function voicePreview(voice: string): Promise<string | null> {
  const hit = previews.get(voice);
  if (hit) return hit;
  const key = elevenKey();
  if (!key) return null;
  try {
    const res = await fetch(`${API}/voices/${voice}`, { headers: { 'xi-api-key': key } });
    if (!res.ok) return null;
    const url = ((await res.json()) as { preview_url?: string }).preview_url ?? null;
    if (url) previews.set(voice, url);
    return url;
  } catch {
    return null;
  }
}
