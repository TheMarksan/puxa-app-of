import type { VideoInfo } from '../../modules/puxa-engine';

/** Partes da playlist sem nada do aparelho (rodam nos testes): ler links e escolher o áudio. */

/** Redes que viram música: YouTube, Instagram e X (o resto do texto colado fica de fora). */
const SUPPORTED = /^(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|instagram\.com|instagr\.am|x\.com|twitter\.com|t\.co)$/i;

/** Links dentro de um texto colado (um por linha, separados por espaço ou vírgula, ou no meio de uma mensagem). */
export function splitLinks(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    // Pontuação grudada no fim da frase ("…veja https://youtu.be/abc.") e sinais de citação
    const s = raw.trim().replace(/^[<("'“]+/, '').replace(/[>)"'”.!?;:]+$/, '');
    if (!s) continue;
    const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    if (!SUPPORTED.test(host)) continue;
    if (!out.some((o) => sameLink(o, url))) out.push(url);
  }
  return out;
}

/** Mesma música já na lista (pelo link, sem os parâmetros de rastreio). */
export function sameLink(a: string, b: string): boolean {
  const norm = (u: string) => {
    try {
      const x = new URL(u);
      const v = x.searchParams.get('v');
      const host = x.hostname.replace(/^(www|m|music)\./, '');
      if (host === 'youtu.be') return `yt:${x.pathname.slice(1)}`;
      if (v) return `yt:${v}`;
      const shorts = x.pathname.match(/\/shorts\/([\w-]+)/);
      if (shorts) return `yt:${shorts[1]}`;
      return `${host}${x.pathname.replace(/\/$/, '')}${x.hash}`;
    } catch {
      return u;
    }
  };
  return norm(a) === norm(b);
}

/** O que baixar de um vídeo já lido: o melhor M4A, ou o áudio do vídeo da rede social. */
export function audioPlan(info: VideoInfo): { kind: 'youtube'; optionId: string } | { kind: 'direct'; url: string } | null {
  const direct = info.direct;
  if (direct) {
    const a = direct['u:mp3'];
    return a ? { kind: 'direct', url: a.url } : null;
  }
  const m4a = info.options.audio.find((o) => o.id.startsWith('a:'));
  const any = m4a ?? info.options.audio[0];
  return any ? { kind: 'youtube', optionId: any.id } : null;
}
