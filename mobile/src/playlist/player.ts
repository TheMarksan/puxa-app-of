import { createAudioPlaylist, setAudioModeAsync, type AudioPlaylist, type AudioPlaylistLoopMode, type AudioPlaylistStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { NAMES } from '../sources';
import { getTracks, onTracksChange, type Track } from './store';

/**
 * O player da playlist: uma fila nativa só, que continua tocando com a tela desligada e mostra
 * os controles (anterior, tocar/pausar, próxima) na barra de notificação e na tela de bloqueio.
 * A ordem da fila segue a lista; só entram as faixas já baixadas.
 */

export type PlayerState = {
  /** Faixa tocando (ou pausada) agora; null antes de tocar a primeira vez. */
  trackId: string | null;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  loop: AudioPlaylistLoopMode;
};

let state: PlayerState = { trackId: null, playing: false, buffering: false, time: 0, duration: 0, loop: 'all' };
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

const uri = (t: Track) => (t.path ? (t.path.startsWith('/') && Platform.OS !== 'web' ? `file://${t.path}` : t.path) : null);
const ready = () => getTracks().filter((t) => t.status === 'ready' && t.path);
const artwork = (t: Track) => (t.thumbnail ? (t.thumbnail.startsWith('/') && Platform.OS !== 'web' ? `file://${t.thumbnail}` : t.thumbnail) : undefined);

function metadata(t: Track) {
  return {
    title: t.title,
    artist: t.artist || (t.source ? NAMES[t.source as 'instagram' | 'x'] ?? 'YouTube' : 'Puxa'),
    albumTitle: 'Playlist do Puxa',
    artworkUrl: artwork(t),
  };
}

function ensure(): AudioPlaylist {
  if (list) return list;
  // Toca com a tela desligada e pede o áudio só para si (a notificação depende disso)
  setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
  const p = createAudioPlaylist({ sources: [], loop: state.loop, updateInterval: 500 });
  list = p;
  p.addListener('playlistStatusUpdate', (s: AudioPlaylistStatus) => {
    // Antes do primeiro toque a fila só está pronta: nada aparece como "tocando"
    if (!state.trackId && !s.playing) {
      set({ loop: s.loop });
      return;
    }
    const id = queue[s.currentIndex] ?? state.trackId;
    set({ trackId: id, playing: s.playing, buffering: s.isBuffering, time: s.currentTime, duration: s.duration || state.duration, loop: s.loop });
  });
  p.addListener('trackChanged', ({ currentIndex }) => {
    if (!state.trackId && !p.playing) return;
    const id = queue[currentIndex] ?? null;
    set({ trackId: id, time: 0 });
    const t = id ? getTracks().find((x) => x.id === id) : null;
    if (t && lockScreen) p.updateLockScreenMetadata(metadata(t));
  });
  // A lista mudou (faixa baixou, saiu ou trocou de lugar): a fila acompanha
  onTracksChange(sync);
  sync();
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
    for (const t of want.slice(queue.length)) p.add({ uri: uri(t)!, name: t.title });
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
  for (const t of want) p.add({ uri: uri(t)!, name: t.title });
  queue = ids;
  const i = cur ? ids.indexOf(cur) : -1;
  if (i >= 0) {
    p.skipTo(i);
    p.seekTo(at).catch(() => {});
    if (was) p.play();
  }
}

/** Toca uma faixa da lista (do começo). */
export function playTrack(id: string) {
  const p = ensure();
  sync();
  const i = queue.indexOf(id);
  if (i < 0) return;
  const t = getTracks().find((x) => x.id === id);
  if (p.currentIndex !== i || state.trackId !== id) p.skipTo(i);
  else p.seekTo(0).catch(() => {});
  p.play();
  set({ trackId: id, playing: true });
  if (t) {
    if (!lockScreen) p.setActiveForLockScreen(true, metadata(t), { showNextTrack: true, showPreviousTrack: true, showSeekForward: false, showSeekBackward: false });
    else p.updateLockScreenMetadata(metadata(t));
    lockScreen = true;
  }
}

export function toggle() {
  const p = ensure();
  if (p.playing) {
    p.pause();
    return;
  }
  if (!state.trackId) {
    const first = ready()[0];
    if (first) playTrack(first.id);
    return;
  }
  p.play();
  const t = getTracks().find((x) => x.id === state.trackId);
  if (t && !lockScreen) {
    p.setActiveForLockScreen(true, metadata(t), { showNextTrack: true, showPreviousTrack: true });
    lockScreen = true;
  }
}

export function next() {
  const p = ensure();
  if (!queue.length) return;
  if (p.currentIndex >= queue.length - 1 && p.loop !== 'all') return;
  p.next();
}

/** Anterior: no começo da música volta uma; depois de 3 s, volta ao começo dela. */
export function previous() {
  const p = ensure();
  if (p.currentTime > 3 || (p.currentIndex === 0 && p.loop !== 'all')) {
    p.seekTo(0).catch(() => {});
    return;
  }
  p.previous();
}

export function seek(seconds: number) {
  const p = ensure();
  p.seekTo(Math.max(0, seconds)).catch(() => {});
  set({ time: seconds });
}

/** Repetir: a lista toda, só esta música ou nada. */
export function cycleLoop() {
  const p = ensure();
  const order: AudioPlaylistLoopMode[] = ['all', 'single', 'none'];
  const nextMode = order[(order.indexOf(p.loop) + 1) % order.length];
  p.loop = nextMode;
  set({ loop: nextMode });
}

/** Para tudo e tira os controles da notificação. */
export function stop() {
  const p = list;
  if (!p) return;
  p.pause();
  if (lockScreen) p.clearLockScreenControls();
  lockScreen = false;
  set({ playing: false, trackId: null, time: 0, duration: 0 });
}

/** Começa a acompanhar a lista (a fila nativa só nasce quando algo toca pela primeira vez). */
export function preparePlayer() {
  if (getTracks().some((t) => t.status === 'ready')) ensure();
}
