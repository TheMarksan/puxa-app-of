import { Directory } from 'expo-file-system';
import { Platform } from 'react-native';

import PuxaEngine from '../../modules/puxa-engine';
import { chunk } from '../editor/captions';
import { dirs, toUri } from '../editor/media';
import { extractSpeech, iso1 } from '../editor/subtitles';
import { newId } from '../editor/timeline';
import type { Cue } from '../editor/types';
import { dubMixArgs, fitPlan, sentences, type DubLine, type DubTarget } from './dubPlan';
import { scribe, speak } from './elevenlabs';

export { estimateCredits, TARGETS } from './dubPlan';
export type { DubLine, DubTarget } from './dubPlan';

/**
 * Dublagem: a ElevenLabs ouve o trecho (Scribe, separando quem fala), o tradutor do aparelho
 * passa as frases para o idioma escolhido, cada frase ganha a voz (até duas pessoas, uma voz
 * para cada) e o FFmpeg encaixa as falas nos tempos originais, por cima do som original baixinho.
 * O resultado é uma faixa de áudio do tamanho do trecho; o envio monta o vídeo com ela.
 */

export type DubResult = { path: string; lines: DubLine[]; cues: Cue[]; language: string; voices: number };

export type DubOptions = {
  path: string;
  from: number;
  to: number;
  /** Voz de quem fala primeiro e a da segunda pessoa. */
  voices: [string, string];
  target: DubTarget;
  progress: (label: string, fraction: number | null) => void;
  signal: { cancelled: boolean };
};

const cancelled = () => Object.assign(new Error('Cancelado'), { code: 'cancelled' });

export async function dub(o: DubOptions): Promise<DubResult> {
  const total = Math.max(0.5, o.to - o.from);
  if (Platform.OS === 'web') return previewDub(o, total);
  const folder = new Directory(toUri(dirs().cache), 'puxa', `dub-${newId('d')}`);
  folder.create({ intermediates: true, idempotent: true });
  const dir = decodeURI(folder.uri.replace(/^file:\/\//, '')).replace(/\/$/, '');

  o.progress('Separando o áudio…', null);
  const mp3 = await extractSpeech({ path: o.path, from: o.from, to: o.to }, 'mp3');
  if (o.signal.cancelled) throw cancelled();
  o.progress('Ouvindo o vídeo na ElevenLabs…', null);
  const heard = await scribe(mp3, { language: 'auto', diarize: true });
  if (o.signal.cancelled) throw cancelled();
  const language = iso1(heard.language);
  let lines = sentences(heard.words);
  if (!lines.length) throw Object.assign(new Error('Não achei fala neste trecho para dublar.'), { code: 'no_speech' });

  if (language !== o.target) {
    o.progress('Traduzindo as falas…', null);
    const translated = await PuxaEngine.translate(
      lines.map((l) => l.text),
      language,
      o.target,
    );
    lines = lines.map((l, i) => ({ ...l, text: translated[i] ?? l.text }));
  }

  const spoken: { path: string; dur: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (o.signal.cancelled) throw cancelled();
    o.progress(`Gravando as vozes (${i + 1} de ${lines.length})…`, i / lines.length);
    const l = lines[i];
    const r = await speak(l.text, o.voices[l.speaker] ?? o.voices[0], `${dir}/fala-${i}.mp3`, {
      previous: lines[i - 1]?.speaker === l.speaker ? lines[i - 1].text : undefined,
      next: lines[i + 1]?.speaker === l.speaker ? lines[i + 1].text : undefined,
    });
    spoken.push({ path: r.path, dur: Math.max(0.2, r.speechEnd + 0.08) });
  }

  if (o.signal.cancelled) throw cancelled();
  o.progress('Encaixando as falas no vídeo…', null);
  const plan = fitPlan(
    lines.map((l, i) => ({ start: l.start, dur: spoken[i].dur })),
    total,
  );
  const out = `${dir}/dublagem.m4a`;
  await PuxaEngine.ffmpeg(
    newId('dubmix'),
    dubMixArgs(
      spoken.map((s, i) => ({ path: s.path, at: plan[i].at, speed: plan[i].speed, dur: s.dur })),
      total,
      out,
    ),
    0,
  );
  const placed = lines.map((l, i) => ({ ...l, start: plan[i].at, end: Math.min(total, plan[i].at + plan[i].len) }));
  return {
    path: out,
    lines: placed,
    cues: chunk(placed.map((l) => ({ start: l.start, end: l.end, text: l.text }))),
    language: o.target,
    voices: new Set(lines.map((l) => l.speaker)).size,
  };
}

/** Prévia web: sem ElevenLabs, devolve frases de exemplo. */
async function previewDub(o: DubOptions, total: number): Promise<DubResult> {
  const steps = ['Ouvindo o vídeo na ElevenLabs…', 'Traduzindo as falas…', 'Gravando as vozes (1 de 3)…', 'Gravando as vozes (3 de 3)…', 'Encaixando as falas no vídeo…'];
  for (const [i, label] of steps.entries()) {
    if (o.signal.cancelled) throw cancelled();
    o.progress(label, i / steps.length);
    await new Promise((r) => setTimeout(r, 450));
  }
  const lines: DubLine[] = [
    { start: 0.4, end: 2.6, text: 'Olha só que lugar bonito', speaker: 0 },
    { start: 2.9, end: 5.2, text: 'A gente chegou bem na hora do pôr do sol', speaker: 1 },
    { start: 5.5, end: Math.min(total, 7.8), text: 'Ninguém acreditou quando eu contei', speaker: 0 },
  ].filter((l) => l.start < total);
  return { path: '/preview/song.m4a', lines, cues: chunk(lines), language: o.target, voices: 2 };
}
