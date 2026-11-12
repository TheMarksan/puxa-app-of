import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dubMixArgs, estimateCredits, fitPlan, sentences } from '../src/ai/dubPlan';
import { fromWords, iso1, type ScribeWord } from '../src/ai/words';

const w = (text: string, start: number, end: number, speaker?: string): ScribeWord => ({ text, start, end, type: 'word', speaker });
const sp = (start: number): ScribeWord => ({ text: ' ', start, end: start, type: 'spacing' });

test('palavras da ElevenLabs viram legendas: pausa, fim de frase e troca de quem fala quebram', () => {
  const words = [w('Olha', 0.1, 0.3), sp(0.3), w('só,', 0.35, 0.6), sp(0.6), w('que', 0.65, 0.8), w('lugar', 0.85, 1.1), w('bonito.', 1.15, 1.6), w('Verdade', 2.6, 3.0, 'b'), w('mesmo!', 3.05, 3.4, 'b')];
  const cues = fromWords(words, 10);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'Olha só, que lugar bonito.');
  assert.equal(cues[0].start, 10.1);
  assert.equal(cues[1].text, 'Verdade mesmo!');
  // Eventos de som (risadas) e espaços ficam de fora
  const withEvent = fromWords([w('Oi', 0, 0.2), { text: '(risos)', start: 0.3, end: 0.8, type: 'audio_event' }, w('gente', 0.9, 1.2)]);
  assert.equal(withEvent[0].text, 'Oi gente');
});

test('frases para dublar: duas vozes, a terceira pessoa volta para a primeira voz', () => {
  const words = [
    w('Hello', 0, 0.3, 'speaker_0'),
    w('there.', 0.35, 0.7, 'speaker_0'),
    w('Hi!', 1.0, 1.2, 'speaker_1'),
    w('How', 1.3, 1.4, 'speaker_1'),
    w('are', 1.45, 1.6, 'speaker_1'),
    w('you?', 1.65, 1.9, 'speaker_1'),
    w('Fine', 2.2, 2.5, 'speaker_2'),
  ];
  const lines = sentences(words);
  assert.deepEqual(
    lines.map((l) => [l.speaker, l.text]),
    [
      [0, 'Hello there.'],
      [1, 'Hi! How are you?'],
      [0, 'Fine'],
    ],
  );
  // Pausa longa no meio da fala da mesma pessoa também separa
  const paused = sentences([w('uma', 0, 0.2), w('coisa', 0.3, 0.5), w('outra', 2.0, 2.3)]);
  assert.equal(paused.length, 2);
});

test('encaixe das falas: acelera até 1,35x e a próxima espera a anterior acabar', () => {
  const plan = fitPlan(
    [
      { start: 0, dur: 2 }, // cabe (2 s até a próxima)
      { start: 2, dur: 3 }, // só tem 1 s: acelera no máximo e passa do tempo
      { start: 3, dur: 1 },
    ],
    6,
  );
  assert.equal(plan[0].speed, 1);
  assert.equal(plan[0].at, 0);
  assert.equal(plan[1].speed, 1.35);
  assert.ok(Math.abs(plan[1].len - 3 / 1.35) < 1e-9);
  // A terceira não sobrepõe a segunda
  assert.ok(plan[2].at >= plan[1].at + plan[1].len);
  assert.ok(estimateCredits(60) >= 800 && estimateCredits(60) <= 900);
});

test('comando que junta as falas: atraso em ms, aceleração, mistura e o tamanho exato do trecho', () => {
  const args = dubMixArgs(
    [
      { path: '/a.mp3', at: 1.5, speed: 1.2, dur: 2 },
      { path: '/b.mp3', at: 4, speed: 1, dur: 1.4 },
    ],
    8,
    '/out.m4a',
  );
  const graph = args[args.indexOf('-filter_complex') + 1];
  assert.match(graph, /\[0:a\]atrim=0:2\.000,.*atempo=1\.200,adelay=1500\|1500\[d0\]/);
  assert.ok(!/\[1:a\][^;]*atempo/.test(graph));
  assert.match(graph, /\[d0\]\[d1\]amix=inputs=2:normalize=0/);
  assert.match(graph, /apad,atrim=0:8\.000\[out\]$/);
  assert.equal(args[args.indexOf('-map') + 1], '[out]');
  assert.equal(args[args.length - 1], '/out.m4a');
  const single = dubMixArgs([{ path: '/a.mp3', at: 0, speed: 1, dur: 1 }], 3, '/o.m4a');
  assert.ok(!single[single.indexOf('-filter_complex') + 1].includes('amix'));
});

test('idioma de 3 letras vira o de 2 letras do tradutor', () => {
  assert.equal(iso1('eng'), 'en');
  assert.equal(iso1('por'), 'pt');
  assert.equal(iso1('pt-BR'), 'pt');
  assert.equal(iso1('xx'), 'xx');
});
