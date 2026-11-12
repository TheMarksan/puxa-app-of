/**
 * Letras: ler o formato LRC (linhas com tempo), tirar do título do vídeo o nome da música e do
 * artista, e escolher o melhor resultado da busca. Sem nada do aparelho (testado no computador).
 */

export type LyricLine = { t: number; text: string };

export type Lyrics = {
  /** Linhas com tempo (letra sincronizada), em ordem. */
  synced: LyricLine[] | null;
  /** Letra sem tempo, quando é só o que existe. */
  plain: string | null;
  instrumental?: boolean;
  /** De onde veio: o banco aberto LRCLIB ou a legenda do próprio vídeo. */
  source: 'lrclib' | 'youtube';
  /** Nome e artista do resultado (para a pessoa conferir se é a música certa). */
  track?: string;
  artist?: string;
};

export type LrclibRecord = {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

/** Lê LRC: "[01:02.50] texto", várias marcas na mesma linha e o ajuste [offset:+500]. */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  let offset = 0;
  for (const raw of lrc.split(/\r?\n/)) {
    const off = /^\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw.trim());
    if (off) {
      offset = Number(off[1]) / 1000;
      continue;
    }
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').trim();
    for (const m of tags) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      // O offset do LRC adianta a letra quando positivo
      const t = Math.max(0, Number(m[1]) * 60 + Number(m[2]) + frac - offset);
      out.push({ t, text });
    }
  }
  out.sort((a, b) => a.t - b.t);
  // Linhas vazias seguidas viram uma pausa só
  return out.filter((l, i) => l.text || (i > 0 && out[i - 1].text));
}

/** Índice da linha que está tocando em [time] (a última que já começou); -1 antes da primeira. */
export function activeLine(lines: LyricLine[], time: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time + 0.15) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

const NOISE =
  /\b(official|oficial|music|musical|video|vídeo|clipe|clip|lyric|lyrics|letra|legendad[oa]|audio|áudio|visuali[sz]er|hd|hq|4k|remaster(ed)?|ao vivo|live|explicit|color coded|mv|m\/v|performance|dance|prod\.?)\b/i;

/** Tira do título do vídeo o nome da música e do artista (para buscar a letra). */
export function cleanTitle(title: string, channel: string): { track: string; artist: string } {
  let t = title
    .replace(/[([【「][^)\]】」]*[)\]】」]/g, (m) => (NOISE.test(m) || /\b(ft|feat|with)\b/i.test(m) ? ' ' : m))
    .replace(/\s*[|•]\s.*$/, '')
    .replace(/#\S+/g, '')
    .replace(/["“”]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  let artist = channel
    .replace(/^@/, '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .replace(/\b(official|oficial|music|tv|channel|canal)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const dash = t.split(/\s+[-–—]\s+/);
  if (dash.length >= 2) {
    artist = dash[0].trim();
    t = dash.slice(1).join(' - ').trim();
  }
  // "feat." fora de parênteses: fica só o artista principal e o nome da música
  t = t.replace(/\s+(ft\.?|feat\.?|featuring)\s+.*$/i, '').trim();
  artist = artist.replace(/\s+(ft\.?|feat\.?|featuring|&|x|e)\s+.*$/i, '').replace(/,.*$/, '').trim();
  // Restos de ruído soltos no fim ("Música - Ao Vivo")
  t = t.replace(/\s+[-–—]\s+(ao vivo|live|acústico|acoustic)$/i, '').trim();
  return { track: t || title.trim(), artist };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019`\u00b4]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Parecido entre dois nomes (0 a 1), pelas palavras em comum. */
export function similarity(a: string, b: string): number {
  const x = new Set(norm(a).split(' ').filter(Boolean));
  const y = new Set(norm(b).split(' ').filter(Boolean));
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.max(x.size, y.size);
}

/**
 * Melhor resultado da busca: com letra, duração perto da do vídeo (clipes têm introdução, então
 * a folga é maior) e nome parecido. Letra sincronizada vale mais que letra sem tempo.
 */
export function pickBest(results: LrclibRecord[], want: { track: string; artist: string; duration: number }): LrclibRecord | null {
  let best: { r: LrclibRecord; score: number } | null = null;
  for (const r of results) {
    if (!r.syncedLyrics && !r.plainLyrics && !r.instrumental) continue;
    const name = similarity(r.trackName, want.track);
    if (name < 0.34) continue;
    const diff = want.duration > 0 ? Math.abs(r.duration - want.duration) : 0;
    if (want.duration > 0 && diff > Math.max(12, want.duration * 0.12)) continue;
    const score = name * 3 + similarity(r.artistName, want.artist) * 2 + (r.syncedLyrics ? 1.5 : 0) - diff / 10;
    if (!best || score > best.score) best = { r, score };
  }
  return best?.r ?? null;
}

/** Resultado do LRCLIB → letra do app. */
export function fromRecord(r: LrclibRecord): Lyrics {
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
  return {
    synced: synced && synced.length ? synced : null,
    plain: r.plainLyrics?.trim() || null,
    instrumental: r.instrumental,
    source: 'lrclib',
    track: r.trackName,
    artist: r.artistName,
  };
}
