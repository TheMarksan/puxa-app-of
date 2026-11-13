import Feather from '@expo/vector-icons/Feather';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Animated, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine, { DoneEvent } from '../../modules/puxa-engine';
import { bytes, clipName, clock, stem } from '../format';
import { ms } from '../motion';
import { control, ease, gutter, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { BackButton } from './BackButton';
import { Press } from './Button';
import { Segmented } from './Segmented';
import { useSheetDrag } from './SheetParts';
import { MIN_CLIP, Trimmer } from './Trimmer';
import { PlayIcon, SendRow } from './ui';

const WA_LIMIT = 16 * 1024 * 1024;

type Props = {
  file: DoneEvent;
  title: string;
  visible: boolean;
  onClose: () => void;
  /** Recebe o arquivo final (inteiro ou trecho) para entregar ao WhatsApp ou a outro app. */
  onSend: (target: { path: string; filename: string; mime: string; size: number }, whatsapp: boolean) => Promise<void>;
  onError: (message: string) => void;
};

/** Painel de envio do áudio: inteiro ou um trecho escolhido na forma de onda, com prévia. */
export function SendSheet({ file, title, visible, onClose, onSend, onError }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const slide = useState(() => new Animated.Value(0))[0];

  const [mode, setMode] = useState<'whole' | 'clip'>('whole');
  const duration = Math.max(MIN_CLIP, file.duration);
  const [range, setRange] = useState(() => ({ start: 0, end: Math.min(duration, 30) }));
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [busy, setBusy] = useState<null | 'wa' | 'other'>(null);
  const sheetDrag = useSheetDrag(onClose, !busy);

  const player = useAudioPlayer({ uri: `file://${file.path}` }, { updateInterval: 80 });
  const status = useAudioPlayerStatus(player);
  const previewing = status.playing;

  // Abrir e fechar: o painel sobe do rodapé e o fundo escurece junto
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      slide.setValue(0);
      sheetDrag.reset();
      Animated.timing(slide, { toValue: 1, duration: ms(380), easing: ease.ios, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(slide, { toValue: 0, duration: ms(220), easing: ease.exit, useNativeDriver: true }).start(() => setMounted(false));
      player.pause();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // A forma de onda só é lida quando a pessoa pede um trecho
  useEffect(() => {
    if (mode !== 'clip' || peaks) return;
    let alive = true;
    PuxaEngine.waveform(file.path, 400)
      .then((p) => alive && setPeaks(p))
      .catch((e: Error) => {
        if (!alive) return;
        setPeaks([]);
        onError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [file.path, mode, onError, peaks]);

  // A prévia para sozinha no fim do trecho
  useEffect(() => {
    if (previewing && status.currentTime >= range.end) player.pause();
  }, [player, previewing, range.end, status.currentTime]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) onClose();
      return true;
    });
    return () => sub.remove();
  }, [busy, onClose, visible]);

  const clipLen = range.end - range.start;
  const clipSize = Math.round((file.size * clipLen) / duration);
  const finalSize = mode === 'clip' ? clipSize : file.size;
  const tooBig = finalSize > WA_LIMIT;

  const togglePreview = () => {
    if (previewing) {
      player.pause();
      return;
    }
    const from = status.currentTime >= range.start && status.currentTime < range.end - 0.3 ? status.currentTime : range.start;
    player.seekTo(from).then(() => player.play()).catch(() => player.play());
  };

  const nudge = (edge: 'start' | 'end', delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setRange((r) => {
      if (edge === 'start') {
        const a = Math.min(Math.max(0, r.start + delta), r.end - MIN_CLIP);
        return { start: a, end: r.end };
      }
      const b = Math.max(Math.min(duration, r.end + delta), r.start + MIN_CLIP);
      return { start: r.start, end: b };
    });
  };

  const send = async (whatsapp: boolean) => {
    player.pause();
    setBusy(whatsapp ? 'wa' : 'other');
    try {
      if (mode === 'clip') {
        const clip = await PuxaEngine.trim(file.path, range.start, range.end, clipName(title, range.start, range.end));
        await onSend(clip, whatsapp);
      } else {
        await onSend({ path: file.path, filename: file.filename, mime: file.mime, size: file.size }, whatsapp);
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!mounted) return null;

  const sheetStyle = {
    transform: [{ translateY: Animated.add(slide.interpolate({ inputRange: [0, 1], outputRange: [560, 0] }), sheetDrag.drag) }],
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {
        if (!busy) onClose();
      }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: slide }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && onClose()} accessibilityLabel="Fechar" />
      </Animated.View>
      <Animated.View style={[s.sheet, sheetStyle, { paddingBottom: insets.bottom + space[4] }]}>
        {/* Alça e topo: arrastar para baixo fecha a folha */}
        <View {...sheetDrag.handlers} style={s.dragZone}>
          <View style={s.grabber} />
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.title} accessibilityRole="header">
                Enviar
              </Text>
              <Text style={s.subtitle} numberOfLines={1}>
                {stem(file.filename)}
              </Text>
            </View>
            <BackButton icon="close" onPress={onClose} disabled={!!busy} />
          </View>
        </View>
        <ScrollView style={s.scroll} bounces={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Segmented
            accessibilityLabel="O que mandar"
            value={mode}
            onChange={(m) => {
              Haptics.selectionAsync().catch(() => {});
              setMode(m);
              if (m === 'whole') player.pause();
            }}
            options={[
              { value: 'whole', label: 'Inteiro', detail: `${clock(file.duration)} · ${bytes(file.size)}` },
              { value: 'clip', label: 'Trecho', detail: 'início e fim' },
            ]}
          />

          {mode === 'clip' ? (
            <View style={s.editor}>
              <Trimmer
                peaks={peaks}
                duration={duration}
                start={range.start}
                end={range.end}
                onChange={(a, b) => setRange({ start: a, end: b })}
                playhead={previewing ? status.currentTime : null}
                onScrubStart={() => player.pause()}
              />
              <View style={s.controls}>
                <Stepper c={c} label="Início" value={range.start} onMinus={() => nudge('start', -1)} onPlus={() => nudge('start', 1)} />
                <Press onPress={togglePreview} style={s.play} accessibilityRole="button" accessibilityLabel={previewing ? 'Parar a prévia' : 'Ouvir trecho'}>
                  <PlayIcon playing={previewing} size={20} color={c.onAccent} />
                </Press>
                <Stepper c={c} label="Fim" value={range.end} onMinus={() => nudge('end', -1)} onPlus={() => nudge('end', 1)} />
              </View>
              <Text style={s.summary}>
                Trecho de <Text style={s.summaryStrong}>{clock(clipLen)}</Text> · cerca de {bytes(clipSize)}
              </Text>
            </View>
          ) : null}

          {tooBig ? (
            <View style={s.warn}>
              <Feather name="alert-triangle" size={20} color={c.danger} />
              <Text style={s.warnText}>
                Acima de 16 MB o WhatsApp pode mandar como documento, sem tocar na conversa.
                {mode === 'whole' ? ' Um trecho resolve.' : ' Diminua o trecho.'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
        <View style={s.footer}>
          <SendRow
            label={mode === 'clip' ? `Enviar trecho de ${clock(clipLen)}` : 'Enviar áudio inteiro'}
            busy={busy === 'wa' ? 'send' : busy === 'other' ? 'other' : null}
            onSend={() => send(true)}
            onOther={() => send(false)}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

function Stepper({ c, label, value, onMinus, onPlus }: { c: Palette; label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  const s = stepperStyles(c);
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <Pressable onPress={onMinus} hitSlop={8} style={({ pressed }) => [s.btn, pressed && { backgroundColor: c.lineStrong }]} accessibilityLabel={`${label}: menos 1 segundo`}>
          <Feather name="minus" size={16} color={c.ink} />
        </Pressable>
        <Text style={s.value}>{clock(value)}</Text>
        <Pressable onPress={onPlus} hitSlop={8} style={({ pressed }) => [s.btn, pressed && { backgroundColor: c.lineStrong }]} accessibilityLabel={`${label}: mais 1 segundo`}>
          <Feather name="plus" size={16} color={c.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const stepperStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: space[1] },
    label: { ...text.caption, color: c.muted },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    btn: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    value: { ...text.bodyBold, ...tabular, minWidth: 44, textAlign: 'center', color: c.ink },
  });

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '92%', backgroundColor: c.dark ? c.raised : c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, boxShadow: c.shadow3 },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.full, backgroundColor: c.lineStrong, marginVertical: space[3] },
    dragZone: { paddingHorizontal: gutter, paddingBottom: space[4] },
    scroll: { flexShrink: 1 },
    content: { paddingHorizontal: gutter, paddingBottom: space[4], gap: space[4] },
    footer: { paddingHorizontal: gutter, paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong },
    header: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    headerText: { flex: 1, minWidth: 0 },
    title: { ...text.title, color: c.ink },
    subtitle: { ...text.caption, color: c.muted },
    editor: { paddingVertical: space[4], borderRadius: radius.lg, backgroundColor: c.sunken, gap: space[2] },
    controls: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: space[4], marginTop: space[2] },
    play: { width: control.lg, height: control.lg, borderRadius: radius.full, backgroundColor: c.accent, boxShadow: c.sheen, alignItems: 'center', justifyContent: 'center' },
    summary: { ...text.caption, textAlign: 'center', color: c.muted, marginTop: space[2] },
    summaryStrong: { ...text.captionBold, color: c.ink },
    warn: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: c.dangerSoft },
    warnText: { ...text.caption, flex: 1, color: c.ink },
  });
