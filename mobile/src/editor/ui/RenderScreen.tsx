import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine from '../../../modules/puxa-engine';
import { BackButton } from '../../components/BackButton';
import { useToast } from '../../components/Toasts';
import { bytes, clock as fmtClock } from '../../format';
import { cancelExport, exportProject, RenderError, type ExportResult } from '../exporter';
import { cachedThumb, toUri } from '../media';
import { loadProject, store } from '../store';
import { aspectRatio, newId } from '../timeline';
import type { Project } from '../types';
import { PrimaryButton, videoFill } from './kit';
import { E } from './palette';

const WA_LIMIT = 16 * 1024 * 1024;

export function RenderScreen({ id }: { id: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [project, setProject] = useState<Project | null>(store.project?.id === id ? store.project : null);
  const [stage, setStage] = useState<'preparing' | 'rendering' | 'done' | 'error'>('preparing');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [failure, setFailure] = useState<{ message: string; details: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const job = useRef(newId('r'));
  const renderStart = useRef(0);
  const [eta, setEta] = useState<number | null>(null);
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
  });
  const pendingShare = useRef(false);

  useEffect(() => {
    if (!project) loadProject(id).then(setProject);
  }, [id, project]);

  /** Monta o vídeo. O estado inicial já é "preparando"; quem refaz zera a tela antes (retry). */
  const render = async (p: Project) => {
    job.current = newId('r');
    renderStart.current = 0;
    try {
      const r = await exportProject(
        p,
        (s, f) => {
          setStage(s);
          setProgress(f);
          // Estimativa a partir do ritmo da montagem (a preparação não entra na conta)
          const now = Date.now();
          if (s === 'preparing') {
            renderStart.current = f >= 1 ? now : 0;
            setEta(null);
          } else if (f <= 0 || !renderStart.current) {
            // Começo da montagem, ou recomeço com o codificador por software
            renderStart.current = now;
            setEta(null);
          } else if (f > 0.04) {
            setEta((((now - renderStart.current) / 1000) / f) * (1 - f));
          }
        },
        job.current,
      );
      setResult(r);
      setStage('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      player.replaceAsync({ uri: toUri(r.path) }).then(() => player.play()).catch(() => {});
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'cancelled') return;
      setFailure({ message: err.message, details: e instanceof RenderError ? e.details : '' });
      setStage('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const retry = () => {
    if (!project) return;
    setStage('preparing');
    setProgress(0);
    setEta(null);
    setFailure(null);
    render(project);
  };

  useEffect(() => {
    if (project) render(project);
    return () => cancelExport(job.current);
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && pendingShare.current) {
        pendingShare.current = false;
        toast.show({ title: 'Entregue ao WhatsApp', tone: 'success' });
      }
    });
    return () => sub.remove();
  }, [toast]);

  const share = async (whatsapp: boolean) => {
    if (!result) return;
    try {
      const direct = await PuxaEngine.share(result.path, 'video/mp4', whatsapp, result.filename);
      pendingShare.current = whatsapp && direct;
      if (whatsapp && !direct) toast.show({ title: 'WhatsApp não encontrado', body: 'Abri o menu de compartilhar.', tone: 'info' });
    } catch (e) {
      toast.show({ title: 'Não deu para enviar', body: (e as Error).message, tone: 'error' });
    }
  };

  const save = async () => {
    if (!result) return;
    try {
      const where = await PuxaEngine.saveToDownloads(result.path, result.filename, 'video/mp4');
      setSaved(true);
      toast.show({ title: where === 'Download/Puxa' ? 'Salvo em Download/Puxa' : 'Salvo na pasta do app', body: result.filename, tone: 'success' });
    } catch (e) {
      toast.show({ title: 'Não deu para salvar', body: (e as Error).message, tone: 'error' });
    }
  };

  const ratio = project ? aspectRatio(project) : 9 / 16;
  const posterW = Math.min(width * 0.62, 300 * Math.max(ratio, 0.56));
  const posterH = posterW / ratio;
  const first = project?.clips[0] ? project.sources[project.clips[0].sourceId] : undefined;
  const cover = first ? (first.kind === 'image' ? toUri(first.path) : (cachedThumb(first.path, project!.clips[0].in) ?? first.thumbnail)) : undefined;
  const pct = stage === 'preparing' ? 0 : progress;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar style="light" />
      {cover ? <Image source={{ uri: cover }} blurRadius={40} style={[StyleSheet.absoluteFill, { opacity: 0.32 }]} /> : null}
      <View style={styles.head}>
        <BackButton
          dark
          label="Voltar ao editor"
          onPress={() => {
            cancelExport(job.current);
            router.back();
          }}
        />
        <Text style={styles.headTitle} numberOfLines={1}>
          {project?.title ?? ''}
        </Text>
      </View>

      <View style={styles.center}>
        {stage === 'done' && result ? (
          <View style={[styles.poster, { width: posterW, height: posterH }]}>
            <VideoView player={player} style={videoFill} contentFit="cover" nativeControls surfaceType="textureView" />
          </View>
        ) : (
          <View style={[styles.poster, { width: posterW, height: posterH }]}>
            {cover ? <Image source={{ uri: cover }} blurRadius={18} style={StyleSheet.absoluteFill} /> : null}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
            {/* A parte já montada fica nítida: a capa "se revela" conforme o vídeo é gerado */}
            {cover ? (
              <View style={[styles.reveal, { width: posterW * pct }]}>
                <Image source={{ uri: cover }} style={{ width: posterW, height: posterH }} />
              </View>
            ) : null}
            <View style={[styles.edge, { left: posterW * pct - 1 }]} />
          </View>
        )}

        {stage === 'preparing' || stage === 'rendering' ? (
          <View style={styles.status}>
            <Text style={styles.pct}>{stage === 'preparing' ? '…' : `${Math.round(pct * 100)}%`}</Text>
            <Text style={styles.label}>{stage === 'preparing' ? 'Preparando textos, legendas e figurinhas' : `Montando o vídeo${eta ? ` · faltam ${eta < 60 ? `${Math.max(1, Math.round(eta))} s` : `${Math.round(eta / 60)} min`}` : ''}`}</Text>
          </View>
        ) : null}

        {stage === 'done' && result ? (
          <View style={styles.status}>
            <Text style={styles.doneTitle}>Pronto</Text>
            <Text style={styles.label}>
              {fmtClock(result.duration)} · {bytes(result.size)}
            </Text>
            {result.size > WA_LIMIT ? <Text style={styles.warn}>Acima de 16 MB o WhatsApp pode mandar como documento. Em 720p ou com um trecho menor ele vai como vídeo.</Text> : null}
          </View>
        ) : null}

        {stage === 'error' && failure ? (
          <View style={styles.status}>
            <Feather name="alert-circle" size={28} color={E.danger} />
            <Text style={styles.doneTitle}>Não deu para montar</Text>
            <Text style={styles.label}>{failure.message}</Text>
            {failure.details ? (
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(failure.details);
                  toast.show({ title: 'Detalhes copiados', tone: 'info' });
                }}
              >
                <Text style={styles.link}>Copiar detalhes técnicos</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {stage === 'done' ? (
          <>
            <PrimaryButton label="Enviar no WhatsApp" icon="send" tone="wa" onPress={() => share(true)} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label={saved ? 'Salvo' : 'Salvar'} icon={saved ? 'check' : 'download'} tone="plain" onPress={save} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Outros apps" icon="share-2" tone="plain" onPress={() => share(false)} />
              </View>
            </View>
          </>
        ) : stage === 'error' ? (
          <PrimaryButton label="Tentar de novo" icon="rotate-cw" onPress={retry} />
        ) : (
          <PrimaryButton
            label="Cancelar"
            tone="plain"
            onPress={() => {
              cancelExport(job.current);
              router.back();
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: E.bg, paddingHorizontal: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontFamily: 'Archivo_700Bold', fontSize: 16, color: E.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  poster: { borderRadius: 16, overflow: 'hidden', backgroundColor: E.raised, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, elevation: 16 },
  reveal: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  edge: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff', shadowColor: E.accent, shadowOpacity: 1, shadowRadius: 8 },
  status: { alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  pct: { fontFamily: 'Archivo_800ExtraBold', fontSize: 44, color: E.ink, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  doneTitle: { fontFamily: 'Archivo_800ExtraBold', fontSize: 28, color: E.ink },
  label: { fontFamily: 'Archivo_500Medium', fontSize: 14, color: E.muted, textAlign: 'center' },
  warn: { fontFamily: 'Archivo_400Regular', fontSize: 13, color: E.sticker, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  link: { fontFamily: 'Archivo_600SemiBold', fontSize: 14, color: E.accent, marginTop: 8 },
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
});
