import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Animated, AppState, BackHandler, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine, { DoneEvent, QualityOption, Stage, VideoInfo } from '../modules/puxa-engine';
import { Button, Press } from './components/Button';
import { Dock, type DockState, type Intent } from './components/Dock';
import { QualityList } from './components/QualityList';
import { ResultCard, ResultSkeleton } from './components/ResultCard';
import { Segmented } from './components/Segmented';
import { SendSheet } from './components/SendSheet';
import { MediaStrip, ProfileHeader } from './components/Social';
import { VideoSendSheet, type SendAs } from './components/VideoSendSheet';
import { useToast } from './components/Toasts';
import { forgetThumbs, importFile } from './editor/media';
import { createProject, saveProject } from './editor/store';
import { defaultClip } from './editor/timeline';
import { onAccountChanged, onStorageCleared } from './events';
import { bytes, stem } from './format';
import { ms } from './motion';
import { itemInfo, loadHighlight, openPost, resolveLink, type Highlight, type SocialPost, type SocialProfile } from './sources';
import { ease, font, Palette, radius, usePalette } from './theme';

const SAMPLE_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const WA_LIMIT = 16 * 1024 * 1024;

type Format = 'audio' | 'video' | 'image';

type Job =
  | { status: 'preparing'; id: string; key: string; optionId: string; intent: Intent | null; video: boolean; stage: Stage; downloaded: number; total: number; speed: number; eta: number | null }
  | { status: 'error'; id: string; key: string; optionId: string; intent: Intent | null; message: string; code?: string };

type ShareTarget = { path: string; filename: string; mime: string; size: number };
type FieldError = { message: string; login?: boolean } | null;
/** Folha de envio aberta: o arquivo e as informações do item no momento em que abriu. */
type Sheet = { file: DoneEvent; info: VideoInfo; as: SendAs };

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const fileKey = (videoId: string, optionId: string) => `${videoId}|${optionId}`;

/** Stories de um perfil como uma lista de itens. */
const storiesPost = (p: SocialProfile): SocialPost => ({
  source: 'instagram',
  kind: 'story',
  id: p.id,
  link: `https://www.instagram.com/stories/${p.username}/`,
  title: `Story de @${p.username}`,
  author: p.username,
  authorName: p.fullName,
  avatar: p.avatar,
  items: p.stories ?? [],
  initial: 0,
  headers: p.headers,
});

const allOptions = (info: VideoInfo): QualityOption[] => [...info.options.audio, ...info.options.video, ...(info.options.image ?? [])];

type HomeProps = {
  /** Cabeçalho com a marca e as abas (rola junto com o conteúdo). */
  header: ReactNode;
  /** Esta aba está na tela (o toast só sobe para o rodapé quando ela está). */
  active: boolean;
  /** Chegou um link pelo menu Compartilhar: a tela volta para cá. */
  onSharedLink: () => void;
  /** Barra flutuante (Criar, Figurinhas, Ajustes): aparece só no começo, sem vídeo aberto. */
  renderBar?: (visible: boolean) => ReactNode;
  /** A barra apareceu ou sumiu (o topo mostra o atalho do menu quando ela some). */
  onBarVisible?: (visible: boolean) => void;
};

export function Home({ header, active, onSharedLink, renderBar, onBarVisible }: HomeProps) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const router = useRouter();

  // Link recebido pelo menu Compartilhar quando o app abriu por ele
  const [shared] = useState(() => PuxaEngine.takeSharedText());
  const [link, setLink] = useState(shared ?? '');
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<'empty' | 'loading' | 'result'>('empty');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [post, setPost] = useState<SocialPost | null>(null);
  const [index, setIndex] = useState(0);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [postBusy, setPostBusy] = useState<string | null>(null);
  const [highlightOpen, setHighlightOpen] = useState<string | null>(null);
  const [highlightBusy, setHighlightBusy] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [format, setFormat] = useState<Format>('audio');
  const [choice, setChoice] = useState<Record<Format, string | null>>({ audio: null, video: null, image: null });
  const [job, setJob] = useState<Job | null>(null);
  const [files, setFiles] = useState<Record<string, DoneEvent>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [audioSheet, setAudioSheet] = useState<{ file: DoneEvent } | null>(null);
  const [audioVisible, setAudioVisible] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [dockH, setDockH] = useState(0);
  const [barH, setBarH] = useState(0);

  const lookupSeq = useRef(0);
  const jobRef = useRef<Job | null>(null);
  const infoRef = useRef<VideoInfo | null>(null);
  useEffect(() => {
    jobRef.current = job;
    infoRef.current = info;
  }, [job, info]);
  const pendingShare = useRef<{ whatsapp: boolean; big: boolean; left: boolean } | null>(null);

  // ---------- Busca ----------

  const arrive = useState(() => [0, 1, 2].map(() => new Animated.Value(1)))[0];
  const dockIn = useState(() => new Animated.Value(0))[0];

  /** Opções padrão de um item: 720p no vídeo; formato áudio no YouTube, vídeo no Instagram e no X. */
  const applyDefaults = useCallback((i: VideoInfo) => {
    const video = i.options.video;
    setChoice({
      audio: i.options.audio[0]?.id ?? null,
      // 720p é o equilíbrio entre nitidez e caber no WhatsApp
      video: (video.find((o) => o.label.startsWith('720')) ?? video[0])?.id ?? null,
      image: i.options.image?.[0]?.id ?? null,
    });
    const youtube = !i.source || i.source === 'youtube';
    setFormat(i.image ? 'image' : youtube ? (i.options.audio.length ? 'audio' : 'video') : video.length ? 'video' : 'audio');
  }, []);

  /** Mostra um item; [animate] faz a chegada orquestrada (só quando o link é novo). */
  const present = useCallback(
    (i: VideoInfo | null, animate: boolean) => {
      setInfo(i);
      if (i) applyDefaults(i);
      if (animate) {
        // A chegada do resultado é o único momento orquestrado: capa, formato e qualidade em sequência
        arrive.forEach((v) => v.setValue(0));
        Animated.stagger(
          ms(70),
          arrive.map((v) => Animated.timing(v, { toValue: 1, duration: ms(340), easing: ease.arrive, useNativeDriver: true })),
        ).start();
        dockIn.setValue(0);
        Animated.timing(dockIn, { toValue: 1, duration: ms(380), delay: ms(160), easing: ease.ios, useNativeDriver: true }).start();
      }
      setPhase('result');
    },
    [applyDefaults, arrive, dockIn],
  );

  const lookup = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value) {
        setFieldError({ message: 'Cole um link do YouTube, do Instagram ou do X para começar.' });
        return;
      }
      const seq = ++lookupSeq.current;
      Keyboard.dismiss();
      setFieldError(null);
      setSheetVisible(false);
      setAudioVisible(false);
      setPhase('loading');
      try {
        const r = await resolveLink(value);
        if (seq !== lookupSeq.current) return;
        setHighlightOpen(null);
        if (r.type === 'youtube') {
          setProfile(null);
          setPost(null);
          present(r.info, true);
        } else if (r.type === 'post') {
          setProfile(null);
          setPost(r.post);
          setIndex(r.post.initial);
          present(itemInfo(r.post, r.post.initial), true);
        } else {
          // Perfil: abre a publicação mais recente (ou os stories, se só houver eles)
          setProfile(r.profile);
          const first = r.profile.posts.find((p) => p.items.every((i) => i.kind === 'image' || i.variants.length)) ?? (r.profile.stories?.length ? storiesPost(r.profile) : null);
          setPost(first);
          setIndex(0);
          present(first ? itemInfo(first, 0) : null, true);
        }
      } catch (e) {
        if (seq !== lookupSeq.current) return;
        const err = e as Error & { code?: string };
        setPhase(infoRef.current || profile ? 'result' : 'empty');
        setFieldError({ message: err.message || 'Não deu para ler esse link. Confira e tente de novo.', login: err.code === 'login' || err.code === 'ig_blocked' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    },
    [present, profile],
  );

  const onSharedRef = useRef(onSharedLink);
  useEffect(() => {
    onSharedRef.current = onSharedLink;
  });
  const lookupRef = useRef(lookup);
  const linkRef = useRef(link);
  useEffect(() => {
    lookupRef.current = lookup;
    linkRef.current = link;
  }, [lookup, link]);

  // Link recebido pelo menu Compartilhar (ao abrir o app ou com ele aberto)
  useEffect(() => {
    if (shared) lookupRef.current(shared);
    const sub = PuxaEngine.addListener('onSharedText', ({ text }) => {
      onSharedRef.current();
      setLink(text);
      lookupRef.current(text);
    });
    return () => sub.remove();
  }, [shared]);

  // Entrou (ou saiu) do Instagram: o link que pedia a conta é lido de novo
  useEffect(
    () =>
      onAccountChanged((account) => {
        if (account !== 'instagram' || !linkRef.current.trim()) return;
        lookupRef.current(linkRef.current);
      }),
    [],
  );

  /** Volta ao começo (sem vídeo aberto); um download em andamento continua onde está. */
  const reset = useCallback(() => {
    lookupSeq.current++;
    setPhase('empty');
    setInfo(null);
    setPost(null);
    setProfile(null);
    setHighlightOpen(null);
    setFieldError(null);
    setSheetVisible(false);
    setAudioVisible(false);
    dockIn.setValue(0);
  }, [dockIn]);

  const busyJob = job?.status === 'preparing';
  useEffect(() => {
    if (!active) return;
    // Voltar do Android com um vídeo aberto: fecha o vídeo em vez de sair do app
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'empty' || busyJob || sheetVisible || audioVisible) return false;
      reset();
      setLink('');
      return true;
    });
    return () => sub.remove();
  }, [active, phase, busyJob, sheetVisible, audioVisible, reset]);

  const paste = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text) {
        toast.show({ title: 'Nada copiado ainda', body: 'Copie o link no YouTube, no Instagram ou no X e toque em Colar.', tone: 'info' });
        return;
      }
      setLink(text);
      lookup(text);
    } catch {
      toast.show({ title: 'Não deu para ler o que foi copiado', tone: 'error' });
    }
  };

  // ---------- Itens (carrossel, stories, destaques) ----------

  const pick = (p: SocialPost, i: number) => {
    setPost(p);
    setIndex(i);
    present(itemInfo(p, i), false);
  };

  /** Publicação do perfil: se a lista veio sem o link de algum vídeo, busca o post inteiro antes. */
  const openProfilePost = async (p: SocialPost) => {
    if (postBusy) return;
    setHighlightOpen(null);
    const complete = p.items.every((i) => i.kind === 'image' || i.variants.length);
    if (complete) {
      pick(p, 0);
      return;
    }
    setPostBusy(p.id);
    try {
      const full = await openPost(p);
      const merged = { ...full, id: p.id };
      setProfile((pr) => (pr ? { ...pr, posts: pr.posts.map((x) => (x.id === p.id ? merged : x)) } : pr));
      pick(merged, 0);
    } catch (e) {
      toast.show({ title: 'Não deu para abrir o post', body: (e as Error).message, tone: 'error' });
    } finally {
      setPostBusy(null);
    }
  };

  const openStory = (i: number) => {
    if (!profile) return;
    setHighlightOpen(null);
    pick(post?.kind === 'story' ? post : storiesPost(profile), i);
  };

  const openHighlight = async (h: Highlight) => {
    if (!profile || highlightBusy) return;
    if (highlightOpen === h.id && post) return;
    setHighlightBusy(h.id);
    try {
      const p = await loadHighlight(h, profile.username);
      setHighlightOpen(h.id);
      pick(p, 0);
    } catch (e) {
      toast.show({ title: 'Não deu para abrir o destaque', body: (e as Error).message, tone: 'error' });
    } finally {
      setHighlightBusy(null);
    }
  };

  // ---------- Preparo ----------

  const optionId = info ? choice[format] : null;
  const options = info ? (info.options[format] ?? []) : [];
  const option = options.find((o) => o.id === optionId) ?? null;
  const key = info && optionId ? fileKey(info.id, optionId) : null;

  const start = useCallback(
    (opt: string, intent: Intent | null) => {
      const i = infoRef.current;
      if (!i) return;
      const current = jobRef.current;
      if (current?.status === 'preparing') PuxaEngine.cancel(current.id);
      const id = newId();
      const k = fileKey(i.id, opt);
      const d = i.direct?.[opt];
      const video = d ? d.kind === 'video' : opt.startsWith('v:');
      const size = allOptions(i).find((o) => o.id === opt)?.size ?? 0;
      setJob({ status: 'preparing', id, key: k, optionId: opt, intent, video, stage: 'downloading', downloaded: 0, total: size, speed: 0, eta: null });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const run = d ? PuxaEngine.startUrlDownload(id, d.url, i.headers ?? {}, d.kind, i.title, false) : PuxaEngine.startDownload(id, i.id, opt, false);
      run.catch((e: Error & { code?: string }) => setJob({ status: 'error', id, key: k, optionId: opt, intent, message: e.message, code: e.code }));
    },
    [],
  );

  const cancel = () => {
    const j = jobRef.current;
    if (!j || j.status !== 'preparing') return;
    PuxaEngine.cancel(j.id);
    setJob(null);
    toast.show({ title: 'Cancelado', tone: 'info', action: { label: 'Recomeçar', onPress: () => start(j.optionId, j.intent) } });
  };

  // ---------- Ações: compartilhar, figurinha, baixar, editar ----------

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
        setAudioVisible(false);
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

  const save = useCallback(
    async (f: DoneEvent, k: string) => {
      setSaving(true);
      try {
        const where = await PuxaEngine.saveToDownloads(f.path, f.filename, f.mime);
        setSaved((m) => ({ ...m, [k]: true }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const inDownloads = where === 'Download/Puxa';
        toast.show({
          title: inDownloads ? 'Salvo em Download/Puxa' : 'Salvo na pasta do app',
          body: inDownloads ? stem(f.filename) : where,
          tone: 'success',
        });
      } catch (e) {
        toast.show({ title: 'Não deu para salvar', body: (e as Error).message, tone: 'error' });
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  /** Leva o vídeo para um projeto novo do modo Criar (já em 9:16 com fundo desfocado). */
  const editInCreate = useCallback(
    async (f: DoneEvent, i: VideoInfo) => {
      setEditing(true);
      try {
        const youtube = !i.source || i.source === 'youtube';
        const src = await importFile(`file://${f.path}`, youtube ? 'youtube' : 'gallery', i.title);
        const named = youtube ? { ...src, youtubeId: i.id, thumbnail: i.thumbnail } : { ...src, thumbnail: i.thumbnail };
        const p = createProject(i.title.slice(0, 50));
        const clip = defaultClip(named);
        if (named.width > named.height) clip.fit = 'blur';
        saveProject({ ...p, sources: { [named.id]: named }, clips: [clip] });
        router.push(`/editor/${p.id}`);
      } catch (e) {
        toast.show({ title: 'Não deu para abrir no modo Criar', body: (e as Error).message, tone: 'error' });
      } finally {
        setEditing(false);
      }
    },
    [router, toast],
  );

  /** Faz a ação com o arquivo já no aparelho. */
  const perform = useCallback(
    (intent: Intent, f: DoneEvent, k: string, i: VideoInfo) => {
      if (intent === 'save') {
        save(f, k);
        return;
      }
      if (intent === 'edit') {
        editInCreate(f, i);
        return;
      }
      const image = f.mime.startsWith('image');
      if (intent === 'sticker') {
        setSheet({ file: f, info: i, as: image ? 'still' : 'animated' });
        setSheetVisible(true);
        return;
      }
      if (f.mime.startsWith('audio')) {
        setAudioSheet({ file: f });
        setAudioVisible(true);
        return;
      }
      setSheet({ file: f, info: i, as: image ? 'photo' : 'video' });
      setSheetVisible(true);
    },
    [editInCreate, save],
  );
  const performRef = useRef(perform);
  useEffect(() => {
    performRef.current = perform;
  }, [perform]);

  /** Qual arquivo cada ação usa: a figurinha precisa do vídeo mesmo com o áudio escolhido. */
  const optionFor = (intent: Intent): string | null => {
    if (!info) return null;
    if (info.image) return choice.image;
    if (intent === 'sticker' || intent === 'edit') return format === 'video' ? choice.video : (choice.video ?? info.options.video[0]?.id ?? null);
    return optionId;
  };

  const act = (intent: Intent) => {
    if (!info) return;
    const opt = optionFor(intent);
    if (!opt) {
      if (intent === 'sticker') toast.show({ title: 'Sem vídeo para a figurinha', body: 'Este link não liberou uma versão em vídeo.', tone: 'info' });
      return;
    }
    const k = fileKey(info.id, opt);
    const f = files[k];
    if (f) {
      perform(intent, f, k, info);
      return;
    }
    const cur = jobRef.current;
    // Já está baixando esse arquivo: só troca o que acontece quando ele ficar pronto
    if (cur?.status === 'preparing' && cur.key === k) {
      setJob({ ...cur, intent });
      return;
    }
    start(opt, intent);
  };

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
      // A ação pedida acontece se a pessoa ainda está no mesmo item
      const i = infoRef.current;
      if (j.status === 'preparing' && j.intent && i && j.key.startsWith(`${i.id}|`)) performRef.current(j.intent, e, j.key, i);
    });
    const failed = PuxaEngine.addListener('onError', (e) => {
      const j = jobRef.current;
      if (!j || j.id !== e.jobId) return;
      // Os links de mídia do Instagram e do X vencem com o tempo: "Tentar de novo" lê o link outra vez
      const message = e.code === 'expired' ? 'O link desta mídia venceu. Toque em Tentar de novo para buscar outra vez.' : e.message;
      setJob({ status: 'error', id: j.id, key: j.key, optionId: j.optionId, intent: j.intent, message, code: e.code });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    });
    return () => {
      progress.remove();
      done.remove();
      failed.remove();
    };
  }, []);

  const onSheetError = useCallback((message: string) => toast.show({ title: 'Algo não saiu', body: message, tone: 'error' }), [toast]);
  const onSheetNotice = useCallback((title: string, body?: string) => toast.show({ title, body, tone: 'success', duration: 5000 }), [toast]);

  // Os arquivos baixados foram apagados nos Ajustes: as ações voltam a baixar
  useEffect(
    () =>
      onStorageCleared((kind) => {
        if (kind === 'temp') forgetThumbs();
        if (kind !== 'downloads') return;
        setFiles({});
        setSaved({});
        setSheetVisible(false);
        setAudioVisible(false);
      }),
    [],
  );

  // ---------- Rodapé ----------

  const file = key ? files[key] : undefined;
  const dock: DockState | null = (() => {
    if (!info) return null;
    const mine = !!job && job.key.startsWith(`${info.id}|`);
    if (job?.status === 'preparing' && mine) return { kind: 'preparing', ...job };
    if (job?.status === 'error' && mine) return { kind: 'error', message: job.message };
    const what = format === 'audio' ? 'Áudio' : format === 'image' ? 'Foto' : 'Vídeo';
    return {
      kind: 'actions',
      ready: file ?? null,
      detail: [`${what} ${option?.label ?? ''}`.trim(), bytes(option?.size)].filter(Boolean).join(' · '),
      image: !!info.image,
      canEdit: !info.image && info.options.video.length > 0,
      saved: !!(key && saved[key]),
      saving,
      editing,
      disabled: !option,
    };
  })();

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const dockVisible = phase === 'result' && !!dock && !keyboard;
  // A barra é do começo: com um vídeo aberto, o rodapé das ações é o que importa
  const barVisible = !!renderBar && phase === 'empty' && !keyboard && !sheetVisible && !audioVisible;
  const barSpace = barVisible && barH ? barH + 12 : 0;
  const onBarRef = useRef(onBarVisible);
  useEffect(() => {
    onBarRef.current = onBarVisible;
  });
  useEffect(() => {
    onBarRef.current?.(barVisible);
  }, [barVisible]);
  useEffect(() => {
    // Fora do Baixar (Ajustes, Figurinhas…), o aviso volta para o rodapé da tela
    toast.setBottomInset(active ? (dockVisible && dockH ? dockH + 8 : insets.bottom + 16) + barSpace : insets.bottom + 16);
  }, [active, dockH, dockVisible, insets.bottom, toast, barSpace]);

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });

  const hasText = link.trim().length > 0;
  const showStrip = !!post && post.items.length > 1 && !(profile && post.kind === 'story');
  const stripLabel = !post ? '' : post.kind === 'highlight' ? `Destaque${post.title ? ` · ${post.title}` : ''}` : post.kind === 'story' ? 'Stories' : 'Itens do post';
  const tall = !!post && (post.kind === 'story' || post.kind === 'highlight');
  const youtube = !!info && (!info.source || info.source === 'youtube');

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: (dockVisible ? dockH : insets.bottom) + 28 + barSpace }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {header}

        <Text style={s.label} nativeID="link-label">
          Link
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
            placeholder="YouTube, Instagram ou X"
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
              <Pressable
                onPress={() => {
                  setLink('');
                  if (!busyJob) reset();
                }}
                hitSlop={8}
                style={s.clear}
                accessibilityLabel="Limpar o link"
              >
                <Feather name="x-circle" size={18} color={c.disabledInk} />
              </Pressable>
              <Press onPress={() => lookup(link)} style={s.go} accessibilityRole="button" accessibilityLabel="Buscar" disabled={phase === 'loading'}>
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
                  <Feather name="clipboard" size={16} color={c.accentInk} />
                  <Text style={s.pasteText}>Colar</Text>
                </View>
              )}
            </Press>
          )}
        </View>
        {fieldError ? (
          <View style={{ gap: 10 }}>
            <View style={s.errorRow} accessibilityLiveRegion="assertive">
              <Feather name="alert-circle" size={15} color={c.danger} style={{ marginTop: 2 }} />
              <Text style={s.errorText}>{fieldError.message}</Text>
            </View>
            {fieldError.login ? <Button tone="accent" compact icon="log-in" label="Entrar no Instagram" onPress={() => router.push('/instagram')} /> : null}
          </View>
        ) : (
          <Text style={s.help}>Vídeos, Shorts, Reels, posts e perfis.</Text>
        )}

        {phase === 'empty' ? (
          <View style={s.empty}>
            <View style={s.tip}>
              <View style={s.tipIcon}>
                <Feather name="share-2" size={18} color={c.accentInk} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.tipTitle}>Direto do app</Text>
                <Text style={s.tipBody}>
                  No YouTube, no Instagram ou no X, toque em <Text style={s.strong}>Compartilhar</Text> e escolha <Text style={s.strong}>Puxa</Text>.
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

        {phase === 'result' ? (
          <>
            {profile ? (
              <Animated.View style={[s.section, rise(arrive[0])]}>
                <ProfileHeader
                  profile={profile}
                  selectedPost={post && profile.posts.some((p) => p.id === post.id) ? post.id : null}
                  postBusy={postBusy}
                  onPost={openProfilePost}
                  storyIndex={post?.kind === 'story' ? index : null}
                  onStory={openStory}
                  onHighlight={openHighlight}
                  highlightBusy={highlightBusy}
                  highlightOpen={highlightOpen}
                  onLogin={() => router.push('/instagram')}
                />
              </Animated.View>
            ) : null}
            {showStrip && post ? (
              <Animated.View style={[s.section, rise(arrive[0])]}>
                <MediaStrip items={post.items} index={index} onPick={(i) => pick(post, i)} label={stripLabel} tall={tall} />
              </Animated.View>
            ) : null}
            {info ? (
              <>
                <Animated.View style={[s.section, rise(arrive[0])]}>
                  {/* Brilho "ambiente": a própria capa, bem desfocada, vaza em volta do cartão */}
                  <Image source={{ uri: info.thumbnail }} blurRadius={40} style={s.ambient} accessibilityIgnoresInvertColors />
                  <ResultCard info={info} />
                </Animated.View>
                {!info.image ? (
                  <>
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
                          { value: 'audio', label: 'Áudio', detail: youtube ? 'MP3 ou M4A' : 'MP3', disabled: !info.options.audio.length },
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
                        <Text style={s.notice}>Este link não liberou nenhuma versão em vídeo. O áudio continua disponível.</Text>
                      )}
                    </Animated.View>
                  </>
                ) : null}
              </>
            ) : null}
            <Text style={s.legal}>Baixe só o que você tem direito de usar. O app fala direto com a rede do link, sem servidor no meio.</Text>
          </>
        ) : null}
      </ScrollView>

      {dockVisible && dock ? (
        <Animated.View
          onLayout={(e) => setDockH(e.nativeEvent.layout.height)}
          style={[
            s.dock,
            { paddingBottom: insets.bottom + 12 },
            { transform: [{ translateY: dockIn.interpolate({ inputRange: [0, 1], outputRange: [200, 0] }) }] },
          ]}
        >
          <Dock
            state={dock}
            onAction={act}
            onCancel={cancel}
            onRetry={() => {
              if (job?.status !== 'error') return;
              if (job.code === 'expired') {
                setJob(null);
                lookup(link);
                return;
              }
              start(job.optionId, job.intent);
            }}
          />
        </Animated.View>
      ) : null}

      {renderBar ? (
        <View pointerEvents="box-none" onLayout={(e) => setBarH(e.nativeEvent.layout.height)} style={[s.barWrap, { bottom: insets.bottom + 12 }]}>
          {renderBar(barVisible)}
        </View>
      ) : null}

      {sheet ? (
        <VideoSendSheet
          key={sheet.file.path}
          file={sheet.file}
          info={sheet.info}
          mode={sheet.as}
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          onShare={share}
          onError={onSheetError}
          onNotice={onSheetNotice}
        />
      ) : null}

      {audioSheet ? (
        <SendSheet
          key={audioSheet.file.path}
          file={audioSheet.file}
          title={stem(audioSheet.file.filename)}
          visible={audioVisible}
          onClose={() => setAudioVisible(false)}
          onSend={share}
          onError={onSheetError}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1 },
    ambient: { position: 'absolute', top: -22, left: -14, right: -14, bottom: -26, borderRadius: 32, opacity: c.dark ? 0.6 : 0.45 },
    scroll: { paddingHorizontal: 20, paddingTop: 12 },
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
    pasteText: { fontFamily: font.semibold, fontSize: 15, color: c.accentInk },
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
    barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
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
