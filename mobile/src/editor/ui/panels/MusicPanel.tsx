import Feather from '@expo/vector-icons/Feather';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import PuxaEngine, { type SearchResult } from '../../../../modules/puxa-engine';
import { clock as fmtClock } from '../../../format';
import { addAudio, patchAudio } from '../../actions';
import { bestM4a, toUri, youtubeSource } from '../../media';
import { store } from '../../store';
import { newId, projectLength } from '../../timeline';
import type { AudioTrack, MediaSource, Project } from '../../types';
import { Chip, Progress, Row, Section, Slider, Toggle, ui } from '../kit';
import { E } from '../palette';

const GENRES: { label: string; query: string }[] = [
  { label: 'Lo-fi', query: 'lofi no copyright music' },
  { label: 'Pop', query: 'pop no copyright music' },
  { label: 'Eletrônica', query: 'electronic no copyright music' },
  { label: 'Cinemática', query: 'cinematic no copyright music' },
  { label: 'Acústica', query: 'acoustic guitar no copyright music' },
  { label: 'Hip-hop', query: 'hip hop instrumental no copyright' },
  { label: 'Rock', query: 'rock no copyright music' },
  { label: 'Calma', query: 'ambient relaxing no copyright music' },
  { label: 'Brasileira', query: 'música brasileira sem direitos autorais' },
  { label: 'Vlog', query: 'vlog background music no copyright' },
];

/** Busca por gênero ou palavra; um link do YouTube vira o próprio vídeo. */
async function find(q: string): Promise<SearchResult[]> {
  if (/youtu\.?be/i.test(q)) {
    const info = await PuxaEngine.getInfo(q);
    return [{ id: info.id, title: info.title, channel: info.channel, duration: info.duration, thumbnail: info.thumbnail }];
  }
  return PuxaEngine.search(q);
}

/** Músicas já baixadas nesta sessão (ouvir e depois usar não baixa duas vezes). */
const downloaded = new Map<string, MediaSource>();

export function MusicPanel({ project, time, onDone, onError }: { project: Project; time: number; onDone: () => void; onError: (m: string) => void }) {
  const [genre, setGenre] = useState(GENRES[0].label);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(GENRES[0].query);
  const [found, setFound] = useState<{ q: string; items: SearchResult[] } | null>(null);
  const [busy, setBusy] = useState<{ id: string; label: string; fraction: number | null } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    let alive = true;
    find(searched)
      .then((items) => alive && setFound({ q: searched, items }))
      .catch((e) => {
        if (!alive) return;
        setFound({ q: searched, items: [] });
        onError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [searched, onError]);
  const results = found?.q === searched ? found.items : null;

  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {
        // o player já foi liberado
      }
    },
    [player],
  );

  const fetchSource = async (r: SearchResult): Promise<MediaSource> => {
    const hit = downloaded.get(r.id);
    if (hit) return hit;
    const info = await PuxaEngine.getInfo(r.id);
    const opt = bestM4a(info);
    if (!opt) throw new Error('O YouTube não liberou o áudio desta música.');
    setBusy({ id: r.id, label: 'Baixando a música…', fraction: 0 });
    const src = await youtubeSource(info, opt, (f) => setBusy({ id: r.id, label: 'Baixando a música…', fraction: f }));
    const named = { ...src, title: r.title, thumbnail: r.thumbnail };
    downloaded.set(r.id, named);
    return named;
  };

  const listen = async (r: SearchResult) => {
    if (preview === r.id && status.playing) {
      player.pause();
      return;
    }
    try {
      setBusy({ id: r.id, label: 'Preparando a prévia…', fraction: null });
      const src = await fetchSource(r);
      player.replace({ uri: toUri(src.path) });
      player.seekTo(Math.min(30, src.duration / 3)).catch(() => {});
      player.play();
      setPreview(r.id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const use = async (r: SearchResult) => {
    try {
      const src = await fetchSource(r);
      player.pause();
      const total = projectLength(store.project ?? project);
      const start = Math.min(time, Math.max(0, total - 1));
      const track: AudioTrack = {
        id: newId('a'),
        kind: 'music',
        sourceId: src.id,
        start,
        in: 0,
        out: src.duration,
        volume: 0.45,
        fadeIn: 1,
        fadeOut: 2,
        loop: src.duration < total - start,
        title: r.title,
      };
      addAudio(track, src);
      onDone();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Row scroll>
        {GENRES.map((g) => (
          <Chip
            key={g.label}
            label={g.label}
            active={genre === g.label}
            onPress={() => {
              setGenre(g.label);
              setSearched(g.query);
            }}
          />
        ))}
      </Row>
      <View style={styles.field}>
        <Feather name="search" size={16} color={E.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => {
            setGenre('');
            const q = query.trim();
            if (q) setSearched(/youtu\.?be/i.test(q) ? q : `${q} no copyright music`);
          }}
          placeholder="Buscar música ou colar link"
          placeholderTextColor={E.faint}
          returnKeyType="search"
          selectionColor={E.accent}
          style={styles.input}
        />
      </View>
      <Text style={styles.notice}>Músicas “sem direitos autorais” no YouTube costumam pedir crédito ao autor. Confira a descrição antes de publicar.</Text>
      {busy && busy.fraction != null ? <Progress label={busy.label} fraction={busy.fraction} /> : null}
      {results == null ? <ActivityIndicator color={E.accent} style={{ marginVertical: 24 }} /> : null}
      {results?.length === 0 ? <Text style={[ui.body, { color: E.muted, marginVertical: 16 }]}>Nada encontrado. Tente outro gênero ou palavra.</Text> : null}
      {results?.map((r) => {
        const loading = busy?.id === r.id;
        const playing = preview === r.id && status.playing;
        return (
          <View key={r.id} style={styles.result}>
            <Image source={{ uri: r.thumbnail }} style={styles.thumb} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={2} style={styles.title}>
                {r.title}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {r.channel} · {fmtClock(r.duration)}
              </Text>
            </View>
            <Pressable onPress={() => listen(r)} disabled={!!busy} style={styles.round} accessibilityLabel={playing ? 'Pausar prévia' : 'Ouvir'}>
              {loading && busy?.fraction == null ? <ActivityIndicator size="small" color={E.ink} /> : <Feather name={playing ? 'pause' : 'play'} size={16} color={E.ink} />}
            </Pressable>
            <Pressable onPress={() => use(r)} disabled={!!busy} style={[styles.round, styles.use]} accessibilityLabel="Usar no vídeo">
              <Feather name="plus" size={18} color="#fff" />
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

export function AudioTrackPanel({ track, project }: { track: AudioTrack; project: Project }) {
  const src = project.sources[track.sourceId];
  const live = (patch: Partial<AudioTrack>) => patchAudio(track.id, patch, true);
  return (
    <>
      <Text style={[ui.body, { color: E.muted, marginBottom: 12 }]} numberOfLines={2}>
        {track.title}
        {src ? ` · ${fmtClock(src.duration)}` : ''}
      </Text>
      <Section label="Volume">
        <Slider value={track.volume} min={0} max={1.5} step={0.01} marks={[1]} format={(v) => `${Math.round(v * 100)}%`} onStart={() => store.checkpoint()} onChange={(volume) => live({ volume })} onEnd={() => store.settle()} />
      </Section>
      <Section label="Entrada suave">
        <Slider value={track.fadeIn} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1).replace('.', ',')} s`} onStart={() => store.checkpoint()} onChange={(fadeIn) => live({ fadeIn })} onEnd={() => store.settle()} />
      </Section>
      <Section label="Saída suave">
        <Slider value={track.fadeOut} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1).replace('.', ',')} s`} onStart={() => store.checkpoint()} onChange={(fadeOut) => live({ fadeOut })} onEnd={() => store.settle()} />
      </Section>
      {track.kind === 'music' ? <Toggle label="Repetir até o fim do vídeo" value={track.loop} onChange={(loop) => patchAudio(track.id, { loop })} /> : null}
      <Text style={[ui.body, { color: E.faint, fontSize: 12, marginTop: 6 }]}>Na linha do tempo, arraste a faixa para mudar onde entra e use as alças para cortar o começo e o fim.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: E.lineStrong, backgroundColor: E.raised, paddingHorizontal: 12 },
  input: { flex: 1, color: E.ink, fontFamily: 'Archivo_400Regular', fontSize: 15, paddingVertical: 11 },
  notice: { fontFamily: 'Archivo_400Regular', fontSize: 12, lineHeight: 17, color: E.faint, marginVertical: 10 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: E.line },
  thumb: { width: 64, height: 36, borderRadius: 6, backgroundColor: E.raised2 },
  title: { fontFamily: 'Archivo_600SemiBold', fontSize: 13, color: E.ink, lineHeight: 17 },
  meta: { fontFamily: 'Archivo_400Regular', fontSize: 12, color: E.muted },
  round: { width: 38, height: 38, borderRadius: 19, backgroundColor: E.raised2, alignItems: 'center', justifyContent: 'center' },
  use: { backgroundColor: E.accent },
});
