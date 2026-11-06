import Feather from '@expo/vector-icons/Feather';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import PuxaEngine from '../../../../modules/puxa-engine';
import { clock as fmtClock } from '../../../format';
import { clamp, FACECAM_BASE, sizeUnit } from '../../timeline';
import type { FacecamLayer } from '../../types';
import type { Clock } from '../clock';
import { Chip } from '../kit';
import { E } from '../palette';

export type RecordMode = 'voice' | 'camera';
export type CamPlacement = { x: number; y: number; scale: number; shape: FacecamLayer['shape'] };
export type Recording = { kind: RecordMode; uri: string; start: number; duration: number; cam: CamPlacement };

type Phase = 'idle' | 'countdown' | 'recording' | 'saving';

/**
 * O som do editor não disputa o foco de áudio consigo mesmo: sem isso, a trilha (expo-audio)
 * tomava o foco do vídeo (expo-video), que pausava, e os dois ficavam se interrompendo.
 */
export const EDITOR_AUDIO = { interruptionMode: 'mixWithOthers', playsInSilentMode: true } as const;

function headphones(): boolean {
  try {
    return PuxaEngine.headphones();
  } catch {
    return false;
  }
}

/** Estado e ações da gravação: compartilhado entre a barra de gravação e a bolha da câmera na prévia. */
export function useRecorder(clock: Clock, onFinish: (r: Recording) => void, onError: (m: string) => void) {
  const [mode, setMode] = useState<RecordMode>('camera');
  const [listen, setListenState] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cam, setCam] = useState<CamPlacement>({ x: 0.76, y: 0.78, scale: 1, shape: 'circle' });
  const camera = useRef<CameraView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [, requestCam] = useCameraPermissions();
  const [, requestMic] = useMicrophonePermissions();
  const session = useRef<{ start: number; t0: number; video: Promise<{ uri: string } | undefined> | null; cam: CamPlacement; mode: RecordMode } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef(phase);
  // A pessoa mexeu no "ouvir o vídeo": a escolha dela vale mais que a detecção do fone
  const touched = useRef(false);
  useEffect(() => {
    phaseRef.current = phase;
  });

  const setListen = (v: boolean) => {
    touched.current = true;
    setListenState(v);
  };

  /** Com fone conectado, dá para ouvir o vídeo sem o som vazar no microfone. */
  const detectHeadphones = () => {
    if (!touched.current) setListenState(headphones());
  };

  const stop = async () => {
    const s = session.current;
    if (!s || phaseRef.current !== 'recording') return;
    setPhase('saving');
    clock.pause();
    if (timer.current) clearInterval(timer.current);
    const duration = (Date.now() - s.t0) / 1000;
    try {
      let uri: string | null = null;
      if (s.mode === 'voice') {
        await recorder.stop();
        uri = recorder.uri;
      } else {
        camera.current?.stopRecording();
        uri = (await s.video)?.uri ?? null;
      }
      await setAudioModeAsync({ ...EDITOR_AUDIO, allowsRecording: false }).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!uri) throw new Error('A gravação não foi salva. Tente de novo.');
      if (duration < 0.6) throw new Error('A gravação ficou curta demais.');
      onFinish({ kind: s.mode, uri, start: s.start, duration, cam: s.cam });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      session.current = null;
      setPhase('idle');
      setElapsed(0);
    }
  };

  // O vídeo chegou ao fim: a gravação termina junto
  useEffect(
    () =>
      clock.subscribe((_, playing) => {
        if (!playing && phaseRef.current === 'recording') stop();
      }),
    [clock], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const start = async () => {
    if (phase !== 'idle') return;
    try {
      if (mode === 'camera') {
        const c = await requestCam();
        const m = await requestMic();
        if (!c.granted || !m.granted) throw new Error('Para a facecam, o Puxa precisa da câmera e do microfone. Libere nas permissões do app.');
      } else {
        const m = await requestRecordingPermissionsAsync();
        if (!m.granted) throw new Error('Para a narração, o Puxa precisa do microfone. Libere nas permissões do app.');
      }
      detectHeadphones();
      await setAudioModeAsync({ ...EDITOR_AUDIO, allowsRecording: true });
      if (mode === 'voice') await recorder.prepareToRecordAsync();
      setPhase('countdown');
      for (const n of [3, 2, 1]) {
        setCount(n);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        await new Promise((r) => setTimeout(r, 700));
      }
      const startAt = clock.time >= clock.duration - 0.2 ? 0 : clock.time;
      clock.seek(startAt);
      let video: Promise<{ uri: string } | undefined> | null = null;
      if (mode === 'voice') recorder.record();
      else video = camera.current?.recordAsync({ maxDuration: 900 }) ?? null;
      session.current = { start: startAt, t0: Date.now(), video, cam, mode };
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      clock.play();
      setPhase('recording');
      timer.current = setInterval(() => setElapsed((Date.now() - (session.current?.t0 ?? Date.now())) / 1000), 200);
    } catch (e) {
      setPhase('idle');
      await setAudioModeAsync({ ...EDITOR_AUDIO, allowsRecording: false }).catch(() => {});
      onError((e as Error).message);
    }
  };

  return { mode, setMode, listen, setListen, detectHeadphones, phase, count, elapsed, cam, setCam, camera, start, stop };
}

export type Recorder = ReturnType<typeof useRecorder>;

/** Bolha da câmera na prévia: mostra onde a facecam vai ficar e pode ser arrastada antes de gravar. */
export function CameraBubble({ rec, canvas }: { rec: Recorder; canvas: { width: number; height: number } }) {
  const size = FACECAM_BASE * sizeUnit(canvas.width, canvas.height) * rec.cam.scale;
  const live = useRef({ rec, canvas });
  useEffect(() => {
    live.current = { rec, canvas };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let o = { x: 0, y: 0, scale: 1 };
    let pinch: { d0: number; s0: number } | null = null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.rec.phase === 'idle',
      onMoveShouldSetPanResponder: () => live.current.rec.phase === 'idle',
      onPanResponderGrant: () => {
        o = { x: live.current.rec.cam.x, y: live.current.rec.cam.y, scale: live.current.rec.cam.scale };
        pinch = null;
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        const { rec: r, canvas: c } = live.current;
        if (t.length >= 2) {
          const d = Math.hypot(t[1].pageX - t[0].pageX, t[1].pageY - t[0].pageY);
          if (!pinch) pinch = { d0: d, s0: r.cam.scale };
          r.setCam({ ...r.cam, scale: clamp((pinch.s0 * d) / Math.max(1, pinch.d0), 0.4, 2.4) });
          return;
        }
        if (pinch) return;
        r.setCam({ ...r.cam, x: clamp(o.x + g.dx / c.width, 0.05, 0.95), y: clamp(o.y + g.dy / c.height, 0.05, 0.95) });
      },
    });
  });
  if (rec.mode !== 'camera') return null;
  const radius = rec.cam.shape === 'circle' ? size / 2 : rec.cam.shape === 'rounded' ? size * 0.18 : 0;
  return (
    <View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        left: rec.cam.x * canvas.width - size / 2,
        top: rec.cam.y * canvas.height - size / 2,
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        borderWidth: 3,
        borderColor: rec.phase === 'recording' ? E.danger : '#FFFFFF',
        backgroundColor: '#000',
      }}
    >
      <CameraView ref={rec.camera} style={StyleSheet.absoluteFill} facing="front" mode="video" mirror videoQuality="720p" />
    </View>
  );
}

/** Por cima do vídeo: a contagem regressiva e o selo de gravando, sem cobrir a prévia. */
export function RecordOverlay({ rec }: { rec: Recorder }) {
  if (rec.phase === 'countdown') {
    return (
      <View pointerEvents="none" style={styles.countWrap}>
        <View style={styles.countBubble}>
          <Text style={styles.count}>{rec.count}</Text>
        </View>
      </View>
    );
  }
  if (rec.phase === 'recording' || rec.phase === 'saving') {
    return (
      <View pointerEvents="none" style={styles.badge}>
        <View style={styles.dot} />
        <Text style={styles.badgeText}>{rec.phase === 'saving' ? 'Salvando' : fmtClock(rec.elapsed)}</Text>
      </View>
    );
  }
  return null;
}

const SHAPES: { id: CamPlacement['shape']; label: string }[] = [
  { id: 'circle', label: 'Círculo' },
  { id: 'rounded', label: 'Arredondado' },
  { id: 'square', label: 'Quadrado' },
];

/**
 * Barra compacta de gravação: as opções numa linha e o botão de gravar embaixo. Fica baixa de
 * propósito, para a prévia do vídeo ocupar quase toda a tela enquanto a pessoa narra ou grava.
 */
export function RecordBar({ rec, onClose, bottom }: { rec: Recorder; onClose: () => void; bottom: number }) {
  const idle = rec.phase === 'idle';
  const recording = rec.phase === 'recording';
  return (
    <View style={[styles.bar, { paddingBottom: bottom + 10 }]}>
      {idle ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options} keyboardShouldPersistTaps="handled">
            <Chip label="Voz e câmera" icon="video" active={rec.mode === 'camera'} onPress={() => rec.setMode('camera')} />
            <Chip label="Só a voz" icon="mic" active={rec.mode === 'voice'} onPress={() => rec.setMode('voice')} />
            <View style={styles.sep} />
            <Chip label="Ouvir o vídeo" icon="headphones" active={rec.listen} onPress={() => rec.setListen(!rec.listen)} />
            {rec.mode === 'camera' ? (
              <>
                <View style={styles.sep} />
                {SHAPES.map((s) => (
                  <Chip key={s.id} label={s.label} active={rec.cam.shape === s.id} onPress={() => rec.setCam({ ...rec.cam, shape: s.id })} />
                ))}
              </>
            ) : null}
          </ScrollView>
          {rec.mode === 'camera' ? (
            <Text style={styles.hint} numberOfLines={1}>
              Arraste a câmera na prévia para mudar o lugar.
            </Text>
          ) : null}
        </>
      ) : null}
      <View style={styles.controls}>
        <Pressable
          onPress={onClose}
          disabled={!idle}
          style={[styles.side, !idle && { opacity: 0 }]}
          accessibilityRole="button"
          accessibilityLabel="Fechar a gravação"
        >
          <Feather name="x" size={20} color={E.ink} />
          <Text style={styles.sideText}>Fechar</Text>
        </Pressable>
        <Pressable
          onPress={recording ? rec.stop : rec.start}
          disabled={rec.phase === 'countdown' || rec.phase === 'saving'}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Parar gravação' : 'Começar a gravar'}
          style={styles.recOuter}
        >
          <View style={[styles.recInner, recording && styles.recStop]} />
        </Pressable>
        <View style={styles.side}>
          {recording ? (
            <>
              <Feather name={rec.listen ? 'volume-2' : 'volume-x'} size={18} color={E.muted} />
              <Text style={styles.sideText}>{rec.listen ? 'Com som' : 'Sem som'}</Text>
            </>
          ) : (
            <Text style={[styles.sideText, { textAlign: 'center' }]}>
              {rec.phase === 'saving' ? 'Salvando…' : rec.phase === 'countdown' ? 'Prepare-se' : 'Toca a partir daqui'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: E.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: E.line, paddingTop: 10 },
  options: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  sep: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: E.lineStrong, marginHorizontal: 2 },
  hint: { fontFamily: 'Archivo_400Regular', fontSize: 12, lineHeight: 16, color: E.muted, paddingHorizontal: 16, marginTop: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: 10 },
  side: { width: 92, alignItems: 'center', gap: 4 },
  sideText: { fontFamily: 'Archivo_500Medium', fontSize: 12, color: E.muted },
  recOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  recInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: E.danger },
  recStop: { width: 26, height: 26, borderRadius: 6 },
  countWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 30 },
  countBubble: { width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: 'Archivo_800ExtraBold', fontSize: 60, color: '#fff' },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: E.danger },
  badgeText: { fontFamily: 'Archivo_700Bold', fontSize: 13, color: '#fff', fontVariant: ['tabular-nums'] },
});
