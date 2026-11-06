import { clipLength, clipStarts } from './timeline';
import type { Clip, Cue } from './types';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** "00:01:02.500", "62.5s", "1500ms", "62.5" → segundos. */
function seconds(v: string | undefined): number {
  if (!v) return NaN;
  const t = v.trim();
  if (/^\d+(\.\d+)?ms$/.test(t)) return parseFloat(t) / 1000;
  if (/^\d+(\.\d+)?s$/.test(t)) return parseFloat(t);
  const parts = t.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Lê o TTML que o YouTube entrega. Junta quebras de linha, tira tags e resolve sobreposições. */
export function parseTTML(xml: string): Cue[] {
  const cues: Cue[] = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
    const start = seconds(attr('begin') ?? (attr('t') ? `${attr('t')}ms` : undefined));
    let end = seconds(attr('end'));
    const dur = seconds(attr('dur') ?? (attr('d') ? `${attr('d')}ms` : undefined));
    if (Number.isNaN(end) && !Number.isNaN(dur)) end = start + dur;
    const text = decode(m[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
    if (!text || Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    cues.push({ start, end, text });
  }
  return tidy(cues);
}

/** Ordena, junta repetidas e corta sobreposições (legendas automáticas "rolam" e repetem a linha anterior). */
export function tidy(input: Cue[]): Cue[] {
  const cues = [...input].sort((a, b) => a.start - b.start);
  const out: Cue[] = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    if (prev) {
      // A automática repete a linha de cima: fica só o que é novo
      const prevLines = prev.text.split('\n');
      const lines = c.text.split('\n');
      if (lines.length > 1 && lines[0] === prevLines[prevLines.length - 1]) c.text = lines.slice(1).join('\n');
      if (c.text === prev.text) {
        prev.end = Math.max(prev.end, c.end);
        continue;
      }
      if (prev.end > c.start) prev.end = c.start;
      if (prev.end - prev.start < 0.12) out.pop();
    }
    if (c.text.trim()) out.push({ ...c });
  }
  return out;
}

/**
 * Quebra legendas longas: até [maxChars] por linha e 2 linhas por vez; o tempo é dividido
 * proporcionalmente ao número de letras. Linhas sem quebra explícita são rearranjadas.
 */
export function chunk(cues: Cue[], maxChars = 38, maxLines = 2): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    const words = c.text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      if (!line) line = w;
      else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    const groups: string[][] = [];
    for (let i = 0; i < lines.length; i += maxLines) groups.push(lines.slice(i, i + maxLines));
    const total = groups.reduce((n, g) => n + g.join(' ').length, 0) || 1;
    let t = c.start;
    groups.forEach((g, i) => {
      const share = (c.end - c.start) * (g.join(' ').length / total);
      const end = i === groups.length - 1 ? c.end : t + share;
      out.push({ start: t, end, text: g.join('\n') });
      t = end;
    });
  }
  return out;
}

/** Segmentos do Whisper (t0/t1 em unidades de 10 ms) → legendas, deslocadas por [offset] segundos. */
export function fromWhisper(segments: { text: string; t0: number; t1: number }[], offset = 0): Cue[] {
  return tidy(
    segments
      .map((s) => ({ start: offset + s.t0 / 100, end: offset + s.t1 / 100, text: s.text.replace(/\s+/g, ' ').trim() }))
      // O Whisper às vezes "alucina" marcações em trechos sem fala
      .filter((c) => c.text && !/^[[(].*[\])]$/.test(c.text) && c.end > c.start),
  );
}

/**
 * Leva legendas do tempo do arquivo de origem para o tempo da linha do tempo, para todos os
 * clipes que usam essa origem (cada clipe recorta e acelera o seu trecho).
 */
export function mapToTimeline(cues: Cue[], clips: Clip[], sourceId: string): Cue[] {
  const starts = clipStarts(clips);
  const out: Cue[] = [];
  clips.forEach((c, i) => {
    if (c.sourceId !== sourceId) return;
    const len = clipLength(c);
    for (const q of cues) {
      const a = Math.max(q.start, c.in);
      const b = Math.min(q.end, c.out);
      if (b - a < 0.2) continue;
      const start = starts[i] + (a - c.in) / c.speed;
      const end = Math.min(starts[i] + len, starts[i] + (b - c.in) / c.speed);
      out.push({ start, end, text: q.text });
    }
  });
  return tidy(out);
}

/** Recorta legendas ao trecho [from, to] de um arquivo e começa em zero (envio rápido de trecho). */
export function slice(cues: Cue[], from: number, to: number): Cue[] {
  return cues
    .filter((c) => c.end > from + 0.05 && c.start < to - 0.05)
    .map((c) => ({ start: Math.max(0, c.start - from), end: Math.min(to, c.end) - from, text: c.text }));
}

export function toSrt(cues: Cue[]): string {
  const ts = (t: number) => {
    const ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const r = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}
