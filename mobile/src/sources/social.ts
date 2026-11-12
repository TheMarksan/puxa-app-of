import type { QualityOption, VideoInfo } from '../../modules/puxa-engine';

/**
 * Links do Instagram e do X. Ao contrário do YouTube, a mídia vem pronta (MP4 com som ou foto):
 * o app lê o link, mostra as opções e baixa o arquivo direto do servidor da rede.
 */

export type SocialSource = 'instagram' | 'x';

export type SocialVariant = { url: string; width: number; height: number; bitrate: number };

export type SocialItem = {
  id: string;
  kind: 'video' | 'image';
  thumbnail: string;
  /** Segundos (0 em fotos e quando a rede não informa). */
  duration: number;
  width: number;
  height: number;
  /** Vídeo: versões do maior para o menor. */
  variants: SocialVariant[];
  /** Foto: a maior. */
  image: string | null;
  hasAudio: boolean;
  /** Quando foi publicado (segundos desde 1970), se a rede informa. */
  takenAt: number | null;
};

export type SocialKind = 'post' | 'reel' | 'story' | 'highlight' | 'tweet';

export type SocialPost = {
  source: SocialSource;
  kind: SocialKind;
  id: string;
  link: string;
  /** Primeira linha da legenda, ou "Story de @fulano". */
  title: string;
  /** @ da conta, sem o arroba. */
  author: string;
  authorName: string;
  avatar: string | null;
  items: SocialItem[];
  /** O item que o link aponta (um story específico, a 2ª foto de um post). */
  initial: number;
  /** Cabeçalhos para baixar a mídia. */
  headers: Record<string, string>;
  /** Instagram: código do post, para buscar o post inteiro quando a lista do perfil veio incompleta. */
  shortcode?: string;
  /** A lista do perfil só trouxe a capa (perfil visto sem conta): abrir busca o post inteiro. */
  partial?: boolean;
};

/** Já dá para baixar tudo o que o post mostra (sem precisar buscar o post inteiro). */
export const isComplete = (p: SocialPost) => !p.partial && p.items.every((i) => i.kind === 'image' || i.variants.length > 0);

export type Highlight = { id: string; title: string; cover: string; count: number };

/**
 * Perfil do Instagram ou do X. As publicações recentes com mídia vêm sem login (o que a rede
 * mostra para quem visita sem conta). Stories e destaques só existem no Instagram e pedem login.
 */
export type SocialProfile = {
  source: SocialSource;
  id: string;
  username: string;
  fullName: string;
  avatar: string;
  isPrivate: boolean;
  /** Publicações recentes com foto ou vídeo, da mais nova para a mais antiga. */
  posts: SocialPost[];
  /** Stories de agora; null quando é preciso entrar na conta para ver (ou no X, que não tem). */
  stories: SocialItem[] | null;
  highlights: Highlight[] | null;
  headers: Record<string, string>;
};

/** Nome antigo (só Instagram). */
export type InstagramProfile = SocialProfile;

/** Erro com código: "login" pede a conta do Instagram; os outros só explicam. */
export class SourceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const NAMES: Record<SocialSource, string> = { instagram: 'Instagram', x: 'X' };

const shortSide = (v: { width: number; height: number }) => Math.min(v.width || v.height, v.height || v.width);

/** Legenda → título curto: primeira linha, sem links nem hashtags soltas no fim. */
export function titleFrom(text: string | null | undefined, fallback: string): string {
  const line = (text ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.replace(/[#@]\S+/g, '').trim().length > 0);
  if (!line) return fallback;
  return line.length > 90 ? `${line.slice(0, 88).trimEnd()}…` : line;
}

/** Junta versões repetidas e ordena da maior para a menor. */
export function sortVariants(list: SocialVariant[]): SocialVariant[] {
  const seen = new Set<string>();
  return list
    .filter((v) => v.url && !seen.has(v.url) && seen.add(v.url))
    .sort((a, b) => b.width * b.height - a.width * a.height || b.bitrate - a.bitrate);
}

/**
 * Um item (vídeo ou foto) no formato que o resto do app usa. As opções têm ids "u:…" e o link
 * direto de cada uma vai em [direct].
 */
export function itemInfo(post: SocialPost, index: number): VideoInfo {
  const it = post.items[Math.max(0, Math.min(post.items.length - 1, index))];
  const id = `${post.source}-${post.id}-${it.id}`;
  const many = post.items.length > 1;
  const title = many ? `${post.title} (${index + 1} de ${post.items.length})` : post.title;
  const base = {
    id,
    title,
    channel: `@${post.author}`,
    duration: it.duration,
    viewCount: null,
    uploadDate: it.takenAt ? new Date(it.takenAt * 1000).toISOString().slice(0, 10) : null,
    thumbnail: it.thumbnail,
    chapters: [],
    captions: [],
    source: post.source,
    link: post.link,
    headers: post.headers,
  };
  if (it.kind === 'image') {
    const image: QualityOption[] = [{ id: 'u:img', label: it.width && it.height ? `${it.width}×${it.height}` : 'Foto', note: 'Original', size: null }];
    return { ...base, image: true, options: { audio: [], video: [], image }, direct: { 'u:img': { url: it.image ?? it.thumbnail, kind: 'image' } } };
  }
  const direct: NonNullable<VideoInfo['direct']> = {};
  const video: QualityOption[] = it.variants.map((v, i) => {
    direct[`u:v${i}`] = { url: v.url, kind: 'video' };
    const side = shortSide(v);
    return {
      id: `u:v${i}`,
      label: side ? `${side}p` : i === 0 ? 'Original' : 'Menor',
      note: i === 0 ? 'Original' : side >= 700 ? 'HD' : side >= 460 ? 'SD' : 'Baixa',
      size: v.bitrate && it.duration ? Math.round(((v.bitrate + 128_000) / 8) * it.duration) : null,
    };
  });
  const audio: QualityOption[] = [];
  if (it.hasAudio && it.variants.length) {
    direct['u:mp3'] = { url: it.variants[0].url, kind: 'audio' };
    audio.push({ id: 'u:mp3', label: 'MP3 192 kbps', note: 'Toca em tudo', size: it.duration ? Math.round((it.duration * 192_000) / 8) : null });
  }
  return { ...base, options: { audio, video }, direct };
}
