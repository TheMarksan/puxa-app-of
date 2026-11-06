import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { newId, projectLength } from './timeline';
import type { Project } from './types';

/**
 * Projeto aberto no editor: estado único com desfazer/refazer e salvamento automático
 * (um JSON por projeto em Documentos/projects). As mídias ficam na pasta de mídia do motor.
 */

type Listener = () => void;

export type ProjectSummary = { id: string; title: string; updatedAt: number; duration: number; cover?: string; clips: number };

const HISTORY = 60;

function dir(): Directory {
  const d = new Directory(Paths.document, 'projects');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

function fileFor(id: string): File {
  return new File(dir(), `${id}.json`);
}

class Store {
  project: Project | null = null;
  private past: Project[] = [];
  private future: Project[] = [];
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Quando um gesto começa, o estado de antes vai para o histórico uma única vez. */
  private pending = false;
  /** O refazer guardado no começo do gesto: volta se o gesto terminar sem mudar nada. */
  private parked: Project[] | null = null;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private emit() {
    this.listeners.forEach((l) => l());
  }

  open(p: Project) {
    this.project = p;
    this.past = [];
    this.future = [];
    this.emit();
  }

  close() {
    this.flush();
    this.project = null;
    this.past = [];
    this.future = [];
    this.emit();
  }

  /** Marca o começo de uma edição contínua (arrastar, pinçar): só esse ponto entra no desfazer. */
  checkpoint() {
    if (!this.project) return;
    this.past.push(this.project);
    if (this.past.length > HISTORY) this.past.shift();
    this.parked = this.future;
    this.future = [];
    this.pending = true;
    this.emit();
  }

  /**
   * Aplica uma mudança. [live] = parte de um gesto já marcado com checkpoint (não cria um novo
   * passo no desfazer a cada quadro).
   */
  update(fn: (p: Project) => Project, live = false) {
    if (!this.project) return;
    const next = { ...fn(this.project), updatedAt: Date.now() };
    if (!live && !this.pending) {
      this.past.push(this.project);
      if (this.past.length > HISTORY) this.past.shift();
      this.future = [];
    }
    if (!live) this.pending = false;
    this.project = next;
    this.emit();
    this.scheduleSave();
  }

  /** Fim do gesto. Um toque que só selecionou não deixa passo vazio no desfazer. */
  settle() {
    if (this.pending && this.past[this.past.length - 1] === this.project) {
      this.past.pop();
      if (this.parked) this.future = this.parked;
      this.emit();
    }
    this.parked = null;
    this.pending = false;
  }

  /** Muda só quando desfazer/refazer ficam (in)disponíveis: serve de snapshot para a interface. */
  get history(): string {
    return `${this.past.length > 0 ? 1 : 0}${this.future.length > 0 ? 1 : 0}`;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  undo() {
    const prev = this.past.pop();
    if (!prev || !this.project) return;
    this.future.push(this.project);
    this.project = prev;
    this.emit();
    this.scheduleSave();
  }

  redo() {
    const next = this.future.pop();
    if (!next || !this.project) return;
    this.past.push(this.project);
    this.project = next;
    this.emit();
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 700);
  }

  flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.project) saveProject(this.project);
  }
}

export const store = new Store();

export function useProject(): Project | null {
  return useSyncExternalStore(store.subscribe, () => store.project, () => store.project);
}

export function useHistory(): { canUndo: boolean; canRedo: boolean } {
  const h = useSyncExternalStore(store.subscribe, () => store.history, () => store.history);
  return { canUndo: h[0] === '1', canRedo: h[1] === '1' };
}

// Na prévia web (só para ver a interface) os projetos ficam no localStorage
const WEB = Platform.OS === 'web';
const webKey = (id: string) => `puxa-project:${id}`;
function webAll(): Project[] {
  const out: Project[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('puxa-project:')) out.push(JSON.parse(localStorage.getItem(k) ?? 'null'));
    }
  } catch {
    // sem localStorage
  }
  return out.filter(Boolean);
}

export function saveProject(p: Project) {
  try {
    if (WEB) localStorage.setItem(webKey(p.id), JSON.stringify(p));
    else fileFor(p.id).write(JSON.stringify(p));
  } catch {
    // Sem espaço ou pasta inacessível: o projeto continua aberto na memória
  }
}

export async function loadProject(id: string): Promise<Project | null> {
  if (WEB) return webAll().find((p) => p.id === id) ?? null;
  const f = fileFor(id);
  if (!f.exists) return null;
  try {
    return JSON.parse(await f.text()) as Project;
  } catch {
    return null;
  }
}

export function createProject(title = 'Novo projeto'): Project {
  const now = Date.now();
  const p: Project = {
    id: newId('p'),
    title,
    aspect: '9:16',
    quality: 720,
    clips: [],
    layers: [],
    audio: [],
    captions: null,
    duck: true,
    fitWhatsApp: true,
    sources: {},
    createdAt: now,
    updatedAt: now,
  };
  saveProject(p);
  return p;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const out: ProjectSummary[] = [];
  const all: (() => Promise<Project>)[] = WEB
    ? webAll().map((p) => async () => p)
    : dir()
        .list()
        .filter((e): e is File => e instanceof File && e.name.endsWith('.json'))
        .map((f) => async () => JSON.parse(await f.text()) as Project);
  for (const read of all) {
    try {
      const p = await read();
      const first = p.clips[0] ? p.sources[p.clips[0].sourceId] : undefined;
      out.push({ id: p.id, title: p.title, updatedAt: p.updatedAt, duration: projectLength(p), cover: first?.thumbnail, clips: p.clips.length });
    } catch {
      // arquivo corrompido: ignora
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Apaga o arquivo do projeto (as mídias vão à parte, com deleteMedia, para dar tempo de desfazer). */
export function deleteProject(id: string) {
  try {
    if (WEB) localStorage.removeItem(webKey(id));
    else fileFor(id).delete();
  } catch {
    // já não existia
  }
}

export function deleteMedia(mediaPaths: string[]) {
  if (WEB) return;
  for (const path of mediaPaths) {
    try {
      const f = new File(`file://${path}`);
      if (f.exists) f.delete();
    } catch {
      // ignorado
    }
  }
}
