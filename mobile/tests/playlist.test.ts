import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { VideoInfo } from '../modules/puxa-engine';
import { audioPlan, sameLink, splitLinks } from '../src/playlist/links';

test('links colados: um por linha, no meio da frase e sem repetir', () => {
  const got = splitLinks(`Olha esse https://youtu.be/jNQXAC9IVRw.
https://www.youtube.com/watch?v=jNQXAC9IVRw&t=3
instagram.com/reel/C9abcDEF123/, "https://x.com/user/status/1234567890"
https://example.com/video e texto solto`);
  assert.deepEqual(got, ['https://youtu.be/jNQXAC9IVRw', 'https://instagram.com/reel/C9abcDEF123/', 'https://x.com/user/status/1234567890']);
});

test('links colados: nada reconhecido devolve vazio', () => {
  assert.deepEqual(splitLinks('só texto, sem link nenhum'), []);
  assert.deepEqual(splitLinks('https://vimeo.com/123'), []);
});

test('mesmo vídeo do YouTube em formatos diferentes', () => {
  assert.ok(sameLink('https://youtu.be/jNQXAC9IVRw', 'https://www.youtube.com/watch?v=jNQXAC9IVRw&si=abc'));
  assert.ok(sameLink('https://m.youtube.com/shorts/abcdefghijk', 'https://youtube.com/watch?v=abcdefghijk'));
  assert.ok(sameLink('https://music.youtube.com/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk'));
  assert.ok(!sameLink('https://youtu.be/aaaaaaaaaaa', 'https://youtu.be/bbbbbbbbbbb'));
});

test('carrossel: cada vídeo do post é uma música (o #id separa)', () => {
  assert.ok(sameLink('https://www.instagram.com/p/ABC/?igsh=1', 'https://instagram.com/p/ABC'));
  assert.ok(!sameLink('https://www.instagram.com/p/ABC/#instagram-1-2', 'https://www.instagram.com/p/ABC/#instagram-1-3'));
  assert.ok(sameLink('https://www.instagram.com/p/ABC/#instagram-1-2', 'https://instagram.com/p/ABC#instagram-1-2'));
});

const base = { id: 'x', title: 't', channel: null, duration: 10, viewCount: null, uploadDate: null, thumbnail: '', chapters: [], captions: [] } as unknown as VideoInfo;

test('áudio do YouTube: prefere o M4A original', () => {
  const info = { ...base, options: { audio: [{ id: 'o:opus', label: 'Opus' }, { id: 'a:140', label: 'M4A' }], video: [], image: [] } } as unknown as VideoInfo;
  assert.deepEqual(audioPlan(info), { kind: 'youtube', optionId: 'a:140' });
});

test('áudio do YouTube sem M4A: usa a primeira opção de áudio', () => {
  const info = { ...base, options: { audio: [{ id: 'o:251', label: 'Opus' }], video: [], image: [] } } as unknown as VideoInfo;
  assert.deepEqual(audioPlan(info), { kind: 'youtube', optionId: 'o:251' });
});

test('vídeo do Instagram ou X: tira o áudio do arquivo direto', () => {
  const info = { ...base, options: { audio: [], video: [], image: [] }, direct: { 'u:mp3': { url: 'https://cdn/v.mp4', kind: 'video' }, 'u:v0': { url: 'https://cdn/v.mp4', kind: 'video' } } } as unknown as VideoInfo;
  assert.deepEqual(audioPlan(info), { kind: 'direct', url: 'https://cdn/v.mp4' });
});

test('foto ou vídeo sem som: nada para tocar', () => {
  const info = { ...base, options: { audio: [], video: [], image: [] }, direct: { 'u:img': { url: 'https://cdn/i.jpg', kind: 'image' } } } as unknown as VideoInfo;
  assert.equal(audioPlan(info), null);
});
