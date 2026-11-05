import Feather from '@expo/vector-icons/Feather';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';

import type { DoneEvent, Stage } from '../../modules/puxa-engine';
import { bytes, clock, eta, speed, stem } from '../format';
import { ms, reduceMotion } from '../motion';
import { ease, font, Palette, usePalette } from '../theme';
import { Button, Press } from './Button';

export type DockState =
  | { kind: 'idle'; label: string; detail: string; disabled?: boolean }
  | { kind: 'preparing'; video: boolean; stage: Stage; downloaded: number; total: number; speed: number; eta: number | null }
  | { kind: 'done'; file: DoneEvent; saved: boolean; saving: boolean; sending: boolean }
  | { kind: 'error'; message: string };

type Props = {
  state: DockState;
  onStart: () => void;
  onCancel: () => void;
  onSend: () => void;
  onSave: () => void;
  onShareOther: () => void;
  onRetry: () => void;
};

/** Rodapé fixo: a ação principal, o preparo em etapas, o arquivo pronto ou o erro. */
export function Dock({ state, onStart, onCancel, onSend, onSave, onShareOther, onRetry }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const swap = useState(() => new Animated.Value(1))[0];

  // Cada troca de estado (ação → preparo → pronto) chega deslizando de leve para cima
  useEffect(() => {
    swap.setValue(0);
    Animated.timing(swap, { toValue: 1, duration: ms(260), easing: ease.arrive, useNativeDriver: true }).start();
  }, [state.kind, swap]);

  const style = {
    opacity: swap,
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  return (
    <Animated.View style={style}>
      {state.kind === 'idle' ? (
        <Button label={state.label} detail={state.detail} icon="download" onPress={onStart} disabled={state.disabled} />
      ) : state.kind === 'preparing' ? (
        <Preparing state={state} onCancel={onCancel} s={s} c={c} />
      ) : state.kind === 'done' ? (
        <View style={s.gap}>
          <View style={s.doneRow}>
            <Check c={c} />
            <View style={{ flex: 1 }}>
              <Text style={s.doneTitle} numberOfLines={1}>
                {stem(state.file.filename)}
              </Text>
              <Text style={s.meta}>
                {[state.file.mime.startsWith('audio') ? 'Áudio M4A' : 'Vídeo MP4', clock(state.file.duration), bytes(state.file.size)].join(' · ')}
              </Text>
            </View>
          </View>
          <View style={s.buttons}>
            <Button tone="wa" icon="send" label="Enviar no WhatsApp" onPress={onSend} busy={state.sending} style={{ flex: 1 }} />
            <IconButton
              icon={state.saved ? 'check' : 'download'}
              busy={state.saving}
              onPress={onSave}
              label={state.saved ? 'Salvo em Downloads' : 'Salvar em Downloads'}
              tint={state.saved ? c.wa : c.ink}
              s={s}
              c={c}
            />
            <IconButton icon="share-2" onPress={onShareOther} label="Enviar por outro app" tint={c.ink} s={s} c={c} />
          </View>
        </View>
      ) : (
        <View style={s.gap}>
          <View style={s.errorRow}>
            <View style={s.errorIcon}>
              <Feather name="alert-circle" size={18} color={c.danger} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.errorTitle}>Não deu para preparar o arquivo</Text>
              <Text style={s.errorBody}>{state.message}</Text>
            </View>
          </View>
          <Button tone="neutral" icon="rotate-cw" label="Tentar de novo" onPress={onRetry} />
        </View>
      )}
    </Animated.View>
  );
}

/** Ação secundária só com ícone, do tamanho do botão principal ao lado. */
function IconButton({ icon, onPress, label, tint, busy, s, c }: { icon: keyof typeof Feather.glyphMap; onPress: () => void; label: string; tint: string; busy?: boolean; s: Styles; c: Palette }) {
  return (
    <Press onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: !!busy }}>
      {(pressed) => (
        <View style={[s.iconBtnInner, pressed && { backgroundColor: c.hover }]}>
          {busy ? <ActivityIndicator size="small" color={c.ink} /> : <Feather name={icon} size={20} color={tint} />}
        </View>
      )}
    </Press>
  );
}

function Preparing({ state, onCancel, s, c }: { state: Extract<DockState, { kind: 'preparing' }>; onCancel: () => void; s: Styles; c: Palette }) {
  const fraction = state.total > 0 ? Math.min(1, state.downloaded / state.total) : 0;
  const processing = state.stage === 'processing';
  const bar = useState(() => new Animated.Value(0))[0];
  const sweep = useState(() => new Animated.Value(0))[0];
  const [trackW, setTrackW] = useState(0);

  // A barra acompanha os bytes; os eventos chegam a cada 300 ms, a animação preenche o intervalo
  useEffect(() => {
    Animated.timing(bar, { toValue: processing ? 1 : fraction, duration: ms(300), easing: ease.ui, useNativeDriver: false }).start();
  }, [bar, fraction, processing]);

  // Enquanto junta/ajusta, um brilho percorre a segunda etapa: não há bytes para contar ali
  useEffect(() => {
    if (!processing || reduceMotion()) return;
    sweep.setValue(0);
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1100, easing: ease.travel, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [processing, sweep]);

  const pct = Math.round(fraction * 100);
  const second = state.video ? 'Juntar' : 'Ajustar';
  const line = processing
    ? state.video
      ? 'Juntando áudio e vídeo…'
      : 'Ajustando o áudio…'
    : state.total > 0
      ? [`${pct}%`, speed(state.speed), eta(state.eta)].filter(Boolean).join(' · ')
      : 'Conectando ao YouTube…';

  return (
    <View style={s.gap} accessibilityLiveRegion="polite" accessible accessibilityLabel={`Preparando. ${line}`}>
      <View style={s.steps}>
        <Step label="Baixar" state={processing ? 'done' : 'active'} c={c} s={s} />
        <View style={s.connector}>
          <Animated.View style={[s.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </View>
        <Step label={second} state={processing ? 'active' : 'todo'} c={c} s={s} />
        <View style={s.connector} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          {processing ? (
            <Animated.View
              style={[
                s.sweep,
                { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-30, Math.max(30, trackW)] }) }] },
              ]}
            />
          ) : null}
        </View>
        <Step label="Pronto" state="todo" c={c} s={s} />
      </View>
      <View style={s.progressRow}>
        <Text style={s.progressText} numberOfLines={1}>
          {line}
        </Text>
        <Button tone="ghost" label="Cancelar" compact onPress={onCancel} />
      </View>
    </View>
  );
}

function Step({ label, state, c, s }: { label: string; state: 'todo' | 'active' | 'done'; c: Palette; s: Styles }) {
  return (
    <View style={s.step}>
      <View
        style={[
          s.stepDot,
          state === 'todo' && { backgroundColor: c.surface, borderColor: c.lineStrong },
          state !== 'todo' && { backgroundColor: c.accent, borderColor: c.accent },
        ]}
      >
        {state === 'done' ? <Feather name="check" size={11} color={c.onAccent} /> : null}
      </View>
      <Text style={[s.stepLabel, state !== 'todo' && { color: c.ink }]}>{label}</Text>
    </View>
  );
}

/** O check chega com uma mola curta: é a confirmação de que o arquivo está no aparelho. */
function Check({ c }: { c: Palette }) {
  const pop = useState(() => new Animated.Value(reduceMotion() ? 1 : 0))[0];
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 9 }).start();
  }, [pop]);
  return (
    <Animated.View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: c.waSoft,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pop }],
        opacity: pop,
      }}
    >
      <Feather name="check" size={22} color={c.wa} />
    </Animated.View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    gap: { gap: 12 },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    doneTitle: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
    meta: { fontFamily: font.regular, fontSize: 14, color: c.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
    buttons: { flexDirection: 'row', gap: 8 },
    iconBtnInner: {
      width: 54,
      height: 54,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    steps: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    stepLabel: { fontFamily: font.semibold, fontSize: 14, color: c.muted },
    connector: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
    fill: { height: 4, borderRadius: 2, backgroundColor: c.accent },
    sweep: { position: 'absolute', top: 0, bottom: 0, width: 30, borderRadius: 2, backgroundColor: c.accent },
    progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    progressText: { flex: 1, fontFamily: font.medium, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums'] },
    errorRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    errorIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' },
    errorTitle: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
    errorBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: c.muted },
  });
