import { sameLink } from './playlist/links';

/**
 * Os últimos links puxados. Ficam só no aparelho e servem para a pessoa voltar a um vídeo com um
 * toque, sem procurar o link de novo. Dá para apagar um por um ou todos de uma vez. Esta parte
 * é só a lista (sem gravar nada), para dar para testar.
 */
export type Recent = {
  /** O que foi colado. */
  link: string;
  title: string;
  /** Canal ou @ da conta. */
  by: string;
  thumbnail: string | null;
  source: 'youtube' | 'instagram' | 'x';
  at: number;
};

export const MAX_RECENTS = 12;

const withScheme = (link: string) => {
  const t = link.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

/** Dois links levam ao mesmo vídeo (youtu.be e watch?v=, sem rastreio, sem barra no fim). */
export const sameRecent = (a: string, b: string) => sameLink(withScheme(a), withScheme(b));

/** Põe um link no começo da lista; se já estava, sobe para o começo sem repetir. */
export function pushRecent(list: Recent[], item: Recent, max = MAX_RECENTS): Recent[] {
  return [item, ...list.filter((r) => !sameRecent(r.link, item.link))].slice(0, max);
}

/** Lê o que estava gravado, descartando o que não tem a forma certa. */
export function parseRecents(raw: string | null | undefined): Recent[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Recent[];
    if (!Array.isArray(list)) return [];
    return list.filter((r) => r && typeof r.link === 'string' && typeof r.title === 'string').slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}
