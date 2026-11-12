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
import { font, type Palette, usePalette } from '../theme';
import { Button } from './Button';
import { Pill } from './Pill';
import { Reveal } from './SheetParts';

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
          <Button tone="accent" compact icon="key" label="Salvar chave" busy={checking} disabled={!draft.trim()} onPress={saveKey} />
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
                    <Feather name={playingVoice === v.id ? 'pause' : 'play'} size={16} color={c.ink} style={playingVoice === v.id ? null : { marginLeft: 2 }} />
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
            thumbColor="#FFFFFF"
            accessibilityLabel="Som original baixinho ao fundo"
          />
        </View>

        {dubbed && !busy ? (
          <View style={s.done}>
            <Feather name="check-circle" size={18} color={c.waInk} />
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
          <View style={{ gap: 4 }}>
            <Button tone={dubbed ? 'neutral' : 'accent'} compact icon="mic" label={dubbed ? 'Dublar de novo' : `Dublar ${clock(length)}`} onPress={run} />
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
    card: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: c.bg },
    title: { fontFamily: font.bold, fontSize: 16, color: c.ink },
    body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: c.muted },
    input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, fontFamily: font.medium, fontSize: 16, color: c.ink },
    link: { fontFamily: font.semibold, fontSize: 14, color: c.accentInk, textAlign: 'center', paddingVertical: 6 },
    label: { fontFamily: font.semibold, fontSize: 14, color: c.ink, marginTop: 2 },
    voices: { flexDirection: 'row', gap: 8 },
    voice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface },
    voiceOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    voiceName: { fontFamily: font.bold, fontSize: 15, color: c.ink },
    voiceDetail: { fontFamily: font.regular, fontSize: 12, color: c.muted, marginTop: 1 },
    play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.hover },
    hint: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: c.muted },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
    switchLabel: { flex: 1, fontFamily: font.medium, fontSize: 15, color: c.ink },
    done: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.waSoft },
    doneText: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: c.ink },
    action: { fontFamily: font.semibold, fontSize: 14, color: c.accentInk, paddingVertical: 6, paddingHorizontal: 4 },
    busy: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
    busyText: { fontFamily: font.medium, fontSize: 14, color: c.ink },
    track: { height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
    fill: { height: 4, borderRadius: 2, backgroundColor: c.accent },
    cancel: { fontFamily: font.semibold, fontSize: 14, color: c.danger, textAlign: 'center' },
  });
