import {
  clamp,
  clipLength,
  facecamSize,
  IMAGE_BASE,
  outputSize,
  placement,
  projectLength,
  rotatedSize,
  sizeUnit,
  STICKER_BASE,
  transitionLength,
} from './timeline';
import { captionPlacement, shownCues } from './captionLayout';
import { frameSegments } from './captionMotion';
import { FPS, type Clip, type FacecamLayer, type FilterId, type FontId, type Layer, type MediaSource, type Project } from './types';

/**
 * Projeto → comando do FFmpeg, em duas fases:
 * 1. planOverlays: o que o aparelho precisa desenhar em PNG (textos, figurinhas, imagens,
 *    faixas de legenda, máscaras da facecam);
 * 2. buildCommand: com os tamanhos reais desses PNGs, monta entradas e filter_complex.
 * O FFmpeg do app é o 6.1.1; os testes rodam o mesmo comando no ffmpeg 6.1.1 do computador.
 */

export type OverlaySpec = {
  name: string;
  kind: 'text' | 'emoji' | 'caption' | 'image' | 'mask' | 'ring' | 'blank';
  [key: string]: unknown;
};

export type OverlayResult = { path: string; width: number; height: number };

export type Encoder = 'hw' | 'sw' | 'x264';

type Ref =
  | { kind: 'layer'; layer: Layer; png: number }
  | { kind: 'facecam'; layer: FacecamLayer; mask: number | null; ring: number | null }
  | { kind: 'captions'; blank: number; segments: { png: number; start: number; end: number }[]; x: number; y: number };

export type Plan = {
  width: number;
  height: number;
  total: number;
  specs: OverlaySpec[];
  refs: Ref[];
};

/** Número curto para o FFmpeg (sem notação científica). */
export function n(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

const FILTERS: Record<FilterId, string> = {
  none: '',
  vivid: 'eq=saturation=1.35:contrast=1.06',
  warm: 'colorbalance=rs=0.07:gs=0.02:bs=-0.08:rm=0.05:bm=-0.05,eq=saturation=1.08',
  cool: 'colorbalance=rs=-0.06:bs=0.08:rm=-0.03:bm=0.06',
  bw: 'hue=s=0,eq=contrast=1.12',
  cinema: 'eq=contrast=1.12:saturation=0.82:gamma=0.97,vignette=angle=PI/5',
  vintage: 'curves=preset=vintage,eq=saturation=0.9',
};

export const FILTER_LABELS: Record<FilterId, string> = {
  none: 'Original',
  vivid: 'Vívido',
  warm: 'Quente',
  cool: 'Frio',
  bw: 'P&B',
  cinema: 'Cinema',
  vintage: 'Retrô',
};

function textSpec(name: string, l: Extract<Layer, { kind: 'text' }>, W: number, U: number, fonts: Record<FontId, string>): OverlaySpec {
  return {
    name,
    kind: 'text',
    text: l.text,
    font: fonts[l.style.font],
    size: l.style.size * U * l.scale,
    color: l.style.color,
    background: l.style.background,
    bgColor: l.style.bgColor,
    align: l.style.align,
    maxWidth: W * 0.9,
    rotation: l.rotation,
  };
}

export function planOverlays(p: Project, fonts: Record<FontId, string>): Plan {
  const first = p.clips[0] ? p.sources[p.clips[0].sourceId] : undefined;
  const { width: W, height: H } = outputSize(p.aspect, p.quality, first ? rotatedSize(first, p.clips[0].rotate) : undefined);
  const U = sizeUnit(W, H);
  const total = projectLength(p);
  const specs: OverlaySpec[] = [];
  const refs: Ref[] = [];
  const add = (s: OverlaySpec) => specs.push(s) - 1;

  for (const l of p.layers) {
    if (l.end <= l.start || l.start >= total) continue;
    if (l.kind === 'text') {
      if (!l.text.trim()) continue;
      refs.push({ kind: 'layer', layer: l, png: add(textSpec(`text-${l.id}.png`, l, W, U, fonts)) });
    } else if (l.kind === 'sticker') {
      refs.push({
        kind: 'layer',
        layer: l,
        png: add({ name: `sticker-${l.id}.png`, kind: 'emoji', text: l.emoji, size: STICKER_BASE * U * l.scale, rotation: l.rotation }),
      });
    } else if (l.kind === 'image') {
      const src = p.sources[l.sourceId];
      if (!src) continue;
      const w = even(IMAGE_BASE * U * l.scale);
      const h = even((w * Math.max(1, src.height)) / Math.max(1, src.width));
      refs.push({
        kind: 'layer',
        layer: l,
        png: add({
          name: `image-${l.id}.png`,
          kind: 'image',
          src: src.path,
          width: w,
          height: h,
          radius: l.rounded ? Math.min(w, h) * 0.08 : 0,
          border: l.border ? Math.max(2, U * 0.008) : 0,
          borderColor: '#FFFFFF',
          rotation: l.rotation,
        }),
      });
    } else if (l.kind === 'facecam') {
      if (!p.sources[l.sourceId]) continue;
      const D = facecamSize(l, U);
      const mask = l.shape === 'square' ? null : add({ name: `mask-${l.id}.png`, kind: 'mask', shape: l.shape, width: D, height: D });
      const ring = l.border
        ? add({ name: `ring-${l.id}.png`, kind: 'ring', shape: l.shape, width: D, height: D, border: Math.max(3, U * 0.01), color: l.borderColor })
        : null;
      refs.push({ kind: 'facecam', layer: l, mask, ring });
    }
  }

  if (p.captions && p.captions.cues.length) {
    const st = p.captions.style;
    const pl = captionPlacement(st, W, H);
    const blank = add({ name: 'cap-blank.png', kind: 'blank', width: W, height: pl.height });
    const up = (t: string) => (st.uppercase ? t.toUpperCase() : t);
    // Respeita o limite de linhas: uma legenda longa vira várias em sequência
    const cues = shownCues(p.captions.cues, st, W, H).filter((c) => c.end > c.start && c.start < total).map((c) => ({ ...c, end: Math.min(c.end, total) }));
    // Cada quadro diferente de cada legenda vira um PNG; quadros iguais reaproveitam o mesmo arquivo
    const seen = new Map<string, number>();
    const segments: { png: number; start: number; end: number }[] = [];
    cues.forEach((c, i) => {
      for (const seg of frameSegments(c, st.motion, { next: cues[i + 1]?.start, rise: H * 0.04, fps: FPS })) {
        const f = seg.frame;
        const text = up(f.text);
        const hl = f.hl && text.length === f.text.length ? f.hl : null;
        const spec = {
          kind: 'caption' as const,
          text,
          fitText: up(f.fit),
          font: fonts[st.font],
          size: st.size * U,
          color: st.color,
          background: st.background,
          bgColor: st.bgColor,
          align: st.align,
          width: W,
          height: pl.height,
          margin: pl.margin,
          maxWidth: pl.maxWidth,
          valign: pl.valign,
          opacity: f.opacity,
          scale: f.scale,
          dy: f.dy,
          ...(hl ? { hlStart: hl[0], hlEnd: hl[1], highlight: st.highlight ?? '#FFD60A' } : {}),
        };
        const key = JSON.stringify(spec);
        let png = seen.get(key);
        if (png == null) {
          png = add({ name: `cap-${seen.size}.png`, ...spec });
          seen.set(key, png);
        }
        segments.push({ png, start: seg.start, end: seg.end });
      }
    });
    refs.push({ kind: 'captions', blank, segments, x: pl.x, y: pl.y });
  }
  return { width: W, height: H, total, specs, refs };
}

/**
 * Lista para o demuxer concat: cada PNG fica na tela pelo tempo da legenda, e uma faixa
 * transparente preenche os intervalos. O último arquivo se repete, como o concat pede.
 */
export function captionList(cues: { path: string; start: number; end: number }[], blank: string, total: number): string {
  const lines = ['ffconcat version 1.0'];
  const q = (f: string) => `file '${f.replace(/'/g, "'\\''")}'`;
  let t = 0;
  for (const c of cues) {
    const start = Math.max(t, c.start);
    if (start - t > 0.001) {
      lines.push(q(blank), `duration ${n(start - t)}`);
    }
    const end = Math.max(start + 0.005, c.end);
    lines.push(q(c.path), `duration ${n(end - start)}`);
    t = end;
  }
  lines.push(q(blank), `duration ${n(Math.max(0.1, total - t + 1))}`, q(blank));
  return lines.join('\n') + '\n';
}

/**
 * Bitrate de vídeo padrão (bps), pela quantidade de pixels: ~3,9 Mbps em 720p e 8 Mbps em 1080p.
 * Sobra qualidade para a tela do celular sem inflar o arquivo.
 */
export function videoBitrate(W: number, H: number): number {
  return Math.round(clamp(W * H * FPS * 0.14, 700_000, 8_000_000));
}

export const AUDIO_BITRATE = 160_000;

/** Limite de vídeo do WhatsApp; acima disso ele manda como documento. */
export const WHATSAPP_BYTES = 16 * 1024 * 1024;

/**
 * Bitrate para o arquivo caber em [maxBytes] sem passar do padrão. Não desce de 1 Mbps (abaixo
 * disso a imagem desmancha): nesse caso o arquivo passa do limite e a interface avisa.
 * A folga de 12% cobre o contêiner e os codificadores que estouram um pouco o alvo.
 */
export function fitBitrate(W: number, H: number, seconds: number, maxBytes: number): number {
  const full = videoBitrate(W, H);
  const room = (maxBytes * 8 * 0.88) / Math.max(0.5, seconds) - AUDIO_BITRATE;
  return Math.round(Math.max(Math.min(1_000_000, full), Math.min(full, room)));
}

/**
 * O bitrate que a exportação vai usar. [cap] limita por cima: num trecho de um vídeo baixado,
 * não adianta gastar mais bits que o original tinha (o arquivo cresceria sem ganhar nitidez).
 */
export function plannedBitrate(W: number, H: number, seconds: number, fitWhatsApp: boolean, cap?: number): number {
  const rate = fitWhatsApp ? fitBitrate(W, H, seconds, WHATSAPP_BYTES) : videoBitrate(W, H);
  return Math.round(cap ? Math.min(rate, Math.max(500_000, cap)) : rate);
}

export function estimateBytes(bitrate: number, seconds: number): number {
  return Math.round(((bitrate + AUDIO_BITRATE) * seconds) / 8);
}

export type BuildOptions = {
  out: string;
  encoder: Encoder;
  /** bps; sem isso, videoBitrate(). */
  videoBitrate?: number;
  /** Onde o chamador vai gravar a lista do concat das legendas (o texto volta em `captionList`). */
  captionListPath: string;
};

export type Command = { args: string[]; total: number; captionList: string | null };

function audioNorm(): string {
  return 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
}

/** atempo aceita de 0,5 a 100; abaixo de 0,5 encadeia. */
function atempo(speed: number): string[] {
  if (Math.abs(speed - 1) < 0.001) return [];
  const out: string[] = [];
  let s = speed;
  while (s < 0.5) {
    out.push('atempo=0.5');
    s /= 0.5;
  }
  out.push(`atempo=${n(s)}`);
  return out;
}

function rotation(c: Clip): string[] {
  const f: string[] = [];
  if (c.rotate === 90) f.push('transpose=1');
  else if (c.rotate === 270) f.push('transpose=2');
  else if (c.rotate === 180) f.push('hflip', 'vflip');
  if (c.flip) f.push('hflip');
  return f;
}

export function buildCommand(p: Project, plan: Plan, results: OverlayResult[], opts: BuildOptions): Command {
  const { width: W, height: H, total: T } = plan;
  const inputs: string[][] = [];
  const graph: string[] = [];
  const addInput = (args: string[]) => inputs.push(args) - 1;

  // ---------- Clipes ----------
  p.clips.forEach((c, i) => {
    const src: MediaSource | undefined = p.sources[c.sourceId];
    if (!src) throw new Error(`Mídia ausente: ${c.sourceId}`);
    const D = clipLength(c);
    const isImage = src.kind === 'image';
    const pl = placement(c, src, W, H);
    const kenBurns = isImage && c.motion !== 'none' && c.fit === 'fill';
    const k = isImage
      ? addInput(kenBurns ? ['-i', src.path] : ['-loop', '1', '-framerate', String(FPS), '-t', n(D + 0.5), '-i', src.path])
      : addInput(['-ss', n(c.in), '-t', n(c.out - c.in + 0.1), '-i', src.path]);

    const pre = [`[${k}:v]setpts=(PTS-STARTPTS)/${n(c.speed)}`];
    if (!kenBurns) pre.push(`fps=${FPS}`);
    pre.push(...rotation(c), 'format=yuv420p');
    const tail = [FILTERS[c.filter], 'setsar=1', 'format=yuv420p'].filter(Boolean);
    const finish = `tpad=stop_mode=clone:stop_duration=1,trim=duration=${n(D)},setpts=PTS-STARTPTS,fps=${FPS},settb=AVTB[v${i}]`;

    if (kenBurns) {
      // Foto parada ganha movimento: o zoompan recorta uma área que cresce ou diminui (imagem em 2x
      // para o recorte não "tremer" por arredondamento)
      const frames = Math.max(1, Math.round(D * FPS));
      const z = c.motion === 'zoomin' ? `1+0.12*on/${frames}` : `1.12-0.12*on/${frames}`;
      const cx = `(iw-iw/zoom)/2*(1+${n(c.panX)})`;
      const cy = `(ih-ih/zoom)/2*(1+${n(c.panY)})`;
      pre.push(`scale=${even(pl.sw * 2)}:${even(pl.sh * 2)}`, `crop=${W * 2}:${H * 2}:${-pl.x * 2}:${-pl.y * 2}`);
      graph.push(`${pre.join(',')},zoompan=z='${z}':x='${cx}':y='${cy}':d=${frames}:s=${W}x${H}:fps=${FPS},${[...tail, finish].join(',')}`);
    } else if (c.fit === 'fill' && pl.covers) {
      graph.push(`${pre.join(',')},scale=${pl.sw}:${pl.sh}:flags=bicubic,crop=${W}:${H}:${-pl.x}:${-pl.y},${[...tail, finish].join(',')}`);
    } else {
      // Encaixar (com fundo preto ou desfocado): o quadro vai por cima de um fundo do tamanho do vídeo
      const bgW = even(W / 4);
      const bgH = even(H / 4);
      if (c.fit === 'blur') {
        graph.push(`${pre.join(',')},split=2[ca${i}][cb${i}]`);
        graph.push(
          `[ca${i}]scale=${bgW}:${bgH}:force_original_aspect_ratio=increase,crop=${bgW}:${bgH},boxblur=luma_radius=10:luma_power=2,scale=${W}:${H},eq=brightness=-0.06:saturation=1.15,format=yuv420p[bg${i}]`,
        );
        graph.push(`[cb${i}]scale=${pl.sw}:${pl.sh}:flags=bicubic[fg${i}]`);
      } else {
        graph.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${n(D + 1)},format=yuv420p[bg${i}]`);
        graph.push(`${pre.join(',')},scale=${pl.sw}:${pl.sh}:flags=bicubic[fg${i}]`);
      }
      graph.push(`[bg${i}][fg${i}]overlay=x=${pl.x}:y=${pl.y}:shortest=1,${[...tail, finish].join(',')}`);
    }

    if (src.hasAudio && !isImage && c.volume > 0.001) {
      graph.push(
        [`[${k}:a]asetpts=PTS-STARTPTS`, audioNorm(), ...atempo(c.speed), `volume=${n(c.volume)}`, `apad=whole_dur=${n(D)}`, `atrim=duration=${n(D)}`, `asetpts=PTS-STARTPTS[a${i}]`].join(','),
      );
    } else {
      graph.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${n(D)},${audioNorm()}[a${i}]`);
    }
  });

  // ---------- Junção: corte seco com concat, transição com xfade + acrossfade ----------
  let v = 'v0';
  let a = 'a0';
  let dur = p.clips.length ? clipLength(p.clips[0]) : 0;
  for (let i = 1; i < p.clips.length; i++) {
    const t = transitionLength(p.clips, i - 1);
    const D = clipLength(p.clips[i]);
    if (t > 0.01) {
      const kind = p.clips[i - 1].transition!.kind;
      graph.push(`[${v}][v${i}]xfade=transition=${kind}:duration=${n(t)}:offset=${n(dur - t)},settb=AVTB[jv${i}]`);
      graph.push(`[${a}][a${i}]acrossfade=d=${n(t)}:c1=tri:c2=tri[ja${i}]`);
      dur += D - t;
    } else {
      graph.push(`[${v}][${a}][v${i}][a${i}]concat=n=2:v=1:a=1[jv${i}][ja${i}]`);
      dur += D;
    }
    v = `jv${i}`;
    a = `ja${i}`;
  }

  // ---------- Camadas: imagens e facecam, depois legendas, depois textos e figurinhas ----------
  const voices: string[] = [];
  const music: string[] = [];
  let step = 0;
  const overlay = (label: string, x: number | string, y: number | string, enable?: [number, number]) => {
    const out = `o${step++}`;
    const en = enable ? `:enable='between(t,${n(enable[0])},${n(enable[1])})'` : '';
    graph.push(`[${v}][${label}]overlay=x=${x}:y=${y}${en}:eof_action=pass:format=auto[${out}]`);
    v = out;
  };
  const pngInput = (r: OverlayResult, until: number) =>
    addInput(['-loop', '1', '-framerate', String(FPS), '-t', n(Math.min(T, until) + 0.2), '-i', r.path]);

  const placeLayer = (ref: Extract<Ref, { kind: 'layer' }>) => {
    const l = ref.layer;
    const r = results[ref.png];
    const k = pngInput(r, l.end);
    const end = Math.min(l.end, T);
    const fades = l.fade
      ? [`fade=t=in:st=${n(l.start)}:d=0.25:alpha=1`, `fade=t=out:st=${n(Math.max(l.start, end - 0.25))}:d=0.25:alpha=1`]
      : [];
    const label = `l${k}`;
    graph.push([`[${k}:v]format=rgba`, ...fades].join(',') + `[${label}]`);
    overlay(label, Math.round(l.x * W - r.width / 2), Math.round(l.y * H - r.height / 2), [l.start, end]);
  };

  const ordered = [
    ...plan.refs.filter((r) => r.kind === 'facecam' || (r.kind === 'layer' && r.layer.kind === 'image')),
    ...plan.refs.filter((r) => r.kind === 'captions'),
    ...plan.refs.filter((r) => r.kind === 'layer' && r.layer.kind !== 'image'),
  ];

  let captionText: string | null = null;
  for (const ref of ordered) {
    if (ref.kind === 'layer') {
      placeLayer(ref);
    } else if (ref.kind === 'facecam') {
      const l = ref.layer;
      const src = p.sources[l.sourceId];
      const end = Math.min(l.end, T);
      const len = end - l.start;
      if (len < 0.1) continue;
      const S = facecamSize(l, sizeUnit(W, H));
      const k = addInput(['-ss', n(l.in), '-t', n(len + 0.1), '-i', src.path]);
      const cam = `cam${k}`;
      graph.push(
        `[${k}:v]setpts=PTS-STARTPTS+${n(l.start)}/TB,fps=${FPS},crop='min(iw,ih)':'min(iw,ih)',scale=${S}:${S}${l.mirror ? ',hflip' : ''},format=rgba[${cam}]`,
      );
      let shown = cam;
      if (ref.mask != null) {
        const m = pngInput(results[ref.mask], end);
        graph.push(`[${m}:v]format=gray,scale=${S}:${S}[mk${k}]`);
        graph.push(`[${cam}][mk${k}]alphamerge[cm${k}]`);
        shown = `cm${k}`;
      }
      const x = Math.round(l.x * W - S / 2);
      const y = Math.round(l.y * H - S / 2);
      overlay(shown, x, y, [l.start, end]);
      if (ref.ring != null) {
        const rk = pngInput(results[ref.ring], end);
        graph.push(`[${rk}:v]format=rgba[rg${rk}]`);
        overlay(`rg${rk}`, x, y, [l.start, end]);
      }
      if (src.hasAudio && l.volume > 0.001) {
        const label = `fa${k}`;
        graph.push(
          [`[${k}:a]asetpts=PTS-STARTPTS`, audioNorm(), `atrim=duration=${n(len)}`, `volume=${n(l.volume)}`, `adelay=${Math.round(l.start * 1000)}:all=1[${label}]`].join(','),
        );
        voices.push(label);
      }
    } else {
      captionText = captionList(
        ref.segments.map((c) => ({ path: results[c.png].path, start: c.start, end: c.end })),
        results[ref.blank].path,
        T,
      );
      const k = addInput(['-f', 'concat', '-safe', '0', '-i', opts.captionListPath]);
      graph.push(`[${k}:v]format=rgba[cap]`);
      overlay('cap', ref.x, ref.y);
    }
  }

  // ---------- Trilha e narração ----------
  for (const tr of p.audio) {
    const src = p.sources[tr.sourceId];
    if (!src || tr.start >= T) continue;
    const len = tr.loop ? T - tr.start : Math.min(tr.out - tr.in, T - tr.start);
    if (len < 0.05) continue;
    const k = addInput([...(tr.loop ? ['-stream_loop', '-1'] : []), '-ss', n(tr.in), '-t', n(len + 0.1), '-i', src.path]);
    const fi = Math.min(tr.fadeIn, len / 2);
    const fo = Math.min(tr.fadeOut, len / 2);
    const label = `t${k}`;
    graph.push(
      [
        `[${k}:a]asetpts=PTS-STARTPTS`,
        audioNorm(),
        `atrim=duration=${n(len)}`,
        `volume=${n(tr.volume)}`,
        ...(fi > 0.01 ? [`afade=t=in:st=0:d=${n(fi)}`] : []),
        ...(fo > 0.01 ? [`afade=t=out:st=${n(len - fo)}:d=${n(fo)}`] : []),
        `adelay=${Math.round(tr.start * 1000)}:all=1[${label}]`,
      ].join(','),
    );
    (tr.kind === 'voice' ? voices : music).push(label);
  }

  const mixOf = (labels: string[], name: string): string | null => {
    if (!labels.length) return null;
    if (labels.length === 1) return labels[0];
    graph.push(`${labels.map((l) => `[${l}]`).join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0[${name}]`);
    return name;
  };
  const voiceMix = mixOf(voices, 'vox');
  let musicMix = mixOf(music, 'mus');
  const parts = [a];
  if (voiceMix && musicMix && p.duck) {
    // A voz controla um compressor na música: ela abaixa sozinha enquanto alguém fala
    graph.push(`[${voiceMix}]asplit=2[voxa][voxb]`);
    graph.push(`[${musicMix}][voxb]sidechaincompress=threshold=0.015:ratio=8:attack=15:release=400:makeup=1[musd]`);
    musicMix = 'musd';
    parts.push(musicMix, 'voxa');
  } else {
    if (musicMix) parts.push(musicMix);
    if (voiceMix) parts.push(voiceMix);
  }
  if (parts.length > 1) {
    graph.push(`${parts.map((l) => `[${l}]`).join('')}amix=inputs=${parts.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true[aout]`);
  } else {
    graph.push(`[${a}]alimiter=limit=0.95:level=false:latency=true[aout]`);
  }
  graph.push(`[${v}]format=yuv420p[vout]`);

  const bitrate = String(opts.videoBitrate ?? videoBitrate(W, H));
  const encoder =
    opts.encoder === 'hw'
      ? ['-c:v', 'h264_mediacodec', '-b:v', bitrate, '-g', String(FPS * 2), '-pix_fmt', 'yuv420p']
      : opts.encoder === 'sw'
        ? ['-c:v', 'libopenh264', '-b:v', bitrate, '-g', String(FPS * 2), '-pix_fmt', 'yuv420p']
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'];

  const args = [
    '-y',
    '-hide_banner',
    '-nostdin',
    ...inputs.flat(),
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    ...encoder,
    '-r',
    String(FPS),
    '-c:a',
    'aac',
    '-b:a',
    String(AUDIO_BITRATE),
    '-ar',
    '48000',
    '-t',
    n(T),
    '-movflags',
    '+faststart',
    opts.out,
  ];
  return { args, total: T, captionList: captionText };
}
