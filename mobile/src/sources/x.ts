import { collect } from './json';
import { type SocialItem, type SocialPost, type SocialProfile, SourceError, sortVariants, titleFrom } from './social';

/**
 * X (Twitter): vídeos, GIFs e fotos de posts e perfis públicos, sem login. Post: primeiro o
 * endpoint dos posts incorporados em sites (o mesmo que o yt-dlp usa como reserva); se falhar,
 * a API do site com a chave de visitante. Perfil: a API do site como visitante (o que o X mostra
 * para quem não tem conta). Conta protegida continua protegida.
 */

export type XLink = { type: 'status'; id: string; index: number | null } | { type: 'short'; url: string } | { type: 'profile'; username: string };

const X_RESERVED = new Set([
  'home', 'explore', 'i', 'search', 'settings', 'notifications', 'messages', 'compose', 'login', 'logout', 'signup', 'tos', 'privacy',
  'hashtag', 'intent', 'share', 'jobs', 'about', 'help', 'download', 'premium', 'verified', 'account', 'lists', 'bookmarks', 'communities',
]);

export function parseX(input: string): XLink | null {
  const text = input.trim();
  const m =
    /(?:https?:\/\/)?(?:(?:www|mobile|m)\.)?(?:twitter|x|fxtwitter|vxtwitter|fixupx|fixvx|twittpr|nitter\.[a-z]+)\.(?:com|net|poast\.org|privacydev\.net)\/(?:[A-Za-z0-9_]{1,30}|i(?:\/web)?)\/status(?:es)?\/(\d{5,25})(?:\/(?:photo|video)\/(\d))?/i.exec(
      text,
    );
  if (m) return { type: 'status', id: m[1], index: m[2] ? Math.max(0, Number(m[2]) - 1) : null };
  const short = /(?:https?:\/\/)?t\.co\/[A-Za-z0-9]{4,}/i.exec(text);
  if (short) return { type: 'short', url: short[0].startsWith('http') ? short[0] : `https://${short[0]}` };
  const profile = /(?:https?:\/\/)?(?:(?:www|mobile|m)\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?(?:media|with_replies)?\/?(?:[?#]|$|\s)/i.exec(text);
  if (profile && !X_RESERVED.has(profile[1].toLowerCase())) return { type: 'profile', username: profile[1] };
  return null;
}

/** Token do endpoint de incorporação: ((id / 1e15) * π) em base 36, sem zeros e sem ponto. */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

type XVariant = { url?: string; bitrate?: number; content_type?: string };
export type XMedia = {
  type?: string;
  media_url_https?: string;
  original_info?: { width?: number; height?: number };
  video_info?: { duration_millis?: number; aspect_ratio?: number[]; variants?: XVariant[] };
  id_str?: string;
  media_key?: string;
};
type XUser = { screen_name?: string; name?: string; profile_image_url_https?: string };

const size = (url: string) => {
  const m = /\/(\d{2,5})x(\d{2,5})\//.exec(url);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
};

export function parseXMedia(md: XMedia, i: number): SocialItem | null {
  const thumb = md.media_url_https ?? '';
  const w = md.original_info?.width ?? 0;
  const h = md.original_info?.height ?? 0;
  const id = md.id_str ?? md.media_key ?? String(i);
  if (md.type === 'photo') {
    if (!thumb) return null;
    const base = thumb.replace(/\.(jpg|png|webp)$/i, '');
    const fmt = /\.(png|webp)$/i.exec(thumb)?.[1] ?? 'jpg';
    return {
      id,
      kind: 'image',
      thumbnail: `${base}?format=${fmt}&name=small`,
      duration: 0,
      width: w,
      height: h,
      variants: [],
      image: `${base}?format=${fmt}&name=orig`,
      hasAudio: false,
      takenAt: null,
    };
  }
  const variants = sortVariants(
    (md.video_info?.variants ?? [])
      .filter((v) => v.url && (v.content_type === 'video/mp4' || /\.mp4(\?|$)/.test(v.url)))
      .map((v) => {
        const s = size(v.url!) ?? { width: w, height: h };
        return { url: v.url!, width: s.width, height: s.height, bitrate: v.bitrate ?? 0 };
      }),
  );
  if (!variants.length) return null;
  return {
    id,
    kind: 'video',
    thumbnail: thumb ? `${thumb}?name=small` : '',
    duration: (md.video_info?.duration_millis ?? 0) / 1000,
    width: w || variants[0].width,
    height: h || variants[0].height,
    variants,
    image: null,
    // GIF do X é um MP4 sem som
    hasAudio: md.type !== 'animated_gif',
    takenAt: null,
  };
}

function toPost(id: string, link: string, index: number | null, text: string | undefined, user: XUser, media: XMedia[], created?: string): SocialPost {
  const items = media.map(parseXMedia).filter((x): x is SocialItem => !!x);
  if (!items.length) throw new SourceError('empty', 'Este post do X não tem vídeo nem foto.');
  const t = created ? Math.floor(Date.parse(created) / 1000) : NaN;
  if (!Number.isNaN(t)) items.forEach((it) => (it.takenAt = t));
  const author = user.screen_name ?? 'x';
  return {
    source: 'x',
    kind: 'tweet',
    id,
    link,
    title: titleFrom(text, `Post de @${author}`),
    author,
    authorName: user.name ?? '',
    avatar: user.profile_image_url_https ?? null,
    items,
    initial: index != null ? Math.min(items.length - 1, index) : 0,
    headers: {},
  };
}

type Syndication = {
  __typename?: string;
  text?: string;
  created_at?: string;
  user?: XUser;
  mediaDetails?: XMedia[];
  quoted_tweet?: { mediaDetails?: XMedia[] };
  tombstone?: unknown;
};

export function parseSyndication(j: Syndication, id: string, link: string, index: number | null): SocialPost {
  if (!j || j.__typename === 'TweetTombstone' || j.tombstone) throw new SourceError('unavailable', 'Este post do X não está disponível. Pode ter sido apagado ou ser de conta protegida.');
  const media = [...(j.mediaDetails ?? []), ...(j.mediaDetails?.length ? [] : (j.quoted_tweet?.mediaDetails ?? []))];
  return toPost(id, link, index, j.text, j.user ?? {}, media, j.created_at);
}

type GqlResult = {
  __typename?: string;
  reason?: string;
  tombstone?: unknown;
  tweet?: GqlResult;
  legacy?: { full_text?: string; created_at?: string; extended_entities?: { media?: XMedia[] } };
  core?: { user_results?: { result?: { legacy?: XUser; core?: { screen_name?: string; name?: string }; avatar?: { image_url?: string } } } };
  quoted_status_result?: { result?: GqlResult };
};

export function parseGraphql(data: { tweetResult?: { result?: GqlResult } } | undefined, id: string, link: string, index: number | null): SocialPost {
  let r = data?.tweetResult?.result;
  if (!r || r.tombstone) throw new SourceError('unavailable', 'Este post do X não está disponível. Pode ter sido apagado ou ser de conta protegida.');
  if (r.__typename === 'TweetUnavailable') {
    throw new SourceError(
      r.reason === 'Protected' ? 'private' : 'unavailable',
      r.reason === 'Protected' ? 'Este post é de uma conta protegida do X.' : /Nsfw/.test(r.reason ?? '') ? 'O X só mostra este post para quem entra na conta.' : 'Este post do X não está disponível.',
    );
  }
  if (r.__typename === 'TweetWithVisibilityResults' && r.tweet) r = r.tweet;
  const u = r.core?.user_results?.result;
  const user: XUser = {
    screen_name: u?.core?.screen_name ?? u?.legacy?.screen_name,
    name: u?.core?.name ?? u?.legacy?.name,
    profile_image_url_https: u?.avatar?.image_url ?? u?.legacy?.profile_image_url_https,
  };
  let media = r.legacy?.extended_entities?.media ?? [];
  if (!media.length) media = r.quoted_status_result?.result?.legacy?.extended_entities?.media ?? [];
  return toPost(id, link, index, r.legacy?.full_text, user, media, r.legacy?.created_at);
}

const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

/** Opções que a API do site pede junto (as mesmas do gallery-dl de 2026). */
const FEATURES = {
  rweb_video_screen_enabled: false,
  payments_enabled: false,
  rweb_xchat_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_enhance_cards_enabled: false,
};

const USER_FEATURES = {
  hidden_profile_subscriptions_enabled: true,
  payments_enabled: false,
  rweb_xchat_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
};

type Fetch = typeof fetch;

async function viaSyndication(id: string, link: string, index: number | null, f: Fetch): Promise<SocialPost> {
  const res = await f(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}&lang=en`, { headers: { 'User-Agent': 'Googlebot', Accept: 'application/json' } });
  if (res.status === 404) throw new SourceError('unavailable', 'Este post do X não está disponível. Pode ter sido apagado ou ser de conta protegida.');
  if (!res.ok) throw new SourceError('network', `O X respondeu com erro ${res.status}.`);
  const text = await res.text();
  if (!text.trim()) throw new SourceError('unavailable', 'O X não entregou este post.');
  return parseSyndication(JSON.parse(text) as Syndication, id, link, index);
}

let guest: { token: string; at: number } | null = null;

/** Chave de visitante do X (vale por um tempo; o app guarda e reaproveita). */
async function guestToken(f: Fetch, fresh = false): Promise<string> {
  if (!fresh && guest && Date.now() - guest.at < 50 * 60_000) return guest.token;
  const r = (await f('https://api.x.com/1.1/guest/activate.json', { method: 'POST', headers: { Authorization: `Bearer ${BEARER}`, 'User-Agent': UA }, credentials: 'omit' }).then((x) => x.json())) as { guest_token?: string };
  if (!r.guest_token) throw new SourceError('network', 'O X não liberou o acesso de visitante agora.');
  guest = { token: r.guest_token, at: Date.now() };
  return r.guest_token;
}

/** Pedido à API do site como visitante (sem conta, sem cookies). */
async function gql(f: Fetch, path: string, variables: unknown, features: unknown, toggles?: unknown): Promise<unknown> {
  const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));
  const url = `https://x.com/i/api/graphql/${path}?variables=${q(variables)}&features=${q(features)}${toggles ? `&fieldToggles=${q(toggles)}` : ''}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await guestToken(f, attempt > 0);
    const res = await f(url, {
      headers: {
        Authorization: `Bearer ${BEARER}`,
        'User-Agent': UA,
        'x-guest-token': token,
        'x-twitter-client-language': 'en',
        'x-twitter-active-user': 'yes',
        'Content-Type': 'application/json',
        Accept: '*/*',
        Referer: 'https://x.com/',
      },
      credentials: 'omit',
    });
    if (res.status === 429) throw new SourceError('rate', 'O X limitou os pedidos agora. Espere um pouco e tente de novo.');
    // Chave de visitante vencida: pega outra e tenta de novo
    if (res.status === 401 || res.status === 403) continue;
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new SourceError('network', `O X respondeu com erro ${res.status}.`);
    }
  }
  throw new SourceError('blocked', 'O X não liberou o acesso de visitante agora.');
}

async function viaGraphql(id: string, link: string, index: number | null, f: Fetch): Promise<SocialPost> {
  const { rweb_video_screen_enabled: _omit, ...features } = FEATURES;
  const json = (await gql(f, 'qxWQxcMLiTPcavz9Qy5hwQ/TweetResultByRestId', { tweetId: id, withCommunity: false, includePromotedContent: false, withVoice: false }, features, {
    withArticleRichContentState: true,
    withArticlePlainText: false,
    withGrokAnalyze: false,
    withDisallowedReplyControls: false,
  })) as { data?: { tweetResult?: { result?: GqlResult } } };
  return parseGraphql(json.data, id, link, index);
}

export async function fetchTweet(id: string, link: string, index: number | null, f: Fetch = fetch): Promise<SocialPost> {
  let first: unknown = null;
  try {
    return await viaSyndication(id, link, index, f);
  } catch (e) {
    first = e;
  }
  try {
    return await viaGraphql(id, link, index, f);
  } catch (e) {
    // O erro mais útil: "apagado/protegido" de qualquer um dos dois; senão o primeiro
    for (const err of [e, first]) if (err instanceof SourceError && err.code !== 'network') throw err;
    if (first instanceof SourceError) throw first;
    throw new SourceError('network', 'Sem resposta do X. Confira a internet e tente de novo.');
  }
}

// ---------- Perfil sem login ----------

type XUserResult = {
  __typename?: string;
  rest_id?: string;
  core?: { screen_name?: string; name?: string };
  legacy?: { screen_name?: string; name?: string; profile_image_url_https?: string; protected?: boolean };
  avatar?: { image_url?: string };
  privacy?: { protected?: boolean };
};

export type XAccount = { id: string; username: string; fullName: string; avatar: string; isPrivate: boolean };

const screenName = (u: XUserResult) => u.core?.screen_name ?? u.legacy?.screen_name;

/** A conta (@) dentro de qualquer resposta da API do site. */
export function parseXUser(jsons: unknown[], username: string): XAccount | null {
  for (const j of jsons) {
    const hit = collect(j, (o) => o.__typename === 'User' && typeof o.rest_id === 'string' && (screenName(o as XUserResult) ?? '').toLowerCase() === username.toLowerCase(), 3)[0] as XUserResult | undefined;
    if (hit?.rest_id) {
      return {
        id: hit.rest_id,
        username: screenName(hit) ?? username,
        fullName: hit.core?.name ?? hit.legacy?.name ?? '',
        avatar: (hit.avatar?.image_url ?? hit.legacy?.profile_image_url_https ?? '').replace('_normal.', '_200x200.'),
        isPrivate: !!(hit.privacy?.protected ?? hit.legacy?.protected),
      };
    }
  }
  return null;
}

/**
 * Posts com mídia de uma linha do tempo (aba Mídia ou Posts), do mais novo ao mais antigo, sem
 * repostagens (a mídia delas é de outra conta).
 */
export function parseXTimeline(jsons: unknown[]): SocialPost[] {
  const out: SocialPost[] = [];
  const seen = new Set<string>();
  for (const j of jsons) {
    for (const holder of collect(j, (o) => typeof o.tweet_results === 'object' && o.tweet_results !== null, 400)) {
      let r = (holder.tweet_results as { result?: GqlResult & { rest_id?: string; legacy?: { id_str?: string; retweeted_status_result?: unknown } } }).result;
      if (r?.__typename === 'TweetWithVisibilityResults' && r.tweet) r = r.tweet as typeof r;
      const legacy = r?.legacy as (GqlResult['legacy'] & { id_str?: string; retweeted_status_result?: unknown }) | undefined;
      const id = (r as { rest_id?: string } | undefined)?.rest_id ?? legacy?.id_str;
      if (!r || !legacy || !id || seen.has(id) || legacy.retweeted_status_result) continue;
      if (!legacy.extended_entities?.media?.length) continue;
      try {
        const post = parseGraphql({ tweetResult: { result: r } }, id, `https://x.com/i/status/${id}`, null);
        seen.add(id);
        out.push(post);
      } catch {
        // post sem mídia que dê para baixar
      }
    }
  }
  return out.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
}

/** Perfil do X sem login: a conta e os posts recentes com foto, vídeo ou GIF. */
export async function fetchXProfile(username: string, f: Fetch = fetch, harvestPage?: (username: string) => Promise<unknown[]>): Promise<SocialProfile> {
  let user: XAccount | null = null;
  let posts: SocialPost[] = [];
  try {
    const u = await gql(f, 'ck5KkZ8t5cOmoLssopN99Q/UserByScreenName', { screen_name: username, withGrokTranslatedBio: false }, USER_FEATURES, { withAuxiliaryUserLabels: true });
    user = parseXUser([u], username);
    if (user && !user.isPrivate) {
      const timelines: [string, Record<string, unknown>][] = [
        ['jCRhbOzdgOHp6u9H4g2tEg/UserMedia', { userId: user.id, count: 40, includePromotedContent: false, withClientEventToken: false, withBirdwatchNotes: false, withVoice: true }],
        ['E8Wq-_jFSaU7hxVcuOPR9g/UserTweets', { userId: user.id, count: 40, includePromotedContent: false, withQuickPromoteEligibilityTweetFields: false, withVoice: true }],
      ];
      for (const [path, variables] of timelines) {
        try {
          posts = parseXTimeline([await gql(f, path, variables, FEATURES, { withArticlePlainText: false })]);
        } catch {
          posts = [];
        }
        if (posts.length) break;
      }
    }
  } catch (e) {
    if (e instanceof SourceError && e.code === 'rate') throw e;
  }
  // Reserva: a página do perfil num navegador invisível, como um visitante sem conta
  if ((!user || (!posts.length && !user.isPrivate)) && harvestPage) {
    const js = await harvestPage(username).catch(() => []);
    user = user ?? parseXUser(js, username);
    if (!posts.length) posts = parseXTimeline(js);
  }
  if (!user) throw new SourceError('unavailable', `Não consegui abrir @${username} no X agora. Confira o nome ou tente de novo em instantes.`);
  return { source: 'x', id: user.id, username: user.username, fullName: user.fullName, avatar: user.avatar, isPrivate: user.isPrivate, posts, stories: null, highlights: null, headers: {} };
}

export async function expandShort(url: string, f: Fetch = fetch): Promise<string> {
  try {
    const res = await f(url, { headers: { 'User-Agent': UA } });
    return res.url || url;
  } catch {
    throw new SourceError('network', 'Sem resposta do link curto. Confira a internet e tente de novo.');
  }
}
