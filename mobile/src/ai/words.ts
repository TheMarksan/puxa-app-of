import { chunk, tidy } from '../editor/captions';
import type { Cue } from '../editor/types';

/** Palavra da transcrição da ElevenLabs (Scribe). Arquivo sem React Native: roda nos testes. */
export type ScribeWord = { text: string; start: number; end: number; type: 'word' | 'spacing' | 'audio_event'; speaker?: string };

/** Código de 3 letras (como a ElevenLabs devolve) → 2 letras (o tradutor do aparelho). */
const ISO3: Record<string, string> = {
  eng: 'en', por: 'pt', spa: 'es', fra: 'fr', deu: 'de', ita: 'it', jpn: 'ja', kor: 'ko', zho: 'zh', cmn: 'zh', yue: 'zh', rus: 'ru', ara: 'ar',
  hin: 'hi', tur: 'tr', pol: 'pl', nld: 'nl', swe: 'sv', ukr: 'uk', ind: 'id', vie: 'vi', tha: 'th', heb: 'he', ell: 'el', ces: 'cs',
  ron: 'ro', hun: 'hu', dan: 'da', fin: 'fi', nor: 'no', nob: 'no', cat: 'ca', fil: 'tl', tgl: 'tl', msa: 'ms', zsm: 'ms', ben: 'bn',
  urd: 'ur', fas: 'fa', pes: 'fa', tam: 'ta', tel: 'te', mar: 'mr', guj: 'gu', kan: 'kn', mal: 'ml', pan: 'pa', slk: 'sk', slv: 'sl',
  bul: 'bg', hrv: 'hr', srp: 'sr', lit: 'lt', lav: 'lv', est: 'et', glg: 'gl', eus: 'eu', afr: 'af', swa: 'sw', isl: 'is',
};
export const iso1 = (code: string) => {
  const c = code.toLowerCase().split(/[-_]/)[0];
  return ISO3[c] ?? c;
};

/** Palavras da ElevenLabs → legendas: quebra em pausas, fim de frase, troca de quem fala e no tamanho. */
export function fromWords(words: ScribeWord[], offset = 0): Cue[] {
  const ws = words.filter((w) => w.type === 'word' && w.text.trim());
  const cues: Cue[] = [];
  let cur: ScribeWord[] = [];
  const text = (list: ScribeWord[]) => list.map((w) => w.text.trim()).join(' ').replace(/\s+([,.!?;:…])/g, '$1');
  const flush = () => {
    if (cur.length) cues.push({ start: offset + cur[0].start, end: offset + cur[cur.length - 1].end, text: text(cur) });
    cur = [];
  };
  for (const w of ws) {
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end > 0.7 || text([...cur, w]).length > 76 || (w.speaker && prev.speaker && w.speaker !== prev.speaker))) flush();
    cur.push(w);
    if (/[.!?…]["»”]?$/.test(w.text.trim()) && text(cur).length > 14) flush();
  }
  flush();
  return chunk(tidy(cues));
}

