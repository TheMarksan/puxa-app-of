/**
 * Teste de ponta a ponta do gerador de comando: monta projetos de verdade com mídia local,
 * desenha as camadas com tests/overlays.py (no lugar do Kotlin), roda o ffmpeg 6.1.1 do
 * computador e confere duração, tamanho e faixas. Também tira quadros para conferir de olho.
 *
 *   npx tsx tests/render.e2e.ts <pasta-de-midia> <pasta-de-saida>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildCommand, planOverlays } from '../src/editor/render';
import { defaultClip, defaultTextStyle, projectLength } from '../src/editor/timeline';
import type { FontId, MediaSource, Project } from '../src/editor/types';

const [media, outRoot] = process.argv.slice(2);
mkdirSync(outRoot, { recursive: true });

// As mesmas fontes do app (os mesmos .ttf que o aparelho usa para desenhar os PNGs)
const G = join(__dirname, '../node_modules/@expo-google-fonts');
const fonts: Record<FontId, string> = {
  archivo: join(G, 'archivo/800ExtraBold/Archivo_800ExtraBold.ttf'),
  montserrat: join(G, 'montserrat/900Black/Montserrat_900Black.ttf'),
  poppins: join(G, 'poppins/800ExtraBold/Poppins_800ExtraBold.ttf'),
  nunito: join(G, 'nunito/900Black/Nunito_900Black.ttf'),
  fredoka: join(G, 'fredoka/700Bold/Fredoka_700Bold.ttf'),
  bebas: join(G, 'bebas-neue/400Regular/BebasNeue_400Regular.ttf'),
  anton: join(G, 'anton/400Regular/Anton_400Regular.ttf'),
  oswald: join(G, 'oswald/700Bold/Oswald_700Bold.ttf'),
  lora: join(G, 'lora/700Bold/Lora_700Bold.ttf'),
  playfair: join(G, 'playfair-display/800ExtraBold/PlayfairDisplay_800ExtraBold.ttf'),
  caveat: join(G, 'caveat/700Bold/Caveat_700Bold.ttf'),
  marker: join(G, 'permanent-marker/400Regular/PermanentMarker_400Regular.ttf'),
  pacifico: join(G, 'pacifico/400Regular/Pacifico_400Regular.ttf'),
  bangers: join(G, 'bangers/400Regular/Bangers_400Regular.ttf'),
  mono: join(G, 'space-mono/700Bold/SpaceMono_700Bold.ttf'),
};

function probe(id: string, file: string, origin: MediaSource['origin'] = 'gallery'): MediaSource {
  const path = join(media, file);
  if (/\.(jpe?g|png)$/i.test(file)) {
    const [w, h] = execFileSync('python3', ['-c', `from PIL import Image;im=Image.open('${path}');print(im.size[0],im.size[1])`]).toString().trim().split(' ').map(Number);
    return { id, kind: 'image', path, duration: 0, width: w, height: h, hasAudio: false, title: file, origin };
  }
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', path]).toString());
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const a = j.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  return {
    id,
    kind: v ? 'video' : 'audio',
    path,
    duration: Number(j.format.duration),
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    hasAudio: !!a,
    title: file,
    origin,
  };
}

const S = {
  land: probe('land', 'landscape.mp4'),
  port: probe('port', 'portrait.mp4'),
  photo: probe('photo', 'photo.jpg'),
  rick: probe('rick', 'rick360.mp4', 'youtube'),
  cam: probe('cam', 'facecam.mp4', 'camera'),
  music: probe('music', 'music.m4a', 'music'),
  voice: probe('voice', 'voice.m4a', 'mic'),
};

const base = (id: string, over: Partial<Project>): Project => ({
  id,
  title: id,
  aspect: '9:16',
  quality: 720,
  clips: [],
  layers: [],
  audio: [],
  captions: null,
  duck: true,
  sources: S,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const projects: Project[] = [
  base('tudo', {
    clips: [
      { ...defaultClip(S.land, 0, 4), zoom: 1.25, panX: 0.6, transition: { kind: 'slideleft', duration: 0.6 } },
      { ...defaultClip(S.port, 0.5, 4), fit: 'blur', transition: { kind: 'circleopen', duration: 0.7 } },
      { ...defaultClip(S.photo), motion: 'zoomin' },
      { ...defaultClip(S.rick, 30, 36), speed: 1.5, filter: 'warm', fit: 'blur', transition: { kind: 'fade', duration: 0.5 } },
      { ...defaultClip(S.land, 1, 3), filter: 'bw', rotate: 90, fit: 'fit' },
    ],
    layers: [
      { id: 't1', kind: 'text', text: 'Puxa no modo Criar', style: { ...defaultTextStyle(), background: 'box', bgColor: '#2547D0E6' }, start: 0.3, end: 4, x: 0.5, y: 0.18, scale: 1, rotation: -4, fade: true },
      { id: 's1', kind: 'sticker', emoji: '🔥', start: 1, end: 6, x: 0.8, y: 0.62, scale: 1, rotation: 15, fade: true },
      { id: 'i1', kind: 'image', sourceId: 'photo', rounded: true, border: true, start: 6, end: 9.5, x: 0.28, y: 0.3, scale: 1, rotation: 0, fade: false },
      { id: 'f1', kind: 'facecam', sourceId: 'cam', in: 0, shape: 'circle', border: true, borderColor: '#FFFFFF', mirror: true, volume: 1, start: 2, end: 6, x: 0.76, y: 0.8, scale: 1, rotation: 0, fade: false },
    ],
    captions: {
      label: 'teste',
      style: { ...defaultTextStyle(), background: 'line', bgColor: '#000000B3', size: 0.06, position: 'bottom', uppercase: false, motion: 'pop', x: 0.5, y: 0.7 },
      cues: [
        { start: 0.5, end: 2.2, text: 'Primeira legenda' },
        { start: 2.4, end: 4.6, text: 'Uma legenda maior que precisa quebrar em duas linhas' },
        { start: 7, end: 9, text: 'Depois de um intervalo' },
        { start: 10.5, end: 12.5, text: 'Quase no fim' },
      ],
    },
    audio: [
      { id: 'm1', kind: 'music', sourceId: 'music', start: 0, in: 20, out: 60, volume: 0.5, fadeIn: 1, fadeOut: 2, loop: false, title: 'música' },
      { id: 'n1', kind: 'voice', sourceId: 'voice', start: 7, in: 0, out: 3, volume: 1, fadeIn: 0, fadeOut: 0, loop: false, title: 'narração' },
    ],
  }),
  base('trecho', {
    aspect: 'original',
    clips: [defaultClip(S.rick, 40, 48)],
    captions: {
      label: 'trecho',
      style: { ...defaultTextStyle(), background: 'outline', bgColor: '#000000FF', size: 0.07, position: 'bottom', uppercase: true, motion: 'karaoke', highlight: '#FFD60A' },
      cues: [
        { start: 0, end: 3, text: 'Legenda gravada no vídeo' },
        { start: 3.2, end: 7.8, text: 'Com contorno, em maiúsculas' },
      ],
    },
  }),
  base('largo', {
    aspect: '16:9',
    duck: false,
    clips: [
      { ...defaultClip(S.port, 0, 3), fit: 'fit', transition: { kind: 'zoomin', duration: 0.5 } },
      { ...defaultClip(S.land, 0, 3), rotate: 180, flip: true, filter: 'cinema', transition: { kind: 'wipeleft', duration: 0.5 } },
      { ...defaultClip(S.photo), fit: 'blur', motion: 'none' },
    ],
    audio: [{ id: 'm2', kind: 'music', sourceId: 'music', start: 1, in: 0, out: 3, volume: 0.6, fadeIn: 0.5, fadeOut: 0.5, loop: true, title: 'loop' }],
    captions: {
      label: 'largo',
      style: { ...defaultTextStyle(), font: 'archivo', background: 'glow', color: '#FFFFFF', bgColor: '#FF2BD6FF', size: 0.07, position: 'bottom', uppercase: false, motion: 'rise', x: 0.3, y: 0.3 },
      cues: [
        { start: 0.2, end: 3.4, text: 'Neon subindo à esquerda' },
        { start: 4, end: 7.5, text: 'De novo, agora mais longa para quebrar' },
      ],
    },
  }),
  base('pilula', {
    aspect: '1:1',
    clips: [defaultClip(S.land, 0, 6)],
    captions: {
      label: 'pilula',
      style: { ...defaultTextStyle(), font: 'archivo', background: 'pill', color: '#111318', bgColor: '#FFFFFFF0', size: 0.07, position: 'bottom', uppercase: false, motion: 'words' },
      cues: [
        { start: 0.3, end: 2.9, text: 'Pílula palavra a palavra' },
        { start: 3, end: 5.8, text: 'Uma frase com várias palavras para crescer' },
      ],
    },
  }),
];

let failed = 0;
for (const p of projects) {
  const dir = join(outRoot, p.id);
  mkdirSync(dir, { recursive: true });
  const plan = planOverlays(p, fonts);
  writeFileSync(join(dir, 'specs.json'), JSON.stringify(plan.specs));
  const results = JSON.parse(execFileSync('python3', [join(__dirname, 'overlays.py'), join(dir, 'specs.json'), join(dir, 'png')]).toString());
  const out = join(dir, `${p.id}.mp4`);
  const listPath = join(dir, 'captions.ffconcat');
  const cmd = buildCommand(p, plan, results, { out, encoder: 'x264', captionListPath: listPath });
  if (cmd.captionList) writeFileSync(listPath, cmd.captionList);
  writeFileSync(join(dir, 'command.txt'), cmd.args.map((a) => (/[\s;'[\]]/.test(a) ? JSON.stringify(a) : a)).join(' '));
  const t0 = Date.now();
  const r = spawnSync('ffmpeg', cmd.args, { encoding: 'utf8' });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status !== 0) {
    failed++;
    console.log(`✗ ${p.id}: ffmpeg saiu com ${r.status}\n${r.stderr.split('\n').slice(-25).join('\n')}`);
    continue;
  }
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', out]).toString());
  const dur = Number(info.format.duration);
  const v = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const a = info.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  const expected = projectLength(p);
  const ok = Math.abs(dur - expected) < 0.15 && v?.width === plan.width && v?.height === plan.height && a?.codec_name === 'aac';
  if (!ok) failed++;
  console.log(
    `${ok ? '✓' : '✗'} ${p.id}: ${v?.width}x${v?.height} ${v?.r_frame_rate} ${dur.toFixed(2)}s (esperado ${expected.toFixed(2)}s), áudio ${a?.codec_name}, ${plan.specs.length} PNGs, render ${secs}s`,
  );
  // Quadros para conferir: uma folha com 8 momentos
  const times = Array.from({ length: 8 }, (_, i) => (expected * (i + 0.5)) / 8);
  times.forEach((t, i) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', out, '-frames:v', '1', '-vf', 'scale=-2:360', join(dir, `f${i}.png`)]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...times.flatMap((_, i) => ['-i', join(dir, `f${i}.png`)]), '-filter_complex', `${times.map((_, i) => `[${i}:v]`).join('')}hstack=inputs=${times.length}`, join(outRoot, `${p.id}-quadros.png`)]);
  // Volume ao longo do tempo, para ver a música abaixando quando a voz entra
  const vol = spawnSync('ffmpeg', ['-v', 'info', '-i', out, '-af', 'astats=metadata=1:reset=24,ametadata=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-'], { encoding: 'utf8' });
  const rms = [...vol.stderr.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => m[1]);
  const step = Math.max(1, Math.floor(rms.length / 14));
  console.log(`   RMS (dB) ao longo do vídeo: ${rms.filter((_, i) => i % step === 0).map((x) => (x === '-inf' ? '-∞' : Math.round(Number(x)))).join(' ')}`);
}
process.exit(failed ? 1 : 0);
