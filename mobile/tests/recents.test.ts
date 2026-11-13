import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_RECENTS, parseRecents, pushRecent, sameRecent, type Recent } from '../src/recentList';

const item = (link: string, title = link): Recent => ({ link, title, by: 'Canal', thumbnail: null, source: 'youtube', at: 1 });

test('recentes: o mesmo vídeo em formatos diferentes conta como um só', () => {
  assert.ok(sameRecent('https://youtu.be/jNQXAC9IVRw?si=abc', 'https://www.youtube.com/watch?v=jNQXAC9IVRw'));
  assert.ok(sameRecent('youtu.be/jNQXAC9IVRw', 'https://youtu.be/jNQXAC9IVRw'));
  assert.ok(sameRecent('https://www.instagram.com/reel/C9abc/?igsh=xyz', 'instagram.com/reel/C9abc'));
  // O id do YouTube diferencia maiúsculas: são vídeos diferentes
  assert.ok(!sameRecent('https://youtu.be/AbCdEfGhIjK', 'https://youtu.be/abcdefghijk'));
});

test('recentes: o último puxado vai para o começo, sem repetir', () => {
  let list: Recent[] = [];
  list = pushRecent(list, item('https://youtu.be/aaaaaaaaaaa', 'A'));
  list = pushRecent(list, item('https://youtu.be/bbbbbbbbbbb', 'B'));
  list = pushRecent(list, item('https://www.youtube.com/watch?v=aaaaaaaaaaa', 'A de novo'));
  assert.deepEqual(
    list.map((r) => r.title),
    ['A de novo', 'B'],
  );
});

test('recentes: guarda no máximo 12', () => {
  let list: Recent[] = [];
  for (let i = 0; i < 20; i++) list = pushRecent(list, item(`https://youtu.be/${String(i).padStart(11, 'x')}`));
  assert.equal(list.length, MAX_RECENTS);
  assert.equal(list[0].link, `https://youtu.be/${'19'.padStart(11, 'x')}`);
});

test('recentes: arquivo estragado ou de outra forma vira lista vazia', () => {
  assert.deepEqual(parseRecents(null), []);
  assert.deepEqual(parseRecents('não é json'), []);
  assert.deepEqual(parseRecents('{"link":"x"}'), []);
  assert.deepEqual(parseRecents(JSON.stringify([item('https://youtu.be/aaaaaaaaaaa'), { link: 1 }, null])).length, 1);
});
