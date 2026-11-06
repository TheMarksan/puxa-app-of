import assert from 'node:assert/strict';
import { test } from 'node:test';

import { captionCenter, captionPlacement, defaultCaptionStyle } from '../src/editor/captionLayout';
import { frameAt, frameSegments, wordSpans } from '../src/editor/captionMotion';
import { chunk, fromWhisper, mapToTimeline, parseTTML, slice, tidy } from '../src/editor/captions';
import { captionList, estimateBytes, n, planOverlays, plannedBitrate, videoBitrate, WHATSAPP_BYTES } from '../src/editor/render';
import { clipAt, clipStarts, defaultClip, outputSize, placement, projectLength, splitClip } from '../src/editor/timeline';
import { FONT_ID_LIST, type Clip, type FontId, type MediaSource, type Project } from '../src/editor/types';

const video: MediaSource = { id: 'v', kind: 'video', path: '/v.mp4', duration: 60, width: 1280, height: 720, hasAudio: true, title: 'v', origin: 'youtube' };

const clip = (over: Partial<Clip>): Clip => ({ ...defaultClip(video, 0, 10), ...over });

test('transições sobrepõem clipes e encurtam o total', () => {
  const clips = [clip({ in: 0, out: 4, transition: { kind: 'fade', duration: 1 } }), clip({ in: 10, out: 13 }), clip({ in: 20, out: 22, speed: 2 })];
  assert.deepEqual(clipStarts(clips), [0, 3, 6]);
  assert.equal(projectLength({ clips }), 7);
  assert.equal(clipAt(clips, 3.5)?.index, 0);
  assert.equal(clipAt(clips, 3.5, true)?.index, 1);
  assert.equal(clipAt(clips, 6.5)?.index, 2);
});

test('transição nunca passa da metade do clipe mais curto', () => {
  const clips = [clip({ in: 0, out: 1, transition: { kind: 'fade', duration: 3 } }), clip({ in: 0, out: 5 })];
  assert.ok(clipStarts(clips)[1] > 0.5);
});

test('dividir mantém o tempo total e tira a transição da primeira metade', () => {
  const clips = [clip({ in: 2, out: 8, transition: { kind: 'fade', duration: 0.5 } }), clip({ in: 0, out: 2 })];
  const before = projectLength({ clips });
  const after = splitClip(clips, 2.5)!;
  assert.equal(after.length, 3);
  assert.equal(after[0].out, 4.5);
  assert.equal(after[1].in, 4.5);
  assert.equal(after[0].transition, null);
  assert.ok(after[1].transition);
  assert.ok(Math.abs(projectLength({ clips: after }) - before) < 1e-9);
  assert.equal(splitClip(clips, 0.05), null);
});

test('tamanhos de saída pares e sem aumentar vídeo pequeno no formato original', () => {
  assert.deepEqual(outputSize('9:16', 720), { width: 720, height: 1280 });
  assert.deepEqual(outputSize('4:5', 1080), { width: 1080, height: 1350 });
  assert.deepEqual(outputSize('original', 720, { width: 640, height: 360 }), { width: 640, height: 360 });
  assert.deepEqual(outputSize('original', 720, { width: 1920, height: 1080 }), { width: 1280, height: 720 });
});

test('enquadramento: preencher cobre, encaixar cabe, arrastar não mostra borda', () => {
  const fill = placement(clip({}), video, 720, 1280);
  assert.ok(fill.covers);
  const right = placement(clip({ panX: 1 }), video, 720, 1280);
  assert.equal(right.x, 0);
  const left = placement(clip({ panX: -1 }), video, 720, 1280);
  assert.equal(left.x + left.sw, 720);
  const fit = placement(clip({ fit: 'fit' }), video, 720, 1280);
  assert.equal(fit.sw, 720);
  assert.ok(fit.sh < 1280);
});

const TTML = `<?xml version="1.0" encoding="utf-8" ?><tt xml:lang="en"><body><div>
<p begin="00:00:18.800" end="00:00:21.880" style="s2">We&apos;re no strangers<br />to love</p>
<p begin="00:00:22.640" end="00:00:26.960">You know the rules &amp; so do I</p>
<p begin="00:00:27.000" end="00:00:27.050">x</p>
<p t="31000" d="2500">formato <span>srv</span></p>
</div></body></tt>`;

test('lê o TTML do YouTube (entidades, quebras, tags, t/d)', () => {
  const cues = parseTTML(TTML);
  assert.equal(cues.length, 3);
  assert.deepEqual(cues[0], { start: 18.8, end: 21.88, text: "We're no strangers\nto love" });
  assert.equal(cues[1].text, 'You know the rules & so do I');
  assert.deepEqual(cues[2], { start: 31, end: 33.5, text: 'formato srv' });
});

test('legenda automática que rola: tira a linha repetida e a sobreposição', () => {
  const cues = tidy([
    { start: 0, end: 3, text: 'primeira linha' },
    { start: 2, end: 5, text: 'primeira linha\nsegunda linha' },
    { start: 4, end: 7, text: 'segunda linha\nterceira' },
  ]);
  assert.deepEqual(cues.map((c) => c.text), ['primeira linha', 'segunda linha', 'terceira']);
  assert.equal(cues[0].end, 2);
  assert.equal(cues[1].end, 4);
});

test('quebra legenda longa em blocos de até 2 linhas, dividindo o tempo', () => {
  const out = chunk([{ start: 0, end: 6, text: 'um texto bem comprido que não cabe em duas linhas curtas de legenda no celular' }], 20, 2);
  assert.ok(out.length >= 2);
  assert.ok(out.every((c) => c.text.split('\n').length <= 2 && c.text.split('\n').every((l) => l.length <= 20 || !l.includes(' '))));
  assert.equal(out[0].start, 0);
  assert.equal(out[out.length - 1].end, 6);
});

test('segmentos do Whisper (10 ms) viram legendas e descartam [Música]', () => {
  const cues = fromWhisper([{ text: ' Olá pessoal', t0: 120, t1: 250 }, { text: ' [Música]', t0: 260, t1: 400 }, { text: ' tudo bem?', t0: 410, t1: 520 }], 10);
  assert.deepEqual(cues, [{ start: 11.2, end: 12.5, text: 'Olá pessoal' }, { start: 14.1, end: 15.2, text: 'tudo bem?' }]);
});

test('legendas da origem vão para a linha do tempo de cada clipe', () => {
  const clips = [clip({ in: 10, out: 14 }), clip({ in: 30, out: 34, speed: 2 })];
  const cues = mapToTimeline([{ start: 11, end: 12, text: 'a' }, { start: 31, end: 33, text: 'b' }, { start: 50, end: 51, text: 'fora' }], clips, 'v');
  assert.deepEqual(cues, [{ start: 1, end: 2, text: 'a' }, { start: 4.5, end: 5.5, text: 'b' }]);
  assert.deepEqual(slice([{ start: 9, end: 12, text: 'x' }], 10, 20), [{ start: 0, end: 2, text: 'x' }]);
});

test('lista do concat cobre o vídeo todo e repete o último arquivo', () => {
  const list = captionList([{ path: '/a.png', start: 1, end: 2 }, { path: "/b'c.png", start: 2, end: 3 }], '/blank.png', 5);
  assert.match(list, /^ffconcat version 1.0\nfile '\/blank.png'\nduration 1\nfile '\/a.png'\nduration 1\n/);
  assert.ok(list.includes("file '/b'\\''c.png'"));
  assert.ok(list.trimEnd().endsWith("file '/blank.png'"));
  assert.equal(n(1 / 3), '0.3333');
  assert.equal(n(2), '2');
  assert.equal(n(1e-7), '0');
});

test('caber no WhatsApp: vídeo longo baixa o bitrate, curto fica no padrão', () => {
  const full = videoBitrate(720, 1280);
  assert.ok(full > 3_500_000 && full < 4_200_000);
  assert.equal(plannedBitrate(720, 1280, 10, true), full);
  const long = plannedBitrate(720, 1280, 60, true);
  assert.ok(long < full);
  assert.ok(estimateBytes(long, 60) < WHATSAPP_BYTES);
  assert.equal(plannedBitrate(720, 1280, 60, false), full);
  // Trecho de um vídeo baixado: não passa do bitrate do original
  assert.equal(plannedBitrate(1280, 720, 10, true, 1_600_000), 1_600_000);
});

test('textos e facecam usam o lado menor: 16:9 não deixa tudo maior', () => {
  const base: Project = {
    id: 'p', title: 't', aspect: '9:16', quality: 720, duck: true, createdAt: 0, updatedAt: 0, audio: [], captions: null,
    sources: { v: video },
    clips: [defaultClip(video, 0, 5)],
    layers: [{ kind: 'text', id: 'l', start: 0, end: 5, x: 0.5, y: 0.5, scale: 1, rotation: 0, fade: false, text: 'Oi', style: { font: 'archivo', size: 0.075, color: '#fff', background: 'none', bgColor: '#000', align: 'center' } }],
  };
  const fonts = Object.fromEntries(FONT_ID_LIST.map((f) => [f, `${f}.ttf`])) as Record<FontId, string>;
  const tall = planOverlays(base, fonts);
  const wide = planOverlays({ ...base, aspect: '16:9' }, fonts);
  assert.equal(wide.width, 1280);
  assert.equal(tall.specs[0].size, wide.specs[0].size);
  assert.ok(Math.abs((wide.specs[0].size as number) - 54) < 0.01);
});

test('palavras repartem o tempo da legenda e apontam para o texto', () => {
  const cue = { start: 1, end: 3, text: 'Olha só\nque lugar!' };
  const w = wordSpans(cue);
  assert.equal(w.length, 4);
  assert.equal(cue.text.slice(w[2].from, w[2].to), 'que');
  assert.ok(Math.abs(w[0].start - 1) < 1e-9 && Math.abs(w[3].end - 3) < 1e-9);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].start >= w[i - 1].start);
});

test('pop: começa pequeno e transparente, termina sumindo; colada na próxima não some', () => {
  const cue = { start: 2, end: 4, text: 'Oi gente' };
  const segs = frameSegments(cue, 'pop', { rise: 20, fps: 30 });
  assert.ok(segs[0].frame.scale < 0.8 && segs[0].frame.opacity < 0.5);
  const total = segs.reduce((a, b) => a + (b.end - b.start), 0);
  assert.ok(Math.abs(total - 2) < 1e-6);
  assert.ok(segs.length > 8 && segs.length < 20);
  assert.ok(segs[segs.length - 1].frame.opacity < 0.5);
  const glued = frameSegments(cue, 'pop', { rise: 20, fps: 30, next: 4.02 });
  assert.equal(glued[glued.length - 1].frame.opacity, 1);
  assert.equal(frameAt(cue, 'pop', 5, { rise: 20 }), null);
});

test('palavra a palavra e karaokê: um quadro por palavra', () => {
  const cue = { start: 0, end: 2, text: 'uma duas três' };
  const words = frameSegments(cue, 'words', { rise: 0, fps: 30 }).map((s) => s.frame.text);
  assert.deepEqual(words, ['uma', 'uma duas', 'uma duas três']);
  const kara = frameSegments(cue, 'karaoke', { rise: 0, fps: 30 }).map((s) => cue.text.slice(...s.frame.hl!));
  assert.deepEqual(kara, ['uma', 'duas', 'três']);
  const single = frameSegments(cue, 'single', { rise: 0, fps: 30 });
  assert.ok(single.every((s) => s.frame.fit === s.frame.text && !s.frame.text.includes(' ')));
});

test('legenda arrastada: centro onde foi solta e linha mais curta perto da borda', () => {
  const st = { ...defaultCaptionStyle(), x: 0.3, y: 0.4 };
  const p = captionPlacement(st, 720, 1280);
  assert.equal(p.valign, 'center');
  assert.ok(Math.abs(p.x + p.width / 2 - 0.3 * 720) <= 1);
  assert.ok(Math.abs(p.y + p.height / 2 - 0.4 * 1280) <= 1);
  assert.ok(p.maxWidth < 720 * 0.6);
  const fixed = captionPlacement(defaultCaptionStyle(), 720, 1280);
  assert.equal(fixed.valign, 'bottom');
  const c = captionCenter(defaultCaptionStyle(), 80, 720, 1280);
  assert.equal(c.x, 0.5);
  assert.ok(c.y > 0.8 && c.y < 0.95);
});
