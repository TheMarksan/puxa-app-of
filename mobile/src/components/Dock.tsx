import Feather from '@expo/vector-icons/Feather';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';

import type { DoneEvent, Stage } from '../../modules/puxa-engine';
import { bytes, clock, eta, speed } from '../format';
import { ms, reduceMotion } from '../motion';
import { ease, font, Palette, usePalette } from '../theme';
import { Button, Press } from './Button';

/** O que a pessoa pediu: o arquivo é baixado por baixo e a ação acontece quando ele fica pronto. */
export type Intent = 'share' | 'sticker' | 'save';

export type DockState =
  | {
      kind: 'actions';
      /** O arquivo do formato escolhido já está no aparelho. */
      ready: DoneEvent | null;
      /** O que vai ser baixado (quando ainda não está): "Vídeo 720p · 5,4 MB". */
      detail: string;
      image: boolean;
      /** Tem áudio para virar música da playlist. */
      canPlaylist: boolean;
      /** Já está na playlist. */
      listed: boolean;
      saved: boolean;
      saving: boolean;
      disabled?: boolean;
    }
  | { kind: 'preparing'; intent: Intent | null; video: boolean; stage: Stage; downloaded: number; total: number; speed: number; eta: number | null }
  | { kind: 'error'; message: string };

type Props = {
  state: DockState;
  onAction: (intent: Intent) => void;
  onPlaylist: () => void;
  onCancel: () => void;
  onRetry: () => void;
};

const ENDS: Record<Intent, string> = { share: 'Enviar', sticker: 'Figurinha', save: 'Salvar' };

/**
 * Rodapé fixo: as ações (Compartilhar, Figurinha, Baixar e Playlist) já aparecem com o link
 * lido. O arquivo vai para o armazenamento do app por baixo, e a ação acontece quando ele
 * fica pronto; Baixar guarda uma cópia em Download/Puxa.
 */
export function Dock({ state, onAction, onPlaylist, onCancel, onRetry }: Props) {
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
      {state.kind === 'actions' ? (
        <Actions state={state} onAction={onAction} onPlaylist={onPlaylist} s={s} c={c} />
      ) : state.kind === 'preparing' ? (
        <Preparing state={state} onCancel={onCancel} s={s} c={c} />
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

function Actions({ state, onAction, onPlaylist, s, c }: { state: Extract<DockState, { kind: 'actions' }>; onAction: (i: Intent) => void; onPlaylist: () => void; s: Styles; c: Palette }) {
  const f = state.ready;
  const kind = f ? (f.mime === 'audio/mpeg' ? 'Áudio MP3' : f.mime.startsWith('audio') ? 'Áudio M4A' : f.mime.startsWith('image') ? 'Foto' : 'Vídeo MP4') : '';
  const meta = f ? [kind, f.mime.startsWith('image') ? null : clock(f.duration), bytes(f.size), state.saved ? 'Salvo' : null].filter(Boolean).join(' · ') : state.detail;
  return (
    <View style={s.gap}>
      <View style={s.metaRow} accessibilityLiveRegion="polite">
        {f ? <Check c={c} /> : null}
        <Text style={[s.meta, { flex: 1 }]} numberOfLines={1}>
          {f ? <Text style={s.ready}>Pronto · </Text> : null}
          {meta}
        </Text>
      </View>
      <Button tone="wa" icon="send" label="Compartilhar" onPress={() => onAction('share')} disabled={state.disabled} />
      <View style={s.buttons}>
        <Secondary icon="smile" label="Figurinha" onPress={() => onAction('sticker')} disabled={state.disabled} s={s} c={c} />
        <Secondary
          icon={state.saved ? 'check' : 'download'}
          label={state.saved ? 'Salvo' : 'Baixar'}
          tint={state.saved ? c.waInk : undefined}
          busy={state.saving}
          onPress={() => onAction('save')}
          disabled={state.disabled}
          s={s}
          c={c}
        />
        {state.canPlaylist ? (
          <Secondary
            icon={state.listed ? 'check' : 'music'}
            label={state.listed ? 'Na playlist' : 'Playlist'}
            tint={state.listed ? c.accentInk : undefined}
            onPress={onPlaylist}
            s={s}
            c={c}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Ação secundária: contorno, ícone e o nome embaixo, mesma altura para as três. */
function Secondary({
  icon,
  label,
  onPress,
  busy,
  disabled,
  tint,
  s,
  c,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tint?: string;
  s: Styles;
  c: Palette;
}) {
  return (
    <Press onPress={onPress} disabled={busy || disabled} containerStyle={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: !!busy, disabled: !!disabled }}>
      {(pressed) => (
        <View style={[s.secondary, pressed && { backgroundColor: c.hover }, disabled && { opacity: 0.45 }]}>
          {busy ? <ActivityIndicator size="small" color={c.ink} /> : <Feather name={icon} size={19} color={tint ?? c.ink} />}
          <Text style={[s.secondaryText, tint ? { color: tint } : null]} numberOfLines={1}>
            {label}
          </Text>
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
        <Step label={state.intent ? ENDS[state.intent] : 'Pronto'} state="todo" c={c} s={s} />
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
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: c.waSoft,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pop }],
        opacity: pop,
      }}
    >
      <Feather name="check" size={14} color={c.waInk} />
    </Animated.View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    gap: { gap: 10 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
    meta: { fontFamily: font.regular, fontSize: 14, color: c.muted, fontVariant: ['tabular-nums'] },
    ready: { fontFamily: font.semibold, color: c.waInk },
    buttons: { flexDirection: 'row', gap: 8 },
    // Ícone em cima e o nome embaixo: cabe "Figurinha" mesmo em celular de 360 dp com três botões
    secondary: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      height: 56,
      paddingHorizontal: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
    },
    secondaryText: { fontFamily: font.semibold, fontSize: 13, color: c.ink },
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
