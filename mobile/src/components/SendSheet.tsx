import Feather from '@expo/vector-icons/Feather';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Animated, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine, { DoneEvent } from '../../modules/puxa-engine';
import { bytes, clipName, clock, stem } from '../format';
import { ms } from '../motion';
import { ease, font, Palette, usePalette } from '../theme';
import { Button, Press } from './Button';
import { Segmented } from './Segmented';
import { MIN_CLIP, Trimmer } from './Trimmer';

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

  const player = useAudioPlayer({ uri: `file://${file.path}` }, { updateInterval: 80 });
  const status = useAudioPlayerStatus(player);
  const previewing = status.playing;

  // Abrir e fechar: o painel sobe do rodapé e o fundo escurece junto
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      slide.setValue(0);
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
    transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [560, 0] }) }],
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {
        if (!busy) onClose();
      }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: slide }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && onClose()} accessibilityLabel="Fechar" />
      </Animated.View>
      <Animated.View style={[s.sheet, sheetStyle, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.grabber} />
        <ScrollView bounces={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Enviar no WhatsApp</Text>
              <Text style={s.subtitle} numberOfLines={1}>
                {stem(file.filename)}
              </Text>
            </View>
            <Press onPress={onClose} disabled={!!busy} style={s.close} accessibilityRole="button" accessibilityLabel="Fechar">
              <Feather name="x" size={22} color={c.muted} />
            </Press>
          </View>

          <Text style={s.label}>O que mandar</Text>
          <Segmented
            accessibilityLabel="O que mandar"
            value={mode}
            onChange={(m) => {
              Haptics.selectionAsync().catch(() => {});
              setMode(m);
              if (m === 'whole') player.pause();
            }}
            options={[
              { value: 'whole', label: 'Áudio inteiro', detail: `${clock(file.duration)} · ${bytes(file.size)}` },
              { value: 'clip', label: 'Só um trecho', detail: 'Você escolhe início e fim' },
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
                  <Feather name={previewing ? 'pause' : 'play'} size={22} color={c.onAccent} style={!previewing && { marginLeft: 3 }} />
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
              <Feather name="alert-triangle" size={16} color={c.danger} style={{ marginTop: 2 }} />
              <Text style={s.warnText}>
                Acima de 16 MB o WhatsApp pode mandar como documento, sem tocar na conversa.
                {mode === 'whole' ? ' Um trecho resolve.' : ' Diminua o trecho.'}
              </Text>
            </View>
          ) : null}

          <View style={s.actions}>
            <Button
              tone="wa"
              icon="send"
              label={mode === 'clip' ? `Enviar trecho de ${clock(clipLen)}` : 'Enviar áudio inteiro'}
              busy={busy === 'wa'}
              disabled={busy === 'other'}
              onPress={() => send(true)}
            />
            <Button tone="ghost" icon="share-2" label="Outros apps" compact busy={busy === 'other'} disabled={busy === 'wa'} onPress={() => send(false)} />
          </View>
        </ScrollView>
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
        <Pressable onPress={onMinus} hitSlop={6} style={({ pressed }) => [s.btn, pressed && { backgroundColor: c.hover }]} accessibilityLabel={`${label}: menos 1 segundo`}>
          <Feather name="minus" size={16} color={c.ink} />
        </Pressable>
        <Text style={s.value}>{clock(value)}</Text>
        <Pressable onPress={onPlus} hitSlop={6} style={({ pressed }) => [s.btn, pressed && { backgroundColor: c.hover }]} accessibilityLabel={`${label}: mais 1 segundo`}>
          <Feather name="plus" size={16} color={c.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const stepperStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: 4 },
    label: { fontFamily: font.medium, fontSize: 13, color: c.muted },
    row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    btn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
    value: { minWidth: 44, textAlign: 'center', fontFamily: font.semibold, fontSize: 16, color: c.ink, fontVariant: ['tabular-nums'] },
  });

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '92%',
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      shadowColor: c.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 24,
    },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.lineStrong, marginTop: 10 },
    content: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
    title: { fontFamily: font.bold, fontSize: 21, color: c.ink, letterSpacing: -0.3 },
    subtitle: { fontFamily: font.regular, fontSize: 14, color: c.muted, marginTop: 2 },
    close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.hover },
    label: { fontFamily: font.semibold, fontSize: 14, color: c.muted, marginTop: 4 },
    editor: { paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, gap: 6 },
    controls: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 14, marginTop: 6 },
    play: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    summary: { textAlign: 'center', fontFamily: font.regular, fontSize: 14, color: c.muted, marginTop: 8 },
    summaryStrong: { fontFamily: font.semibold, color: c.ink },
    warn: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerLine },
    warnText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: c.ink },
    actions: { gap: 6, marginTop: 4 },
  });
