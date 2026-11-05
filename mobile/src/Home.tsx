import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine, { DoneEvent, Stage, VideoInfo } from '../modules/puxa-engine';
import { Button, Press } from './components/Button';
import { Dock, DockState } from './components/Dock';
import { QualityList } from './components/QualityList';
import { ResultCard, ResultSkeleton } from './components/ResultCard';
import { Segmented } from './components/Segmented';
import { SendSheet } from './components/SendSheet';
import { useToast } from './components/Toasts';
import { bytes, stem } from './format';
import { ms } from './motion';
import { ease, font, Palette, radius, usePalette } from './theme';

const SAMPLE_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const WA_LIMIT = 16 * 1024 * 1024;

type Format = 'audio' | 'video';

type Job =
  | { status: 'preparing'; id: string; key: string; video: boolean; stage: Stage; downloaded: number; total: number; speed: number; eta: number | null }
  | { status: 'error'; id: string; key: string; message: string };

type ShareTarget = { path: string; filename: string; mime: string; size: number };

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const fileKey = (videoId: string, optionId: string) => `${videoId}|${optionId}`;

export function Home() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const toast = useToast();

  // Link recebido pelo menu Compartilhar quando o app abriu por ele
  const [shared] = useState(() => PuxaEngine.takeSharedText());
  const [link, setLink] = useState(shared ?? '');
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<'empty' | 'loading' | 'result'>('empty');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('audio');
  const [choice, setChoice] = useState<Record<Format, string | null>>({ audio: null, video: null });
  const [job, setJob] = useState<Job | null>(null);
  const [files, setFiles] = useState<Record<string, DoneEvent>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [dockH, setDockH] = useState(0);

  const lookupSeq = useRef(0);
  const jobRef = useRef<Job | null>(null);
  useEffect(() => {
    jobRef.current = job;
  }, [job]);
  const pendingShare = useRef<{ whatsapp: boolean; big: boolean; left: boolean } | null>(null);

  // ---------- Busca ----------

  const arrive = useState(() => [0, 1, 2].map(() => new Animated.Value(1)))[0];
  const dockIn = useState(() => new Animated.Value(0))[0];

  const lookup = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value) {
        setFieldError('Cole um link do YouTube para começar.');
        return;
      }
      const seq = ++lookupSeq.current;
      Keyboard.dismiss();
      setFieldError(null);
      setSheetOpen(false);
      setPhase('loading');
      try {
        const result = await PuxaEngine.getInfo(value);
        if (seq !== lookupSeq.current) return;
        const video = result.options.video;
        setInfo(result);
        setChoice({
          audio: result.options.audio[0]?.id ?? null,
          // 720p é o equilíbrio entre nitidez e caber no WhatsApp
          video: (video.find((o) => o.label.startsWith('720')) ?? video[0])?.id ?? null,
        });
        setFormat(result.options.audio.length ? 'audio' : 'video');
        // A chegada do resultado é o único momento orquestrado: capa, formato e qualidade em sequência
        arrive.forEach((v) => v.setValue(0));
        setPhase('result');
        Animated.stagger(
          ms(70),
          arrive.map((v) => Animated.timing(v, { toValue: 1, duration: ms(340), easing: ease.arrive, useNativeDriver: true })),
        ).start();
        Animated.timing(dockIn, { toValue: 1, duration: ms(380), delay: ms(160), easing: ease.ios, useNativeDriver: true }).start();
      } catch (e) {
        if (seq !== lookupSeq.current) return;
        setPhase(info ? 'result' : 'empty');
        setFieldError((e as Error).message || 'Não deu para ler esse link. Confira e tente de novo.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    },
    [arrive, dockIn, info],
  );

  const lookupRef = useRef(lookup);
  useEffect(() => {
    lookupRef.current = lookup;
  }, [lookup]);

  // Link recebido pelo menu Compartilhar do YouTube (ao abrir o app ou com ele aberto)
  useEffect(() => {
    if (shared) lookupRef.current(shared);
    const sub = PuxaEngine.addListener('onSharedText', ({ text }) => {
      setLink(text);
      lookupRef.current(text);
    });
    return () => sub.remove();
  }, [shared]);

  const paste = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text) {
        toast.show({ title: 'Nada copiado ainda', body: 'Copie o link no YouTube e toque em Colar.', tone: 'info' });
        return;
      }
      setLink(text);
      lookup(text);
    } catch {
      toast.show({ title: 'Não deu para ler o que foi copiado', tone: 'error' });
    }
  };

  // ---------- Preparo ----------

  const optionId = choice[format];
  const options = info ? info.options[format] : [];
  const option = options.find((o) => o.id === optionId) ?? null;
  const key = info && optionId ? fileKey(info.id, optionId) : null;

  const start = useCallback(() => {
    if (!info || !optionId) return;
    const current = jobRef.current;
    if (current?.status === 'preparing') PuxaEngine.cancel(current.id);
    const id = newId();
    const video = optionId.startsWith('v:');
    setJob({ status: 'preparing', id, key: fileKey(info.id, optionId), video, stage: 'downloading', downloaded: 0, total: option?.size ?? 0, speed: 0, eta: null });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    PuxaEngine.startDownload(id, info.id, optionId).catch((e: Error) => {
      setJob({ status: 'error', id, key: fileKey(info.id, optionId), message: e.message });
    });
  }, [info, option?.size, optionId]);

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    const progress = PuxaEngine.addListener('onProgress', (e) => {
      setJob((j) =>
        j && j.status === 'preparing' && j.id === e.jobId
          ? { ...j, stage: e.stage, downloaded: e.downloaded, total: e.total || j.total, speed: e.speed, eta: e.eta }
          : j,
      );
    });
    const done = PuxaEngine.addListener('onDone', (e) => {
      const j = jobRef.current;
      if (!j || j.id !== e.jobId) return;
      setFiles((f) => ({ ...f, [j.key]: e }));
      setJob(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
    const failed = PuxaEngine.addListener('onError', (e) => {
      const j = jobRef.current;
      if (!j || j.id !== e.jobId) return;
      setJob({ status: 'error', id: j.id, key: j.key, message: e.message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    });
    return () => {
      progress.remove();
      done.remove();
      failed.remove();
    };
  }, []);

  const cancel = () => {
    const j = jobRef.current;
    if (!j || j.status !== 'preparing') return;
    PuxaEngine.cancel(j.id);
    setJob(null);
    toast.show({ title: 'Preparo cancelado', tone: 'info', action: { label: 'Recomeçar', onPress: () => startRef.current() } });
  };

  // ---------- Pronto: salvar e enviar ----------

  const file = key ? files[key] : undefined;

  const share = useCallback(
    async (target: ShareTarget, whatsapp: boolean) => {
      const direct = await PuxaEngine.share(target.path, target.mime, whatsapp, target.filename);
      pendingShare.current = { whatsapp: whatsapp && direct, big: target.size > WA_LIMIT, left: false };
      if (whatsapp && !direct) {
        toast.show({ title: 'WhatsApp não encontrado', body: 'Abri o menu de compartilhar para você escolher outro app.', tone: 'info' });
      }
    },
    [toast],
  );

  // Ao voltar do WhatsApp, confirma a entrega e fecha o painel de envio
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const p = pendingShare.current;
      if (!p) return;
      if (state === 'background') p.left = true;
      if (state === 'active' && p.left) {
        pendingShare.current = null;
        setSheetOpen(false);
        if (p.whatsapp) {
          toast.show({
            title: 'Entregue ao WhatsApp',
            body: p.big ? 'Com mais de 16 MB ele pode chegar como documento.' : undefined,
            tone: 'success',
          });
        }
      }
    });
    return () => sub.remove();
  }, [toast]);

  const sendFromDock = async () => {
    if (!file) return;
    if (file.mime.startsWith('audio')) {
      setSheetOpen(true);
      return;
    }
    setSending(true);
    try {
      await share({ path: file.path, filename: file.filename, mime: file.mime, size: file.size }, true);
    } catch (e) {
      toast.show({ title: 'Não deu para enviar', body: (e as Error).message, tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const shareOther = async () => {
    if (!file) return;
    try {
      await share({ path: file.path, filename: file.filename, mime: file.mime, size: file.size }, false);
    } catch (e) {
      toast.show({ title: 'Não deu para compartilhar', body: (e as Error).message, tone: 'error' });
    }
  };

  const save = async () => {
    if (!file || !key) return;
    setSaving(true);
    try {
      const where = await PuxaEngine.saveToDownloads(file.path, file.filename, file.mime);
      setSaved((m) => ({ ...m, [key]: true }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const inDownloads = where === 'Download/Puxa';
      toast.show({
        title: inDownloads ? 'Salvo em Download/Puxa' : 'Salvo na pasta do app',
        body: inDownloads ? stem(file.filename) : where,
        tone: 'success',
      });
    } catch (e) {
      toast.show({ title: 'Não deu para salvar', body: (e as Error).message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const onSheetError = useCallback((message: string) => toast.show({ title: 'Algo não saiu', body: message, tone: 'error' }), [toast]);

  // ---------- Rodapé ----------

  const dock: DockState = (() => {
    if (job?.status === 'preparing') return { kind: 'preparing', ...job };
    if (file) return { kind: 'done', file, saved: !!(key && saved[key]), saving, sending };
    if (job?.status === 'error' && job.key === key) return { kind: 'error', message: job.message };
    const what = format === 'audio' ? 'Baixar áudio' : `Baixar vídeo ${option?.label ?? ''}`.trim();
    return { kind: 'idle', label: what, detail: bytes(option?.size), disabled: !option };
  })();

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const dockVisible = phase === 'result' && !keyboard;
  useEffect(() => {
    toast.setBottomInset(dockVisible && dockH ? dockH + 8 : insets.bottom + 16);
  }, [dockH, dockVisible, insets.bottom, toast]);

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });

  const hasText = link.trim().length > 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: (dockVisible ? dockH : insets.bottom) + 28 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={s.brandRow}>
          <View style={s.logo}>
            <Feather name="download" size={18} color="#FFFFFF" />
          </View>
          <Text style={s.brand}>puxa</Text>
        </View>
        <Text style={s.tagline}>Baixe do YouTube e mande no WhatsApp.</Text>

        <Text style={s.label} nativeID="link-label">
          Link do vídeo
        </Text>
        <View style={[s.field, focused && s.fieldFocused, fieldError && s.fieldError]}>
          <TextInput
            value={link}
            onChangeText={(t) => {
              setLink(t);
              if (fieldError) setFieldError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => lookup(link)}
            placeholder="youtube.com/watch?v=…"
            placeholderTextColor={c.disabledInk}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="search"
            selectionColor={c.accent}
            style={s.input}
            accessibilityLabelledBy="link-label"
          />
          {hasText ? (
            <>
              <Pressable onPress={() => setLink('')} hitSlop={8} style={s.clear} accessibilityLabel="Limpar o link">
                <Feather name="x-circle" size={18} color={c.disabledInk} />
              </Pressable>
              <Press onPress={() => lookup(link)} style={s.go} accessibilityRole="button" accessibilityLabel="Buscar vídeo" disabled={phase === 'loading'}>
                {(pressed) => (
                  <View style={[s.goInner, { backgroundColor: pressed ? c.accentPressed : c.accent }]}>
                    <Feather name="arrow-right" size={20} color={c.onAccent} />
                  </View>
                )}
              </Press>
            </>
          ) : (
            <Press onPress={paste} style={s.pasteBtn} accessibilityRole="button" accessibilityLabel="Colar o link copiado">
              {(pressed) => (
                <View style={[s.pasteInner, pressed && { backgroundColor: c.accentSoft }]}>
                  <Feather name="clipboard" size={16} color={c.accent} />
                  <Text style={s.pasteText}>Colar</Text>
                </View>
              )}
            </Press>
          )}
        </View>
        {fieldError ? (
          <View style={s.errorRow} accessibilityLiveRegion="assertive">
            <Feather name="alert-circle" size={15} color={c.danger} style={{ marginTop: 2 }} />
            <Text style={s.errorText}>{fieldError}</Text>
          </View>
        ) : (
          <Text style={s.help}>Vale link de vídeo, Shorts ou YouTube Music.</Text>
        )}

        {phase === 'empty' ? (
          <View style={s.empty}>
            <View style={s.tip}>
              <View style={s.tipIcon}>
                <Feather name="share-2" size={18} color={c.accent} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.tipTitle}>Direto do app do YouTube</Text>
                <Text style={s.tipBody}>
                  No vídeo, toque em <Text style={s.strong}>Compartilhar</Text> e escolha <Text style={s.strong}>Puxa</Text>. O link chega aqui e a busca começa
                  sozinha.
                </Text>
              </View>
            </View>
            <Button
              tone="ghost"
              compact
              icon="play-circle"
              label="Testar com um vídeo de exemplo"
              onPress={() => {
                setLink(SAMPLE_URL);
                lookup(SAMPLE_URL);
              }}
            />
          </View>
        ) : null}

        {phase === 'loading' ? (
          <View style={s.section}>
            <ResultSkeleton />
          </View>
        ) : null}

        {phase === 'result' && info ? (
          <>
            <Animated.View style={[s.section, rise(arrive[0])]}>
              <ResultCard info={info} />
            </Animated.View>
            <Animated.View style={[s.section, rise(arrive[1])]}>
              <Text style={s.label}>Formato</Text>
              <Segmented<Format>
                accessibilityLabel="Formato"
                value={format}
                onChange={(f) => {
                  Haptics.selectionAsync().catch(() => {});
                  setFormat(f);
                }}
                options={[
                  { value: 'audio', label: 'Áudio', detail: 'M4A, só o som', disabled: !info.options.audio.length },
                  { value: 'video', label: 'Vídeo', detail: 'MP4 com som', disabled: !info.options.video.length },
                ]}
              />
            </Animated.View>
            <Animated.View style={[s.section, rise(arrive[2])]}>
              <Text style={s.label}>Qualidade</Text>
              {options.length ? (
                <QualityList
                  group={`${info.id}:${format}`}
                  options={options}
                  value={optionId}
                  onChange={(id) => {
                    Haptics.selectionAsync().catch(() => {});
                    setChoice((ch) => ({ ...ch, [format]: id }));
                  }}
                />
              ) : (
                <Text style={s.notice}>O YouTube não liberou nenhuma versão em vídeo deste link. O áudio continua disponível.</Text>
              )}
              <Text style={s.legal}>Baixe só o que você tem direito de usar. Tudo acontece no seu aparelho: o app fala só com o YouTube.</Text>
            </Animated.View>
          </>
        ) : null}
      </ScrollView>

      {dockVisible ? (
        <Animated.View
          onLayout={(e) => setDockH(e.nativeEvent.layout.height)}
          style={[
            s.dock,
            { paddingBottom: insets.bottom + 12 },
            { transform: [{ translateY: dockIn.interpolate({ inputRange: [0, 1], outputRange: [160, 0] }) }] },
          ]}
        >
          <Dock state={dock} onStart={start} onCancel={cancel} onSend={sendFromDock} onSave={save} onShareOther={shareOther} onRetry={start} />
        </Animated.View>
      ) : null}

      {file && file.mime.startsWith('audio') && info ? (
        <SendSheet
          key={file.path}
          file={file}
          title={stem(file.filename)}
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSend={share}
          onError={onSheetError}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { paddingHorizontal: 20, paddingTop: 18 },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: 32, height: 32, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    brand: { fontFamily: font.black, fontSize: 28, color: c.ink, letterSpacing: -1 },
    tagline: { fontFamily: font.regular, fontSize: 16, color: c.muted, marginTop: 8, marginBottom: 22 },
    label: { fontFamily: font.semibold, fontSize: 14, color: c.muted, marginBottom: 8 },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 58,
      borderRadius: radius.slot,
      borderWidth: 1.5,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      paddingLeft: 16,
      paddingRight: 6,
      gap: 6,
    },
    fieldFocused: { borderColor: c.accent },
    fieldError: { borderColor: c.danger },
    input: { flex: 1, fontFamily: font.regular, fontSize: 16, color: c.ink, paddingVertical: 14 },
    clear: { padding: 6 },
    go: {},
    goInner: { width: 46, height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    pasteBtn: {},
    pasteInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 46, borderRadius: 11 },
    pasteText: { fontFamily: font.semibold, fontSize: 15, color: c.accent },
    help: { fontFamily: font.regular, fontSize: 14, color: c.muted, marginTop: 8 },
    errorRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
    errorText: { flex: 1, fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: c.danger },
    empty: { marginTop: 28, gap: 10 },
    tip: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: radius.slot, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
    tipIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    tipTitle: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
    tipBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: c.muted },
    strong: { fontFamily: font.semibold, color: c.ink },
    section: { marginTop: 22 },
    notice: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: c.muted, padding: 14, borderRadius: radius.list, borderWidth: 1, borderColor: c.line },
    legal: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 18 },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 14,
      backgroundColor: c.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
      shadowColor: c.shadow,
      shadowOpacity: c.dark ? 0.4 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
      elevation: 12,
    },
  });
