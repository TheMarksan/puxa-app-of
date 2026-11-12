import { Platform } from 'react-native';

import PuxaEngine, { type VideoInfo } from '../../modules/puxa-engine';
import { harvest, MOBILE_UA } from './harvest';
import { completePost, expandShare, fetchHighlight, fetchMedia, fetchProfile, fetchStories, instagramLoggedIn, parseInstagram } from './instagram';
import { jsonsOf } from './json';
import { previewHighlight, previewResolve } from './preview';
import { type Highlight, type SocialPost, type SocialProfile, SourceError } from './social';
import { expandShort, fetchTweet, fetchXProfile, parseX, parseXTimeline, parseXUser } from './x';

export type Resolved = { type: 'youtube'; info: VideoInfo } | { type: 'post'; post: SocialPost } | { type: 'profile'; profile: SocialProfile };

const YT = /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i;

/** De que rede é o texto colado (null: não reconheci). */
export function sourceOf(text: string): 'youtube' | 'instagram' | 'x' | null {
  const t = text.trim();
  if (parseInstagram(t)) return 'instagram';
  if (parseX(t)) return 'x';
  if (YT.test(t) || /^[A-Za-z0-9_-]{11}$/.test(t)) return 'youtube';
  return null;
}

/** Lê o link (YouTube, Instagram ou X) e devolve o vídeo, o post ou o perfil. */
export async function resolveLink(text: string, depth = 0): Promise<Resolved> {
  const t = text.trim();
  if (Platform.OS === 'web') {
    const p = await previewResolve(t);
    if (p) return p;
  }
  const ig = parseInstagram(t);
  if (ig) {
    switch (ig.type) {
      case 'media':
        return { type: 'post', post: await fetchMedia(ig.shortcode, `https://www.instagram.com/${ig.kind === 'reel' ? 'reel' : 'p'}/${ig.shortcode}/`, ig.kind) };
      case 'story':
        // Sem conta o Instagram não entrega stories: abre o perfil (publicações sem login) com o aviso
        if (!instagramLoggedIn()) return { type: 'profile', profile: await fetchProfile(ig.username) };
        return { type: 'post', post: await fetchStories(`https://www.instagram.com/stories/${ig.username}/${ig.storyId ?? ''}`, ig.username, ig.storyId) };
      case 'highlight':
        return { type: 'post', post: await fetchHighlight(`https://www.instagram.com/stories/highlights/${ig.highlightId}/`, ig.highlightId, ig.storyId) };
      case 'profile':
        return { type: 'profile', profile: await fetchProfile(ig.username) };
      case 'share': {
        const url = await expandShare(ig.url);
        if (depth > 1 || url === ig.url || parseInstagram(url)?.type === 'share') throw new SourceError('invalid_url', 'Não consegui abrir esse link do Instagram. Copie o link do post de novo.');
        return resolveLink(url, depth + 1);
      }
    }
  }
  const x = parseX(t);
  if (x) {
    if (x.type === 'short') {
      const url = await expandShort(x.url);
      if (depth > 1 || url === x.url) throw new SourceError('invalid_url', 'Não consegui abrir esse link curto.');
      return resolveLink(url, depth + 1);
    }
    if (x.type === 'profile') return { type: 'profile', profile: await fetchXProfile(x.username, fetch, harvestXProfile) };
    return { type: 'post', post: await fetchTweet(x.id, `https://x.com/i/status/${x.id}`, x.index) };
  }
  if (!sourceOf(t) && !/https?:\/\//i.test(t)) {
    throw new SourceError('invalid_url', 'Isso não parece um link. Cole um link do YouTube, do Instagram ou do X.');
  }
  return { type: 'youtube', info: await PuxaEngine.getInfo(t) };
}

/** Perfil do X na página pública, num navegador invisível sem conta (reserva da API de visitante). */
async function harvestXProfile(username: string): Promise<unknown[]> {
  const got = await harvest({
    url: `https://x.com/${encodeURIComponent(username)}`,
    pattern: /\/graphql\/[^/]+\/(UserByScreenName|UserMedia|UserTweets)/,
    userAgent: MOBILE_UA,
    enough: (c) => {
      const js = c.flatMap(jsonsOf);
      return !!parseXUser(js, username) && parseXTimeline(js).length > 0;
    },
  });
  return got.flatMap(jsonsOf);
}

/** Post escolhido num perfil: se a lista veio sem o link de algum vídeo, busca o post inteiro. */
export async function openPost(post: SocialPost): Promise<SocialPost> {
  if (Platform.OS === 'web') return post;
  return completePost(post);
}

/** Abre um destaque do perfil (os itens dele viram a lista para escolher). */
export async function loadHighlight(h: Highlight, username: string): Promise<SocialPost> {
  if (Platform.OS === 'web') return previewHighlight(h.id, h.title);
  const post = await fetchHighlight(`https://www.instagram.com/stories/highlights/${h.id}/`, h.id, null);
  return { ...post, title: h.title || post.title, author: post.author === 'instagram' ? username : post.author };
}

export { IG_LOGIN_UA, IG_UA, instagramLoggedIn } from './instagram';
export { itemInfo, NAMES, SourceError } from './social';
export type { Highlight, InstagramProfile, SocialItem, SocialPost, SocialProfile } from './social';
