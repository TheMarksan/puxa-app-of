import Feather from '@expo/vector-icons/Feather';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DoneEvent, Stage } from '../../modules/puxa-engine';
import { bytes, eta, speed } from '../format';
import { ms, reduceMotion } from '../motion';
import { control, ease, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { Button, Press } from './Button';
import { Segmented } from './Segmented';

/** O que a pessoa pediu: o arquivo é baixado por baixo e a ação acontece quando ele fica pronto. */
export type Intent = 'share' | 'sticker' | 'save';

export type Format = 'audio' | 'video' | 'image';

export type DockState =
  | {
      kind: 'actions';
      /** O arquivo do formato escolhido já está no aparelho. */
      ready: DoneEvent | null;
      format: Format;
      /** Quais formatos o link oferece. */
      has: { audio: boolean; video: boolean };
      /** A qualidade escolhida ("720p") e quanto pesa (em bytes; 0 quando não se sabe). */
      quality: string;
      size: number;
      /** Tem mais de uma qualidade para escolher. */
      canPick: boolean;
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
  onFormat: (format: Format) => void;
  onQuality: () => void;
  onPlaylist: () => void;
  onCancel: () => void;
  onRetry: () => void;
};

/**
 * Rodapé fixo, na zona do polegar: o formato, a qualidade e as ações já aparecem com o link
 * lido. O arquivo vai para o armazenamento do app por baixo, e a ação acontece quando ele fica
 * pronto; Baixar guarda uma cópia em Download/Puxa.
 */
export function Dock({ state, onAction, onFormat, onQuality, onPlaylist, onCancel, onRetry }: Props) {
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
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  return (
    <Animated.View style={style}>
      {state.kind === 'actions' ? (
        <Actions state={state} onAction={onAction} onFormat={onFormat} onQuality={onQuality} onPlaylist={onPlaylist} s={s} c={c} />
      ) : state.kind === 'preparing' ? (
        <Preparing state={state} onCancel={onCancel} s={s} c={c} />
      ) : (
        <View style={s.stack}>
          <View style={s.errorRow}>
            <View style={s.errorIcon}>
              <Feather name="alert-circle" size={20} color={c.danger} />
            </View>
            <View style={s.errorText}>
              <Text style={s.statusTitle}>Não deu para preparar o arquivo</Text>
              <Text style={s.statusLine}>{state.message}</Text>
            </View>
          </View>
          <Button tone="neutral" icon="rotate-cw" label="Tentar de novo" onPress={onRetry} />
        </View>
      )}
    </Animated.View>
  );
}

type ActionsProps = Pick<Props, 'onAction' | 'onFormat' | 'onQuality' | 'onPlaylist'> & { state: Extract<DockState, { kind: 'actions' }>; s: Styles; c: Palette };

function Actions({ state, onAction, onFormat, onQuality, onPlaylist, s, c }: ActionsProps) {
  const image = state.format === 'image';
  return (
    <View style={s.stack}>
      <View style={s.choices}>
        {image ? (
          <Text style={s.photo}>Foto</Text>
        ) : (
          <View style={s.format}>
            <Segmented<Format>
              size="sm"
              accessibilityLabel="Formato"
              value={state.format}
              onChange={onFormat}
              options={[
                { value: 'audio', label: 'Áudio', disabled: !state.has.audio },
                { value: 'video', label: 'Vídeo', disabled: !state.has.video },
              ]}
            />
          </View>
        )}
        {state.quality ? (
          <Pressable
            onPress={onQuality}
            disabled={!state.canPick}
            style={({ pressed }) => [s.quality, pressed && { backgroundColor: c.lineStrong }]}
            accessibilityRole="button"
            accessibilityLabel={`Qualidade: ${state.quality}${state.ready ? ', pronto no aparelho' : ''}`}
            accessibilityHint={state.canPick ? 'Abre as outras qualidades' : undefined}
          >
            {state.ready ? <Check c={c} /> : null}
            <Text style={s.qualityText} numberOfLines={1}>
              {state.quality}
            </Text>
            {state.canPick ? <Feather name="chevron-down" size={16} color={c.muted} /> : null}
          </Pressable>
        ) : null}
      </View>
      <Button
        icon="send"
        label="Compartilhar"
        detail={state.ready ? bytes(state.ready.size) : state.size ? bytes(state.size) : undefined}
        accessibilityLabel={`Compartilhar${state.format === 'audio' ? ' o áudio' : state.format === 'video' ? ' o vídeo' : ' a foto'}`}
        onPress={() => onAction('share')}
        disabled={state.disabled}
      />
      <View style={s.buttons}>
        <Secondary icon="smile" label="Figurinha" onPress={() => onAction('sticker')} disabled={state.disabled} s={s} c={c} />
        <Secondary
          icon={state.saved ? 'check' : 'download'}
          label={state.saved ? 'Salvo' : 'Baixar'}
          tint={state.saved ? c.successInk : undefined}
          busy={state.saving}
          onPress={() => onAction('save')}
          disabled={state.disabled}
          s={s}
          c={c}
        />
        {state.canPlaylist ? (
          <Secondary icon={state.listed ? 'check' : 'music'} label={state.listed ? 'Na playlist' : 'Playlist'} tint={state.listed ? c.accentInk : undefined} onPress={onPlaylist} s={s} c={c} />
        ) : null}
      </View>
    </View>
  );
}

/** Ação de apoio: ícone em cima e o nome embaixo, mesma altura para as três. */
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
    <Press onPress={onPress} disabled={busy || disabled} containerStyle={s.secondarySlot} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: !!busy, disabled: !!disabled }}>
      {(pressed) => (
        <View style={[s.secondary, pressed && { backgroundColor: c.lineStrong }, disabled && { opacity: 0.4 }]}>
          {busy ? <ActivityIndicator size="small" color={c.ink} /> : <Feather name={icon} size={20} color={tint ?? c.ink} />}
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

  // Enquanto junta/ajusta não há bytes para contar: um brilho percorre a barra cheia
  useEffect(() => {
    if (!processing || reduceMotion()) return;
    sweep.setValue(0);
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1100, easing: ease.travel, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [processing, sweep]);

  const pct = Math.round(fraction * 100);
  const title = processing ? (state.video ? 'Juntando áudio e vídeo' : 'Ajustando o áudio') : state.total > 0 ? (state.video ? 'Baixando o vídeo' : 'Baixando') : 'Conectando';
  const line = processing ? 'Falta pouco.' : [speed(state.speed), eta(state.eta)].filter(Boolean).join(' · ') || 'Começando…';

  return (
    <View style={s.stack} accessibilityLiveRegion="polite" accessible accessibilityLabel={`${title}. ${processing ? '' : `${pct}%. `}${line}`}>
      <View style={s.statusRow}>
        <View style={s.statusText}>
          <Text style={s.statusTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.statusLine} numberOfLines={1}>
            {line}
          </Text>
        </View>
        {processing ? <ActivityIndicator color={c.accentInk} /> : <Text style={s.percent}>{pct}%</Text>}
      </View>
      <View style={s.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <Animated.View style={[s.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        {processing ? <Animated.View style={[s.sweep, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-64, Math.max(64, trackW)] }) }] }]} /> : null}
      </View>
      <Button tone="neutral" size="md" label="Cancelar" onPress={onCancel} />
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
    <Animated.View style={{ transform: [{ scale: pop }], opacity: pop }}>
      <Feather name="check-circle" size={16} color={c.successInk} />
    </Animated.View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stack: { gap: space[3] },
    choices: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    format: { flex: 1 },
    photo: { ...text.bodyBold, color: c.ink, flex: 1 },
    quality: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: c.sunken, maxWidth: '56%' },
    qualityText: { ...text.captionBold, ...tabular, color: c.ink, flexShrink: 1 },
    buttons: { flexDirection: 'row', gap: space[2] },
    secondarySlot: { flex: 1 },
    // Ícone em cima e o nome embaixo: cabe "Na playlist" mesmo em celular de 360 dp com três botões
    secondary: { alignItems: 'center', justifyContent: 'center', height: control.lg, paddingHorizontal: space[1], borderRadius: radius.lg, backgroundColor: c.sunken },
    secondaryText: { ...text.captionBold, lineHeight: 16, color: c.ink },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    statusText: { flex: 1, minWidth: 0 },
    statusTitle: { ...text.bodyBold, color: c.ink },
    statusLine: { ...text.caption, ...tabular, color: c.muted },
    percent: { ...text.title, ...tabular, color: c.ink },
    track: { height: 8, borderRadius: radius.full, backgroundColor: c.sunken, overflow: 'hidden' },
    fill: { height: 8, borderRadius: radius.full, backgroundColor: c.accent },
    sweep: { position: 'absolute', top: 0, bottom: 0, width: 64, borderRadius: radius.full, backgroundColor: c.accentInk, opacity: 0.4 },
    errorRow: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
    errorIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' },
    errorText: { flex: 1, minWidth: 0 },
  });
