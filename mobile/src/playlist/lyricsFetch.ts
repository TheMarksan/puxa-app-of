import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { youtubeCues } from '../editor/subtitles';
import { resolveLink } from '../sources';
import { cleanTitle, fromRecord, pickBest, type LrclibRecord, type Lyrics } from './lyrics';
import type { Track } from './store';

/**
 * Busca da letra: primeiro no LRCLIB (banco aberto de letras, com tempo de cada linha); se não
 * achar, a legenda feita à mão do próprio vídeo do YouTube. A letra achada fica guardada junto da
 * música, então abre na hora e sem internet nas próximas vezes.
 */

const API = 'https://lrclib.net/api';
const AGENT = 'Puxa 1.6 (https://github.com/TheMarksan/puxa-app-of)';
/** Quando não achou: tenta de novo só depois de um dia. */
const RETRY_MS = 24 * 3600 * 1000;

type Cached = { lyrics: Lyrics | null; at: number; query?: { track: string; artist: string } };

const memory = new Map<string, Cached>();
const cacheFile = (id: string) => new File(Paths.document, 'playlist', `${id}.lyrics.json`);

function readCache(id: string): Cached | null {
  const hit = memory.get(id);
  if (hit) return hit;
  if (Platform.OS === 'web') return null;
  try {
    const f = cacheFile(id);
    if (!f.exists) return null;
    const c = JSON.parse(f.textSync()) as Cached;
    memory.set(id, c);
    return c;
  } catch {
    return null;
  }
}

function writeCache(id: string, c: Cached) {
  memory.set(id, c);
  if (Platform.OS === 'web') return;
  try {
    const f = cacheFile(id);
    if (!f.parentDirectory.exists) f.parentDirectory.create({ intermediates: true, idempotent: true });
    f.write(JSON.stringify(c));
  } catch {
    // sem cache: busca de novo na próxima
  }
}

/** Apaga a letra guardada (quando a música sai do celular). */
export function forgetLyrics(id: string) {
  memory.delete(id);
  if (Platform.OS === 'web') return;
  try {
    const f = cacheFile(id);
    if (f.exists) f.delete();
  } catch {
    // ignorado
  }
}

async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const qs = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await fetch(`${API}/${path}?${qs}`, { headers: { 'User-Agent': AGENT, 'Lrclib-Client': AGENT, Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(res.status === 429 ? 'Muitas buscas seguidas. Tente de novo em um minuto.' : `O banco de letras respondeu com erro ${res.status}.`);
  return (await res.json()) as T;
}

/** Busca livre (a pessoa corrige o nome): os resultados com letra. */
export async function searchLyrics(q: string): Promise<LrclibRecord[]> {
  const list = (await get<LrclibRecord[]>('search', { q })) ?? [];
  return list.filter((r) => r.syncedLyrics || r.plainLyrics).slice(0, 12);
}

async function fromLrclib(track: string, artist: string, duration: number): Promise<Lyrics | null> {
  const want = { track, artist, duration };
  if (artist && duration > 0) {
    const exact = await get<LrclibRecord>('get', { track_name: track, artist_name: artist, duration: String(Math.round(duration)) });
    if (exact && (exact.syncedLyrics || exact.plainLyrics || exact.instrumental)) return fromRecord(exact);
  }
  const tries: Record<string, string>[] = [];
  if (artist) tries.push({ track_name: track, artist_name: artist });
  tries.push({ q: `${artist} ${track}`.trim() });
  if (artist) tries.push({ track_name: track });
  for (const params of tries) {
    const list = await get<LrclibRecord[]>('search', params);
    const best = list ? pickBest(list, want) : null;
    if (best) return fromRecord(best);
  }
  return null;
}

/** Legenda feita à mão do vídeo do YouTube (as automáticas erram demais em música). */
async function fromYoutube(t: Track): Promise<Lyrics | null> {
  if (t.source !== 'youtube' || Platform.OS === 'web') return null;
  const r = await resolveLink(t.link.split('#')[0]);
  if (r.type !== 'youtube') return null;
  const manual = r.info.captions.filter((c) => !c.auto);
  if (!manual.length) return null;
  const { cues } = await youtubeCues(r.info.id, manual[0], false);
  const lines = cues.map((c) => ({ t: c.start, text: c.text.replace(/\n/g, ' ').replace(/[♪♫]/g, '').trim() })).filter((l) => l.text);
  return lines.length ? { synced: lines, plain: null, source: 'youtube' } : null;
}

/** Letra de uma música: do que está guardado ou buscando agora. null = não achou. */
export async function lyricsFor(t: Track, force = false): Promise<Lyrics | null> {
  const hit = readCache(t.id);
  if (hit && !force && (hit.lyrics || Date.now() - hit.at < RETRY_MS)) return hit.lyrics;
  const q = hit?.query ?? cleanTitle(t.title, t.artist);
  let found: Lyrics | null = null;
  try {
    found = await fromLrclib(q.track, q.artist, t.duration);
  } catch (e) {
    // Sem internet ou banco fora do ar: tenta a legenda do vídeo antes de desistir
    found = await fromYoutube(t).catch(() => null);
    if (!found) throw e;
  }
  found ??= await fromYoutube(t).catch(() => null);
  writeCache(t.id, { lyrics: found, at: Date.now(), query: q });
  return found;
}

/** A pessoa escolheu um resultado da busca: passa a ser a letra desta música. */
export function chooseLyrics(t: Track, r: LrclibRecord) {
  const lyrics = fromRecord(r);
  writeCache(t.id, { lyrics, at: Date.now(), query: { track: r.trackName, artist: r.artistName } });
  return lyrics;
}

/** O que buscar por padrão para esta música (para preencher a busca manual). */
export function queryFor(t: Track): string {
  const q = readCache(t.id)?.query ?? cleanTitle(t.title, t.artist);
  return `${q.artist} ${q.track}`.trim();
}

export type LyricsState = { status: 'loading' } | { status: 'ready'; lyrics: Lyrics } | { status: 'none' } | { status: 'error'; message: string };

/** Letra da música [t] para a tela. [req.n] muda para ler de novo; [req.refresh] busca na rede de novo. */
export function useLyrics(t: Track | null, req: { n: number; refresh: boolean }): LyricsState {
  const id = t?.id ?? null;
  const [got, setGot] = useState<{ id: string | null; n: number; state: LyricsState }>({ id: null, n: -1, state: { status: 'loading' } });
  useEffect(() => {
    if (!t) return;
    let alive = true;
    lyricsFor(t, req.refresh)
      .then((l) => alive && setGot({ id: t.id, n: req.n, state: l && (l.synced || l.plain) ? { status: 'ready', lyrics: l } : { status: 'none' } }))
      .catch((e: Error) => alive && setGot({ id: t.id, n: req.n, state: { status: 'error', message: e.message || 'Sem conexão para buscar a letra.' } }));
    return () => {
      alive = false;
    };
    // A música muda pelo id; o objeto muda a cada progresso de download
  }, [id, req.n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return { status: 'none' };
  return got.id === id && got.n === req.n ? got.state : { status: 'loading' };
}
