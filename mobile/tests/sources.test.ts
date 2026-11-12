import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseHighlights, parseInstagram, parseMediaPost, parseReelPost, shortcodeToPk } from '../src/sources/instagramParse';
import { itemInfo, SourceError, titleFrom } from '../src/sources/social';
import { parseGraphql, parseSyndication, parseX, syndicationToken } from '../src/sources/x';

test('links do Instagram: post, reel, story, destaque, link compartilhado e perfil', () => {
  assert.deepEqual(parseInstagram('https://www.instagram.com/reel/C9abcDEF123/?igsh=MWZ4dGRk'), { type: 'media', shortcode: 'C9abcDEF123', kind: 'reel' });
  assert.deepEqual(parseInstagram('instagram.com/p/DAbc_123-x/'), { type: 'media', shortcode: 'DAbc_123-x', kind: 'post' });
  assert.deepEqual(parseInstagram('olha isso https://www.instagram.com/praiadofrances/reel/C9abcDEF123/'), { type: 'media', shortcode: 'C9abcDEF123', kind: 'reel' });
  assert.deepEqual(parseInstagram('https://www.instagram.com/tv/BkfuX9UB-eK/'), { type: 'media', shortcode: 'BkfuX9UB-eK', kind: 'reel' });
  assert.deepEqual(parseInstagram('https://www.instagram.com/stories/praiadofrances/3482938472938472938/?utm_source=ig'), {
    type: 'story',
    username: 'praiadofrances',
    storyId: '3482938472938472938',
  });
  assert.deepEqual(parseInstagram('https://www.instagram.com/stories/praiadofrances/'), { type: 'story', username: 'praiadofrances', storyId: null });
  assert.deepEqual(parseInstagram('https://www.instagram.com/stories/highlights/17912345678901234/'), { type: 'highlight', highlightId: '17912345678901234', storyId: null });
  const b64 = Buffer.from('highlight:17912345678901234').toString('base64').replace(/=+$/, '');
  assert.deepEqual(parseInstagram(`https://www.instagram.com/s/${b64}?story_media_id=3482938472938472938_1234&igsh=x`), {
    type: 'highlight',
    highlightId: '17912345678901234',
    storyId: '3482938472938472938',
  });
  assert.deepEqual(parseInstagram('@Praia.Do_Frances'), { type: 'profile', username: 'praia.do_frances' });
  assert.deepEqual(parseInstagram('https://instagram.com/praiadofrances?igsh=abc'), { type: 'profile', username: 'praiadofrances' });
  assert.equal(parseInstagram('https://www.instagram.com/share/reel/BAabc123x/')?.type, 'share');
  assert.equal(parseInstagram('https://www.instagram.com/explore/'), null);
  assert.equal(parseInstagram('https://www.youtube.com/watch?v=jNQXAC9IVRw'), null);
});

test('código do post vira o id da mídia (inclusive o de post privado, com 28 letras a mais)', () => {
  // Par conhecido (o mesmo dos testes do yt-dlp)
  assert.equal(shortcodeToPk('aye83DjauH'), '482584233761418119');
  assert.equal(shortcodeToPk('B'), '1');
  assert.equal(shortcodeToPk(`aye83DjauH${'x'.repeat(28)}`), '482584233761418119');
  assert.throws(() => shortcodeToPk('a!b'), SourceError);
});

const carousel = {
  pk: '3400000000000000001',
  code: 'DAbc',
  caption: { text: '#praia #mar\nTrês jeitos de ver o mesmo mar 🌊\n\nfoto: @fulano' },
  user: { username: 'praiadofrances', full_name: 'Praia do Francês', profile_pic_url: 'https://cdn/p.jpg' },
  carousel_media: [
    {
      pk: '1',
      media_type: 2,
      video_duration: 7.9,
      has_audio: true,
      original_width: 720,
      original_height: 1280,
      video_versions: [
        { url: 'https://cdn/v-480.mp4', width: 480, height: 854 },
        { url: 'https://cdn/v-720.mp4', width: 720, height: 1280 },
        { url: 'https://cdn/v-720.mp4', width: 720, height: 1280 },
      ],
      image_versions2: { candidates: [{ url: 'https://cdn/t-1080.jpg', width: 1080, height: 1920 }, { url: 'https://cdn/t-320.jpg', width: 320, height: 568 }] },
      taken_at: 1793900000,
    },
    { pk: '2', media_type: 1, image_versions2: { candidates: [{ url: 'https://cdn/i-640.jpg', width: 640, height: 640 }, { url: 'https://cdn/i-1440.jpg', width: 1440, height: 1440 }] } },
    { pk: '3', media_type: 2, has_audio: false, video_versions: [{ url: 'https://cdn/mudo.mp4', width: 640, height: 640 }], image_versions2: { candidates: [{ url: 'https://cdn/m.jpg', width: 640, height: 640 }] } },
  ],
};

test('post com carrossel: vídeos e fotos, maior versão primeiro, sem repetidas, título da legenda', () => {
  const post = parseMediaPost(carousel, 'https://www.instagram.com/p/DAbc/', 'post');
  assert.equal(post.items.length, 3);
  assert.equal(post.kind, 'post');
  assert.equal(post.author, 'praiadofrances');
  assert.equal(post.title, 'Três jeitos de ver o mesmo mar 🌊');
  const [v, img, mute] = post.items;
  assert.equal(v.kind, 'video');
  assert.deepEqual(
    v.variants.map((x) => x.url),
    ['https://cdn/v-720.mp4', 'https://cdn/v-480.mp4'],
  );
  assert.equal(v.thumbnail, 'https://cdn/t-320.jpg');
  assert.equal(v.duration, 7.9);
  assert.equal(img.kind, 'image');
  assert.equal(img.image, 'https://cdn/i-1440.jpg');
  assert.equal(mute.hasAudio, false);
  assert.equal(post.headers.Referer, 'https://www.instagram.com/');
});

test('item vira as opções do app: vídeo com qualidades e MP3; foto com o link da imagem', () => {
  const post = parseMediaPost(carousel, 'https://www.instagram.com/p/DAbc/', 'post');
  const video = itemInfo(post, 0);
  assert.equal(video.source, 'instagram');
  assert.equal(video.channel, '@praiadofrances');
  assert.match(video.title, /\(1 de 3\)$/);
  assert.deepEqual(
    video.options.video.map((o) => o.label),
    ['720p', '480p'],
  );
  assert.equal(video.direct?.['u:v1']?.url, 'https://cdn/v-480.mp4');
  assert.equal(video.options.audio[0].id, 'u:mp3');
  assert.equal(video.direct?.['u:mp3']?.kind, 'audio');
  const photo = itemInfo(post, 1);
  assert.equal(photo.image, true);
  assert.equal(photo.options.video.length, 0);
  assert.equal(photo.options.image?.[0].id, 'u:img');
  assert.equal(photo.direct?.['u:img']?.url, 'https://cdn/i-1440.jpg');
  // Vídeo sem som não oferece MP3
  assert.equal(itemInfo(post, 2).options.audio.length, 0);
});

test('stories: o link de um story específico abre nele; sem stories, explica', () => {
  const reel = {
    user: { username: 'praiadofrances' },
    items: [
      { pk: '111', media_type: 1, image_versions2: { candidates: [{ url: 'https://cdn/s1.jpg', width: 1080, height: 1920 }] } },
      { pk: '222', media_type: 2, video_versions: [{ url: 'https://cdn/s2.mp4', width: 720, height: 1280 }], image_versions2: { candidates: [{ url: 'https://cdn/s2.jpg', width: 720, height: 1280 }] } },
    ],
  };
  const post = parseReelPost(reel, { kind: 'story', id: '99', link: 'x', storyId: '222' });
  assert.equal(post.initial, 1);
  assert.equal(post.title, 'Story de @praiadofrances');
  assert.equal(parseReelPost(reel, { kind: 'story', id: '99', link: 'x', storyId: '999' }).initial, 0);
  assert.throws(
    () => parseReelPost({ items: [] }, { kind: 'story', id: '99', link: 'x', storyId: null, username: 'fulano' }),
    (e: unknown) => e instanceof SourceError && /fulano não tem stories/.test(e.message),
  );
  const hl = parseHighlights({ tray: [{ id: 'highlight:17900000000000001', title: 'Verão', media_count: 6, cover_media: { cropped_image_version: { url: 'https://cdn/c.jpg' } } }, { id: 'lixo' }] });
  assert.deepEqual(hl, [{ id: '17900000000000001', title: 'Verão', cover: 'https://cdn/c.jpg', count: 6 }]);
});

test('links do X: post, foto específica, espelhos e link curto', () => {
  assert.deepEqual(parseX('https://x.com/orladeboa/status/1854000000000000001?s=46'), { type: 'status', id: '1854000000000000001', index: null });
  assert.deepEqual(parseX('https://twitter.com/i/web/status/1854000000000000001/photo/2'), { type: 'status', id: '1854000000000000001', index: 1 });
  assert.deepEqual(parseX('https://fxtwitter.com/a/status/12345678901'), { type: 'status', id: '12345678901', index: null });
  assert.deepEqual(parseX('veja https://t.co/AbCd1234'), { type: 'short', url: 'https://t.co/AbCd1234' });
  assert.equal(parseX('https://example.com/orladeboa/status/1854000000000000001'), null);
});

test('token do endpoint de incorporação do X: base 36 sem zeros nem ponto', () => {
  const t = syndicationToken('1854000000000000001');
  assert.match(t, /^[1-9a-z]+$/);
  assert.equal(t, ((Number('1854000000000000001') / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ''));
});

test('post do X com vídeo e foto: versões MP4 da maior para a menor; foto no tamanho original', () => {
  const j = {
    __typename: 'Tweet',
    text: 'Fim de tarde na orla https://t.co/abc',
    created_at: '2026-11-01T18:00:00.000Z',
    user: { screen_name: 'orladeboa', name: 'Orla de Boa', profile_image_url_https: 'https://pbs/p.jpg' },
    mediaDetails: [
      {
        type: 'video',
        media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/abc.jpg',
        original_info: { width: 1280, height: 720 },
        video_info: {
          duration_millis: 30500,
          variants: [
            { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/ext_tw_video/1/pu/pl/abc.m3u8' },
            { bitrate: 832000, content_type: 'video/mp4', url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/640x360/b.mp4?tag=12' },
            { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/1280x720/c.mp4?tag=12' },
            { bitrate: 256000, content_type: 'video/mp4', url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/480x270/a.mp4?tag=12' },
          ],
        },
      },
      { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/XYZ.jpg', original_info: { width: 2048, height: 1365 } },
    ],
  };
  const post = parseSyndication(j, '1', 'https://x.com/i/status/1', null);
  assert.equal(post.title, 'Fim de tarde na orla');
  assert.equal(post.author, 'orladeboa');
  const [v, p] = post.items;
  assert.deepEqual(
    v.variants.map((x) => `${x.width}x${x.height}`),
    ['1280x720', '640x360', '480x270'],
  );
  assert.equal(v.duration, 30.5);
  assert.equal(p.image, 'https://pbs.twimg.com/media/XYZ?format=jpg&name=orig');
  const info = itemInfo(post, 0);
  assert.deepEqual(
    info.options.video.map((o) => o.label),
    ['720p', '360p', '270p'],
  );
  assert.ok(info.options.video[0].size! > 0);
  assert.throws(() => parseSyndication({ __typename: 'TweetTombstone' }, '1', '', null), SourceError);
});

test('API do site do X: post com aviso de visibilidade e GIF (sem som)', () => {
  const data = {
    tweetResult: {
      result: {
        __typename: 'TweetWithVisibilityResults',
        tweet: {
          core: { user_results: { result: { core: { screen_name: 'gifzeiro', name: 'GIF' }, avatar: { image_url: 'https://pbs/a.jpg' } } } },
          legacy: {
            full_text: 'kkkkk',
            extended_entities: {
              media: [{ type: 'animated_gif', media_url_https: 'https://pbs/t.jpg', video_info: { variants: [{ bitrate: 0, content_type: 'video/mp4', url: 'https://video.twimg.com/tweet_video/G.mp4' }] } }],
            },
          },
        },
      },
    },
  };
  const post = parseGraphql(data, '5', 'l', null);
  assert.equal(post.author, 'gifzeiro');
  assert.equal(post.items[0].hasAudio, false);
  assert.equal(itemInfo(post, 0).options.audio.length, 0);
  assert.throws(() => parseGraphql({ tweetResult: { result: { __typename: 'TweetUnavailable', reason: 'Protected' } } }, '5', 'l', null), SourceError);
});

test('título curto a partir da legenda', () => {
  assert.equal(titleFrom('#tbt #praia\nVerão chegando', 'x'), 'Verão chegando');
  assert.equal(titleFrom('', 'Post de @fulano'), 'Post de @fulano');
  const long = titleFrom('a'.repeat(200), 'x');
  assert.ok(long.length <= 90 && long.endsWith('…'));
});

import { findMediaPost, parseProfileData } from '../src/sources/instagramParse';
import { parseXTimeline, parseXUser } from '../src/sources/x';

test('perfil do Instagram sem login (formato do site para visitantes): conta e publicações com mídia', () => {
  const json = {
    data: {
      user: {
        id: '1234',
        username: 'praiadofrances',
        full_name: 'Praia do Francês',
        profile_pic_url_hd: 'https://cdn/avatar.jpg',
        is_private: false,
        edge_owner_to_timeline_media: {
          edges: [
            {
              node: {
                __typename: 'GraphVideo',
                id: '10',
                shortcode: 'Cvideo1',
                is_video: true,
                video_url: 'https://cdn/v.mp4',
                display_url: 'https://cdn/v.jpg',
                dimensions: { width: 720, height: 1280 },
                taken_at_timestamp: 1793000000,
                video_duration: 12.5,
                edge_media_to_caption: { edges: [{ node: { text: 'Ondas boas hoje' } }] },
              },
            },
            {
              node: {
                __typename: 'GraphSidecar',
                id: '11',
                shortcode: 'Ccarrossel',
                display_url: 'https://cdn/c.jpg',
                taken_at_timestamp: 1793500000,
                edge_sidecar_to_children: {
                  edges: [
                    { node: { id: '11a', is_video: false, display_url: 'https://cdn/c1.jpg', dimensions: { width: 1080, height: 1080 } } },
                    { node: { id: '11b', is_video: true, display_url: 'https://cdn/c2.jpg' } },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  };
  const d = parseProfileData([json], 'PraiaDoFrances');
  assert.ok(d);
  assert.equal(d.user.id, '1234');
  assert.equal(d.posts.length, 2);
  // Mais nova primeiro
  assert.equal(d.posts[0].shortcode, 'Ccarrossel');
  assert.equal(d.posts[0].items.length, 2);
  // Vídeo do carrossel sem link: o app busca o post inteiro quando a pessoa escolhe
  assert.equal(d.posts[0].items[1].variants.length, 0);
  assert.equal(d.posts[1].kind, 'reel');
  assert.equal(d.posts[1].items[0].variants[0].url, 'https://cdn/v.mp4');
  assert.equal(d.posts[1].title, 'Ondas boas hoje');
  assert.equal(parseProfileData([{ data: {} }], 'praiadofrances'), null);
});

test('perfil do Instagram pela linha do tempo nova (dados dentro da página)', () => {
  const page = {
    require: [
      {
        xdt_api__v1__feed__user_timeline_graphql_connection: {
          edges: [
            {
              node: {
                code: 'DnovoPost1',
                pk: '77',
                media_type: 2,
                taken_at: 1794000000,
                user: { pk: '1234', username: 'praiadofrances', full_name: 'Praia' },
                video_versions: [{ url: 'https://cdn/n.mp4', width: 720, height: 1280 }],
                image_versions2: { candidates: [{ url: 'https://cdn/n.jpg', width: 720, height: 1280 }] },
              },
            },
          ],
        },
      },
    ],
  };
  const d = parseProfileData([page], 'praiadofrances');
  assert.ok(d);
  assert.equal(d.user.id, '1234');
  assert.equal(d.posts[0].shortcode, 'DnovoPost1');
  assert.equal(d.posts[0].items[0].variants[0].url, 'https://cdn/n.mp4');
  // E um post achado pelo código dentro da página dele
  const post = findMediaPost([page], 'DnovoPost1', 'link', 'reel');
  assert.equal(post?.items[0].kind, 'video');
  assert.equal(findMediaPost([page], 'outro', 'link', 'post'), null);
});

test('perfil do X: link, conta e posts com mídia sem repostagens', () => {
  assert.deepEqual(parseX('https://x.com/orladeboa'), { type: 'profile', username: 'orladeboa' });
  assert.deepEqual(parseX('https://twitter.com/OrlaDeBoa/media'), { type: 'profile', username: 'OrlaDeBoa' });
  assert.equal(parseX('https://x.com/home'), null);
  assert.equal(parseX('https://x.com/explore'), null);
  const user = {
    data: { user: { result: { __typename: 'User', rest_id: '42', core: { screen_name: 'OrlaDeBoa', name: 'Orla de Boa' }, avatar: { image_url: 'https://pbs/a_normal.jpg' }, privacy: { protected: false } } } },
  };
  assert.deepEqual(parseXUser([user], 'orladeboa'), { id: '42', username: 'OrlaDeBoa', fullName: 'Orla de Boa', avatar: 'https://pbs/a_200x200.jpg', isPrivate: false });
  const media = (url: string) => ({ type: 'video', media_url_https: 'https://pbs/t.jpg', video_info: { duration_millis: 5000, variants: [{ bitrate: 832000, content_type: 'video/mp4', url }] } });
  const tweet = (id: string, extra: Record<string, unknown> = {}) => ({
    entryId: `tweet-${id}`,
    content: {
      itemContent: {
        tweet_results: {
          result: {
            __typename: 'Tweet',
            rest_id: id,
            core: { user_results: { result: { __typename: 'User', rest_id: '42', core: { screen_name: 'OrlaDeBoa', name: 'Orla' } } } },
            legacy: { full_text: `post ${id}`, extended_entities: { media: [media(`https://video.twimg.com/${id}/vid/avc1/640x360/a.mp4`)] }, ...extra },
          },
        },
      },
    },
  });
  const timeline = {
    data: {
      user: {
        result: {
          timeline: {
            timeline: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: [tweet('100'), tweet('300'), tweet('200', { retweeted_status_result: { result: {} } }), { entryId: 'tweet-400', content: { itemContent: { tweet_results: { result: { __typename: 'Tweet', rest_id: '400', legacy: { full_text: 'só texto' } } } } } }],
                },
              ],
            },
          },
        },
      },
    },
  };
  const posts = parseXTimeline([timeline]);
  assert.deepEqual(
    posts.map((p) => p.id),
    ['300', '100'],
  );
  assert.equal(posts[0].items[0].variants[0].width, 640);
});

import { jsonsOf } from '../src/sources/json';

test('respostas do navegador invisível: JSON com prefixo, em partes e dentro do HTML', () => {
  assert.deepEqual(jsonsOf({ url: '/graphql/query', body: 'for (;;);{"data":{"ok":true}}', html: false }), [{ data: { ok: true } }]);
  assert.deepEqual(jsonsOf({ url: '/api/graphql', body: '{"a":1}\n{"b":2}\n', html: false }), [{ a: 1 }, { b: 2 }]);
  assert.deepEqual(jsonsOf({ url: '/x', body: 'não é json', html: false }), []);
  const html = '<html><head><script type="application/json" data-sjs="">{"require":[{"x":1}]}</script><script>var a = 1;</script></head><body></body></html>';
  assert.deepEqual(jsonsOf({ url: 'https://www.instagram.com/praia/', body: html, html: true }), [{ require: [{ x: 1 }] }]);
});

// Página do perfil para visitantes (formato de nov/2026): dados da conta e a grade só com capas,
// em dois scripts JSON separados. Os números e textos aqui são de exemplo.
test('perfil sem conta: grade nova (polaris) vira posts parciais com o pk da conta', () => {
  const userScript = { require: [['ScheduledServerJS', 'handle', null, [{ __bbox: { require: [['RelayPrefetchedStreamCache', 'next', [], ['adp_PolarisProfilePageContentQuery', { __bbox: { result: { data: { xig_user_by_username: { pk: '555', id: '178414000999', username: 'mar.aberto', full_name: 'Mar Aberto', profile_pic_url: 'https://cdn/a.jpg', is_private: false } } } } }]]] } }]]] };
  const node = (code: string, media_type: number, typename: string) => ({ __typename: typename, pk: `9${code.length}${media_type}`, code, display_uri: `https://cdn/${code}.jpg`, media_type, product_type: media_type === 2 ? 'clips' : 'feed', caption: { text: `Legenda ${code}\nsegunda linha` }, user: { username: 'mar.aberto', id: '178414000999' } });
  const gridScript = { require: [['ScheduledServerJS', 'handle', null, [{ __bbox: { require: [['RelayPrefetchedStreamCache', 'next', [], ['adp_PolarisLoggedOutDesktopWWWProfilePostsTabContentQuery', { __bbox: { result: { data: { xig_user_by_username: { pk: '555', polaris_ordered_timeline_connection: { edges: [{ node: node('AAA111', 2, 'XIGPolarisVideoMedia') }, { node: node('BBB222', 8, 'XIGPolarisCarouselMedia') }, { node: node('CCC333', 1, 'XIGPolarisImageMedia') }], page_info: { has_next_page: true } } } } } } }]]] } }]]] };
  const html = `<html><body><script type="application/json" data-sjs>${JSON.stringify(userScript)}</script><script type="application/json">${JSON.stringify(gridScript)}</script></body></html>`;
  const d = parseProfileData(jsonsOf({ url: 'https://www.instagram.com/mar.aberto/', body: html, html: true }), 'mar.aberto');
  assert.ok(d);
  assert.equal(d!.user.id, '555');
  assert.deepEqual(d!.posts.map((p) => [p.shortcode, p.kind, p.items[0].kind, p.partial]), [
    ['AAA111', 'reel', 'video', true],
    ['BBB222', 'post', 'image', true],
    ['CCC333', 'post', 'image', true],
  ]);
  assert.equal(d!.posts[0].link, 'https://www.instagram.com/reel/AAA111/');
  assert.equal(d!.posts[0].title, 'Legenda AAA111');
  assert.equal(d!.posts[1].items[0].thumbnail, 'https://cdn/BBB222.jpg');
});

test('post parcial da grade não conta como completo, mesmo sendo foto', async () => {
  const { isComplete } = await import('../src/sources/social');
  const base = { source: 'instagram' as const, kind: 'post' as const, id: '1', link: '', title: '', author: 'a', authorName: '', avatar: null, initial: 0, headers: {} };
  const img = { id: '1', kind: 'image' as const, thumbnail: 't', duration: 0, width: 0, height: 0, variants: [], image: 'i', hasAudio: false, takenAt: null };
  assert.equal(isComplete({ ...base, items: [img] }), true);
  assert.equal(isComplete({ ...base, items: [img], partial: true }), false);
  assert.equal(isComplete({ ...base, items: [{ ...img, kind: 'video', image: null }] }), false);
});
