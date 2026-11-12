import { createAudioPlayer, createAudioPlaylist, setAudioModeAsync, type AudioPlayer, type AudioPlaylist, type AudioPlaylistStatus, type AudioStatus } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { NAMES } from '../sources';
import { ALL, listLook, onListsChange, readyIds } from './lists';
import { askNotifications } from './permissions';
import { arrange, neighbor, plan, stuckAtEnd, wrapped, type LoopMode, type Sample } from './queue';
import { getTracks, onTracksChange, type Track } from './store';

/**
 * O player das playlists. Toca a lista escolhida numa fila nativa, que segue com a tela desligada
 * e mostra anterior, tocar/pausar e próxima na notificação e na tela de bloqueio.
 *
 * Tocar uma música monta uma fila nova que começa nela (a lista girada até ela, ou embaralhada
 * com ela na frente). Assim nunca se pula para um índice que o player do aparelho ainda não tem.
 * A passagem para a próxima é do próprio player; se ele parar no fim de uma música ou repetir
 * em vez de seguir, o app passa para a próxima ele mesmo. Se a fila nativa não tocar nem depois
 * de refeita, o app toca uma música por vez num player simples e cuida da fila sozinho.
 */

export type { LoopMode };

export type PlayerState = {
  /** Lista que está tocando (ALL = todas as músicas). */
  listId: string | null;
  /** Música tocando (ou pausada) agora; null antes de tocar a primeira vez. */
  trackId: string | null;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  loop: LoopMode;
  shuffle: boolean;
  /** Por que não tocou (arquivo que não abriu, por exemplo). */
  error: string | null;
};

let state: PlayerState = { listId: null, trackId: null, playing: false, buffering: false, time: 0, duration: 0, loop: 'all', shuffle: false, error: null };
const listeners = new Set<() => void>();
/** Quando o tempo foi lido pela última vez (para o relógio liso da letra). */
let stamp = Date.now();
const set = (patch: Partial<PlayerState>) => {
  if ('time' in patch || 'playing' in patch) stamp = Date.now();
  const next = { ...state, ...patch };
  if (Object.keys(patch).every((k) => (next as Record<string, unknown>)[k] === (state as Record<string, unknown>)[k])) return;
  state = next;
  listeners.forEach((l) => l());
};

/** Tempo agora, completando com o relógio entre um aviso do player e outro. */
export function smoothTime(): number {
  if (!state.playing || state.buffering) return state.time;
  const t = state.time + (Date.now() - stamp) / 1000;
  return state.duration > 0 ? Math.min(state.duration, t) : t;
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => state;
export const getPlayer = get;

export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribe, get, get);
}

// ---------- Estado interno ----------

/** Fila nativa e a ordem dela (ids). */
let list: AudioPlaylist | null = null;
let order: string[] = [];
/** Reserva: um player simples, uma música por vez. */
let solo: AudioPlayer | null = null;
let mode: 'list' | 'solo' = 'list';
let lockScreen = false;
let modeReady: Promise<void> | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;
let rebuilt = false;
/** A pessoa quer ouvir (tocou em tocar e não pausou). */
let intent = false;
/** Última amostra do player (para perceber quando ele não passa para a próxima). */
let lastSample: Sample | null = null;
let endSince = 0;
/** A pessoa pediu próxima ou anterior: a troca de faixa não é a do fim da música. */
let userSkip = 0;
/** A lista mudou com a música pausada: a fila é refeita no próximo tocar. */
let stale = false;

const uri = (t: Track) => (t.path ? (t.path.startsWith('/') && Platform.OS !== 'web' ? `file://${t.path}` : t.path) : null);
const artwork = (t: Track) => (t.thumbnail ? (t.thumbnail.startsWith('/') && Platform.OS !== 'web' ? `file://${t.thumbnail}` : t.thumbnail) : undefined);
const trackOf = (id: string | null) => (id ? (getTracks().find((x) => x.id === id) ?? null) : null);
const source = (t: Track) => ({ uri: uri(t)!, name: t.title });
const ids = () => (state.listId ? readyIds(state.listId) : []);

function metadata(t: Track) {
  return {
    title: t.title,
    artist: t.artist || (t.source ? (NAMES[t.source as 'instagram' | 'x'] ?? 'YouTube') : 'Puxa'),
    albumTitle: state.listId ? listLook(state.listId).name : 'Puxa',
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

function clearWatchdog() {
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
}

function dropList() {
  const old = list;
  list = null;
  order = [];
  if (!old) return;
  try {
    old.pause();
    if (lockScreen) old.clearLockScreenControls();
    old.destroy();
  } catch {
    // já estava solta
  }
  lockScreen = false;
}

/** Liga os controles da notificação e da tela de bloqueio para esta música. */
function showControls(p: AudioPlaylist | AudioPlayer, t: Track, withSkips: boolean) {
  try {
    if (!lockScreen) {
      p.setActiveForLockScreen(true, metadata(t), withSkips ? { showNextTrack: true, showPreviousTrack: true } : { showSeekForward: true, showSeekBackward: true });
      lockScreen = true;
    } else p.updateLockScreenMetadata(metadata(t));
  } catch {
    // Sem os controles na notificação, a música toca do mesmo jeito com o app aberto
  }
}

/** Amostra nova do player: confere se ele travou no fim de uma música. */
function watchEnd(s: Sample) {
  const stuck = stuckAtEnd(lastSample, s, state.loop, order.length);
  lastSample = s;
  if (!intent || !stuck || !state.trackId) {
    endSince = 0;
    return;
  }
  if (state.loop === 'single') {
    if (stuck === 'ended') seek(0, true);
    return;
  }
  // "Parado no fim" espera um pouco (o player do aparelho costuma passar sozinho em seguida)
  if (stuck === 'ended') {
    endSince ||= s.at;
    if (s.at - endSince < 1200) return;
  }
  endSince = 0;
  const n = neighbor(order, ids(), state.trackId, 1, state.loop, state.shuffle);
  if (n) startAt(n, 0, true);
  else finish();
}

/** A lista acabou (repetir desligado). */
function finish() {
  intent = false;
  clearWatchdog();
  if (mode === 'solo') solo?.pause();
  else list?.pause();
  set({ playing: false, buffering: false });
}

// ---------- Fila nativa ----------

function build(startId: string, at: number, play: boolean): boolean {
  const all = ids();
  const want = arrange(all, startId, state.shuffle);
  const tracks = want.map(trackOf).filter((t): t is Track => !!t && !!uri(t));
  if (!tracks.length) return false;
  dropList();
  const p = createAudioPlaylist({ sources: tracks.map(source), loop: state.loop, updateInterval: 500 });
  list = p;
  order = tracks.map((t) => t.id);
  stale = false;
  lastSample = null;
  p.addListener('playlistStatusUpdate', (s: AudioPlaylistStatus) => {
    if (list !== p) return;
    const err = (s as AudioPlaylistStatus & { error?: unknown }).error;
    if (err) {
      const id = order[s.currentIndex] ?? state.trackId;
      clearWatchdog();
      if (id && intent) playSolo(id, errorText(err));
      else set({ error: errorText(err), playing: false, buffering: false });
      return;
    }
    if (s.playing) clearWatchdog();
    const id = order[s.currentIndex] ?? state.trackId;
    set({ trackId: id, playing: s.playing, buffering: s.isBuffering, time: s.currentTime, duration: s.duration || trackOf(id)?.duration || 0, ...(s.playing ? { error: null } : null) });
    if ((s as AudioPlaylistStatus & { didJustFinish?: boolean }).didJustFinish && state.loop === 'none') {
      finish();
      return;
    }
    watchEnd({ index: s.currentIndex, time: s.currentTime, duration: s.duration, playing: s.playing, buffering: s.isBuffering, at: Date.now() });
  });
  p.addListener('trackChanged', ({ previousIndex, currentIndex }: { previousIndex: number; currentIndex: number }) => {
    if (list !== p) return;
    const from = order[previousIndex];
    const id = order[currentIndex] ?? null;
    // Repetir desligado: chegou ao fim da lista e o player deu a volta
    if (!userSkip && state.loop === 'none' && !state.shuffle && from && id && wrapped(ids(), from, id)) {
      set({ trackId: id, time: 0 });
      finish();
      return;
    }
    userSkip = 0;
    lastSample = null;
    set({ trackId: id, time: 0, duration: trackOf(id)?.duration ?? 0 });
    const t = trackOf(id);
    if (t && lockScreen) {
      try {
        p.updateLockScreenMetadata(metadata(t));
      } catch {
        // sem notificação
      }
    }
  });
  const first = tracks[0];
  set({ trackId: first.id, time: at, duration: first.duration || 0, error: null });
  if (at > 0) p.seekTo(at).catch(() => {});
  if (play) {
    showControls(p, first, true);
    intent = true;
    p.play();
    set({ playing: true });
    arm(first.id);
  }
  return true;
}

/**
 * Se em alguns segundos nada tocou e nenhum erro veio, a fila é refeita uma vez; se de novo não
 * tocar, passa para o player simples.
 */
function arm(id: string) {
  clearWatchdog();
  watchdog = setTimeout(() => {
    watchdog = null;
    if (!intent || state.error || state.trackId !== id) return;
    const playing = mode === 'solo' ? solo?.playing : list?.playing;
    if (playing) return;
    if (mode === 'list' && !rebuilt) {
      rebuilt = true;
      build(id, 0, true);
      return;
    }
    if (mode === 'list') playSolo(id, 'O áudio não começou. Toque de novo; se continuar, remova e adicione o link outra vez.');
    else set({ playing: false, error: 'O áudio não começou. Toque de novo; se continuar, remova e adicione o link outra vez.' });
  }, 4000);
}

// ---------- Player simples (reserva) ----------

function playSolo(id: string, failMessage: string) {
  const t = trackOf(id);
  if (!t || !uri(t)) return;
  if (mode === 'list') {
    const keep = order.length ? order : arrange(ids(), id, state.shuffle);
    dropList();
    order = keep;
    mode = 'solo';
  }
  if (!order.includes(id)) order = arrange(ids(), id, state.shuffle);
  if (!solo) {
    const pl = createAudioPlayer(null, { updateInterval: 500 });
    solo = pl;
    pl.addListener('playbackStatusUpdate', (st: AudioStatus) => {
      if (mode !== 'solo') return;
      const err = (st as AudioStatus & { error?: unknown }).error;
      if (err) {
        clearWatchdog();
        set({ error: errorText(err), playing: false, buffering: false });
        return;
      }
      if (st.playing) clearWatchdog();
      set({ playing: st.playing, buffering: st.isBuffering, time: st.currentTime, duration: st.duration || state.duration, ...(st.playing ? { error: null } : null) });
      const cur = state.trackId;
      if (st.didJustFinish && cur && intent) {
        if (state.loop === 'single') {
          pl.seekTo(0).catch(() => {});
          pl.play();
          return;
        }
        const n = neighbor(order, ids(), cur, 1, state.loop, state.shuffle);
        if (n) playSolo(n, failMessage);
        else finish();
        return;
      }
      watchEnd({ index: cur ? order.indexOf(cur) : -1, time: st.currentTime, duration: st.duration, playing: st.playing, buffering: st.isBuffering, at: Date.now() });
    });
  }
  const pl = solo;
  lastSample = null;
  pl.replace(source(t));
  intent = true;
  pl.play();
  showControls(pl, t, false);
  set({ trackId: id, playing: true, time: 0, duration: t.duration || 0, error: null });
  clearWatchdog();
  watchdog = setTimeout(() => {
    watchdog = null;
    if (solo && !solo.playing && state.trackId === id && !state.error && intent) set({ playing: false, error: failMessage });
  }, 4000);
}

/** Toca [id] do começo (ou de [at]) na lista atual, pelo caminho que estiver valendo. */
function startAt(id: string, at: number, play: boolean) {
  if (mode === 'solo') {
    playSolo(id, 'Não deu para tocar esta música.');
    if (at > 0) solo?.seekTo(at).catch(() => {});
    if (!play) solo?.pause();
    return;
  }
  build(id, at, play);
}

// ---------- A lista mudou ----------

function sync() {
  if (!state.listId || !state.trackId) return;
  const now = ids();
  if (!now.length) {
    stop();
    return;
  }
  const cur = state.trackId;
  if (!now.includes(cur)) {
    // A música atual saiu: segue para a que vinha depois dela (ou para)
    const after = order.slice(order.indexOf(cur) + 1).concat(order.slice(0, order.indexOf(cur))).find((x) => now.includes(x));
    if (after && intent) startAt(after, 0, true);
    else stop();
    return;
  }
  if (mode === 'solo') {
    const p = plan(order, now, cur, state.shuffle);
    order = p ? p.order : arrange(now, cur, state.shuffle);
    return;
  }
  if (!list) return;
  const p = plan(order, now, cur, state.shuffle);
  if (p && !p.ops.length) return;
  if (p) {
    for (const op of p.ops) {
      if (op.op === 'remove') list.remove(op.index);
      else {
        const t = trackOf(op.id);
        if (t && uri(t)) list.insert(source(t), op.index);
      }
    }
    order = p.order;
    return;
  }
  // As músicas trocaram de lugar: tocando, refaz a fila no mesmo ponto; pausada, no próximo tocar
  if (state.playing) build(cur, list.currentTime, true);
  else stale = true;
}

let watching = false;
function watchLibrary() {
  if (watching) return;
  watching = true;
  onTracksChange(sync);
  onListsChange(sync);
}

// ---------- Ações ----------

/** Toca uma música de uma lista (do começo). */
export async function playTrack(listId: string, id: string) {
  watchLibrary();
  await audioMode();
  askNotifications();
  rebuilt = false;
  userSkip = 0;
  set({ listId, error: null });
  startAt(id, 0, true);
}

/** Toca a lista do começo (ou, embaralhado, de uma música qualquer). */
export async function playList(listId: string, shuffle?: boolean) {
  const all = readyIds(listId);
  if (!all.length) return;
  if (shuffle != null) set({ shuffle });
  const first = state.shuffle ? all[Math.floor(Math.random() * all.length)] : all[0];
  await playTrack(listId, first);
}

export async function toggle() {
  const p = mode === 'solo' ? solo : list;
  if (p?.playing) {
    intent = false;
    p.pause();
    clearWatchdog();
    return;
  }
  if (!state.trackId || !state.listId) {
    await playList(state.listId ?? ALL);
    return;
  }
  await audioMode();
  intent = true;
  if (mode === 'list' && (!list || stale)) {
    build(state.trackId, state.time, true);
    return;
  }
  if (mode === 'solo' && solo) {
    solo.play();
    arm(state.trackId);
    return;
  }
  if (list) {
    const t = trackOf(state.trackId);
    if (t) showControls(list, t, true);
    list.play();
    set({ playing: true });
    arm(state.trackId);
  }
}

/** Próxima (ou anterior): pelo próprio player quando é a vizinha da fila; senão, fila nova nela. */
function step(by: 1 | -1) {
  const cur = state.trackId;
  if (!cur) return;
  const target = neighbor(order, ids(), cur, by, state.loop === 'single' ? 'all' : state.loop, state.shuffle);
  if (!target) {
    if (by === -1) seek(0);
    return;
  }
  const wasPlaying = intent;
  if (mode === 'list' && list && !stale) {
    const i = order.indexOf(cur);
    const j = order.indexOf(target);
    if (j === i + by) {
      userSkip = Date.now();
      if (by === 1) list.next();
      else list.previous();
      // Confere se o player mudou mesmo de música; se não, monta a fila na vizinha
      setTimeout(() => {
        if (state.trackId === cur && list) build(target, 0, wasPlaying);
      }, 900);
      return;
    }
  }
  startAt(target, 0, wasPlaying || mode === 'solo');
}

export function next() {
  step(1);
}

/** Anterior: no começo da música volta uma; depois de 3 s, volta ao começo dela. */
export function previous() {
  const t = mode === 'solo' ? (solo?.currentTime ?? 0) : (list?.currentTime ?? state.time);
  if (t > 3) {
    seek(0);
    return;
  }
  step(-1);
}

export function seek(seconds: number, keepPlaying = false) {
  const p: { seekTo: (s: number) => Promise<void> } | null = mode === 'solo' ? solo : list;
  const s = Math.max(0, seconds);
  set({ time: s });
  lastSample = null;
  if (!p) return;
  p.seekTo(s).catch(() => {});
  if (keepPlaying && intent) (mode === 'solo' ? solo : list)?.play();
}

/** Repetir: a lista toda, só esta música ou nada. */
export function cycleLoop() {
  const all: LoopMode[] = ['all', 'single', 'none'];
  const next = all[(all.indexOf(state.loop) + 1) % all.length];
  set({ loop: next });
  if (list) list.loop = next;
}

/** Aleatório: liga ou desliga; a música atual continua e a fila se refaz atrás dela. */
export function toggleShuffle() {
  set({ shuffle: !state.shuffle });
  const cur = state.trackId;
  if (!cur) return;
  if (mode === 'solo') {
    order = arrange(ids(), cur, state.shuffle);
    return;
  }
  if (!list) return;
  if (state.playing) build(cur, list.currentTime, true);
  else stale = true;
}

/** Para tudo e tira os controles da notificação. */
export function stop() {
  intent = false;
  clearWatchdog();
  const p: AudioPlaylist | AudioPlayer | null = mode === 'solo' ? solo : list;
  try {
    p?.pause();
    if (lockScreen) p?.clearLockScreenControls();
  } catch {
    // já estava solto
  }
  lockScreen = false;
  set({ playing: false, trackId: null, time: 0, duration: 0, buffering: false });
}

/** Esconde o aviso de erro do player. */
export function dismissError() {
  set({ error: null });
}
