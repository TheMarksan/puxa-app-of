import { Text, View } from 'react-native';

import { patchAudio, patchClip, patchLayer, patchProject } from '../../actions';
import { FILTER_LABELS } from '../../render';
import { store } from '../../store';
import type { Aspect, Clip, FilterId, Fit, Motion, Project, TransitionKind } from '../../types';
import { Chip, Row, Section, Slider, Toggle, ui } from '../kit';
import { E } from '../palette';

export function FormatPanel({ project }: { project: Project }) {
  const aspects: { v: Aspect; label: string; detail: string }[] = [
    { v: '9:16', label: '9:16', detail: 'Status, Reels' },
    { v: '1:1', label: '1:1', detail: 'Quadrado' },
    { v: '4:5', label: '4:5', detail: 'Feed' },
    { v: '16:9', label: '16:9', detail: 'Deitado' },
    { v: 'original', label: 'Original', detail: 'Do 1º clipe' },
  ];
  return (
    <>
      <Section label="Formato do vídeo">
        <Row scroll>
          {aspects.map((a) => (
            <Chip key={a.v} label={a.label} detail={a.detail} active={project.aspect === a.v} onPress={() => patchProject({ aspect: a.v })} />
          ))}
        </Row>
      </Section>
      <Section label="Qualidade">
        <Row>
          <Chip label="720p" detail="Mais leve, ideal para WhatsApp" active={project.quality === 720} onPress={() => patchProject({ quality: 720 })} />
          <Chip label="1080p" detail="Mais nítido" active={project.quality === 1080} onPress={() => patchProject({ quality: 1080 })} />
        </Row>
      </Section>
      <Toggle
        label="Caber no WhatsApp"
        detail="Ajusta a qualidade para o vídeo ficar abaixo de 16 MB"
        value={!!project.fitWhatsApp}
        onChange={(v) => patchProject({ fitWhatsApp: v })}
      />
      <Toggle
        label="Abaixar a música quando houver voz"
        detail="Vale para narração e facecam"
        value={project.duck}
        onChange={(v) => patchProject({ duck: v })}
      />
    </>
  );
}

export function AdjustPanel({ clip, project }: { clip: Clip; project: Project }) {
  const src = project.sources[clip.sourceId];
  const fits: { v: Fit; label: string }[] = [
    { v: 'fill', label: 'Preencher' },
    { v: 'fit', label: 'Encaixar' },
    { v: 'blur', label: 'Fundo desfocado' },
  ];
  return (
    <>
      <Text style={[ui.body, { color: '#9AA1AC', marginBottom: 12 }]}>Na prévia, arraste para enquadrar e use dois dedos para aproximar.</Text>
      <Section label="Enquadramento">
        <Row scroll>
          {fits.map((f) => (
            <Chip key={f.v} label={f.label} active={clip.fit === f.v} onPress={() => patchClip(clip.id, { fit: f.v, panX: 0, panY: 0 })} />
          ))}
        </Row>
      </Section>
      <Section label="Zoom">
        <Slider
          value={clip.zoom}
          min={1}
          max={4}
          step={0.01}
          marks={[1, 2]}
          format={(v) => `${v.toFixed(2).replace('.', ',')}×`}
          onStart={() => store.checkpoint()}
          onChange={(zoom) => patchClip(clip.id, { zoom }, true)}
          onEnd={() => store.settle()}
        />
      </Section>
      <Section label="Girar e espelhar">
        <Row scroll>
          <Chip icon="rotate-cw" label="Girar 90°" onPress={() => patchClip(clip.id, { rotate: (((clip.rotate + 90) % 360) as Clip['rotate']), panX: 0, panY: 0 })} />
          <Chip icon="columns" label="Espelhar" active={clip.flip} onPress={() => patchClip(clip.id, { flip: !clip.flip })} />
          <Chip icon="refresh-ccw" label="Restaurar" onPress={() => patchClip(clip.id, { zoom: 1, panX: 0, panY: 0, rotate: 0, flip: false, fit: 'fill' })} />
        </Row>
      </Section>
      {src?.kind === 'image' ? (
        <Section label="Movimento da foto">
          <Row>
            {(['none', 'zoomin', 'zoomout'] as Motion[]).map((m) => (
              <Chip key={m} label={m === 'none' ? 'Parada' : m === 'zoomin' ? 'Aproximar' : 'Afastar'} active={clip.motion === m} onPress={() => patchClip(clip.id, { motion: m, fit: m === 'none' ? clip.fit : 'fill' })} />
            ))}
          </Row>
        </Section>
      ) : null}
    </>
  );
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function SpeedPanel({ clip }: { clip: Clip }) {
  return (
    <Section label="Velocidade">
      <Row scroll>
        {SPEEDS.map((s) => (
          <Chip key={s} label={`${String(s).replace('.', ',')}×`} active={Math.abs(clip.speed - s) < 0.001} onPress={() => patchClip(clip.id, { speed: s })} />
        ))}
      </Row>
    </Section>
  );
}

export function VolumePanel({ target, value }: { target: { kind: 'clip' | 'audio' | 'layer'; id: string }; value: number }) {
  const set = (volume: number, live: boolean) => {
    if (target.kind === 'clip') patchClip(target.id, { volume }, live);
    else if (target.kind === 'audio') patchAudio(target.id, { volume }, live);
    else patchLayer(target.id, { volume } as never, live);
  };
  return (
    <Section label="Volume">
      <Slider value={value} min={0} max={2} step={0.01} marks={[1]} format={(v) => `${Math.round(v * 100)}%`} onStart={() => store.checkpoint()} onChange={(v) => set(v, true)} onEnd={() => store.settle()} />
      <Row>
        <Chip icon="volume-x" label="Mudo" active={value === 0} onPress={() => set(0, false)} />
        <Chip icon="volume-2" label="Original" active={value === 1} onPress={() => set(1, false)} />
      </Row>
    </Section>
  );
}

const FILTER_SWATCH: Record<FilterId, string[]> = {
  none: ['#5B6B85', '#C9B28A'],
  vivid: ['#2F6BFF', '#FFB020'],
  warm: ['#9E5A2C', '#F2B266'],
  cool: ['#2B5C8A', '#8FD3F4'],
  bw: ['#3A3A3A', '#D9D9D9'],
  cinema: ['#1F2A33', '#C08A5A'],
  vintage: ['#6E5B3E', '#E6C99A'],
};

export function FilterPanel({ clip, project }: { clip: Clip; project: Project }) {
  const applyAll = () => store.update((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, filter: clip.filter })) }));
  return (
    <Section label="Filtro de cor" right={project.clips.length > 1 ? <Chip label="Aplicar a todos" icon="copy" onPress={applyAll} /> : undefined}>
      <Row scroll>
        {(Object.keys(FILTER_LABELS) as FilterId[]).map((f) => (
          <View key={f} style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 54, height: 54, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: clip.filter === f ? '#fff' : 'transparent', flexDirection: 'row' }}>
              <View style={{ flex: 1, backgroundColor: FILTER_SWATCH[f][0] }} />
              <View style={{ flex: 1, backgroundColor: FILTER_SWATCH[f][1] }} />
            </View>
            <Chip label={FILTER_LABELS[f]} active={clip.filter === f} onPress={() => patchClip(clip.id, { filter: f })} />
          </View>
        ))}
      </Row>
      <Text style={[ui.body, { color: E.faint, fontSize: 12 }]}>Na prévia a cor é aproximada; o vídeo exportado usa o filtro completo.</Text>
    </Section>
  );
}

const TRANSITIONS: { v: TransitionKind | null; label: string }[] = [
  { v: null, label: 'Corte seco' },
  { v: 'fade', label: 'Dissolver' },
  { v: 'fadeblack', label: 'Pelo preto' },
  { v: 'slideleft', label: 'Deslizar' },
  { v: 'slideup', label: 'Subir' },
  { v: 'wipeleft', label: 'Cortina' },
  { v: 'circleopen', label: 'Círculo' },
  { v: 'zoomin', label: 'Zoom' },
  { v: 'smoothleft', label: 'Varrer' },
];

export function TransitionPanel({ clip, project }: { clip: Clip; project: Project }) {
  const isLast = project.clips[project.clips.length - 1]?.id === clip.id;
  if (isLast) return <Text style={ui.body}>Este é o último clipe: a transição vai entre um clipe e o próximo.</Text>;
  const duration = clip.transition?.duration ?? 0.6;
  const applyAll = () =>
    store.update((p) => ({ ...p, clips: p.clips.map((c, i) => (i < p.clips.length - 1 ? { ...c, transition: clip.transition ? { ...clip.transition } : null } : c)) }));
  return (
    <>
      <Section label="Transição para o próximo clipe" right={project.clips.length > 2 ? <Chip label="Em todos" icon="copy" onPress={applyAll} /> : undefined}>
        <Row scroll>
          {TRANSITIONS.map((t) => (
            <Chip
              key={t.label}
              label={t.label}
              active={(clip.transition?.kind ?? null) === t.v}
              onPress={() => patchClip(clip.id, { transition: t.v ? { kind: t.v, duration } : null })}
            />
          ))}
        </Row>
      </Section>
      {clip.transition ? (
        <Section label="Duração">
          <Slider
            value={duration}
            min={0.2}
            max={1.5}
            step={0.05}
            marks={[0.5, 1]}
            format={(v) => `${v.toFixed(1).replace('.', ',')} s`}
            onStart={() => store.checkpoint()}
            onChange={(d) => patchClip(clip.id, { transition: { kind: clip.transition!.kind, duration: d } }, true)}
            onEnd={() => store.settle()}
          />
        </Section>
      ) : null}
    </>
  );
}
