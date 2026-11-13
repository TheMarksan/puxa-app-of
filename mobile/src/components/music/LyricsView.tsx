import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';

import { clock } from '../../format';
import { ms } from '../../motion';
import { activeLine, type LrclibRecord, type Lyrics } from '../../playlist/lyrics';
import { chooseLyrics, queryFor, searchLyrics, type LyricsState } from '../../playlist/lyricsFetch';
import { seek } from '../../playlist/player';
import type { Track } from '../../playlist/store';
import { alpha, control, ease, radius, space, text } from '../../theme';

type Look = { bg: string; ink: string };

/** A letra da cor em vários tons: a linha que toca a 100%, as outras mais apagadas. */
const dim = (ink: string, a: number) => alpha(ink, a);

/**
 * Prévia da letra no player (como no Spotify): um cartão com a cor da playlist e as linhas em
 * volta da que está tocando. Tocar abre a letra inteira.
 */
export function LyricsCard({ state, time, look, onOpen, onSearch, onRetry }: { state: LyricsState; time: number; look: Look; onOpen: () => void; onSearch: () => void; onRetry: () => void }) {
  const lines = state.status === 'ready' ? state.lyrics.synced : null;
  const i = lines ? activeLine(lines, time) : -1;
  const near = lines ? lines.slice(Math.max(0, i - 1), Math.max(0, i - 1) + 4) : null;
  return (
    <Pressable
      onPress={state.status === 'ready' ? onOpen : state.status === 'none' ? onSearch : state.status === 'error' ? onRetry : undefined}
      style={({ pressed }) => [card.root, { backgroundColor: look.bg }, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityLabel={state.status === 'ready' ? 'Abrir a letra' : state.status === 'none' ? 'Buscar a letra' : 'Letra'}
    >
      <View style={card.head}>
        <Text style={[card.label, { color: look.ink }]}>Letra</Text>
        {state.status === 'ready' ? <Feather name="maximize-2" size={20} color={look.ink} /> : null}
      </View>
      {state.status === 'loading' ? (
        <View style={{ gap: space[3], paddingVertical: space[1] }}>
          {[0.9, 0.7, 0.8].map((w, k) => (
            <View key={k} style={{ width: `${w * 100}%`, height: 16, borderRadius: radius.full, backgroundColor: dim(look.ink, 0.18) }} />
          ))}
        </View>
      ) : state.status === 'none' ? (
        <View style={{ gap: space[3] }}>
          <Text style={[card.msg, { color: look.ink }]}>Não achamos a letra desta música.</Text>
          <View style={[card.pill, { backgroundColor: dim(look.ink, 0.16) }]}>
            <Feather name="search" size={16} color={look.ink} />
            <Text style={[card.pillText, { color: look.ink }]}>Buscar pelo nome</Text>
          </View>
        </View>
      ) : state.status === 'error' ? (
        <View style={{ gap: space[3] }}>
          <Text style={[card.msg, { color: look.ink }]}>{state.message}</Text>
          <View style={[card.pill, { backgroundColor: dim(look.ink, 0.16) }]}>
            <Feather name="rotate-cw" size={16} color={look.ink} />
            <Text style={[card.pillText, { color: look.ink }]}>Tentar de novo</Text>
          </View>
        </View>
      ) : near ? (
        <View style={{ gap: space[2] }}>
          {near.map((l, k) => {
            const idx = Math.max(0, i - 1) + k;
            return (
              <Text key={idx} style={[card.line, { color: idx === i ? look.ink : dim(look.ink, idx < i ? 0.55 : 0.42) }]} numberOfLines={2}>
                {l.text || '♪'}
              </Text>
            );
          })}
        </View>
      ) : (
        <Text style={[card.line, { color: look.ink }]} numberOfLines={5}>
          {state.lyrics.plain}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A letra inteira: a linha que toca fica acesa e a lista anda sozinha até ela (se a pessoa rolar,
 * para de seguir por alguns segundos). Tocar numa linha leva a música para aquele ponto.
 */
export function LyricsFull({ lyrics, time, look, bottom, onSearch }: { lyrics: Lyrics; time: number; look: Look; /** Espaço livre no fim, para a última linha subir acima dos controles. */ bottom: number; onSearch: () => void }) {
  const lines = lyrics.synced;
  const i = lines ? activeLine(lines, time) : -1;
  const scroll = useRef<ScrollViewInstance>(null);
  const ys = useRef<number[]>([]);
  const [height, setHeight] = useState(0);
  const userAt = useRef(0);
  useEffect(() => {
    if (!lines || i < 0 || !height) return;
    if (Date.now() - userAt.current < 3500) return;
    const y = ys.current[i];
    if (y == null) return;
    scroll.current?.scrollTo({ y: Math.max(0, y - height * 0.32), animated: true });
  }, [i, height, lines]);
  return (
    <ScrollView
      ref={scroll}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      onScrollBeginDrag={() => (userAt.current = Date.now())}
      contentContainerStyle={[full.content, { paddingBottom: bottom }]}
      showsVerticalScrollIndicator={false}
    >
      {lines ? (
        lines.map((l, k) => (
          <Pressable
            key={k}
            onLayout={(e) => (ys.current[k] = e.nativeEvent.layout.y)}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              userAt.current = 0;
              seek(l.t, true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${l.text || 'Pausa'}, em ${clock(l.t)}`}
          >
            <Line text={l.text || '♪'} on={k === i} past={k < i} look={look} />
          </Pressable>
        ))
      ) : (
        <>
          <Text style={[full.note, { color: dim(look.ink, 0.7) }]}>Esta letra não tem o tempo de cada linha.</Text>
          <Text style={[full.plain, { color: look.ink }]}>{lyrics.plain}</Text>
        </>
      )}
      <Pressable onPress={onSearch} style={[full.source, { borderColor: dim(look.ink, 0.3) }]} accessibilityRole="button" accessibilityLabel="Não é esta a letra? Buscar outra">
        <Text style={[full.sourceText, { color: dim(look.ink, 0.8) }]}>
          {lyrics.source === 'youtube' ? 'Legenda do vídeo' : `${lyrics.track ?? ''}${lyrics.artist ? ` · ${lyrics.artist}` : ''} · LRCLIB`}
        </Text>
        <Text style={[full.sourceAction, { color: look.ink }]}>Não é esta? Buscar outra</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Uma linha da letra: a que toca cresce de leve e acende; as outras ficam apagadas. */
function Line({ text, on, past, look }: { text: string; on: boolean; past: boolean; look: Look }) {
  const [v] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.timing(v, { toValue: on ? 1 : 0, duration: ms(on ? 260 : 180), easing: on ? ease.arrive : ease.exit, useNativeDriver: true }).start();
  }, [on, v]);
  return (
    <View style={full.lineWrap}>
      <Animated.Text
        style={[
          full.line,
          { color: on ? look.ink : dim(look.ink, past ? 0.6 : 0.4), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }], transformOrigin: 'left center' },
        ]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

/** Busca da letra pelo nome (quando não achou sozinha, ou achou a errada). */
export function LyricsSearch({ track, look, onChosen, onClose }: { track: Track; look: Look; onChosen: () => void; onClose: () => void }) {
  const [q, setQ] = useState(() => queryFor(track));
  const [state, setState] = useState<{ busy: boolean; list: LrclibRecord[] | null; error: string | null }>({ busy: false, list: null, error: null });
  const run = async () => {
    if (!q.trim()) return;
    setState({ busy: true, list: null, error: null });
    try {
      setState({ busy: false, list: await searchLyrics(q.trim()), error: null });
    } catch (e) {
      setState({ busy: false, list: null, error: (e as Error).message || 'Sem conexão.' });
    }
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={srch.bar}>
        <Pressable onPress={onClose} hitSlop={8} style={srch.back} accessibilityRole="button" accessibilityLabel="Voltar">
          <Feather name="arrow-left" size={20} color={look.ink} />
        </Pressable>
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder="Artista e música"
          placeholderTextColor={dim(look.ink, 0.5)}
          style={[srch.input, { color: look.ink, backgroundColor: dim(look.ink, 0.12) }]}
          returnKeyType="search"
          onSubmitEditing={run}
          selectionColor={look.ink}
          accessibilityLabel="Buscar letra"
        />
        <Pressable onPress={run} hitSlop={8} style={srch.back} accessibilityRole="button" accessibilityLabel="Buscar">
          {state.busy ? <ActivityIndicator color={look.ink} /> : <Feather name="search" size={20} color={look.ink} />}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[12], gap: space[1] }} keyboardShouldPersistTaps="handled">
        {state.error ? <Text style={[srch.msg, { color: look.ink }]}>{state.error}</Text> : null}
        {state.list && !state.list.length ? <Text style={[srch.msg, { color: look.ink }]}>Nada encontrado. Tente só o nome da música.</Text> : null}
        {!state.list && !state.busy && !state.error ? <Text style={[srch.msg, { color: dim(look.ink, 0.75) }]}>Confira o nome e o artista e toque em buscar.</Text> : null}
        {state.list?.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              chooseLyrics(track, r);
              onChosen();
            }}
            style={({ pressed }) => [srch.row, pressed && { backgroundColor: dim(look.ink, 0.1) }]}
            accessibilityRole="button"
            accessibilityLabel={`${r.trackName}, ${r.artistName}`}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[srch.name, { color: look.ink }]} numberOfLines={1}>
                {r.trackName}
              </Text>
              <Text style={[srch.meta, { color: dim(look.ink, 0.7) }]} numberOfLines={1}>
                {r.artistName} · {clock(r.duration)}
              </Text>
            </View>
            {r.syncedLyrics ? (
              <View style={[srch.badge, { backgroundColor: dim(look.ink, 0.16) }]}>
                <Text style={[srch.badgeText, { color: look.ink }]}>Com tempo</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const card = StyleSheet.create({
  root: { borderRadius: radius.xl, padding: space[4], gap: space[3], minHeight: 152 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...text.bodyBold },
  line: { ...text.title },
  msg: { ...text.bodyBold },
  pill: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: space[2], height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full },
  pillText: { ...text.captionBold },
});

const full = StyleSheet.create({
  content: { paddingHorizontal: space[6], paddingTop: space[6] },
  lineWrap: { paddingVertical: space[2] },
  line: { ...text.display },
  note: { ...text.caption, marginBottom: space[3] },
  plain: { ...text.title },
  source: { marginTop: space[8], paddingTop: space[4], borderTopWidth: 1, gap: space[1] },
  sourceText: { ...text.caption },
  sourceAction: { ...text.bodyBold },
});

const srch = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[3] },
  back: { width: control.md, height: control.md, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  input: { ...text.bodyBold, flex: 1, height: control.md, borderRadius: radius.full, paddingHorizontal: space[4] },
  msg: { ...text.body, paddingVertical: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], paddingHorizontal: space[2], borderRadius: radius.lg },
  name: { ...text.bodyBold },
  meta: { ...text.caption },
  badge: { paddingHorizontal: space[3], height: 24, borderRadius: radius.full, justifyContent: 'center' },
  badgeText: { ...text.captionBold },
});
