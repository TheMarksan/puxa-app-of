import type { ScribeWord } from './words';

/** Planejamento da dublagem (frases, tempos e o comando de mistura). Sem React Native: roda nos testes. */

export type DubLine = { start: number; end: number; text: string; speaker: number };

export const TARGETS = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'Inglês' },
  { code: 'es', label: 'Espanhol' },
] as const;
export type DubTarget = (typeof TARGETS)[number]['code'];

/** Créditos da ElevenLabs que um trecho costuma gastar (uma letra = um crédito; fala ~14 letras/s). */
export const estimateCredits = (seconds: number) => Math.max(50, Math.round((seconds * 14) / 50) * 50);

/** Palavras → frases para dublar: troca de quem fala, fim de frase, pausa longa ou frase comprida. */
export function sentences(words: ScribeWord[]): DubLine[] {
  const ws = words.filter((w) => w.type === 'word' && w.text.trim());
  const ids = new Map<string, number>();
  const who = (w: ScribeWord) => {
    if (!w.speaker) return 0;
    if (!ids.has(w.speaker)) ids.set(w.speaker, ids.size);
    return ids.get(w.speaker)! % 2;
  };
  const out: DubLine[] = [];
  let cur: ScribeWord[] = [];
  let speaker = 0;
  const join = (list: ScribeWord[]) => list.map((w) => w.text.trim()).join(' ').replace(/\s+([,.!?;:…])/g, '$1');
  const flush = () => {
    if (cur.length) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: join(cur), speaker });
    cur = [];
  };
  for (const w of ws) {
    const s = who(w);
    const prev = cur[cur.length - 1];
    if (prev && (s !== speaker || w.start - prev.end > 0.9 || w.end - cur[0].start > 12 || join(cur).length > 220)) flush();
    if (!cur.length) speaker = s;
    cur.push(w);
    if (/[.!?…]["»”]?$/.test(w.text.trim()) && join(cur).length > 24) flush();
  }
  flush();
  return out;
}

/**
 * Onde cada fala entra e quanto acelera para caber até a próxima (no máximo 1,35x, para não
 * ficar estranho). Se ainda passar, a próxima fala espera esta terminar.
 */
export function fitPlan(lines: { start: number; dur: number }[], total: number): { at: number; speed: number; len: number }[] {
  let prevEnd = -Infinity;
  return lines.map((l, i) => {
    const at = Math.max(l.start, prevEnd + 0.05);
    const nextStart = i + 1 < lines.length ? lines[i + 1].start : total;
    const room = Math.max(0.4, nextStart - at);
    const speed = Math.min(1.35, Math.max(1, l.dur / room));
    const len = l.dur / speed;
    prevEnd = at + len;
    return { at, speed, len };
  });
}

/** Comando do FFmpeg que junta as falas numa faixa só, do tamanho do trecho. */
export function dubMixArgs(clips: { path: string; at: number; speed: number; dur: number }[], total: number, out: string): string[] {
  const args = ['-y', '-v', 'error'];
  clips.forEach((c) => args.push('-i', c.path));
  const parts: string[] = [];
  clips.forEach((c, i) => {
    const delay = Math.round(c.at * 1000);
    const tempo = c.speed > 1.001 ? `,atempo=${c.speed.toFixed(3)}` : '';
    parts.push(`[${i}:a]atrim=0:${c.dur.toFixed(3)},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo${tempo},adelay=${delay}|${delay}[d${i}]`);
  });
  const labels = clips.map((_, i) => `[d${i}]`).join('');
  const mixed = clips.length > 1 ? `${labels}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,` : `${labels}`;
  parts.push(`${mixed}${clips.length > 1 ? '' : 'anull,'}apad,atrim=0:${total.toFixed(3)}[out]`);
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-c:a', 'aac', '-b:a', '160k', out);
  return args;
}

