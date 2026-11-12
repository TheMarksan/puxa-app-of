import { Platform } from 'react-native';

import PuxaEngine from '../../modules/puxa-engine';
import { harvest } from './harvest';
import {
  APP_ID,
  ASBD_ID,
  findMediaPost,
  IG_UA,
  MEDIA_HEADERS,
  parseHighlights,
  parseItem,
  parseMediaPost,
  parseProfileData,
  parseReelPost,
  ROOT,
  shortcodeToPk,
  type IgMedia,
  type IgProfileData,
  type IgReel,
  type IgUser,
} from './instagramParse';
import { jsonsOf } from './json';
import { type SocialKind, type SocialPost, type SocialProfile, SourceError } from './social';

export { IG_LOGIN_UA, IG_UA, parseInstagram } from './instagramParse';

/**
 * Instagram pela rede: a API do site do Instagram com a conta da própria pessoa (login no WebView
 * do app), que só mostra o que essa conta já vê. Sem login, tenta o caminho do site para
 * visitantes, que só vale para posts públicos e às vezes é bloqueado.
 */

const usable = (i: { kind: string; variants: unknown[]; image: string | null }) => (i.kind === 'video' ? i.variants.length > 0 : !!i.image);

// ---------- Rede ----------

/** Cookie do Instagram guardado pelo WebView do login. */
export function igCookie(name: string): string | null {
  if (Platform.OS === 'web') return null;
  let all = '';
  try {
    all = PuxaEngine.webCookies(ROOT) ?? '';
  } catch {
    // WebView do sistema indisponível (atualizando, por exemplo): conta como sem login
    return null;
  }
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(all);
  if (!m || !m[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export const instagramLoggedIn = () => !!igCookie('sessionid');

let wwwClaim = '0';

const LOGIN = 'Entre na sua conta do Instagram pelo Puxa para ver isso. O app só vê o que a sua conta já vê.';

function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: '*/*',
    'User-Agent': IG_UA,
    'X-IG-App-ID': APP_ID,
    'X-ASBD-ID': ASBD_ID,
    'X-IG-WWW-Claim': wwwClaim,
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRFToken': igCookie('csrftoken') ?? '',
    Origin: ROOT,
    Referer: `${ROOT}/`,
    ...extra,
  };
}

type Fetch = typeof fetch;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const claim = res.headers.get('x-ig-set-www-claim');
  if (claim) wwwClaim = claim;
  if (/\/accounts\/login|\/challenge\//.test(res.url)) throw new SourceError('login', LOGIN);
  if (res.status === 429) throw new SourceError('rate', 'O Instagram pediu uma pausa. Espere alguns minutos e tente de novo.');
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (res.status === 404) throw new SourceError('unavailable', 'Não achei isso no Instagram. O link pode ter sido apagado.');
    throw new SourceError(res.status === 401 || res.status === 403 ? 'login' : 'network', res.status === 401 || res.status === 403 ? LOGIN : 'O Instagram não respondeu como esperado. Tente de novo.');
  }
  const message = String(json.message ?? '');
  if (json.require_login || message === 'login_required' || res.status === 401) throw new SourceError('login', LOGIN);
  if (message.includes('checkpoint') || json.checkpoint_url) throw new SourceError('checkpoint', 'O Instagram pediu para confirmar o login. Abra o app do Instagram, confirme e tente de novo.');
  if (/wait a few minutes/i.test(message)) throw new SourceError('rate', 'O Instagram pediu uma pausa. Espere alguns minutos e tente de novo.');
  if (res.status === 404 || message === 'Media not found or unavailable') throw new SourceError('unavailable', 'Não achei isso no Instagram. O link pode ter sido apagado ou a conta é privada.');
  if (!res.ok && json.status === 'fail') throw new SourceError('network', message || 'O Instagram recusou o pedido. Tente de novo.');
  return json;
}

async function api(path: string, f: Fetch = fetch): Promise<Record<string, unknown>> {
  try {
    const res = await f(`${ROOT}/api/v1${path}`, { headers: apiHeaders(), credentials: 'include' });
    return await readJson(res);
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError('network', 'Sem resposta do Instagram. Confira a internet e tente de novo.');
  }
}

/** Caminho do site para visitantes (só posts públicos; às vezes o Instagram bloqueia). */
async function loggedOutMedia(pk: string, link: string, f: Fetch): Promise<IgMedia | null> {
  const page = await f(`${ROOT}/`, { headers: { 'User-Agent': IG_UA, Accept: 'text/html' }, credentials: 'include' }).then((r) => r.text());
  let lsd = /"LSD",\[\],\{"token":"([^"]+)"/.exec(page)?.[1] ?? null;
  if (!lsd) {
    const eqmc = /<script\b[^>]*\bid="__eqmc"[^>]*>(\{[\s\S]*?\})<\/script>/.exec(page)?.[1];
    try {
      lsd = eqmc ? ((JSON.parse(eqmc) as { l?: string }).l ?? null) : null;
    } catch {
      lsd = null;
    }
  }
  if (!lsd) return null;
  await api(`/web/get_ruling_for_content/?content_type=MEDIA&target_id=${pk}`, f).catch(() => null);
  const form: Record<string, string> = {
    lsd,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PolarisLoggedOutDesktopWWWPostRootContentQuery',
    server_timestamps: 'true',
    variables: JSON.stringify({ media_id: pk }),
    doc_id: '27130156389949648',
  };
  const body = Object.entries(form)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await f(`${ROOT}/api/graphql`, {
    method: 'POST',
    headers: apiHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-Friendly-Name': 'PolarisLoggedOutDesktopWWWPostRootContentQuery',
      'X-FB-LSD': lsd,
      Referer: link,
    }),
    body,
    credentials: 'include',
  });
  const json = (await res.json().catch(() => null)) as { data?: { xig_polaris_media?: { if_not_gated_logged_out?: IgMedia } } } | null;
  return json?.data?.xig_polaris_media?.if_not_gated_logged_out ?? null;
}

/** A página pública do post num navegador invisível, sem conta: o que o site carrega para quem visita. */
async function harvestPost(shortcode: string, link: string, kind: SocialKind): Promise<SocialPost | null> {
  const got = await harvest({
    url: `${ROOT}/p/${shortcode}/`,
    pattern: /\/graphql\/query|\/api\/graphql|\/api\/v1\/media\//,
    html: true,
    userAgent: IG_UA,
    enough: (c) => !!findMediaPost(c.flatMap(jsonsOf), shortcode, link, kind),
  });
  return findMediaPost(got.flatMap(jsonsOf), shortcode, link, kind);
}

export async function fetchMedia(shortcode: string, link: string, kind: SocialKind, f: Fetch = fetch): Promise<SocialPost> {
  const pk = shortcodeToPk(shortcode);
  if (instagramLoggedIn()) {
    const json = await api(`/media/${pk}/info/`, f).catch(() => null);
    const m = (json?.items as IgMedia[] | undefined)?.[0];
    if (m) return { ...parseMediaPost(m, link, kind), shortcode };
  }
  // Sem conta: o caminho do site para visitantes e, se ele recusar, a página do post
  const m = await loggedOutMedia(pk, link, f).catch(() => null);
  if (m) return { ...parseMediaPost(m, link, kind), shortcode };
  const page = await harvestPost(shortcode, link, kind).catch(() => null);
  if (page) return page;
  throw new SourceError(
    instagramLoggedIn() ? 'unavailable' : 'ig_blocked',
    instagramLoggedIn() ? 'Não achei esse post. Ele pode ter sido apagado ou a conta é privada.' : 'O Instagram não mostrou este post para visitantes agora. Espere um pouco e tente de novo (ou entre na conta).',
  );
}

export async function fetchUser(username: string, f: Fetch = fetch): Promise<IgUser & { id: string }> {
  try {
    const json = await api(`/users/web_profile_info/?username=${encodeURIComponent(username)}`, f);
    const u = (json.data as { user?: IgUser } | undefined)?.user;
    if (u?.id) return { ...u, id: String(u.id) };
  } catch (e) {
    if (e instanceof SourceError && (e.code === 'rate' || e.code === 'checkpoint')) throw e;
  }
  // Plano B: o id da conta aparece na própria página do perfil
  const html = await f(`${ROOT}/${encodeURIComponent(username)}/`, { headers: { 'User-Agent': IG_UA, Accept: 'text/html' }, credentials: 'include' })
    .then((r) => r.text())
    .catch(() => '');
  const id = /"profile_id":"(\d+)"/.exec(html)?.[1] ?? /"user_id":"(\d+)"/.exec(html)?.[1] ?? /"id":"(\d+)","username":"/.exec(html)?.[1];
  if (!id) throw new SourceError(instagramLoggedIn() ? 'unavailable' : 'login', instagramLoggedIn() ? `Não achei a conta @${username}.` : LOGIN);
  return { id, username };
}

export async function fetchReel(reelId: string, f: Fetch = fetch): Promise<IgReel> {
  const json = await api(`/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`, f);
  const reels = json.reels as Record<string, IgReel> | undefined;
  return reels?.[reelId] ?? (json.reels_media as IgReel[] | undefined)?.[0] ?? { items: [] };
}

export async function fetchStories(link: string, username: string, storyId: string | null, f: Fetch = fetch): Promise<SocialPost> {
  if (!instagramLoggedIn()) throw new SourceError('login', 'Para baixar stories, entre na sua conta do Instagram pelo Puxa. O app só vê o que a sua conta já vê.');
  const user = await fetchUser(username, f);
  const reel = await fetchReel(user.id, f);
  if (!reel.items?.length && user.is_private) throw new SourceError('private', `@${username} tem conta privada: só quem segue vê os stories.`);
  return parseReelPost({ ...reel, user: reel.user ?? user }, { kind: 'story', id: user.id, link, storyId, username });
}

export async function fetchHighlight(link: string, highlightId: string, storyId: string | null, f: Fetch = fetch): Promise<SocialPost> {
  if (!instagramLoggedIn()) throw new SourceError('login', 'Para baixar destaques, entre na sua conta do Instagram pelo Puxa.');
  const reel = await fetchReel(`highlight:${highlightId}`, f);
  return parseReelPost(reel, { kind: 'highlight', id: highlightId, link, storyId });
}

/**
 * Perfil sem precisar de conta: primeiro o pedido que o site faz para quem visita; se o
 * Instagram recusar, a página pública do perfil num navegador invisível. Com login, ainda vêm
 * os stories e os destaques.
 */
export async function fetchProfile(username: string, f: Fetch = fetch): Promise<SocialProfile> {
  let data: IgProfileData | null = null;
  let refused: SourceError | null = null;
  try {
    data = parseProfileData([await api(`/users/web_profile_info/?username=${encodeURIComponent(username)}`, f)], username);
  } catch (e) {
    if (e instanceof SourceError && e.code === 'unavailable') throw new SourceError('unavailable', `Não achei a conta @${username} no Instagram.`);
    refused = e instanceof SourceError ? e : null;
  }
  if (!data || !data.posts.length) {
    const got = await harvest({
      url: `${ROOT}/${encodeURIComponent(username)}/`,
      pattern: /web_profile_info|\/graphql\/query|\/api\/graphql/,
      html: true,
      userAgent: IG_UA,
      enough: (c) => (parseProfileData(c.flatMap(jsonsOf), username)?.posts.length ?? 0) > 0,
    }).catch(() => []);
    const fromPage = parseProfileData(got.flatMap(jsonsOf), username);
    if (fromPage && (!data || fromPage.posts.length)) data = fromPage;
  }
  if (!data) {
    if (instagramLoggedIn()) throw refused ?? new SourceError('network', `Não consegui abrir @${username} agora. Tente de novo em instantes.`);
    // Visita sem conta recusada: a tela oferece entrar na conta como alternativa
    throw new SourceError(
      'ig_blocked',
      refused?.code === 'rate'
        ? 'O Instagram pediu uma pausa nas visitas sem conta. Espere alguns minutos ou entre na conta.'
        : `Não consegui abrir @${username} agora. O Instagram às vezes barra visitas sem conta: tente de novo em instantes ou entre na conta.`,
    );
  }
  const user = data.user;
  const base: SocialProfile = {
    source: 'instagram',
    id: user.id,
    username: user.username ?? username,
    fullName: user.full_name ?? '',
    avatar: user.profile_pic_url_hd ?? user.profile_pic_url ?? '',
    isPrivate: !!user.is_private,
    posts: data.posts,
    stories: null,
    highlights: null,
    headers: MEDIA_HEADERS,
  };
  if (!instagramLoggedIn()) return base;
  const [reel, tray] = await Promise.all([
    fetchReel(user.id, f).catch(() => ({ items: [] }) as IgReel),
    api(`/highlights/${user.id}/highlights_tray/`, f).catch(() => null),
  ]);
  return {
    ...base,
    stories: (reel.items ?? []).map(parseItem).filter(usable),
    highlights: tray ? parseHighlights(tray) : [],
  };
}

/** Post de um perfil que veio sem o link de algum vídeo: busca o post inteiro pelo código. */
export async function completePost(post: SocialPost, f: Fetch = fetch): Promise<SocialPost> {
  if (post.source !== 'instagram' || !post.shortcode || post.items.every((i) => i.kind === 'image' || i.variants.length)) return post;
  return fetchMedia(post.shortcode, post.link, post.kind, f);
}

/** Link curto (instagram.com/share/…): segue o redirecionamento até o link de verdade. */
export async function expandShare(url: string, f: Fetch = fetch): Promise<string> {
  try {
    const res = await f(url, { headers: { 'User-Agent': IG_UA, Accept: 'text/html' }, credentials: 'include' });
    return res.url || url;
  } catch {
    throw new SourceError('network', 'Sem resposta do Instagram. Confira a internet e tente de novo.');
  }
}
