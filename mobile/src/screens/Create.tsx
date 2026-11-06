import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Press } from '../components/Button';
import { useToast } from '../components/Toasts';
import { ownedMedia } from '../editor/actions';
import { dirs } from '../editor/media';
import { createProject, deleteMedia, deleteProject, listProjects, loadProject, saveProject, type ProjectSummary } from '../editor/store';
import { clock } from '../format';
import { ms } from '../motion';
import { ease, font, Palette, radius, usePalette } from '../theme';

function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

const FEATURES: { icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { icon: 'scissors', label: 'Cortes e transições' },
  { icon: 'message-square', label: 'Legendas em pt-BR' },
  { icon: 'music', label: 'Trilha do YouTube' },
  { icon: 'video', label: 'Narração e facecam' },
];

export function Create({ header }: { header: React.ReactNode }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const appear = useState(() => new Animated.Value(0))[0];

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listProjects()
        .then((list) => {
          if (!alive) return;
          setProjects(list);
          appear.setValue(0);
          Animated.timing(appear, { toValue: 1, duration: ms(320), easing: ease.arrive, useNativeDriver: true }).start();
        })
        .catch(() => alive && setProjects([]));
      return () => {
        alive = false;
      };
    }, [appear]),
  );

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const p = createProject(`Projeto ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`);
    router.push(`/editor/${p.id}`);
  };

  const remove = async (summary: ProjectSummary) => {
    const p = await loadProject(summary.id);
    if (!p) return;
    deleteProject(p.id);
    setProjects((list) => list?.filter((x) => x.id !== p.id) ?? null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // As mídias só são apagadas se a pessoa não desfizer em alguns segundos
    const timer = setTimeout(() => deleteMedia(ownedMedia(p, dirs().media)), 6500);
    toast.show({
      title: 'Projeto apagado',
      body: p.title,
      tone: 'info',
      duration: 6000,
      action: {
        label: 'Desfazer',
        onPress: () => {
          clearTimeout(timer);
          saveProject(p);
          listProjects().then(setProjects);
        },
      },
    });
  };

  return (
    <View>
      {header}
      <Press onPress={start} scaleTo={0.985} accessibilityRole="button" accessibilityLabel="Novo projeto">
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View style={s.heroIcon}>
              <Feather name="plus" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>Novo projeto</Text>
              <Text style={s.heroBody}>Junte vídeos, legende e grave sua voz por cima.</Text>
            </View>
          </View>
          <View style={s.features}>
            {FEATURES.map((f) => (
              <View key={f.label} style={s.feature}>
                <Feather name={f.icon} size={13} color="rgba(255,255,255,0.9)" />
                <Text style={s.featureText}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </Press>

      <Text style={s.label}>Seus projetos</Text>
      {projects && !projects.length ? (
        <View style={s.empty}>
          <Feather name="film" size={22} color={c.muted} />
          <Text style={s.emptyText}>Os projetos ficam guardados aqui, com as mídias, para você continuar depois.</Text>
        </View>
      ) : null}
      <Animated.View style={{ opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }], gap: 10 }}>
        {projects?.map((p) => (
          <Pressable key={p.id} onPress={() => router.push(`/editor/${p.id}`)} onLongPress={() => remove(p)} style={({ pressed }) => [s.item, pressed && { backgroundColor: c.hover }]}>
            <View style={s.cover}>
              {p.cover ? <Image source={{ uri: p.cover }} style={StyleSheet.absoluteFill} /> : <Feather name="film" size={18} color={c.muted} />}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.itemTitle} numberOfLines={1}>
                {p.title}
              </Text>
              <Text style={s.itemMeta}>
                {p.clips ? `${p.clips} ${p.clips === 1 ? 'clipe' : 'clipes'} · ${clock(p.duration)}` : 'Vazio'} · {ago(p.updatedAt)}
              </Text>
            </View>
            <Pressable onPress={() => remove(p)} hitSlop={8} style={s.more} accessibilityLabel={`Apagar ${p.title}`}>
              <Feather name="trash-2" size={17} color={c.muted} />
            </Pressable>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hero: {
      borderRadius: 22,
      padding: 18,
      gap: 16,
      backgroundColor: c.accent,
      overflow: 'hidden',
      shadowColor: c.accent,
      shadowOpacity: c.dark ? 0.35 : 0.3,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    heroTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    heroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    heroTitle: { fontFamily: font.black, fontSize: 22, color: '#fff', letterSpacing: -0.4 },
    heroBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.88)', marginTop: 4 },
    features: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    feature: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
    featureText: { fontFamily: font.medium, fontSize: 12, color: '#fff' },
    label: { fontFamily: font.semibold, fontSize: 14, color: c.muted, marginTop: 26, marginBottom: 10 },
    empty: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: radius.slot, borderWidth: 1, borderColor: c.line, borderStyle: 'dashed' },
    emptyText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: c.muted },
    item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.slot, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
    cover: { width: 54, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: c.sk, alignItems: 'center', justifyContent: 'center' },
    itemTitle: { fontFamily: font.semibold, fontSize: 16, color: c.ink },
    itemMeta: { fontFamily: font.regular, fontSize: 13, color: c.muted, fontVariant: ['tabular-nums'] },
    more: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  });
