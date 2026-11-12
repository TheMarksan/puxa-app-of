import { createAudioPlayer, createAudioPlaylist, setAudioModeAsync, type AudioPlayer, type AudioPlaylist, type AudioPlaylistLoopMode, type AudioPlaylistStatus, type AudioStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { NAMES } from '../sources';
import { askNotifications } from './permissions';
import { getTracks, onTracksChange, type Track } from './store';

/**
 * O player da playlist: uma fila nativa só, que continua tocando com a tela desligada e mostra
 * os controles (anterior, tocar/pausar, próxima) na barra de notificação e na tela de bloqueio.
 * A ordem da fila segue a lista; só entram as faixas já baixadas.
 *
 * A fila nativa nasce no primeiro toque, já com as músicas dentro (uma fila criada vazia fica
 * "terminada" no Android e pode não sair do lugar), depois de o modo de áudio estar valendo.
 * Se a fila nativa não tocar nem depois de refeita, o app passa a tocar uma música por vez num
 * player simples (o mesmo da prévia de áudio do envio) e cuida da fila ele mesmo.
 */

export type PlayerState = {
  /** Faixa tocando (ou pausada) agora; null antes de tocar a primeira vez. */
  trackId: string | null;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  loop: AudioPlaylistLoopMode;
  /** Por que não tocou (arquivo que não abriu, por exemplo). */
  error: string | null;
};

let state: PlayerState = { trackId: null, playing: false, buffering: false, time: 0, duration: 0, loop: 'all', error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<PlayerState>) => {
  const next = { ...state, ...patch };
  if (Object.keys(patch).every((k) => (next as Record<string, unknown>)[k] === (state as Record<string, unknown>)[k])) return;
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => state;

export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribe, get, get);
}

let list: AudioPlaylist | null = null;
/** Ids das faixas carregadas na fila nativa, na mesma ordem. */
let queue: string[] = [];
let lockScreen = false;
let modeReady: Promise<void> | null = null;
let unwatchTracks: (() => void) | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;
let recovered = false;
/** Reserva: um player simples, uma música por vez. */
let solo: AudioPlayer | null = null;
let mode: 'list' | 'solo' = 'list';

const uri = (t: Track) => (t.path ? (t.path.startsWith('/') && Platform.OS !== 'web' ? `file://${t.path}` : t.path) : null);
const ready = () => getTracks().filter((t) => t.status === 'ready' && t.path);
const artwork = (t: Track) => (t.thumbnail ? (t.thumbnail.startsWith('/') && Platform.OS !== 'web' ? `file://${t.thumbnail}` : t.thumbnail) : undefined);
const source = (t: Track) => ({ uri: uri(t)!, name: t.title });

function metadata(t: Track) {
  return {
    title: t.title,
    artist: t.artist || (t.source ? NAMES[t.source as 'instagram' | 'x'] ?? 'YouTube' : 'Puxa'),
    albumTitle: 'Playlist do Puxa',
    artworkUrl: artwork(t),
  };
}

/** Toca com a tela desligada e pede o áudio só para si (os controles da notificação dependem disso). */
function audioMode(): Promise<void> {
  modeReady ??= setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMixPersistent' }).catch(() => {
    modeReady = null;
  });
  return modeReady;
}

function errorText(e: unknown): string {
  const raw = typeof e === 'string' ? e : ((e as { message?: string } | null)?.message ?? '');
  if (/FileNotFound|ENOENT|no such file|404/i.test(raw)) return 'O arquivo desta música sumiu. Remova e adicione o link de novo.';
  if (/decoder|codec|unsupported|Unrecognized|extractor/i.test(raw)) return 'O celular não conseguiu ler o áudio desta música.';
  return raw ? `Não deu para tocar: ${raw}` : 'Não deu para tocar esta música.';
}

/** A fila nativa, criada já com as músicas baixadas. */
function create(): AudioPlaylist {
  const want = ready();
  const p = createAudioPlaylist({ sources: want.map(source), loop: state.loop, updateInterval: 500 });
  list = p;
  queue = want.map((t) => t.id);
  p.addListener('playlistStatusUpdate', (s: AudioPlaylistStatus) => {
    const err = (s as AudioPlaylistStatus & { error?: unknown }).error;
    if (err) {
      const id = state.trackId ?? queue[s.currentIndex];
      if (mode === 'list' && id) {
        // A fila nativa falhou: tenta a mesma música no player simples antes de mostrar o erro
        clearWatchdog();
        playSolo(id, errorText(err));
        return;
      }
      set({ error: errorText(err), playing: false, buffering: false });
      return;
    }
    if (s.playing) clearWatchdog();
    // Antes do primeiro toque a fila só está pronta: nada aparece como "tocando"
    if (!state.trackId && !s.playing) {
      set({ loop: s.loop });
      return;
    }
    const id = queue[s.currentIndex] ?? state.trackId;
    set({ trackId: id, playing: s.playing, buffering: s.isBuffering, time: s.currentTime, duration: s.duration || state.duration, loop: s.loop, ...(s.playing ? { error: null } : null) });
  });
  p.addListener('trackChanged', ({ currentIndex }) => {
    if (!state.trackId && !p.playing) return;
    const id = queue[currentIndex] ?? null;
    set({ trackId: id, time: 0 });
    const t = id ? getTracks().find((x) => x.id === id) : null;
    if (t && lockScreen) p.updateLockScreenMetadata(metadata(t));
  });
  // A lista mudou (faixa baixou, saiu ou trocou de lugar): a fila acompanha
  unwatchTracks ??= onTracksChange(sync);
  return p;
}

/** Acerta a fila nativa com a lista: acrescenta, tira ou, se a ordem mudou, monta de novo. */
function sync() {
  const p = list;
  if (!p) return;
  const want = ready();
  const ids = want.map((t) => t.id);
  if (ids.length === queue.length && ids.every((id, i) => id === queue[i])) return;
  // Só entraram faixas no fim
  if (ids.length > queue.length && queue.every((id, i) => ids[i] === id)) {
    for (const t of want.slice(queue.length)) p.add(source(t));
    queue = ids;
    return;
  }
  // Só saíram faixas (de trás para a frente, para os índices não mudarem)
  const kept = queue.filter((id) => ids.includes(id));
  if (kept.length === ids.length && kept.every((id, i) => ids[i] === id)) {
    for (let i = queue.length - 1; i >= 0; i--) if (!ids.includes(queue[i])) p.remove(i);
    queue = ids;
    if (state.trackId && !ids.includes(state.trackId)) set({ trackId: queue[p.currentIndex] ?? null });
    if (!ids.length) stop();
    return;
  }
  // Ordem nova: monta a fila de novo e volta para a mesma faixa, no mesmo ponto
  const cur = state.trackId;
  const at = p.currentTime;
  const was = p.playing;
  p.clear();
  for (const t of want) p.add(source(t));
  queue = ids;
  const i = cur ? ids.indexOf(cur) : -1;
  if (i >= 0) {
    p.skipTo(i);
    p.seekTo(at).catch(() => {});
    if (was) p.play();
  }
}

function clearWatchdog() {
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
}

/** Liga os controles da notificação e da tela de bloqueio para esta faixa. */
function showControls(p: AudioPlaylist, t: Track) {
  try {
    if (!lockScreen) p.setActiveForLockScreen(true, metadata(t), { showNextTrack: true, showPreviousTrack: true, showSeekForward: false, showSeekBackward: false });
    else p.updateLockScreenMetadata(metadata(t));
    lockScreen = true;
  } catch {
    // Sem os controles na notificação, a música toca do mesmo jeito com o app aberto
  }
}

/**
 * Começa a tocar. Se em alguns segundos nada tocou e nenhum erro veio, a fila nativa é refeita
 * uma vez (um player que ficou parado no estado errado volta assim).
 */
function start(p: AudioPlaylist, id: string) {
  const t = getTracks().find((x) => x.id === id);
  if (t) showControls(p, t);
  p.play();
  set({ trackId: id, playing: true, error: null });
  clearWatchdog();
  watchdog = setTimeout(() => {
    watchdog = null;
    const cur = list;
    if (!cur || cur.playing || state.error || state.trackId !== id) return;
    if (recovered) {
      playSolo(id, 'O áudio não começou. Toque de novo; se continuar, remova e adicione o link outra vez.');
      return;
    }
    recovered = true;
    rebuild();
    const p2 = list as AudioPlaylist | null;
    const i = queue.indexOf(id);
    if (!p2 || i < 0) return;
    p2.skipTo(i);
    start(p2, id);
  }, 3500);
}

/** Joga fora a fila nativa e cria outra com as mesmas músicas. */
function rebuild() {
  const old = list;
  list = null;
  queue = [];
  lockScreen = false;
  try {
    old?.clearLockScreenControls();
    old?.destroy();
  } catch {
    // já estava solta
  }
  create();
}

/** Próxima faixa depois de [id] na lista (ou a primeira, repetindo tudo); null no fim. */
function after(id: string, by: number): string | null {
  const ids = ready().map((t) => t.id);
  const i = ids.indexOf(id);
  if (i < 0) return ids[0] ?? null;
  const j = i + by;
  if (j >= 0 && j < ids.length) return ids[j];
  return state.loop === 'all' && ids.length ? ids[(j + ids.length) % ids.length] : null;
}

/**
 * Toca [id] no player simples. [failMessage]: o que mostrar se nem ele tocar. Os controles da
 * notificação ficam com tocar/pausar e voltar ou avançar 10 s (anterior e próxima são da fila nativa).
 */
function playSolo(id: string, failMessage: string) {
  const t = getTracks().find((x) => x.id === id);
  if (!t?.path) return;
  if (mode === 'list') {
    mode = 'solo';
    const old = list;
    list = null;
    queue = [];
    try {
      old?.pause();
      if (lockScreen) old?.clearLockScreenControls();
      old?.destroy();
    } catch {
      // já estava solta
    }
    lockScreen = false;
  }
  if (!solo) {
    const pl = createAudioPlayer(null, { updateInterval: 500 });
    solo = pl;
    pl.addListener('playbackStatusUpdate', (st: AudioStatus) => {
      const err = (st as AudioStatus & { error?: unknown }).error;
      if (err) {
        clearWatchdog();
        set({ error: errorText(err), playing: false, buffering: false });
        return;
      }
      if (st.playing) clearWatchdog();
      set({ playing: st.playing, buffering: st.isBuffering, time: st.currentTime, duration: st.duration || state.duration, ...(st.playing ? { error: null } : null) });
      if (st.didJustFinish && state.trackId) {
        if (state.loop === 'single') {
          pl.seekTo(0).catch(() => {});
          pl.play();
          return;
        }
        const n = after(state.trackId, 1);
        if (n) playSolo(n, failMessage);
        else set({ playing: false });
      }
    });
  }
  const pl = solo;
  pl.replace(source(t));
  pl.play();
  try {
    if (!lockScreen) pl.setActiveForLockScreen(true, metadata(t), { showSeekForward: true, showSeekBackward: true });
    else pl.updateLockScreenMetadata(metadata(t));
    lockScreen = true;
  } catch {
    // sem controles na notificação
  }
  set({ trackId: id, playing: true, time: 0, error: null });
  clearWatchdog();
  watchdog = setTimeout(() => {
    watchdog = null;
    if (solo && !solo.playing && state.trackId === id && !state.error) set({ playing: false, error: failMessage });
  }, 4000);
}

/** Toca uma faixa da lista (do começo). */
export async function playTrack(id: string) {
  await audioMode();
  askNotifications();
  if (mode === 'solo') {
    playSolo(id, 'Não deu para tocar esta música.');
    return;
  }
  const p = list ?? create();
  sync();
  const i = queue.indexOf(id);
  if (i < 0) return;
  if (p.currentIndex !== i || state.trackId !== id) p.skipTo(i);
  else p.seekTo(0).catch(() => {});
  recovered = false;
  start(p, id);
}

export async function toggle() {
  if (mode === 'solo' && solo) {
    if (solo.playing) {
      solo.pause();
      clearWatchdog();
    } else if (state.trackId) {
      await audioMode();
      solo.play();
    }
    return;
  }
  const p = list;
  if (p?.playing) {
    p.pause();
    clearWatchdog();
    return;
  }
  if (!p || !state.trackId) {
    const first = ready()[0];
    if (first) await playTrack(first.id);
    return;
  }
  await audioMode();
  start(p, state.trackId);
}

export function next() {
  if (mode === 'solo') {
    const n = state.trackId ? after(state.trackId, 1) : null;
    if (n) playSolo(n, 'Não deu para tocar esta música.');
    return;
  }
  const p = list;
  if (!p || !queue.length) return;
  if (p.currentIndex >= queue.length - 1 && p.loop !== 'all') return;
  p.next();
}

/** Anterior: no começo da música volta uma; depois de 3 s, volta ao começo dela. */
export function previous() {
  if (mode === 'solo' && solo) {
    const back = state.trackId ? after(state.trackId, -1) : null;
    if (solo.currentTime > 3 || !back) solo.seekTo(0).catch(() => {});
    else playSolo(back, 'Não deu para tocar esta música.');
    return;
  }
  const p = list;
  if (!p) return;
  if (p.currentTime > 3 || (p.currentIndex === 0 && p.loop !== 'all')) {
    p.seekTo(0).catch(() => {});
    return;
  }
  p.previous();
}

export function seek(seconds: number) {
  const p: { seekTo: (s: number) => Promise<void> } | null = mode === 'solo' ? solo : list;
  if (!p) return;
  p.seekTo(Math.max(0, seconds)).catch(() => {});
  set({ time: seconds });
}

/** Repetir: a lista toda, só esta música ou nada. */
export function cycleLoop() {
  const order: AudioPlaylistLoopMode[] = ['all', 'single', 'none'];
  const nextMode = order[(order.indexOf(state.loop) + 1) % order.length];
  if (list) list.loop = nextMode;
  set({ loop: nextMode });
}

/** Para tudo e tira os controles da notificação. */
export function stop() {
  const p: AudioPlaylist | AudioPlayer | null = mode === 'solo' ? solo : list;
  clearWatchdog();
  if (!p) return;
  p.pause();
  if (lockScreen) p.clearLockScreenControls();
  lockScreen = false;
  set({ playing: false, trackId: null, time: 0, duration: 0 });
}

/** Esconde o aviso de erro do player. */
export function dismissError() {
  set({ error: null });
}
