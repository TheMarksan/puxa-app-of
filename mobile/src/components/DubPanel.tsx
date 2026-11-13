import Feather from '@expo/vector-icons/Feather';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { dub, estimateCredits, TARGETS, type DubResult, type DubTarget } from '../ai/dub';
import { account, VOICES, voicePreview } from '../ai/elevenlabs';
import { setElevenKey, useElevenKey } from '../ai/key';
import { toUri } from '../editor/media';
import { clock } from '../format';
import { getSettings, setSettings } from '../settings';
import { control, type Palette, radius, space, text, usePalette } from '../theme';
import { Button } from './Button';
import { Pill } from './Pill';
import { Reveal } from './SheetParts';
import { PlayIcon } from './ui';

type Props = {
  path: string;
  from: number;
  to: number;
  dubbed: DubResult | null;
  onDubbed: (r: DubResult | null) => void;
  keepOriginal: boolean;
  onKeepOriginal: (on: boolean) => void;
  /** Enquanto dubla: a função que cancela (o voltar do Android usa). */
  onBusy: (cancel: (() => void) | null) => void;
  onError: (message: string) => void;
  /** Toca o vídeo junto com a dublagem (prévia). */
  onListen: (playing: boolean) => void;
};

/**
 * Dublagem com duas vozes da ElevenLabs. Sem chave, pede a chave ali mesmo (uma vez). A primeira
 * pessoa que fala fica com a voz escolhida; a segunda, com a outra.
 */
export function DubPanel({ path, from, to, dubbed, onDubbed, keepOriginal, onKeepOriginal, onBusy, onError, onListen }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const key = useElevenKey();
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [voice, setVoice] = useState<string>(() => getSettings().voice ?? VOICES[0].id);
  const [target, setTarget] = useState<DubTarget>('pt');
  const [busy, setBusy] = useState<{ label: string; fraction: number | null } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const signal = useRef({ cancelled: false });
  const sample = useAudioPlayer(null);
  const sampleStatus = useAudioPlayerStatus(sample);
  const [sampleVoice, setPlayingVoice] = useState<string | null>(null);
  const playingVoice = sampleVoice && sampleStatus.playing ? sampleVoice : null;

  useEffect(
    () => () => {
      try {
        sample.pause();
      } catch {
        // o player já foi liberado
      }
    },
    [sample],
  );

  const saveKey = async () => {
    const k = draft.trim();
    if (!k) return;
    setChecking(true);
    try {
      await account(k);
      await setElevenKey(k);
      setDraft('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const preview = async (id: string) => {
    if (playingVoice === id) {
      sample.pause();
      setPlayingVoice(null);
      return;
    }
    setLoadingPreview(id);
    const url = await voicePreview(id);
    setLoadingPreview(null);
    if (!url) {
      onError('Não deu para tocar a amostra agora.');
      return;
    }
    sample.replace({ uri: url });
    sample.play();
    setPlayingVoice(id);
  };

  const run = async () => {
    signal.current = { cancelled: false };
    setBusy({ label: 'Preparando…', fraction: null });
    onBusy(() => (signal.current.cancelled = true));
    const other = VOICES.find((v) => v.id !== voice)?.id ?? VOICES[1].id;
    try {
      const r = await dub({ path, from, to, voices: [voice, other], target, progress: (label, fraction) => setBusy({ label, fraction }), signal: signal.current });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDubbed(r);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code !== 'cancelled') onError(err.message);
    } finally {
      setBusy(null);
      onBusy(null);
    }
  };

  if (key === null) return <ActivityIndicator color={c.accent} />;

  if (!key) {
    return (
      <Reveal>
        <View style={s.card}>
          <Text style={s.title}>Dublagem com vozes de IA</Text>
          <Text style={s.body}>Usa a sua conta da ElevenLabs (tem plano grátis). Cole a chave da API uma vez.</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Chave da ElevenLabs"
            placeholderTextColor={c.disabledInk}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
            selectionColor={c.accent}
            accessibilityLabel="Chave da API da ElevenLabs"
          />
          <Button tone="accent" size="md" icon="key" label="Salvar chave" busy={checking} disabled={!draft.trim()} onPress={saveKey} />
          <Text style={s.link} onPress={() => Linking.openURL('https://elevenlabs.io/app/settings/api-keys').catch(() => {})} accessibilityRole="link">
            Onde pego a chave?
          </Text>
        </View>
      </Reveal>
    );
  }

  const length = Math.max(0, to - from);

  return (
    <Reveal>
      <View style={s.card}>
        <Text style={s.label}>Voz</Text>
        <View style={s.voices} accessibilityRole="radiogroup" accessibilityLabel="Voz da dublagem">
          {VOICES.map((v) => {
            const on = v.id === voice;
            return (
              <Pressable
                key={v.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setVoice(v.id);
                  setSettings({ voice: v.id });
                }}
                style={[s.voice, on && s.voiceOn]}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${v.name}, ${v.detail}`}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.voiceName, on && { color: c.accentInk }]}>{v.name}</Text>
                  <Text style={s.voiceDetail} numberOfLines={1}>
                    {v.detail}
                  </Text>
                </View>
                <Pressable onPress={() => preview(v.id)} hitSlop={8} style={s.play} accessibilityRole="button" accessibilityLabel={playingVoice === v.id ? `Parar a amostra de ${v.name}` : `Ouvir ${v.name}`}>
                  {loadingPreview === v.id ? (
                    <ActivityIndicator size="small" color={c.ink} />
                  ) : (
                    <PlayIcon playing={playingVoice === v.id} size={16} color={c.ink} />
                  )}
                </Pressable>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.hint}>Se duas pessoas falam, a segunda fica com a outra voz.</Text>

        <Text style={s.label}>Para</Text>
        <View style={s.row}>
          {TARGETS.map((t) => (
            <Pill key={t.code} c={c} label={t.label} active={target === t.code} onPress={() => setTarget(t.code)} />
          ))}
        </View>

        <View style={s.switchRow}>
          <Text style={s.switchLabel}>Som original baixinho ao fundo</Text>
          <Switch
            value={keepOriginal}
            onValueChange={onKeepOriginal}
            trackColor={{ true: c.accent, false: c.lineStrong }}
            thumbColor={c.onAccent}
            accessibilityLabel="Som original baixinho ao fundo"
          />
        </View>

        {dubbed && !busy ? (
          <View style={s.done}>
            <Feather name="check-circle" size={20} color={c.successInk} />
            <Text style={s.doneText} numberOfLines={2}>
              Dublado em {TARGETS.find((t) => t.code === dubbed.language)?.label ?? dubbed.language} · {dubbed.lines.length} falas{dubbed.voices > 1 ? ' · 2 vozes' : ''}
            </Text>
            <Text style={s.action} onPress={() => onListen(true)} accessibilityRole="button">
              Ouvir
            </Text>
            <Text
              style={[s.action, { color: c.danger }]}
              onPress={() => {
                onListen(false);
                onDubbed(null);
              }}
              accessibilityRole="button"
            >
              Tirar
            </Text>
          </View>
        ) : null}

        {busy ? (
          <View style={s.busy}>
            <Text style={s.busyText}>{busy.label}</Text>
            <View style={s.track}>
              <View style={[s.fill, { width: busy.fraction == null ? '35%' : `${Math.max(3, busy.fraction * 100)}%` }]} />
            </View>
            <Text onPress={() => (signal.current.cancelled = true)} style={s.cancel}>
              Cancelar
            </Text>
          </View>
        ) : (
          <View style={{ gap: space[1] }}>
            <Button tone={dubbed ? 'neutral' : 'accent'} size="md" icon="mic" label={dubbed ? 'Dublar de novo' : `Dublar ${clock(length)}`} onPress={run} />
            <Text style={s.hint}>Gasta uns {estimateCredits(length)} créditos da sua conta.</Text>
          </View>
        )}
      </View>
    </Reveal>
  );
}

/** Toca a dublagem (prévia) a partir do começo do trecho. */
export function useDubPreview(dubbed: DubResult | null) {
  const player = useAudioPlayer(null);
  useEffect(() => {
    if (dubbed) player.replace({ uri: toUri(dubbed.path) });
  }, [dubbed, player]);
  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {
        // já liberado
      }
    },
    [player],
  );
  return player;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: c.sunken },
    title: { ...text.bodyBold, color: c.ink },
    body: { ...text.caption, color: c.muted },
    input: { ...text.body, minHeight: control.md, paddingHorizontal: space[4], borderRadius: radius.lg, backgroundColor: c.surface, color: c.ink },
    link: { ...text.captionBold, color: c.accentInk, textAlign: 'center', paddingVertical: space[2] },
    label: { ...text.overline, color: c.muted },
    voices: { flexDirection: 'row', gap: space[2] },
    voice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.lg, borderWidth: 2, borderColor: 'transparent', backgroundColor: c.surface },
    voiceOn: { borderColor: c.accentLine, backgroundColor: c.accentSoft },
    voiceName: { ...text.bodyBold, color: c.ink },
    voiceDetail: { ...text.caption, color: c.muted },
    play: { width: control.sm, height: control.sm, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken },
    hint: { ...text.caption, color: c.muted },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: control.md },
    switchLabel: { ...text.body, flex: 1, color: c.ink },
    done: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: c.successSoft },
    doneText: { ...text.captionBold, flex: 1, color: c.ink },
    action: { ...text.captionBold, color: c.accentInk, paddingVertical: space[2], paddingHorizontal: space[1] },
    busy: { gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: c.surface },
    busyText: { ...text.caption, color: c.ink },
    track: { height: 8, borderRadius: radius.full, backgroundColor: c.sunken, overflow: 'hidden' },
    fill: { height: 8, borderRadius: radius.full, backgroundColor: c.accent },
    cancel: { ...text.captionBold, color: c.danger, textAlign: 'center' },
  });
