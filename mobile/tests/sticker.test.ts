import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANIMATED_LIMIT, animatedArgs, baseArgs, betterTry, CANVAS, clampCorner, defaultDesign, firstTry, maskArgs, nextTry, shapeWeight, stickerLayout, textPlacement, type Try } from '../src/stickers/sticker';

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
  const circle = stickerLayout({ ...defaultDesign(), corner: 1 }, portrait);
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
  const much = nextTry({ fps: 15, quality: 60, soft: 1 }, ANIMATED_LIMIT * 4, ANIMATED_LIMIT);
  assert.ok(much && much.fps < 15);
  assert.equal(nextTry(start, ANIMATED_LIMIT * 0.5, ANIMATED_LIMIT), null);
  // No fundo do poço não tem mais o que cortar
  assert.equal(nextTry({ fps: 4, quality: 8, soft: 0.5 }, ANIMATED_LIMIT * 3, ANIMATED_LIMIT), null);
});

test('animada longa: de 8 a 10 s começa com menos quadros por segundo, para caber em 500 KB', () => {
  // O WebP animado pesa quase em linha reta com o número de quadros: trecho longo pede menos quadros por segundo
  const frames = (d: number) => firstTry(d).fps * Math.min(d, 9.8);
  for (const d of [2, 3, 5, 7, 8, 9, 10]) assert.ok(frames(d) <= 60.5, `${d} s: ${frames(d)} quadros`);
  assert.ok(firstTry(10).fps < firstTry(8).fps && firstTry(8).fps < firstTry(5).fps);
  assert.ok(firstTry(10).fps >= 4);
  // Trecho curto tem orçamento sobrando: vira qualidade
  assert.ok(firstTry(2).quality > firstTry(10).quality);
  // O círculo com contorno pesa mais por quadro: começa com menos quadros que o quadrado
  const land = { width: 1280, height: 720 };
  const circle = { ...defaultDesign(), corner: 1 };
  const wCircle = shapeWeight(circle, stickerLayout(circle, land));
  const wDefault = shapeWeight(defaultDesign(), stickerLayout(defaultDesign(), land));
  assert.ok(Math.abs(wDefault - 1) < 0.05);
  assert.ok(wCircle > 1.25);
  assert.ok(firstTry(10, wCircle).fps < firstTry(10, wDefault).fps);
  // O vídeo inteiro (faixa no meio do quadro) ocupa menos área: pesa menos
  const fit = { ...defaultDesign(), shape: 'fit' as const };
  assert.ok(shapeWeight(fit, stickerLayout(fit, land)) < wDefault);
});

test('animada pesada: a segunda tentativa já sai da conta do peso e sempre chega a um piso', () => {
  // Passou 15%: baixa só a qualidade (até o piso que ainda fica bonito) e, se faltar, um degrau de quadros
  const a = nextTry({ fps: 6, quality: 37, soft: 1 }, ANIMATED_LIMIT * 1.06, ANIMATED_LIMIT)!;
  assert.deepEqual(a, { fps: 5.5, quality: 26, soft: 1 });
  // Passou o dobro: corta quadros por segundo quase na mesma proporção, sem mexer na nitidez à toa
  const b = nextTry({ fps: 7, quality: 41, soft: 1 }, ANIMATED_LIMIT * 1.6, ANIMATED_LIMIT)!;
  assert.equal(b.quality, 26);
  assert.ok(b.fps >= 4 && b.fps <= 4.5);
  assert.equal(b.soft, 1);
  // Descendo sem parar de qualquer ponto, sempre termina (nunca fica em laço) e cada passo é mais leve
  let cur: Try = firstTry(10);
  const cost = (t: Try) => t.fps * Math.pow(t.quality, 0.27) * t.soft;
  for (let i = 0; i < 12; i++) {
    const next = nextTry(cur, ANIMATED_LIMIT * 1.5, ANIMATED_LIMIT);
    if (!next) break;
    assert.ok(cost(next) < cost(cur));
    cur = next;
    assert.ok(i < 8, 'a descida precisa terminar em poucas voltas');
  }
  assert.deepEqual(cur, { fps: 4, quality: 8, soft: 0.5 });
});

test('animada leve: sobrando muito, uma volta a mais aproveita a folga', () => {
  const up = betterTry({ fps: 6, quality: 37, soft: 1 }, ANIMATED_LIMIT * 0.4, ANIMATED_LIMIT)!;
  assert.ok(up.fps > 6 && up.quality >= 37);
  // Folga pequena não compensa montar de novo
  assert.equal(betterTry({ fps: 6, quality: 37, soft: 1 }, ANIMATED_LIMIT * 0.75, ANIMATED_LIMIT), null);
  // Nunca devolve algo que deve estourar o limite: os quadros a mais cabem na folga medida
  assert.ok(up.fps / 6 <= (ANIMATED_LIMIT * 0.92) / (ANIMATED_LIMIT * 0.4));
});

test('cantos de reto a círculo: o raio acompanha o controle, no recorte e no inteiro', () => {
  const at = (corner: number, shape: 'crop' | 'fit' = 'crop') => stickerLayout({ ...defaultDesign(), shape, corner }, portrait);
  const sq = at(0);
  assert.equal(sq.content.radius, 0);
  assert.equal(sq.border?.radius, 0);
  const mid = at(0.5);
  assert.equal(mid.content.radius, Math.round(mid.content.w / 4));
  assert.equal(mid.border?.radius, mid.content.radius + 12);
  const round = at(1);
  assert.equal(round.content.radius, round.content.w / 2);
  assert.equal(round.border?.radius, round.border!.w / 2);
  // Quanto mais redondo, maior o raio
  const rs = [0, 0.1, 0.28, 0.6, 0.9, 1].map((k) => at(k).content.radius);
  assert.deepEqual([...rs].sort((a, b) => a - b), rs);
  // Inteiro deitado: o máximo é uma pílula (meia altura)
  const pill = at(1, 'fit');
  const flat = stickerLayout({ ...defaultDesign(), shape: 'fit', corner: 1 }, landscape);
  assert.equal(flat.content.radius, flat.content.h / 2);
  assert.ok(pill.content.radius <= pill.content.w / 2);
  // Valores fora do intervalo (ou de uma versão antiga, sem o campo) viram um canto válido
  assert.equal(clampCorner(5), 1);
  assert.equal(clampCorner(-1), 0);
  assert.equal(clampCorner(Number.NaN), 0.28);
  const old = stickerLayout({ shape: 'crop', crop: { zoom: 1, panX: 0, panY: 0 }, outline: true }, landscape);
  assert.ok(old.content.radius > 0);
});

test('cantos retos: máscara e contorno opacos por inteiro (sem meio-transparente)', () => {
  const sq = stickerLayout({ ...defaultDesign(), corner: 0 }, landscape);
  const mask = maskArgs(sq, '/m.png').join(' ');
  assert.ok(mask.includes('lte(abs('));
  const base = baseArgs(sq, '/b.png').join(' ');
  assert.ok(base.includes('lte(abs('));
  const round = stickerLayout({ ...defaultDesign(), corner: 0.6 }, landscape);
  assert.ok(maskArgs(round, '/m.png').join(' ').includes('hypot'));
});

test('vídeo sem tamanho conhecido não quebra a conta (usa no mínimo 2x2)', () => {
  const l = stickerLayout(defaultDesign(), { width: 0, height: 0 });
  assert.ok(l.crop && l.crop.w > 0);
  assert.ok(Number.isFinite(l.content.radius));
});
