import Feather from '@expo/vector-icons/Feather';
import { setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clock as fmtClock } from '../../format';
import { BackButton } from '../../components/BackButton';
import { useToast } from '../../components/Toasts';
import {
  addAudio,
  addLayer,
  clipRange,
  duplicateSelection,
  layerWindow,
  moveClip,
  newSticker,
  newText,
  removeSelection,
  splitAt,
} from '../actions';
import { importFile, importPicked } from '../media';
import { loadProject, store, useHistory, useProject } from '../store';
import { clamp, newId, projectLength } from '../timeline';
import type { AudioTrack, FacecamLayer, Layer } from '../types';
import { Clock, useClock } from './clock';
import { E } from './palette';
import { AdjustPanel, FilterPanel, FormatPanel, SpeedPanel, TransitionPanel, VolumePanel } from './panels/ClipPanels';
import { CaptionsPanel } from './panels/CaptionsPanel';
import { FacecamPanel, ImageLayerPanel, StickerGrid, StickerPanel, TextPanel } from './panels/LayerPanels';
import { MediaPanel } from './panels/MediaPanel';
import { AudioTrackPanel, MusicPanel } from './panels/MusicPanel';
import { CameraBubble, EDITOR_AUDIO, RecordBar, RecordOverlay, useRecorder, type Recording } from './panels/RecordPanel';
import { Preview, type Selection } from './Preview';
import { Timeline } from './Timeline';

type Tool = 'media' | 'format' | 'adjust' | 'speed' | 'volume' | 'filter' | 'transition' | 'text' | 'stickers' | 'captions' | 'music' | 'record' | 'layer' | 'audio';

const TITLES: Record<Tool, string> = {
  media: 'Adicionar mídia',
  format: 'Formato',
  adjust: 'Enquadrar',
  speed: 'Velocidade',
  volume: 'Volume',
  filter: 'Filtro',
  transition: 'Transição',
  text: 'Texto',
  stickers: 'Figurinhas e ícones',
  captions: 'Legendas',
  music: 'Trilha sonora',
  record: 'Narração e facecam',
  layer: 'Ajustes',
  audio: 'Áudio',
};

type ToolButton = { key: string; icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; danger?: boolean };

export function EditorScreen({ id }: { id: string }) {
  const project = useProject();
  const { canUndo, canRedo } = useHistory();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [clock] = useState(() => new Clock());
  const [selection, setSelection] = useState<Selection>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [pps, setPps] = useState(48);
  const [missing, setMissing] = useState(false);
  const { time, playing } = useClock(clock, 12);

  useEffect(() => {
    let alive = true;
    setAudioModeAsync({ ...EDITOR_AUDIO, allowsRecording: false }).catch(() => {});
    loadProject(id).then((p) => {
      if (!alive) return;
      if (p) {
        store.open(p);
        if (!p.clips.length) setTool('media');
      } else setMissing(true);
    });
    return () => {
      alive = false;
      clock.pause();
      store.close();
    };
  }, [id, clock]);

  const total = project ? projectLength(project) : 0;
  useEffect(() => clock.setDuration(total), [clock, total]);

  const error = useCallback((m: string) => toast.show({ title: 'Algo não saiu', body: m, tone: 'error' }), [toast]);

  const onRecorded = useCallback(
    async (r: Recording) => {
      try {
        const src = await importFile(r.uri, r.kind === 'camera' ? 'camera' : 'mic', r.kind === 'camera' ? 'Facecam' : 'Narração');
        const p = store.project;
        if (!p) return;
        // A gravação começa um pouco depois do play (a câmera leva uns décimos para arrancar): o que
        // falta no arquivo em relação ao tempo de relógio é esse atraso, e a camada anda junto
        const late = src.duration > 0 ? clamp(r.duration - src.duration, 0, 0.8) : 0;
        const at = r.start + late;
        const len = Math.min(src.duration || r.duration, projectLength(p) - at);
        if (len < 0.3) throw new Error('A gravação ficou curta demais.');
        if (r.kind === 'camera') {
          const layer: FacecamLayer = {
            id: newId('l'),
            kind: 'facecam',
            sourceId: src.id,
            in: 0,
            start: at,
            end: at + len,
            x: r.cam.x,
            y: r.cam.y,
            scale: r.cam.scale,
            rotation: 0,
            fade: false,
            shape: r.cam.shape,
            border: true,
            borderColor: '#FFFFFF',
            mirror: true,
            volume: 1,
          };
          store.update((q) => ({ ...q, sources: { ...q.sources, [src.id]: src }, layers: [...q.layers, layer] }));
          setSelection({ kind: 'layer', id: layer.id });
        } else {
          const track: AudioTrack = { id: newId('a'), kind: 'voice', sourceId: src.id, start: at, in: 0, out: len, volume: 1, fadeIn: 0, fadeOut: 0, loop: false, title: 'Narração' };
          addAudio(track, src);
          setSelection({ kind: 'audio', id: track.id });
        }
        setTool(null);
        clock.seek(r.start);
        toast.show({ title: r.kind === 'camera' ? 'Facecam adicionada' : 'Narração adicionada', body: 'Toque em play para conferir.', tone: 'success' });
      } catch (e) {
        error((e as Error).message);
      }
    },
    [clock, error, toast],
  );
  const rec = useRecorder(clock, onRecorded, error);
  const detectHeadphones = rec.detectHeadphones;
  useEffect(() => {
    if (tool === 'record') detectHeadphones();
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback(
    (s: Selection) => {
      setSelection(s);
      setTool((t) => (t === 'media' || t === 'format' || t === 'music' || t === 'record' ? t : null));
      const p = store.project;
      if (s?.kind === 'clip' && p) {
        const r = clipRange(p, s.id);
        if (r && (clock.time < r.start || clock.time >= r.end - 0.05)) clock.seek(r.start + 0.01);
      }
    },
    [clock],
  );

  // Voltar do Android: fecha o painel, depois tira a seleção, depois sai
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (rec.phase === 'recording') {
        rec.stop();
        return true;
      }
      if (tool) {
        setTool(null);
        return true;
      }
      if (selection) {
        setSelection(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tool, selection, rec]);

  const deleted = () => {
    removeSelection(selection);
    setSelection(null);
    setTool(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    toast.show({ title: 'Excluído', tone: 'info', action: { label: 'Desfazer', onPress: () => store.undo() } });
  };

  const addImageLayer = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets[0] || !store.project) return;
      const [src] = await importPicked(res.assets.slice(0, 1));
      const layer: Layer = { id: newId('l'), kind: 'image', sourceId: src.id, rounded: true, border: false, ...layerWindow(store.project, clock.time, 4), x: 0.5, y: 0.42, scale: 1, rotation: 0, fade: true };
      store.update((q) => ({ ...q, sources: { ...q.sources, [src.id]: src }, layers: [...q.layers, layer] }));
      setSelection({ kind: 'layer', id: layer.id });
      setTool('layer');
    } catch (e) {
      error((e as Error).message);
    }
  };

  const buttons: ToolButton[] = useMemo(() => {
    if (!project) return [];
    const sel = selection;
    if (!sel) {
      return [
        { key: 'media', icon: 'plus-square', label: 'Mídia', onPress: () => setTool('media') },
        {
          key: 'text',
          icon: 'type',
          label: 'Texto',
          onPress: () => {
            const l = newText(project, clock.time);
            addLayer(l);
            setSelection({ kind: 'layer', id: l.id });
            setTool('text');
          },
        },
        { key: 'stickers', icon: 'smile', label: 'Figurinha', onPress: () => setTool('stickers') },
        { key: 'image', icon: 'image', label: 'Imagem', onPress: addImageLayer },
        { key: 'captions', icon: 'message-square', label: 'Legendas', onPress: () => setTool('captions') },
        { key: 'music', icon: 'music', label: 'Música', onPress: () => setTool('music') },
        { key: 'record', icon: 'video', label: 'Gravar', onPress: () => setTool('record') },
        { key: 'format', icon: 'crop', label: 'Formato', onPress: () => setTool('format') },
      ];
    }
    const common = (dup = true): ToolButton[] => [
      ...(dup
        ? [{ key: 'dup', icon: 'copy' as const, label: 'Duplicar', onPress: () => setSelection(duplicateSelection(sel)) }]
        : []),
      { key: 'del', icon: 'trash-2', label: 'Excluir', onPress: deleted, danger: true },
    ];
    if (sel.kind === 'clip') {
      return [
        {
          key: 'split',
          icon: 'scissors',
          label: 'Dividir',
          onPress: () => {
            const right = splitAt(clock.time);
            if (right) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setSelection({ kind: 'clip', id: right });
            } else toast.show({ title: 'Mova o cursor para dentro do clipe', body: 'Perto demais da ponta para dividir.', tone: 'info' });
          },
        },
        { key: 'adjust', icon: 'move', label: 'Enquadrar', onPress: () => setTool('adjust') },
        { key: 'speed', icon: 'fast-forward', label: 'Velocidade', onPress: () => setTool('speed') },
        { key: 'volume', icon: 'volume-2', label: 'Volume', onPress: () => setTool('volume') },
        { key: 'filter', icon: 'aperture', label: 'Filtro', onPress: () => setTool('filter') },
        { key: 'transition', icon: 'shuffle', label: 'Transição', onPress: () => setTool('transition') },
        { key: 'left', icon: 'chevron-left', label: 'Para trás', onPress: () => moveClip(sel.id, -1) },
        { key: 'right', icon: 'chevron-right', label: 'Para frente', onPress: () => moveClip(sel.id, 1) },
        ...common(),
      ];
    }
    if (sel.kind === 'layer') {
      const l = project.layers.find((x) => x.id === sel.id);
      if (!l) return [];
      const edit: ToolButton =
        l.kind === 'text'
          ? { key: 'edit', icon: 'edit-3', label: 'Editar', onPress: () => setTool('text') }
          : l.kind === 'sticker'
            ? { key: 'edit', icon: 'smile', label: 'Trocar', onPress: () => setTool('layer') }
            : { key: 'edit', icon: 'sliders', label: l.kind === 'facecam' ? 'Facecam' : 'Ajustes', onPress: () => setTool('layer') };
      return [edit, ...common(l.kind !== 'facecam')];
    }
    if (sel.kind === 'audio') return [{ key: 'edit', icon: 'sliders', label: 'Ajustes', onPress: () => setTool('audio') }, ...common(false)];
    return [{ key: 'edit', icon: 'type', label: 'Estilo', onPress: () => setTool('captions') }, ...common(false)];
  }, [project, selection, clock]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.muted}>Este projeto não existe mais.</Text>
        <Pressable onPress={() => router.back()} style={styles.export}>
          <Text style={styles.exportText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }
  if (!project) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={E.accent} />
      </View>
    );
  }

  const selClip = selection?.kind === 'clip' ? project.clips.find((c) => c.id === selection.id) : undefined;
  const selLayer = selection?.kind === 'layer' ? project.layers.find((l) => l.id === selection.id) : undefined;
  const selAudio = selection?.kind === 'audio' ? project.audio.find((a) => a.id === selection.id) : undefined;
  const clipIndex = selClip ? project.clips.findIndex((c) => c.id === selClip.id) : undefined;

  const panel = (() => {
    switch (tool) {
      case 'media':
        return <MediaPanel project={project} after={clipIndex} onDone={() => setTool(null)} onError={error} />;
      case 'format':
        return <FormatPanel project={project} />;
      case 'adjust':
        return selClip ? <AdjustPanel clip={selClip} project={project} /> : null;
      case 'speed':
        return selClip ? <SpeedPanel clip={selClip} /> : null;
      case 'volume':
        return selClip ? <VolumePanel target={{ kind: 'clip', id: selClip.id }} value={selClip.volume} /> : null;
      case 'filter':
        return selClip ? <FilterPanel clip={selClip} project={project} /> : null;
      case 'transition':
        return selClip ? <TransitionPanel clip={selClip} project={project} /> : null;
      case 'text':
        return selLayer?.kind === 'text' ? <TextPanel layer={selLayer} /> : null;
      case 'stickers':
        return (
          <StickerGrid
            onPick={(emoji) => {
              const l = newSticker(project, clock.time, emoji);
              addLayer(l);
              setSelection({ kind: 'layer', id: l.id });
              setTool(null);
            }}
          />
        );
      case 'captions':
        return <CaptionsPanel project={project} time={time} onSeek={(t) => clock.seek(t)} onError={error} />;
      case 'music':
        return <MusicPanel project={project} time={time} onDone={() => setTool(null)} onError={error} />;
      case 'audio':
        return selAudio ? <AudioTrackPanel track={selAudio} project={project} /> : null;
      case 'layer':
        if (selLayer?.kind === 'sticker') return <StickerPanel layer={selLayer} />;
        if (selLayer?.kind === 'image') return <ImageLayerPanel layer={selLayer} />;
        if (selLayer?.kind === 'facecam') return <FacecamPanel layer={selLayer} />;
        return null;
      default:
        return null;
    }
  })();

  const recording = rec.phase !== 'idle';

  return (
    <KeyboardAvoidingView style={styles.root} behavior={undefined}>
      <StatusBar style="light" />
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <BackButton dark onPress={() => router.back()} />
        <TextInput
          value={project.title}
          onChangeText={(title) => store.update((p) => ({ ...p, title }), true)}
          onBlur={() => store.settle()}
          style={styles.title}
          selectionColor={E.accent}
          maxLength={60}
          accessibilityLabel="Nome do projeto"
        />
        <Pressable onPress={() => store.undo()} disabled={!canUndo} style={[styles.iconBtn, !canUndo && { opacity: 0.35 }]} accessibilityLabel="Desfazer">
          <Feather name="corner-up-left" size={20} color={E.ink} />
        </Pressable>
        <Pressable onPress={() => store.redo()} disabled={!canRedo} style={[styles.iconBtn, !canRedo && { opacity: 0.35 }]} accessibilityLabel="Refazer">
          <Feather name="corner-up-right" size={20} color={E.ink} />
        </Pressable>
        <Pressable
          onPress={() => {
            clock.pause();
            store.flush();
            router.push(`/render/${project.id}`);
          }}
          disabled={!project.clips.length || recording}
          style={[styles.export, (!project.clips.length || recording) && { opacity: 0.4 }]}
          accessibilityLabel="Exportar vídeo"
        >
          <Text style={styles.exportText}>Exportar</Text>
        </Pressable>
      </View>

      <Preview
        project={project}
        clock={clock}
        selection={selection}
        onSelect={select}
        adjusting={tool === 'adjust'}
        muted={recording && !rec.listen}
      >
        {(canvas) =>
          tool === 'record' ? (
            <>
              <CameraBubble rec={rec} canvas={canvas} />
              <RecordOverlay rec={rec} />
            </>
          ) : null
        }
      </Preview>

      <View style={styles.transport}>
        <Pressable onPress={() => clock.toggle()} disabled={recording} style={styles.play} accessibilityLabel={playing ? 'Pausar' : 'Reproduzir'}>
          <Feather name={playing ? 'pause' : 'play'} size={20} color="#fff" style={!playing && { marginLeft: 2 }} />
        </Pressable>
        <Text style={styles.time}>
          {fmtClock(time)} <Text style={{ color: E.faint }}>/ {fmtClock(total)}</Text>
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setPps((v) => Math.max(8, v / 1.5))} style={styles.iconBtn} accessibilityLabel="Afastar a linha do tempo">
          <Feather name="zoom-out" size={18} color={E.muted} />
        </Pressable>
        <Pressable onPress={() => setPps((v) => Math.min(200, v * 1.5))} style={styles.iconBtn} accessibilityLabel="Aproximar a linha do tempo">
          <Feather name="zoom-in" size={18} color={E.muted} />
        </Pressable>
      </View>

      {tool === 'record' ? (
        <RecordBar rec={rec} bottom={insets.bottom} onClose={() => setTool(null)} />
      ) : tool ? (
        <View style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>{TITLES[tool]}</Text>
            <Pressable onPress={() => (recording ? rec.stop() : setTool(null))} style={styles.done} accessibilityLabel="Concluir">
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.doneText}>Concluir</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelBody}>
            {panel ?? <Text style={styles.muted}>Selecione um item na linha do tempo.</Text>}
          </ScrollView>
        </View>
      ) : (
        <>
          <Timeline
            project={project}
            clock={clock}
            selection={selection}
            onSelect={select}
            pps={pps}
            onAdd={() => {
              setSelection(null);
              setTool('media');
            }}
            onTransition={(i) => {
              const c = project.clips[i];
              if (!c) return;
              setSelection({ kind: 'clip', id: c.id });
              setTool('transition');
            }}
          />
          <View style={[styles.toolbar, { paddingBottom: insets.bottom + 6 }]}>
            {selection ? (
              <Pressable onPress={() => setSelection(null)} style={styles.closeSel} accessibilityLabel="Tirar seleção">
                <Feather name="x" size={18} color={E.ink} />
              </Pressable>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
              {buttons.map((b) => (
                <Pressable key={b.key} onPress={b.onPress} style={({ pressed }) => [styles.tool, pressed && { backgroundColor: E.raised }]} accessibilityLabel={b.label}>
                  <Feather name={b.icon} size={21} color={b.danger ? E.danger : E.ink} />
                  <Text style={[styles.toolText, b.danger && { color: E.danger }]}>{b.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: E.bg },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  muted: { fontFamily: 'Archivo_400Regular', fontSize: 14, color: E.muted },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontFamily: 'Archivo_700Bold', fontSize: 16, color: E.ink, paddingVertical: 6, marginLeft: 6 },
  export: { height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: E.accent, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  exportText: { fontFamily: 'Archivo_700Bold', fontSize: 14, color: '#fff' },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 4 },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: E.raised2, alignItems: 'center', justifyContent: 'center' },
  time: { fontFamily: 'Archivo_600SemiBold', fontSize: 14, color: E.ink, fontVariant: ['tabular-nums'] },
  toolbar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: E.line, backgroundColor: E.panel, paddingTop: 6 },
  closeSel: { width: 44, height: 56, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: E.line },
  tools: { paddingHorizontal: 6, gap: 2 },
  tool: { width: 72, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  toolText: { fontFamily: 'Archivo_500Medium', fontSize: 11, color: E.ink },
  panel: { maxHeight: '52%', minHeight: 240, backgroundColor: E.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: E.line },
  panelHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  panelTitle: { flex: 1, fontFamily: 'Archivo_700Bold', fontSize: 17, color: E.ink },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: E.raised2 },
  doneText: { fontFamily: 'Archivo_600SemiBold', fontSize: 14, color: '#fff' },
  panelBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
});
