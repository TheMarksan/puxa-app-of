import { parseInstagram } from './instagramParse';
import type { SocialItem, SocialPost, SocialProfile } from './social';
import { parseX } from './x';

/** Só para a prévia web (sem rede social de verdade): posts e perfil de exemplo, com contas fictícias e as mídias locais. */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const video = (id: string, name: 'sea' | 'sunset', thumb: number, duration: number): SocialItem => ({
  id,
  kind: 'video',
  thumbnail: `/preview/thumbs/${name}-${thumb}.jpg`,
  duration,
  width: name === 'sea' ? 720 : 1280,
  height: name === 'sea' ? 1280 : 720,
  variants: [
    { url: `/preview/${name}.mp4`, width: name === 'sea' ? 720 : 1280, height: name === 'sea' ? 1280 : 720, bitrate: 2_000_000 },
    { url: `/preview/${name}.mp4#360`, width: name === 'sea' ? 360 : 640, height: name === 'sea' ? 640 : 360, bitrate: 600_000 },
  ],
  image: null,
  hasAudio: true,
  takenAt: 1_793_900_000,
});

const photo = (id: string, name: 'sea' | 'sunset', thumb: number): SocialItem => ({
  id,
  kind: 'image',
  thumbnail: `/preview/thumbs/${name}-${thumb}.jpg`,
  duration: 0,
  width: name === 'sea' ? 1080 : 1440,
  height: name === 'sea' ? 1920 : 810,
  variants: [],
  image: `/preview/thumbs/${name}-${thumb}.jpg`,
  hasAudio: false,
  takenAt: 1_793_900_000,
});

const STORIES = [video('s1', 'sea', 2, 8), photo('s2', 'sunset', 6), video('s3', 'sea', 5, 8), photo('s4', 'sea', 7)];

const base = { authorName: 'Mar Aberto', avatar: '/preview/thumbs/sunset-3.jpg', headers: {} };

const POSTS = (source: 'instagram' | 'x', author: string): SocialPost[] => [
  { ...base, source, kind: 'reel', id: 'r1', link: '', title: 'O mar mais azul do Nordeste 🌊', author, items: [video('r1', 'sea', 3, 8)], initial: 0 },
  { ...base, source, kind: 'post', id: 'p1', link: '', title: 'Três jeitos de ver o mesmo mar', author, items: [photo('p1a', 'sunset', 4), video('p1b', 'sea', 1, 8), photo('p1c', 'sunset', 8)], initial: 0 },
  { ...base, source, kind: 'post', id: 'p2', link: '', title: 'Fim de tarde', author, items: [video('p2', 'sunset', 9, 10)], initial: 0 },
  { ...base, source, kind: 'post', id: 'p3', link: '', title: 'Calmaria', author, items: [photo('p3', 'sea', 6)], initial: 0 },
  { ...base, source, kind: 'post', id: 'p4', link: '', title: 'Sol se pondo', author, items: [photo('p4', 'sunset', 2)], initial: 0 },
];

export async function previewResolve(text: string): Promise<{ type: 'post'; post: SocialPost } | { type: 'profile'; profile: SocialProfile } | null> {
  const ig = parseInstagram(text);
  const x = parseX(text);
  if (!ig && !x) return null;
  await sleep(700);
  if (x?.type === 'profile') {
    return {
      type: 'profile',
      profile: { source: 'x', id: '9', username: x.username, fullName: 'Fim de Tarde', avatar: '/preview/thumbs/sunset-6.jpg', isPrivate: false, posts: POSTS('x', x.username), stories: null, highlights: null, headers: {} },
    };
  }
  if (x) {
    return {
      type: 'post',
      post: { ...base, source: 'x', kind: 'tweet', id: '1', link: text, title: 'Fim de tarde na orla, ninguém queria ir embora', author: 'fimdetarde_demo', items: [video('x1', 'sunset', 5, 10)], initial: 0 },
    };
  }
  if (ig?.type === 'profile') {
    return {
      type: 'profile',
      profile: {
        source: 'instagram',
        id: '1',
        username: ig.username,
        fullName: 'Mar Aberto',
        avatar: '/preview/thumbs/sunset-3.jpg',
        isPrivate: false,
        posts: POSTS('instagram', ig.username),
        // Prévia sem login: stories e destaques pedem a conta (com ?logado no link, aparecem)
        stories: /logado/.test(text) ? STORIES : null,
        highlights: /logado/.test(text)
          ? [
              { id: '11', title: 'Verão', cover: '/preview/thumbs/sea-3.jpg', count: 6 },
              { id: '12', title: 'Pôr do sol', cover: '/preview/thumbs/sunset-8.jpg', count: 4 },
              { id: '13', title: 'Bastidores', cover: '/preview/thumbs/sea-6.jpg', count: 9 },
            ]
          : null,
        headers: {},
      },
    };
  }
  if (ig?.type === 'story' || ig?.type === 'highlight') {
    return { type: 'post', post: { ...base, source: 'instagram', kind: ig.type, id: '2', link: text, title: 'Story de @mar.aberto.demo', author: 'mar.aberto.demo', items: STORIES, initial: 0 } };
  }
  const carousel = /\/p\//.test(text);
  return {
    type: 'post',
    post: {
      ...base,
      source: 'instagram',
      kind: carousel ? 'post' : 'reel',
      id: '3',
      link: text,
      title: carousel ? 'Três jeitos de ver o mesmo mar' : 'O mar mais azul do Nordeste 🌊',
      author: 'mar.aberto.demo',
      items: carousel ? [video('c1', 'sea', 1, 8), photo('c2', 'sunset', 4), video('c3', 'sunset', 9, 10)] : [video('r1', 'sea', 3, 8)],
      initial: 0,
    },
  };
}

/** Destaque de exemplo (prévia web). */
export async function previewHighlight(id: string, title: string): Promise<SocialPost> {
  await sleep(500);
  return { ...base, source: 'instagram', kind: 'highlight', id, link: '', title, author: 'mar.aberto.demo', items: [...STORIES].reverse(), initial: 0 };
}
