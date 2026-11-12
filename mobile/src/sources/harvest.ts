import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { Captured } from './json';

/**
 * Navegador invisível (um WebView fora da tela): abre a página pública do perfil ou do post como
 * um visitante sem conta e guarda as respostas de dados que o próprio site busca. Serve de
 * reserva quando o pedido direto é recusado (o site real passa nos controles que um pedido
 * solto às vezes não passa). Um trabalho por vez.
 */

export type { Captured };

export type HarvestJob = {
  id: number;
  url: string;
  /** Endereços das respostas que interessam (texto de uma RegExp). */
  pattern: string;
  html: boolean;
  userAgent: string;
  /** Texto de um botão para tocar depois de carregar (o "Ver story" da página de stories). */
  tap?: string;
};

type Running = HarvestJob & { got: Captured[]; enough: (c: Captured[]) => boolean; done: (c: Captured[]) => void; timer: ReturnType<typeof setTimeout> };

/** Chrome de celular comum (sem o "wv" do WebView, que alguns sites tratam diferente). */
export const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';

let seq = 0;
let mounted = 0;
let current: Running | null = null;
const queue: Running[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function next() {
  if (current || !queue.length) return;
  current = queue.shift()!;
  emit();
}

function finish(id: number) {
  if (!current || current.id !== id) return;
  const job = current;
  clearTimeout(job.timer);
  current = null;
  job.done(job.got);
  emit();
  next();
}

/** O navegador invisível está na tela (montado no layout raiz). */
export function harvesterMounted(on: boolean) {
  mounted += on ? 1 : -1;
}

export function harvest(o: { url: string; pattern: RegExp; enough: (c: Captured[]) => boolean; timeoutMs?: number; html?: boolean; userAgent?: string; tap?: RegExp }): Promise<Captured[]> {
  if (Platform.OS === 'web' || mounted <= 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    const id = ++seq;
    const job: Running = {
      id,
      url: o.url,
      pattern: o.pattern.source,
      html: !!o.html,
      userAgent: o.userAgent ?? MOBILE_UA,
      tap: o.tap?.source,
      got: [],
      enough: o.enough,
      done: resolve,
      timer: setTimeout(() => finish(id), o.timeoutMs ?? 16_000),
    };
    queue.push(job);
    next();
  });
}

/** Mensagem do WebView: uma resposta capturada. */
export function report(id: number, raw: string) {
  if (!current || current.id !== id) return;
  try {
    const m = JSON.parse(raw) as Captured;
    if (typeof m.body !== 'string' || !m.body) return;
    current.got.push({ url: String(m.url ?? ''), body: m.body, html: !!m.html });
    if (current.enough(current.got)) finish(id);
  } catch {
    // mensagem que não é nossa
  }
}

/** A página falhou de vez: termina com o que já tinha. */
export function fail(id: number) {
  finish(id);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = (): HarvestJob | null => (current ? { id: current.id, url: current.url, pattern: current.pattern, html: current.html, userAgent: current.userAgent, tap: current.tap } : null);
let last: HarvestJob | null = null;
const stable = () => {
  const s = snapshot();
  if (s?.id !== last?.id) last = s;
  return last;
};

export function useHarvestJob(): HarvestJob | null {
  return useSyncExternalStore(subscribe, stable, stable);
}

export { hookScript } from './hook';
