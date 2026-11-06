import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import PuxaEngine, { type CaptionTrack } from '../../../../modules/puxa-engine';
import { patchProject } from '../../actions';
import { mapToTimeline, tidy } from '../../captions';
import { store } from '../../store';
import { defaultCaptionStyle } from '../../captionLayout';
import { useElevenKey } from '../../../ai/key';
import { getSettings, setSettings } from '../../../settings';
import { chooseTrack, hasModel, MODELS, SPOKEN, transcribe, youtubeCues, type Engine, type WhisperModel } from '../../subtitles';
import { clipLength, clipStarts } from '../../timeline';
import type { CaptionStyle, Cue, Project } from '../../types';
import { CueList, LookPicker, MotionPicker, PositionPicker } from '../CaptionControls';
import { Chip, PrimaryButton, Progress, Row, Section, Swatches, Toggle, ui } from '../kit';
import { E } from '../palette';
import { StyleEditor } from './LayerPanels';

export { defaultCaptionStyle };

/** Legendas do projeto: do YouTube (originais ou em pt-BR) ou transcritas do áudio (no aparelho ou na ElevenLabs). */
export function CaptionsPanel({ project, time, onSeek, onError }: { project: Project; time: number; onSeek: (t: number) => void; onError: (m: string) => void }) {
  const caps = project.captions;
  const [tracks, setTracks] = useState<Record<string, CaptionTrack[]>>({});
  const [picked, setMode] = useState<'youtube' | 'transcribe'>('youtube');
  const [toPt, setToPt] = useState(true);
  const hasKey = !!useElevenKey();
  const [engine, setEngineState] = useState<Engine>(() => getSettings().transcriber ?? 'elevenlabs');
  const [model, setModelState] = useState<WhisperModel>(() => getSettings().whisperModel ?? 'small');
  const [lang, setLangState] = useState(() => getSettings().spokenLanguage ?? 'auto');
  const cloud = hasKey && engine === 'elevenlabs';
  const setEngine = (e: Engine) => {
    setEngineState(e);
    setSettings({ transcriber: e });
  };
  const setModel = (m: WhisperModel) => {
    setModelState(m);
    setSettings({ whisperModel: m });
  };
  const setLang = (l: string) => {
    setLangState(l);
    setSettings({ spokenLanguage: l });
  };
  const [busy, setBusy] = useState<{ label: string; fraction: number | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const signal = useRef({ cancelled: false });

  // Vídeos do YouTube usados nos clipes, e as legendas que cada um tem
  const ytSources = [...new Set(project.clips.map((c) => project.sources[c.sourceId]).filter((s) => s?.youtubeId).map((s) => s!.id))].map((id) => project.sources[id]);
  useEffect(() => {
    let alive = true;
    for (const s of ytSources) {
      if (tracks[s.youtubeId!]) continue;
      PuxaEngine.getInfo(s.youtubeId!)
        .then((i) => alive && setTracks((t) => ({ ...t, [s.youtubeId!]: i.captions })))
        .catch(() => alive && setTracks((t) => ({ ...t, [s.youtubeId!]: [] })));
    }
    return () => {
      alive = false;
    };
  }, [ytSources.map((s) => s.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasYoutube = ytSources.some((s) => (tracks[s.youtubeId!] ?? []).length > 0);
  const loadingTracks = ytSources.some((s) => !tracks[s.youtubeId!]);
  // Sem faixa do YouTube nos clipes, só resta transcrever
  const mode = !loadingTracks && !hasYoutube ? 'transcribe' : picked;

  const finish = (cues: Cue[], label: string) => {
    if (!cues.length) {
      onError('Não encontrei fala para legendar nos clipes.');
      return;
    }
    patchProject({ captions: { cues: tidy(cues), style: caps?.style ?? defaultCaptionStyle(), label } });
  };

  const fromYoutube = async () => {
    setBusy({ label: 'Buscando legendas…', fraction: null });
    try {
      const all: Cue[] = [];
      let how = '';
      for (const s of ytSources) {
        const pick = chooseTrack(tracks[s.youtubeId!] ?? [], toPt);
        if (!pick) continue;
        const r = await youtubeCues(s.youtubeId!, pick.track, pick.translate, (label, fraction) => setBusy({ label, fraction }));
        how = r.how;
        all.push(...mapToTimeline(r.cues, store.project?.clips ?? project.clips, s.id));
      }
      finish(all, how || 'Do YouTube');
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fromAudio = async () => {
    signal.current = { cancelled: false };
    const clips = project.clips;
    const starts = clipStarts(clips);
    const all: Cue[] = [];
    try {
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        const src = project.sources[c.sourceId];
        if (!src?.hasAudio || src.kind !== 'video' || c.volume < 0.01) continue;
        const r = await transcribe(
          { path: src.path, from: c.in, to: c.out, engine: cloud ? 'elevenlabs' : 'device', model, language: lang, toPortuguese: toPt },
          (label, fraction) => setBusy({ label: clips.length > 1 ? `Clipe ${i + 1} de ${clips.length}: ${label}` : label, fraction }),
          signal.current,
        );
        const len = clipLength(c);
        for (const q of r.cues) {
          const start = starts[i] + q.start / c.speed;
          if (start >= starts[i] + len) continue;
          all.push({ start, end: Math.min(starts[i] + len, starts[i] + q.end / c.speed), text: q.text });
        }
      }
      finish(all, `Transcrita ${cloud ? 'na ElevenLabs' : 'no aparelho'}${toPt ? ' (pt-BR)' : ''}`);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code !== 'cancelled') onError(err.message || 'A transcrição falhou.');
    } finally {
      setBusy(null);
    }
  };

  if (busy) {
    return (
      <>
        <Progress label={busy.label} fraction={busy.fraction} />
        {mode === 'transcribe' ? (
          <Text onPress={() => (signal.current.cancelled = true)} style={[ui.body, { color: E.danger, marginTop: 12, textAlign: 'center' }]}>
            Cancelar
          </Text>
        ) : null}
      </>
    );
  }

  const style = caps?.style;
  const setStyle = (next: CaptionStyle) => caps && patchProject({ captions: { ...caps, style: next } });
  const setCues = (cues: Cue[], live = false) => {
    if (live) store.update((p) => (p.captions ? { ...p, captions: { ...p.captions, cues } } : p), true);
    else if (caps) patchProject({ captions: { ...caps, cues } });
  };
  return (
    <>
      {caps && style ? (
        <>
          <Text style={[ui.body, { color: E.muted, marginBottom: 12 }]}>
            {caps.cues.length} legendas · {caps.label}
          </Text>
          <Section label="Estilo">
            <LookPicker style={style} onPick={setStyle} />
          </Section>
          <Section label="Animação">
            <MotionPicker value={style.motion} onPick={(motion) => setStyle({ ...style, motion })} />
          </Section>
          {style.motion === 'karaoke' ? (
            <Section label="Cor da palavra falada">
              <Swatches value={style.highlight ?? '#FFD60A'} onChange={(highlight) => setStyle({ ...style, highlight })} />
            </Section>
          ) : null}
          <Section label="Posição">
            <PositionPicker style={style} onChange={setStyle} />
          </Section>
          <Toggle label="Tudo em maiúsculas" value={style.uppercase} onChange={(uppercase) => setStyle({ ...style, uppercase })} />
          <StyleEditor
            style={style}
            onChange={(s) => setStyle({ ...style, ...s })}
            onLive={(s) => store.update((p) => (p.captions ? { ...p, captions: { ...p.captions, style: { ...p.captions.style, ...s } } } : p), true)}
          />
          <Section label="Textos" right={<Chip label={editing ? 'Fechar' : `Editar (${caps.cues.length})`} icon={editing ? 'chevron-up' : 'edit-3'} onPress={() => setEditing((v) => !v)} />}>
            {editing ? (
              <CueList
                cues={caps.cues}
                time={time}
                onSeek={onSeek}
                onEditStart={() => store.checkpoint()}
                onEditEnd={() => store.settle()}
                onEdit={(i, text) => setCues(caps.cues.map((c, j) => (j === i ? { ...c, text } : c)), true)}
                onDelete={(i) => setCues(caps.cues.filter((_, j) => j !== i))}
                onAdd={() => {
                  const next = caps.cues.find((c) => c.start > time);
                  const end = Math.min(time + 2, next ? next.start : time + 2);
                  if (end - time < 0.3) return onError('Já tem uma legenda começando aqui. Ande um pouco no vídeo.');
                  setCues([...caps.cues, { start: time, end, text: '' }].sort((a, b) => a.start - b.start));
                }}
              />
            ) : null}
          </Section>
        </>
      ) : null}

      <Section label={caps ? 'Gerar de novo' : 'Gerar legendas'}>
        <Row>
          <Chip label="Do YouTube" icon="youtube" active={mode === 'youtube'} disabled={!hasYoutube} onPress={() => setMode('youtube')} />
          <Chip label="Transcrever o áudio" icon="mic" active={mode === 'transcribe'} onPress={() => setMode('transcribe')} />
        </Row>
        {!hasYoutube && !loadingTracks ? (
          <Text style={[ui.body, { color: E.muted, fontSize: 13 }]}>{ytSources.length ? 'Os vídeos do YouTube deste projeto não têm legenda.' : 'Sem vídeos do YouTube no projeto.'} A transcrição gera as legendas a partir da fala.</Text>
        ) : null}
        <Toggle label="Em português (pt-BR)" detail={mode === 'youtube' ? 'Usa a faixa em português ou traduz' : 'Traduz se a fala for em outro idioma'} value={toPt} onChange={setToPt} />
        {mode === 'transcribe' ? (
          <>
            {hasKey ? (
              <Row>
                <Chip label="ElevenLabs" icon="zap" detail="A mais precisa" active={cloud} onPress={() => setEngine('elevenlabs')} />
                <Chip label="No celular" icon="smartphone" detail="Sem internet" active={!cloud} onPress={() => setEngine('device')} />
              </Row>
            ) : null}
            {!cloud ? (
              <Row scroll>
                {(Object.keys(MODELS) as WhisperModel[]).map((m) => (
                  <Chip key={m} label={MODELS[m].label} detail={hasModel(m) ? 'Baixado' : `${MODELS[m].mb} MB`} active={model === m} onPress={() => setModel(m)} />
                ))}
              </Row>
            ) : null}
            <Text style={[ui.label, { marginTop: 4 }]}>IDIOMA FALADO</Text>
            <Row scroll>
              {SPOKEN.map((l) => (
                <Chip key={l.code} label={l.label} active={lang === l.code} onPress={() => setLang(l.code)} />
              ))}
            </Row>
            <Text style={[ui.body, { color: E.faint, fontSize: 12 }]}>
              {cloud ? 'O áudio vai para a sua conta da ElevenLabs e volta transcrito.' : 'Roda no seu celular, sem enviar o áudio. Pode levar alguns minutos em vídeos longos.'}
            </Text>
          </>
        ) : null}
        <PrimaryButton
          label={mode === 'youtube' ? 'Usar legendas do YouTube' : 'Transcrever agora'}
          icon={mode === 'youtube' ? 'download' : 'mic'}
          disabled={!project.clips.length || (mode === 'youtube' && !hasYoutube)}
          onPress={mode === 'youtube' ? fromYoutube : fromAudio}
        />
        {!caps ? (
          <PrimaryButton
            label="Escrever as legendas à mão"
            icon="edit-3"
            tone="plain"
            disabled={!project.clips.length}
            onPress={() => {
              patchProject({ captions: { cues: [], style: defaultCaptionStyle(), label: 'Escritas à mão' } });
              setEditing(true);
            }}
          />
        ) : null}
      </Section>
    </>
  );
}
