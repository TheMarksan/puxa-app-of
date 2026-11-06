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

export function harvest(o: { url: string; pattern: RegExp; enough: (c: Captured[]) => boolean; timeoutMs?: number; html?: boolean; userAgent?: string }): Promise<Captured[]> {
  if (Platform.OS === 'web' || mounted <= 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    const id = ++seq;
    const job: Running = {
      id,
      url: o.url,
      pattern: o.pattern.source,
      html: !!o.html,
      userAgent: o.userAgent ?? MOBILE_UA,
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
const snapshot = (): HarvestJob | null => (current ? { id: current.id, url: current.url, pattern: current.pattern, html: current.html, userAgent: current.userAgent } : null);
let last: HarvestJob | null = null;
const stable = () => {
  const s = snapshot();
  if (s?.id !== last?.id) last = s;
  return last;
};

export function useHarvestJob(): HarvestJob | null {
  return useSyncExternalStore(subscribe, stable, stable);
}

/**
 * Script que entra antes da página: copia as respostas de fetch e XHR cujo endereço bate com o
 * padrão e, se pedido, o HTML no fim do carregamento (Instagram põe dados dentro da página).
 */
export function hookScript(pattern: string, html: boolean): string {
  return `(function(){
  if (window.__puxaHook) return; window.__puxaHook = true;
  var RE = new RegExp(${JSON.stringify(pattern)});
  function send(u, b, h) { try { window.ReactNativeWebView.postMessage(JSON.stringify({ url: String(u || ''), body: String(b || ''), html: !!h })); } catch (e) {} }
  try {
    var of = window.fetch;
    if (of) window.fetch = function(input) {
      var u = typeof input === 'string' ? input : (input && input.url) || String(input || '');
      var p = of.apply(this, arguments);
      try { p.then(function(res) { try { if (RE.test(u)) res.clone().text().then(function(t) { send(u, t); }).catch(function(){}); } catch (e) {} }).catch(function(){}); } catch (e) {}
      return p;
    };
  } catch (e) {}
  try {
    var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, u) { this.__puxaUrl = u; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var x = this;
      try {
        x.addEventListener('load', function() {
          try {
            if (!RE.test(String(x.__puxaUrl))) return;
            var t = x.responseType === '' || x.responseType === 'text' ? x.responseText : x.responseType === 'json' ? JSON.stringify(x.response) : null;
            if (t) send(x.__puxaUrl, t);
          } catch (e) {}
        });
      } catch (e) {}
      return os.apply(this, arguments);
    };
  } catch (e) {}
  ${html ? "window.addEventListener('load', function() { setTimeout(function() { try { send(location.href, document.documentElement.outerHTML, true); } catch (e) {} }, 1200); });" : ''}
})(); true;`;
}
