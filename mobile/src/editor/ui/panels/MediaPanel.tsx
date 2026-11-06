import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import PuxaEngine, { type VideoInfo } from '../../../../modules/puxa-engine';
import { clock as fmtClock } from '../../../format';
import { addClips } from '../../actions';
import { importPicked, pickVideoOption, youtubeSource } from '../../media';
import type { Project } from '../../types';
import { Chip, PrimaryButton, Progress, Row, Section, ui } from '../kit';
import { E } from '../palette';

/** Adicionar mídia: link do YouTube ou fotos e vídeos da galeria. */
export function MediaPanel({ project, after, onDone, onError }: { project: Project; after?: number; onDone: () => void; onError: (m: string) => void }) {
  const [link, setLink] = useState('');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ label: string; fraction: number | null } | null>(null);

  const lookup = async (text: string) => {
    if (!text.trim()) return;
    setBusy({ label: 'Buscando o vídeo…', fraction: null });
    try {
      const i = await PuxaEngine.getInfo(text.trim());
      setInfo(i);
      setOption(pickVideoOption(i, 720));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    if (!info || !option) return;
    setBusy({ label: 'Baixando para o projeto…', fraction: 0 });
    try {
      const src = await youtubeSource(info, option, (f, stage) =>
        setBusy({ label: stage === 'processing' ? 'Juntando áudio e vídeo…' : 'Baixando para o projeto…', fraction: stage === 'processing' ? null : f }),
      );
      addClips([src], after);
      setInfo(null);
      setLink('');
      onDone();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const gallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos', 'images'], allowsMultipleSelection: true, selectionLimit: 12, quality: 1 });
      if (res.canceled || !res.assets.length) return;
      setBusy({ label: `Preparando ${res.assets.length > 1 ? `${res.assets.length} itens` : 'o item'}…`, fraction: null });
      const sources = await importPicked(res.assets);
      addClips(sources, after);
      onDone();
    } catch (e) {
      onError((e as Error).message || 'Não deu para abrir a galeria.');
    } finally {
      setBusy(null);
    }
  };

  const videoOptions = (info?.options.video ?? []).filter((o) => parseInt(o.label, 10) <= 1080);

  return (
    <>
      <Section label="Da galeria">
        <PrimaryButton label="Escolher vídeos e fotos" icon="image" tone="plain" onPress={gallery} disabled={!!busy} />
      </Section>
      <Section label="Do YouTube">
        <View style={styles.field}>
          <TextInput
            value={link}
            onChangeText={setLink}
            onSubmitEditing={() => lookup(link)}
            placeholder="Cole um link do YouTube"
            placeholderTextColor={E.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="search"
            selectionColor={E.accent}
            style={styles.input}
          />
          <Pressable
            onPress={async () => {
              const t = (await Clipboard.getStringAsync()).trim();
              if (t) {
                setLink(t);
                lookup(t);
              }
            }}
            style={styles.paste}
            accessibilityLabel="Colar"
          >
            <Feather name="clipboard" size={16} color={E.accent} />
            <Text style={styles.pasteText}>Colar</Text>
          </Pressable>
        </View>
        {info ? (
          <View style={styles.card}>
            <Image source={{ uri: info.thumbnail }} style={styles.thumb} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={ui.title} numberOfLines={2}>
                {info.title}
              </Text>
              <Text style={[ui.body, { color: E.muted, fontSize: 13 }]} numberOfLines={1}>
                {info.channel} · {fmtClock(info.duration)}
              </Text>
            </View>
          </View>
        ) : null}
        {info && videoOptions.length ? (
          <Row scroll>
            {videoOptions.map((o) => (
              <Chip key={o.id} label={o.label} detail={o.note} active={option === o.id} onPress={() => setOption(o.id)} />
            ))}
          </Row>
        ) : null}
        {info && !videoOptions.length ? <Text style={[ui.body, { color: E.danger }]}>O YouTube não liberou vídeo deste link.</Text> : null}
        {info ? <PrimaryButton label="Adicionar à linha do tempo" icon="plus" onPress={download} disabled={!option || !!busy} /> : null}
      </Section>
      {busy ? <Progress label={busy.label} fraction={busy.fraction} /> : null}
      {!project.clips.length && !busy ? <Text style={[ui.body, { color: E.faint, fontSize: 12 }]}>Os arquivos ficam guardados no projeto, então dá para continuar a edição depois.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: E.lineStrong, backgroundColor: E.raised, paddingLeft: 14, paddingRight: 4 },
  input: { flex: 1, color: E.ink, fontFamily: 'Archivo_400Regular', fontSize: 15, paddingVertical: 12 },
  paste: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 10 },
  pasteText: { fontFamily: 'Archivo_600SemiBold', fontSize: 14, color: E.accent },
  card: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 12, backgroundColor: E.raised, borderWidth: 1, borderColor: E.line },
  thumb: { width: 104, aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: E.raised2 },
});
