import assert from 'node:assert/strict';
import { test } from 'node:test';

import { artworkArgs } from '../src/playlist/artworkArgs';
import { colorFromPixels, coverPad, motifOf, nextColor, titleSize } from '../src/playlist/colors';
import { activeLine, cleanTitle, parseLrc, pickBest, similarity, type LrclibRecord } from '../src/playlist/lyrics';
import { arrange, moved, neighbor, plan, stuckAtEnd, wrapped } from '../src/playlist/queue';

const IDS = ['a', 'b', 'c', 'd', 'e'];

test('fila: começa na música escolhida e segue a lista dando a volta', () => {
  assert.deepEqual(arrange(IDS, 'c', false), ['c', 'd', 'e', 'a', 'b']);
  assert.deepEqual(arrange(IDS, 'a', false), IDS);
  assert.deepEqual(arrange(IDS, 'z', false), []);
});

test('fila embaralhada: a escolhida na frente e todas as outras uma vez', () => {
  let seed = 3;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const got = arrange(IDS, 'd', true, rand);
  assert.equal(got[0], 'd');
  assert.deepEqual([...got].sort(), [...IDS].sort());
});

test('próxima e anterior: dão a volta com repetir ligado', () => {
  const order = arrange(IDS, 'c', false);
  assert.equal(neighbor(order, IDS, 'c', 1, 'all', false), 'd');
  assert.equal(neighbor(order, IDS, 'b', 1, 'all', false), 'c');
  assert.equal(neighbor(order, IDS, 'c', -1, 'all', false), 'b');
  assert.equal(neighbor(['a'], ['a'], 'a', 1, 'all', false), null);
});

test('próxima e anterior: repetir desligado para no fim e no começo da lista', () => {
  const order = arrange(IDS, 'c', false);
  assert.equal(neighbor(order, IDS, 'e', 1, 'none', false), null);
  assert.equal(neighbor(order, IDS, 'a', -1, 'none', false), null);
  assert.equal(neighbor(order, IDS, 'd', 1, 'none', false), 'e');
  // Embaralhado e sem repetir: a fila embaralhada é a ordem
  assert.equal(neighbor(['c', 'a', 'e'], ['a', 'c', 'e'], 'e', 1, 'none', true), null);
  assert.equal(neighbor(['c', 'a', 'e'], ['a', 'c', 'e'], 'c', 1, 'none', true), 'a');
});

test('volta da lista percebida só da última para a primeira', () => {
  assert.equal(wrapped(IDS, 'e', 'a'), true);
  assert.equal(wrapped(IDS, 'c', 'd'), false);
  assert.equal(wrapped(['a'], 'a', 'a'), false);
});

test('lista mudou tocando: música nova entra depois da anterior dela, sem refazer a fila', () => {
  const order = arrange(['a', 'b', 'c', 'd'], 'c', false); // c d a b
  const p = plan(order, ['a', 'b', 'c', 'd', 'x'], 'c', false);
  assert.ok(p);
  assert.deepEqual(p.order, ['c', 'd', 'x', 'a', 'b']);
  assert.deepEqual(p.ops, [{ op: 'insert', id: 'x', index: 2 }]);
  // No começo da lista: entra antes da que abre a fila (depois da última, dando a volta)
  const q = plan(order, ['y', 'a', 'b', 'c', 'd'], 'c', false);
  assert.deepEqual(q?.order, ['c', 'd', 'y', 'a', 'b']);
});

test('lista mudou tocando: saída tira da fila; troca de lugar ou saída da atual refaz', () => {
  const order = ['c', 'd', 'a', 'b'];
  const p = plan(order, ['a', 'c', 'd'], 'c', false);
  assert.deepEqual(p, { ops: [{ op: 'remove', index: 3 }], order: ['c', 'd', 'a'] });
  assert.equal(plan(order, ['a', 'b', 'd'], 'c', false), null);
  assert.equal(plan(order, ['b', 'a', 'c', 'd'], 'c', false), null);
  assert.deepEqual(plan(order, ['a', 'b', 'c', 'd'], 'c', false), { ops: [], order });
});

test('player travado: parou no fim ou repetiu em vez de seguir', () => {
  const s = (o: Partial<{ index: number; time: number; duration: number; playing: boolean; buffering: boolean }>) => ({ index: 0, time: 10, duration: 200, playing: true, buffering: false, at: 0, ...o });
  assert.equal(stuckAtEnd(null, s({ time: 199.8, playing: false }), 'all', 3), 'ended');
  assert.equal(stuckAtEnd(null, s({ time: 100 }), 'all', 3), null);
  assert.equal(stuckAtEnd(s({ time: 199.5 }), s({ time: 0.4 }), 'all', 3), 'repeated');
  assert.equal(stuckAtEnd(s({ time: 199.5 }), s({ time: 0.4, index: 1 }), 'all', 3), null);
  assert.equal(stuckAtEnd(s({ time: 199.5 }), s({ time: 0.4 }), 'single', 3), null);
});

test('mover música na playlist', () => {
  assert.deepEqual(moved(IDS, 'c', -1), ['a', 'c', 'b', 'd', 'e']);
  assert.deepEqual(moved(IDS, 'a', -1), IDS);
  assert.deepEqual(moved(IDS, 'e', 1), IDS);
});

test('capas: desenho estável pelo nome, cores sem repetir e letra que cabe', () => {
  assert.equal(motifOf('Treino'), motifOf(' treino '));
  assert.ok(motifOf('Estudos') >= 0 && motifOf('Estudos') < 4);
  assert.equal(nextColor(['azul']), 'coral');
  assert.ok(titleSize('Treino', 160) > titleSize('Músicas para estudar de madrugada', 160));
  assert.ok(titleSize('Superlongopalavrasemespaco', 160) * 0.46 * 26 <= 160 - 2 * coverPad(160));
  // Capa pequena (52): a palavra inteira cabe, sem quebrar no meio
  assert.ok(titleSize('Estudos', 52) * 0.46 * 7 <= 52 - 2 * coverPad(52));
});

test('LRC: tempos, várias marcas por linha, offset e linhas vazias', () => {
  const lines = parseLrc(`[ar:Alguém]
[offset:+500]
[00:12.30]Primeira linha
[00:15.00][01:15.00]Refrão
[00:20.5]
[00:21.00]
[00:22.10]<00:22.10>Palavra <00:22.60>por palavra`);
  assert.deepEqual(
    lines.map((l) => [Number(l.t.toFixed(2)), l.text]),
    [
      [11.8, 'Primeira linha'],
      [14.5, 'Refrão'],
      [20, ''],
      [21.6, 'Palavra por palavra'],
      [74.5, 'Refrão'],
    ],
  );
  assert.equal(activeLine(lines, 0), -1);
  assert.equal(activeLine(lines, 15), 1);
  assert.equal(activeLine(lines, 90), 4);
});

test('título do vídeo vira música e artista', () => {
  assert.deepEqual(cleanTitle('Anitta - Envolver (Official Music Video)', 'Anitta'), { track: 'Envolver', artist: 'Anitta' });
  assert.deepEqual(cleanTitle('Blinding Lights', 'The Weeknd - Topic'), { track: 'Blinding Lights', artist: 'The Weeknd' });
  assert.deepEqual(cleanTitle('Coldplay - Yellow [Official Video] | 4K', 'ColdplayVEVO'), { track: 'Yellow', artist: 'Coldplay' });
  assert.deepEqual(cleanTitle('Jorge & Mateus - Propaganda (Ao Vivo)', 'Jorge e Mateus'), { track: 'Propaganda', artist: 'Jorge' });
  assert.deepEqual(cleanTitle('Shakira - Hips Don’t Lie ft. Wyclef Jean', 'shakiraVEVO'), { track: 'Hips Don’t Lie', artist: 'Shakira' });
});

test('busca da letra: nome parecido, duração perto e com tempo vence', () => {
  const rec = (o: Partial<LrclibRecord>): LrclibRecord => ({ id: 1, trackName: 'Yellow', artistName: 'Coldplay', duration: 266, instrumental: false, plainLyrics: 'x', syncedLyrics: null, ...o });
  const list = [rec({ id: 1 }), rec({ id: 2, syncedLyrics: '[00:01.00]x' }), rec({ id: 3, trackName: 'Fix You', syncedLyrics: '[00:01.00]x' }), rec({ id: 4, duration: 400, syncedLyrics: '[00:01.00]x' })];
  assert.equal(pickBest(list, { track: 'Yellow', artist: 'Coldplay', duration: 269 })?.id, 2);
  assert.equal(pickBest([rec({ trackName: 'Outra coisa' })], { track: 'Yellow', artist: 'Coldplay', duration: 266 }), null);
  assert.ok(similarity('Hips Don’t Lie', 'Hips Dont Lie') > 0.6);
});

test('cor da playlist a partir da imagem', () => {
  const rep = (r: number, g: number, b: number, n = 64) => Array.from({ length: n }, () => [r, g, b]).flat();
  assert.equal(colorFromPixels(rep(200, 40, 30)), 'coral');
  assert.equal(colorFromPixels(rep(30, 60, 200)), 'azul');
  assert.equal(colorFromPixels(rep(20, 150, 90)), 'verde');
  assert.equal(colorFromPixels(rep(120, 120, 120)), 'grafite');
  // Foto escura com um detalhe colorido: a cor do detalhe
  assert.equal(colorFromPixels([...rep(10, 10, 10, 50), ...rep(220, 60, 140, 14)]), 'rosa');
  assert.equal(colorFromPixels([]), 'grafite');
});

test('arte da notificação: quadro na cor da playlist com a capa no meio', () => {
  const a = artworkArgs({ color: '#EE4B32', art: '/x/capa.jpg', out: '/x/arte.jpg' });
  assert.ok(a.includes('color=c=0xEE4B32:s=720x720:d=1'));
  const graph = a[a.indexOf('-filter_complex') + 1];
  // Miniatura 4:3 do YouTube perde as faixas pretas; recorte quadrado; cantos arredondados
  assert.match(graph, /between\(iw\/ih\\,1\.30\\,1\.36\)/);
  assert.match(graph, /crop=605:605/);
  assert.match(graph, /overlay=58:58/);
  assert.deepEqual(a.slice(-1), ['/x/arte.jpg']);
  const plain = artworkArgs({ color: '#2B2F36', art: null, out: '/x/a.jpg' });
  assert.ok(!plain.includes('-filter_complex'));
  const dark = artworkArgs({ color: '#F5C518', art: null, out: '/x/a.jpg', mark: '/x/seta.png', darkMark: true });
  assert.match(dark[dark.indexOf('-filter_complex') + 1], /lutrgb=r=negval/);
});
