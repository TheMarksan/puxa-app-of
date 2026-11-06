import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANIMATED_LIMIT, animatedArgs, CANVAS, defaultDesign, firstTry, nextTry, stickerLayout, textPlacement } from '../src/stickers/sticker';

const landscape = { width: 1280, height: 720 };
const portrait = { width: 720, height: 1280 };

test('figurinha quadrada: recorte quadrado no meio do vídeo, contorno em volta, tudo dentro de 512', () => {
  const l = stickerLayout(defaultDesign(), landscape);
  assert.ok(l.crop);
  assert.equal(l.crop.w, 720);
  assert.equal(l.crop.h, 720);
  assert.equal(l.crop.x, 280);
  assert.equal(l.crop.y, 0);
  assert.equal(l.content.w, l.content.h);
  assert.ok(l.border);
  assert.ok(l.border.x >= 0 && l.border.x + l.border.w <= CANVAS);
  assert.equal(l.content.x + l.content.w / 2, CANVAS / 2);
});

test('recorte com zoom e deslocamento não sai do quadro do vídeo', () => {
  const l = stickerLayout({ ...defaultDesign(), crop: { zoom: 2, panX: 1, panY: -1 } }, landscape);
  assert.ok(l.crop);
  assert.equal(l.crop.w, 360);
  assert.equal(l.crop.x + l.crop.w, 1280);
  assert.equal(l.crop.y, 0);
  const far = stickerLayout({ ...defaultDesign(), crop: { zoom: 9, panX: 5, panY: 5 } }, portrait);
  assert.ok(far.crop && far.crop.x + far.crop.w <= 720 && far.crop.y + far.crop.h <= 1280);
});

test('inteiro: mantém a proporção, sem recorte; círculo tem raio de meia largura', () => {
  const fit = stickerLayout({ ...defaultDesign(), shape: 'fit' }, landscape);
  assert.equal(fit.crop, null);
  assert.ok(Math.abs(fit.content.w / fit.content.h - 16 / 9) < 0.02);
  const tall = stickerLayout({ ...defaultDesign(), shape: 'fit' }, portrait);
  assert.ok(tall.content.h > tall.content.w);
  const circle = stickerLayout({ ...defaultDesign(), shape: 'circle' }, portrait);
  assert.equal(circle.content.radius, circle.content.w / 2);
  const bare = stickerLayout({ ...defaultDesign(), outline: false }, portrait);
  assert.equal(bare.border, null);
  assert.ok(bare.content.w > circle.content.w);
});

test('texto da figurinha fica dentro do quadro, em cima ou embaixo', () => {
  const top = textPlacement({ ...defaultDesign(), textPosition: 'top' }, { width: 400, height: 80 });
  assert.deepEqual(top, { x: 56, y: 10 });
  const bottom = textPlacement({ ...defaultDesign(), textPosition: 'bottom' }, { width: 600, height: 90 });
  assert.equal(bottom.x, 0);
  assert.equal(bottom.y, CANVAS - 90 - 10);
});

test('animada: repete sem parar, nunca passa de 10 s e desce qualidade e quadros quando pesa', () => {
  const l = stickerLayout(defaultDesign(), landscape);
  const args = animatedArgs(defaultDesign(), l, { src: '/v.mp4', mask: '/m.png', base: '/b.png', text: null }, 5, 12, 12, 50, '/o.webp');
  assert.equal(args[args.indexOf('-loop', args.indexOf('-c:v')) + 1], '0');
  assert.equal(args[args.lastIndexOf('-t') + 1], '9.8');
  assert.ok(args.includes('libwebp_anim'));
  const start = firstTry(3);
  const lighter = nextTry(start, ANIMATED_LIMIT * 2, ANIMATED_LIMIT);
  assert.ok(lighter && (lighter.quality < start.quality || lighter.fps < start.fps));
  const much = nextTry({ fps: 15, quality: 60 }, ANIMATED_LIMIT * 4, ANIMATED_LIMIT);
  assert.ok(much && much.fps < 15);
  assert.equal(nextTry(start, ANIMATED_LIMIT * 0.5, ANIMATED_LIMIT), null);
  assert.equal(nextTry({ fps: 8, quality: 8 }, ANIMATED_LIMIT * 3, ANIMATED_LIMIT), null);
});
