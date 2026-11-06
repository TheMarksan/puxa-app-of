import { store } from './store';
import { aspectRatio, clipAt, clipLength, clipStarts, defaultClip, defaultTextStyle, newId, projectLength, splitClip } from './timeline';
import type { AudioTrack, Clip, Fit, Layer, MediaSource, Project } from './types';
import type { Selection } from './ui/Preview';

/** Ações do editor. Cada uma vira um passo no desfazer (a não ser as marcadas como "live"). */

export function patchProject(patch: Partial<Project>) {
  store.update((p) => ({ ...p, ...patch }));
}

export function patchClip(id: string, patch: Partial<Clip>, live = false) {
  store.update((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }), live);
}

export function patchLayer(id: string, patch: Partial<Layer>, live = false) {
  store.update((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) }), live);
}

export function patchAudio(id: string, patch: Partial<AudioTrack>, live = false) {
  store.update((p) => ({ ...p, audio: p.audio.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), live);
}

export function addSources(sources: MediaSource[]): Record<string, MediaSource> {
  const map = Object.fromEntries(sources.map((s) => [s.id, s]));
  store.update((p) => ({ ...p, sources: { ...p.sources, ...map } }));
  return map;
}

/** Põe as mídias na linha do tempo depois do clipe em [after] (ou no fim). */
/** Proporção do quadro; no formato original de um projeto vazio, quem manda é o primeiro clipe novo. */
function frameRatio(p: Project, firstNew?: MediaSource): number {
  if (p.aspect !== 'original' || p.clips.length) return aspectRatio(p);
  return firstNew && firstNew.width > 0 && firstNew.height > 0 ? firstNew.width / firstNew.height : 16 / 9;
}

/** Vídeo deitado num quadro em pé (ou o contrário) entra com fundo desfocado: nada fica cortado. */
function fitFor(src: MediaSource, frame: number): Fit {
  if (src.kind !== 'video' || src.width <= 0 || src.height <= 0) return 'fill';
  return Math.abs(Math.log(src.width / src.height / frame)) > 0.2 ? 'blur' : 'fill';
}

export function addClips(sources: MediaSource[], after?: number, range?: { from: number; to: number }): Clip[] {
  const visual = sources.filter((s) => s.kind !== 'audio');
  const frame = store.project ? frameRatio(store.project, visual[0]) : 9 / 16;
  const clips = visual.map((s) => ({ ...defaultClip(s, range?.from ?? 0, range?.to), fit: fitFor(s, frame) }));
  store.update((p) => {
    const at = after == null ? p.clips.length : after + 1;
    return {
      ...p,
      sources: { ...p.sources, ...Object.fromEntries(sources.map((s) => [s.id, s])) },
      clips: [...p.clips.slice(0, at), ...clips, ...p.clips.slice(at)],
    };
  });
  return clips;
}

export function addLayer(layer: Layer) {
  store.update((p) => ({ ...p, layers: [...p.layers, layer] }));
}

export function addAudio(track: AudioTrack, source?: MediaSource) {
  store.update((p) => ({ ...p, sources: source ? { ...p.sources, [source.id]: source } : p.sources, audio: [...p.audio, track] }));
}

/** Camada nova começando no playhead, com 3 s (ou até o fim do vídeo). */
export function layerWindow(p: Project, t: number, length = 3): { start: number; end: number } {
  const total = Math.max(projectLength(p), 0.5);
  const start = Math.min(t, Math.max(0, total - 0.5));
  return { start, end: Math.min(total, start + length) };
}

export function newText(p: Project, t: number, text = 'Seu texto'): Layer {
  return { id: newId('l'), kind: 'text', text, style: defaultTextStyle(), ...layerWindow(p, t), x: 0.5, y: 0.3, scale: 1, rotation: 0, fade: true };
}

export function newSticker(p: Project, t: number, emoji: string): Layer {
  return { id: newId('l'), kind: 'sticker', emoji, ...layerWindow(p, t), x: 0.72, y: 0.4, scale: 1, rotation: 0, fade: true };
}

export function removeSelection(sel: Selection) {
  if (!sel) return;
  store.update((p) => {
    if (sel.kind === 'clip') return { ...p, clips: p.clips.filter((c) => c.id !== sel.id) };
    if (sel.kind === 'layer') return { ...p, layers: p.layers.filter((l) => l.id !== sel.id) };
    if (sel.kind === 'audio') return { ...p, audio: p.audio.filter((a) => a.id !== sel.id) };
    return { ...p, captions: null };
  });
}

export function duplicateSelection(sel: Selection): Selection {
  const p = store.project;
  if (!p || !sel) return sel;
  if (sel.kind === 'clip') {
    const i = p.clips.findIndex((c) => c.id === sel.id);
    if (i < 0) return sel;
    const copy = { ...p.clips[i], id: newId('c') };
    store.update((q) => ({ ...q, clips: [...q.clips.slice(0, i + 1), copy, ...q.clips.slice(i + 1)] }));
    return { kind: 'clip', id: copy.id };
  }
  if (sel.kind === 'layer') {
    const l = p.layers.find((x) => x.id === sel.id);
    if (!l) return sel;
    const len = l.end - l.start;
    const copy = { ...l, id: newId('l'), start: l.end, end: Math.min(projectLength(p), l.end + len), x: Math.min(0.9, l.x + 0.04), y: Math.min(0.9, l.y + 0.04) } as Layer;
    store.update((q) => ({ ...q, layers: [...q.layers, copy] }));
    return { kind: 'layer', id: copy.id };
  }
  return sel;
}

export function moveClip(id: string, dir: -1 | 1) {
  store.update((p) => {
    const i = p.clips.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.clips.length) return p;
    const clips = [...p.clips];
    [clips[i], clips[j]] = [clips[j], clips[i]];
    return { ...p, clips };
  });
}

/** Divide o clipe sob o playhead. Retorna o id do clipe da direita (para continuar selecionado). */
export function splitAt(t: number): string | null {
  const p = store.project;
  if (!p) return null;
  const next = splitClip(p.clips, t);
  if (!next) return null;
  const at = clipAt(p.clips, t);
  store.update((q) => ({ ...q, clips: next }));
  return at ? next[at.index + 1].id : null;
}

/** Início do clipe na linha do tempo (para levar o playhead até ele ao selecionar). */
export function clipStart(p: Project, id: string): number | null {
  const i = p.clips.findIndex((c) => c.id === id);
  if (i < 0) return null;
  return clipStarts(p.clips)[i];
}

export function clipRange(p: Project, id: string): { start: number; end: number } | null {
  const i = p.clips.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const s = clipStarts(p.clips)[i];
  return { start: s, end: s + clipLength(p.clips[i]) };
}

/** Mídias que só este projeto usa (para apagar junto). */
export function ownedMedia(p: Project, mediaRoot: string): string[] {
  return Object.values(p.sources)
    .map((s) => s.path)
    .filter((path) => path.startsWith(mediaRoot));
}
