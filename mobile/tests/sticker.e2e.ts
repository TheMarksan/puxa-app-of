/**
 * Teste de ponta a ponta das figurinhas: roda o mesmo buildSticker do app com o ffmpeg 6.1.1 do
 * computador (o mesmo do aparelho) e o desenhista de texto de tests/overlays.py, e confere as
 * regras do WhatsApp com o Pillow: 512x512, peso, animação repetindo, quadros e duração.
 *
 *   npx tsx tests/sticker.e2e.ts <pasta-de-midia> <pasta-de-saida>
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildSticker, type StickerRequest } from '../src/stickers/make';
import { ANIMATED_LIMIT, defaultDesign, STILL_LIMIT, type StickerDesign } from '../src/stickers/sticker';

const [media, outRoot] = process.argv.slice(2);
mkdirSync(outRoot, { recursive: true });
const FONT = join(__dirname, '../node_modules/@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf');

function probe(file: string) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  const [width, height] = r.stdout.toString().trim().split(',').map(Number);
  return { path: file, width, height };
}

function ffmpeg(args: string[]) {
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg falhou: ${r.stderr.toString().slice(-1500)}\n${args.join(' ')}`);
}

type Case = { name: string; file: string; kind: StickerRequest['kind']; start: number; duration: number; design: Partial<StickerDesign> };

const cases: Case[] = [
  { name: 'animada-quadrado-3s', file: 'rick360.mp4', kind: 'animated', start: 30, duration: 3, design: {} },
  { name: 'animada-circulo-6s', file: 'rick360.mp4', kind: 'animated', start: 60, duration: 6, design: { corner: 1, crop: { zoom: 1.4, panX: 0, panY: -0.2 } } },
  { name: 'animada-cantos-retos-4s', file: 'rick360.mp4', kind: 'animated', start: 10, duration: 4, design: { corner: 0 } },
  { name: 'animada-cantos-60-sem-contorno', file: 'portrait.mp4', kind: 'animated', start: 0, duration: 3, design: { corner: 0.6, outline: false } },
  { name: 'animada-inteiro-pilula', file: 'landscape.mp4', kind: 'animated', start: 0, duration: 3, design: { shape: 'fit', corner: 1 } },
  // Como chega do X e do Instagram: MP4 fragmentado em retrato, depois de reempacotado como no aparelho
  { name: 'animada-x-retrato-circulo', file: 'social.mp4', kind: 'animated', start: 0.5, duration: 4, design: { corner: 1 } },
  { name: 'animada-x-retrato-quadrado-texto', file: 'social.mp4', kind: 'animated', start: 0, duration: 5, design: { corner: 0.28, text: 'olha isso', crop: { zoom: 1.2, panX: 0, panY: 0.4 } } },
  { name: 'parada-x-retrato-cantos-0', file: 'social.mp4', kind: 'still', start: 2, duration: 0, design: { corner: 0 } },
  { name: 'animada-inteiro-10s-texto', file: 'rick360.mp4', kind: 'animated', start: 90, duration: 10, design: { shape: 'fit', text: 'quando o pix cai', textPosition: 'bottom' } },
  { name: 'animada-retrato-5s', file: 'portrait.mp4', kind: 'animated', start: 0, duration: 5, design: { outline: false } },
  // Pior caso para o peso: ruído em todos os quadros (obriga a descer qualidade e quadros por segundo)
  { name: 'animada-ruido-4s', file: 'facecam.mp4', kind: 'animated', start: 0, duration: 4, design: {} },
  { name: 'parada-quadrado-texto', file: 'rick360.mp4', kind: 'still', start: 45, duration: 0, design: { text: 'nunca vou te abandonar', textPosition: 'top', textColor: 'yellow' } },
  { name: 'parada-inteiro-sem-contorno', file: 'landscape.mp4', kind: 'still', start: 2, duration: 0, design: { shape: 'fit', outline: false } },
  { name: 'parada-circulo', file: 'facecam.mp4', kind: 'still', start: 1, duration: 0, design: { corner: 1 } },
];

const PY = `
import json, struct, sys
from PIL import Image
p = sys.argv[1]; b = open(p, 'rb').read()
assert b[:4] == b'RIFF' and b[8:12] == b'WEBP'
durs, loop, canvas, off = [], None, None, 12
while off + 8 <= len(b):
    tag = b[off:off+4]; size = struct.unpack('<I', b[off+4:off+8])[0]; o = off + 8
    if tag == b'VP8X': canvas = [int.from_bytes(b[o+4:o+7], 'little') + 1, int.from_bytes(b[o+7:o+10], 'little') + 1]
    elif tag == b'ANIM': loop = struct.unpack('<H', b[o+4:o+6])[0]
    elif tag == b'ANMF': durs.append(int.from_bytes(b[o+12:o+15], 'little'))
    off = o + size + (size & 1)
im = Image.open(p)
print(json.dumps({'size': canvas or list(im.size), 'frames': max(1, len(durs)), 'duration': sum(durs), 'minFrame': min(durs) if durs else None, 'loop': loop, 'alpha': im.mode == 'RGBA'}))
`;

(async () => {
  const report: Record<string, unknown>[] = [];
  let failures = 0;
  for (const c of cases) {
    const dir = join(outRoot, c.name);
    mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    const res = await buildSticker(
      { kind: c.kind, src: probe(join(media, c.file)), start: c.start, duration: c.duration, design: { ...defaultDesign(), ...c.design } },
      {
        dir,
        font: FONT,
        ffmpeg: async (args) => ffmpeg(args),
        size: (p) => statSync(p).size,
        renderText: async (spec, d) => {
          const specs = join(d, 'texto.json');
          writeFileSync(specs, JSON.stringify([spec]));
          const r = spawnSync('python3', [join(__dirname, 'overlays.py'), specs, d]);
          if (r.status !== 0) throw new Error(r.stderr.toString());
          return JSON.parse(r.stdout.toString())[0];
        },
      },
    );
    const info = JSON.parse(spawnSync('python3', ['-c', PY, res.webp]).stdout.toString() || '{}');
    const limit = c.kind === 'still' ? STILL_LIMIT : ANIMATED_LIMIT;
    const problems: string[] = [];
    if (info.size?.[0] !== 512 || info.size?.[1] !== 512) problems.push(`tamanho ${info.size}`);
    if (res.size > limit) problems.push(`peso ${res.size} > ${limit}`);
    if (c.kind === 'animated') {
      if (info.frames < 2) problems.push('não animou');
      if (info.loop !== 0) problems.push(`loop=${info.loop} (precisa ser 0)`);
      if (info.duration > 10000) problems.push(`duração ${info.duration} ms > 10 s`);
      if (info.minFrame < 8) problems.push(`quadro de ${info.minFrame} ms (mínimo 8)`);
    }
    if (problems.length) failures++;
    report.push({ case: c.name, webp: res.webp, kb: Math.round(res.size / 1024), quality: res.quality, fps: res.fps, attempts: res.attempts, ms: Date.now() - t0, ...info, problems });
    console.log(
      `${problems.length ? 'FALHOU' : 'ok    '} ${c.name}: ${Math.round(res.size / 1024)} KB, q${res.quality}${res.fps ? ` ${res.fps} fps` : ''}, ${res.attempts} tentativa(s), ${info.frames} quadro(s), ${info.duration} ms, ${Date.now() - t0} ms de trabalho ${problems.join('; ')}`,
    );
  }
  writeFileSync(join(outRoot, 'relatorio.json'), JSON.stringify(report, null, 1));
  // Folha de contato: o primeiro quadro de cada figurinha sobre um xadrez (mostra a transparência)
  spawnSync('python3', [
    '-c',
    `
import json, sys, os
from PIL import Image, ImageDraw
rows = json.load(open(sys.argv[1])); root = sys.argv[2]
tile = 200; per = 7; cols = min(per, len(rows)); lines = (len(rows) + per - 1) // per
sheet = Image.new('RGBA', (tile * cols, tile * lines), (255, 255, 255, 255))
d = ImageDraw.Draw(sheet)
for y in range(0, tile * lines, 16):
    for x in range(0, tile * cols, 16):
        if (x // 16 + y // 16) % 2: d.rectangle([x, y, x + 15, y + 15], fill=(222, 222, 222, 255))
for i, r in enumerate(rows):
    im = Image.open(r['webp']).convert('RGBA').resize((tile, tile))
    sheet.alpha_composite(im, ((i % per) * tile, (i // per) * tile))
sheet.save(os.path.join(root, 'figurinhas.png'))
`,
    join(outRoot, 'relatorio.json'),
    outRoot,
  ]);
  console.log(failures ? `${failures} caso(s) com problema` : 'todas as figurinhas dentro das regras do WhatsApp');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

