import { collect } from './json';
import { type Highlight, type SocialItem, type SocialKind, type SocialPost, SourceError, sortVariants, titleFrom } from './social';

/**
 * Instagram (leitura dos links e das respostas; sem React Native, roda nos testes): posts, reels,
 * carrossel, stories e destaques. Usa a API do site do Instagram com a
 * conta da própria pessoa (login no WebView do app), que só mostra o que essa conta já vê:
 * perfil privado continua privado. Sem login, tenta o caminho do site para visitantes, que só
 * vale para posts públicos e às vezes é bloqueado.
 */

/** Chrome de computador: o Instagram entrega a melhor qualidade de vídeo para ele. */
export const IG_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
/**
 * Chrome de celular, só para a tela de login: com o de computador numa tela estreita, o Instagram
 * mostra o convite "Abrir Instagram" (app para tablet) no lugar do formulário, e o login trava.
 */
export const IG_LOGIN_UA = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
export const ROOT = 'https://www.instagram.com';
export const APP_ID = '936619743392459';
export const ASBD_ID = '359341';
export const MEDIA_HEADERS = { Referer: `${ROOT}/`, 'User-Agent': IG_UA };

// ---------- Links ----------

export type IgLink =
  | { type: 'media'; shortcode: string; kind: SocialKind }
  | { type: 'story'; username: string; storyId: string | null }
  | { type: 'highlight'; highlightId: string; storyId: string | null }
  | { type: 'profile'; username: string }
  | { type: 'share'; url: string };

const RESERVED = new Set([
  'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'about', 'developer', 'legal', 'privacy', 'web', 'api',
  'graphql', 'challenge', 'emails', 'session', 'share', 's', 'tags', 'locations', 'topics', 'directory', 'press', 'blog', 'jobs', 'help',
  'ar', 'lite', 'download', 'qr', 'nametag', 'oauth', 'static', 'push', 'invites', 'your_activity', 'threads',
]);
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;

/** Query de um link sem depender do URLSearchParams (incompleto no React Native). */
export function queryOf(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of search.replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function b64decode(s: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = s.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const ch of clean) {
    value = (value << 6) | chars.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

/** Lê um link do Instagram (ou "@fulano"). null se não for do Instagram. */
export function parseInstagram(input: string): IgLink | null {
  const text = input.trim();
  const at = /^@([A-Za-z0-9._]{1,30})$/.exec(text);
  if (at) return { type: 'profile', username: at[1].toLowerCase() };
  const m = /(?:https?:\/\/)?(?:(?:www|m)\.)?(?:instagram\.com|instagr\.am)(\/[^\s?#]*)?(\?[^\s#]*)?/i.exec(text);
  if (!m) return null;
  const parts = (m[1] ?? '/').split('/').filter(Boolean);
  const query = queryOf(m[2] ?? '');
  if (!parts.length) return null;
  const [a, b, c, d] = parts;
  const media = (kind: string | undefined, code: string | undefined): IgLink | null => {
    if (!kind || !code || !/^[A-Za-z0-9_-]{5,}$/.test(code)) return null;
    const k = kind.toLowerCase();
    if (k === 'p') return { type: 'media', shortcode: code, kind: 'post' };
    if (k === 'reel' || k === 'reels' || k === 'tv') return { type: 'media', shortcode: code, kind: 'reel' };
    return null;
  };
  // /share/… é um link de compartilhar: o código ali não é o do post, precisa seguir o redirecionamento
  if (a === 'share') return { type: 'share', url: m[0].startsWith('http') ? m[0] : `https://${m[0]}` };
  const direct = media(a, b) ?? (c ? media(b, c) : null);
  if (direct) return direct;
  if (a === 'stories') {
    if (b === 'highlights' && c && /^\d+$/.test(c)) return { type: 'highlight', highlightId: c, storyId: d && /^\d+$/.test(d) ? d : null };
    if (b && USERNAME.test(b)) return { type: 'story', username: b.toLowerCase(), storyId: c && /^\d+$/.test(c) ? c : null };
    return null;
  }
  if (a === 's' && b) {
    // Destaque compartilhado: /s/<base64 de "highlight:123">?story_media_id=<pk>_<conta>
    const decoded = b64decode(b);
    const hl = /highlight:(\d+)/.exec(decoded);
    const story = (query.story_media_id ?? '').split('_')[0] || null;
    if (hl) return { type: 'highlight', highlightId: hl[1], storyId: story && /^\d+$/.test(story) ? story : null };
    return { type: 'share', url: m[0].startsWith('http') ? m[0] : `https://${m[0]}` };
  }
  if (USERNAME.test(a) && !RESERVED.has(a.toLowerCase()) && (!b || b === 'reels' || b === 'tagged' || b === 'highlights')) {
    return { type: 'profile', username: a.toLowerCase() };
  }
  return null;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Código do link (/p/CODE) → id numérico da mídia. Post privado tem 28 letras a mais no fim. */
export function shortcodeToPk(code: string): string {
  const c = code.length > 28 ? code.slice(0, -28) : code;
  let n = BigInt(0);
  const base = BigInt(64);
  for (const ch of c) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new SourceError('invalid_url', 'Esse link do Instagram está incompleto.');
    n = n * base + BigInt(i);
  }
  return n.toString();
}

// ---------- Respostas da API → itens ----------

type IgCandidate = { url: string; width?: number; height?: number };
export type IgUser = { pk?: string | number; id?: string; username?: string; full_name?: string; profile_pic_url?: string; profile_pic_url_hd?: string; is_private?: boolean };
export type IgMedia = {
  pk?: string | number;
  id?: string;
  code?: string;
  media_type?: number;
  video_versions?: IgCandidate[];
  image_versions2?: { candidates?: IgCandidate[] };
  carousel_media?: IgMedia[];
  video_duration?: number;
  has_audio?: boolean;
  taken_at?: number;
  original_width?: number;
  original_height?: number;
  caption?: { text?: string } | null;
  user?: IgUser;
  owner?: IgUser;
};

export function parseItem(m: IgMedia): SocialItem {
  const candidates = [...(m.image_versions2?.candidates ?? [])].filter((x) => x?.url).sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  const best = candidates[0];
  // Miniatura: a menor que ainda fica nítida na lista
  const thumb = [...candidates].reverse().find((x) => (x.width ?? 0) >= 240) ?? best;
  const variants = sortVariants((m.video_versions ?? []).filter((v) => v?.url).map((v) => ({ url: v.url, width: v.width ?? 0, height: v.height ?? 0, bitrate: 0 })));
  const video = variants.length > 0 || m.media_type === 2;
  return {
    id: String(m.pk ?? m.id ?? '').split('_')[0] || String(Math.random()).slice(2, 10),
    kind: video ? 'video' : 'image',
    thumbnail: thumb?.url ?? '',
    duration: video ? Number(m.video_duration) || 0 : 0,
    width: m.original_width ?? best?.width ?? variants[0]?.width ?? 0,
    height: m.original_height ?? best?.height ?? variants[0]?.height ?? 0,
    variants,
    image: video ? null : (best?.url ?? null),
    hasAudio: video && m.has_audio !== false,
    takenAt: m.taken_at ?? null,
  };
}

const usable = (i: SocialItem) => (i.kind === 'video' ? i.variants.length > 0 : !!i.image);

export function parseMediaPost(m: IgMedia, link: string, kind: SocialKind): SocialPost {
  const items = (m.carousel_media?.length ? m.carousel_media : [m]).map(parseItem).filter(usable);
  if (!items.length) throw new SourceError('empty', 'Este post não tem vídeo nem foto para baixar.');
  const user = m.user ?? m.owner ?? {};
  const author = user.username ?? 'instagram';
  const isReel = kind === 'reel' || (items.length === 1 && items[0].kind === 'video' && kind !== 'post');
  return {
    source: 'instagram',
    kind: isReel ? 'reel' : 'post',
    id: String(m.pk ?? m.id ?? m.code ?? '').split('_')[0],
    link,
    title: titleFrom(m.caption?.text, `${isReel ? 'Reel' : 'Post'} de @${author}`),
    author,
    authorName: user.full_name ?? '',
    avatar: user.profile_pic_url ?? null,
    items,
    initial: 0,
    headers: MEDIA_HEADERS,
  };
}

export type IgReel = { id?: string; title?: string; items?: IgMedia[]; user?: IgUser };

/** Stories (ou um destaque) → post com um item por story, do mais antigo ao mais novo. */
export function parseReelPost(reel: IgReel, opts: { kind: 'story' | 'highlight'; id: string; link: string; storyId: string | null; username?: string }): SocialPost {
  const items = (reel.items ?? []).map(parseItem).filter(usable);
  const user = reel.user ?? {};
  const author = user.username ?? opts.username ?? 'instagram';
  if (!items.length) {
    throw new SourceError(
      'empty',
      opts.kind === 'story' ? `@${author} não tem stories no ar agora. Eles ficam 24 horas.` : 'Este destaque não tem nada que dê para baixar.',
    );
  }
  const found = opts.storyId ? items.findIndex((i) => i.id === opts.storyId) : -1;
  return {
    source: 'instagram',
    kind: opts.kind,
    id: opts.id,
    link: opts.link,
    title: opts.kind === 'highlight' ? titleFrom(reel.title, `Destaque de @${author}`) : `Story de @${author}`,
    author,
    authorName: user.full_name ?? '',
    avatar: user.profile_pic_url ?? null,
    items,
    initial: Math.max(0, found),
    headers: MEDIA_HEADERS,
  };
}

export function parseHighlights(tray: unknown): Highlight[] {
  const list = (tray as { tray?: unknown[] })?.tray ?? [];
  return list
    .map((h) => h as { id?: string | number; title?: string; media_count?: number; cover_media?: { cropped_image_version?: { url?: string }; full_image_version?: { url?: string } } })
    .map((h) => ({
      id: String(h.id ?? '').replace(/^highlight:/, ''),
      title: h.title ?? '',
      cover: h.cover_media?.cropped_image_version?.url ?? h.cover_media?.full_image_version?.url ?? '',
      count: h.media_count ?? 0,
    }))
    .filter((h) => /^\d+$/.test(h.id));
}


// ---------- Perfil sem login ----------

/** Post no formato do site para visitantes (GraphQL antigo): é o que o perfil público devolve. */
export type IgNode = {
  __typename?: string;
  id?: string;
  shortcode?: string;
  is_video?: boolean;
  display_url?: string;
  thumbnail_src?: string;
  thumbnail_resources?: { src: string; config_width: number }[];
  video_url?: string;
  video_duration?: number;
  dimensions?: { width?: number; height?: number };
  taken_at_timestamp?: number;
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  edge_sidecar_to_children?: { edges?: { node?: IgNode }[] };
  owner?: IgUser;
};

export function legacyItem(n: IgNode): SocialItem {
  const video = !!n.is_video || /Video/.test(n.__typename ?? '');
  const w = n.dimensions?.width ?? 0;
  const h = n.dimensions?.height ?? 0;
  const thumb = [...(n.thumbnail_resources ?? [])].sort((a, b) => a.config_width - b.config_width).find((t) => t.config_width >= 240)?.src ?? n.thumbnail_src ?? n.display_url ?? '';
  return {
    id: String(n.id ?? n.shortcode ?? ''),
    kind: video ? 'video' : 'image',
    thumbnail: thumb,
    duration: video ? Number(n.video_duration) || 0 : 0,
    width: w,
    height: h,
    variants: video && n.video_url ? [{ url: n.video_url, width: w, height: h, bitrate: 0 }] : [],
    image: video ? null : (n.display_url ?? null),
    hasAudio: video,
    takenAt: n.taken_at_timestamp ?? null,
  };
}

export const postLink = (code: string, reel: boolean) => `${ROOT}/${reel ? 'reel' : 'p'}/${code}/`;

export function legacyPost(n: IgNode, owner: IgUser): SocialPost {
  const children = (n.edge_sidecar_to_children?.edges ?? []).map((e) => e.node).filter((x): x is IgNode => !!x);
  // Os itens de um carrossel não trazem a data: vale a do post.
  const items = (children.length ? children : [n]).map((c) => {
    const it = legacyItem(c);
    return it.takenAt == null ? { ...it, takenAt: n.taken_at_timestamp ?? null } : it;
  });
  const author = owner.username ?? n.owner?.username ?? 'instagram';
  const reel = items.length === 1 && items[0].kind === 'video';
  const code = n.shortcode ?? '';
  return {
    source: 'instagram',
    kind: reel ? 'reel' : 'post',
    id: String(n.id ?? code),
    link: code ? postLink(code, reel) : '',
    title: titleFrom(n.edge_media_to_caption?.edges?.[0]?.node?.text, `${reel ? 'Reel' : 'Post'} de @${author}`),
    author,
    authorName: owner.full_name ?? '',
    avatar: owner.profile_pic_url ?? null,
    items,
    initial: 0,
    headers: MEDIA_HEADERS,
    shortcode: code || undefined,
  };
}

/** Publicação da grade nova do perfil para visitantes (só capa, código e tipo). */
export type IgPolarisNode = {
  __typename?: string;
  pk?: string;
  id?: string;
  code?: string;
  caption?: { text?: string } | null;
  display_uri?: string;
  media_type?: number;
  product_type?: string;
  accessibility_caption?: string | null;
  user?: IgUser;
};

/**
 * Grade do perfil sem conta (polaris_ordered_timeline_connection): vem só a capa de cada
 * publicação. Fica marcada como parcial, e abrir uma busca o post inteiro pelo código.
 */
export function polarisPost(n: IgPolarisNode, owner: IgUser): SocialPost | null {
  const code = n.code;
  if (!code || !n.display_uri) return null;
  const video = n.media_type === 2 || /Video/.test(n.__typename ?? '');
  const carousel = n.media_type === 8 || /Carousel/.test(n.__typename ?? '');
  const reel = video && !carousel;
  const author = owner.username ?? n.user?.username ?? 'instagram';
  const item: SocialItem = {
    id: String(n.pk ?? code),
    kind: reel ? 'video' : 'image',
    thumbnail: n.display_uri,
    duration: 0,
    width: 0,
    height: 0,
    variants: [],
    image: reel ? null : n.display_uri,
    hasAudio: reel,
    takenAt: null,
  };
  return {
    source: 'instagram',
    kind: reel ? 'reel' : 'post',
    id: String(n.pk ?? code),
    link: postLink(code, reel),
    title: titleFrom(n.caption?.text, `${reel ? 'Reel' : 'Post'} de @${author}`),
    author,
    authorName: owner.full_name ?? '',
    avatar: owner.profile_pic_url ?? null,
    items: [item],
    initial: 0,
    headers: MEDIA_HEADERS,
    shortcode: code,
    partial: true,
  };
}

export type IgProfileData = { user: IgUser & { id: string }; posts: SocialPost[] };

const sameName = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

/**
 * Perfil a partir do que o Instagram devolver: a API do perfil (web_profile_info), a linha do
 * tempo nova (xdt_api…user_timeline) ou os dados dentro da página. null se não achou a conta.
 */
export function parseProfileData(jsons: unknown[], username: string): IgProfileData | null {
  let user: (IgUser & { id: string }) | null = null;
  const posts: SocialPost[] = [];
  const seen = new Set<string>();
  const add = (p: SocialPost) => {
    const k = p.shortcode ?? p.id;
    if (!p.items.length || seen.has(k)) return;
    seen.add(k);
    posts.push(p);
  };
  for (const j of jsons) {
    const users = collect(j, (o) => sameName(o.username, username) && (o.id != null || o.pk != null) && ('edge_owner_to_timeline_media' in o || 'profile_pic_url' in o || 'full_name' in o));
    const main = users.find((u) => 'edge_owner_to_timeline_media' in u) ?? users[0];
    // pk é o número da conta (o que stories e destaques pedem); id às vezes é outro identificador
    if (main && !user) user = { ...(main as IgUser), id: String(main.pk ?? main.id) };
    for (const u of users) {
      const edges = (u.edge_owner_to_timeline_media as { edges?: { node?: IgNode }[] } | undefined)?.edges ?? [];
      for (const e of edges) if (e.node) add(legacyPost(e.node, u as IgUser));
    }
    for (const c of collect(j, (o) => 'xdt_api__v1__feed__user_timeline_graphql_connection' in o)) {
      const edges = (c.xdt_api__v1__feed__user_timeline_graphql_connection as { edges?: { node?: IgMedia }[] } | undefined)?.edges ?? [];
      for (const e of edges) {
        const m = e.node;
        if (!m) continue;
        if (!user && m.user && sameName(m.user.username, username) && (m.user.pk ?? m.user.id) != null) user = { ...m.user, id: String(m.user.pk ?? m.user.id) };
        try {
          const p = parseMediaPost(m, m.code ? postLink(m.code, (m.media_type === 2 && !m.carousel_media) || false) : '', 'post');
          add({ ...p, shortcode: m.code });
        } catch {
          // post sem mídia que dê para baixar
        }
      }
    }
  }
  // Grade nova do perfil para visitantes: só capas, na ordem do perfil (os fixados primeiro)
  for (const j of jsons) {
    for (const c of collect(j, (o) => 'polaris_ordered_timeline_connection' in o)) {
      if (!user && sameName(c.username, username) && (c.pk ?? c.id) != null) user = { ...(c as IgUser), id: String(c.pk ?? c.id) };
      const edges = (c.polaris_ordered_timeline_connection as { edges?: { node?: IgPolarisNode }[] } | undefined)?.edges ?? [];
      for (const e of edges) {
        if (!e.node || (e.node.user?.username && !sameName(e.node.user.username, username))) continue;
        const p = polarisPost(e.node, user ?? { username });
        if (p) add(p);
      }
    }
  }
  if (!user) return null;
  // As datas só vêm nos formatos completos; sem data, fica a ordem em que o Instagram mostrou
  if (posts.every((p) => p.items[0]?.takenAt != null)) posts.sort((a, b) => (b.items[0]?.takenAt ?? 0) - (a.items[0]?.takenAt ?? 0));
  return { user, posts };
}

/** Um post (pelo código) dentro do que a página do post devolveu. */
export function findMediaPost(jsons: unknown[], shortcode: string, link: string, kind: SocialKind): SocialPost | null {
  for (const j of jsons) {
    const api = collect(j, (o) => o.code === shortcode && ('video_versions' in o || 'image_versions2' in o || 'carousel_media' in o), 5)[0];
    if (api) {
      try {
        return { ...parseMediaPost(api as IgMedia, link, kind), shortcode };
      } catch {
        // sem mídia
      }
    }
    const legacy = collect(j, (o) => o.shortcode === shortcode && ('display_url' in o || 'video_url' in o), 5)[0];
    if (legacy) return legacyPost(legacy as IgNode, ((legacy as IgNode).owner ?? {}) as IgUser);
  }
  return null;
}
