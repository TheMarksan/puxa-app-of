import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { COLOR_IDS, COLORS, nextColor, SUGGESTIONS, type ListColor } from '../../playlist/colors';
import { colorOfImage, dropCover, pickCover } from '../../playlist/covers';
import { getLists } from '../../playlist/lists';
import { font, usePalette } from '../../theme';
import { Button } from '../Button';
import { PlaylistCover } from './Cover';
import { Sheet } from './Sheet';

type Look = { name: string; color: ListColor; cover?: string | null };

/**
 * Criar (ou editar) uma playlist: a capa aparece grande e muda junto com o nome e a cor. As
 * sugestões (Treino, Estudos...) já vêm com a cor que combina. Dá para usar uma imagem da
 * galeria como capa; a cor continua valendo no topo da playlist e no player (e, se ainda não foi
 * escolhida, passa a ser a que combina com a imagem).
 */
export function ListEditor({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial?: Look;
  onClose: () => void;
  onSave: (name: string, color: ListColor, cover: string | null) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} label={initial ? 'Editar playlist' : 'Nova playlist'}>
      {visible ? <Body initial={initial} onSave={onSave} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Body({ initial, onSave, onClose }: { initial?: Look; onSave: (name: string, color: ListColor, cover: string | null) => void; onClose: () => void }) {
  const c = usePalette();
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<ListColor>(initial?.color ?? nextColor(getLists().map((p) => p.color)));
  const [touchedColor, setTouchedColor] = useState(!!initial);
  const [cover, setCover] = useState<string | null>(initial?.cover ?? null);
  const [picking, setPicking] = useState(false);
  // Imagens escolhidas aqui e não salvas saem do celular quando a folha fecha
  const picked = useRef<string[]>([]);
  const kept = useRef<string | null>(null);
  const first = initial?.cover ?? null;
  useEffect(
    () => () => {
      picked.current.filter((x) => x !== kept.current && x !== first).forEach(dropCover);
    },
    [first],
  );
  const taken = new Set(getLists().map((p) => p.name.trim().toLowerCase()));
  const shown = name.trim() || 'Nova playlist';
  const ok = !!name.trim();
  const save = () => {
    if (!ok) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    kept.current = cover;
    onSave(name.trim(), color, cover);
  };
  const choose = async () => {
    setPicking(true);
    try {
      const path = await pickCover();
      if (!path) return;
      picked.current.push(path);
      setCover(path);
      if (!touchedColor) {
        const match = await colorOfImage(path);
        if (match) setColor(match);
      }
    } catch {
      // Galeria fechada ou imagem que não abriu: fica como estava
    } finally {
      setPicking(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" bounces={false}>
      <View style={s.head}>
        <Pressable onPress={choose} disabled={picking} accessibilityRole="button" accessibilityLabel={cover ? 'Trocar a imagem da capa' : 'Escolher uma imagem para a capa'}>
          <PlaylistCover name={shown} color={color} size={112} radius={20} image={cover} />
          <View style={[s.camBadge, { backgroundColor: c.surface, borderColor: c.line }]}>
            {picking ? <ActivityIndicator size="small" color={c.ink} /> : <Feather name="image" size={16} color={c.ink} />}
          </View>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Text style={[s.title, { color: c.ink }]} accessibilityRole="header">
            {initial ? 'Editar playlist' : 'Nova playlist'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable onPress={choose} disabled={picking} style={({ pressed }) => [s.smallBtn, { borderColor: c.lineStrong }, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={cover ? 'Trocar imagem' : 'Usar uma imagem'}>
              <Feather name="image" size={15} color={c.ink} />
              <Text style={[s.smallText, { color: c.ink }]}>{cover ? 'Trocar imagem' : 'Usar imagem'}</Text>
            </Pressable>
            {cover ? (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCover(null);
                }}
                style={({ pressed }) => [s.smallBtn, { borderColor: c.lineStrong }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel="Voltar para a capa de cor"
              >
                <Feather name="x" size={15} color={c.ink} />
                <Text style={[s.smallText, { color: c.ink }]}>Tirar</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={[s.sub, { color: c.muted }]}>{cover ? 'A cor abaixo pinta o topo e o player.' : 'Sem imagem, a capa sai do nome e da cor.'}</Text>
        </View>
      </View>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nome da playlist"
        placeholderTextColor={c.disabledInk}
        style={[s.input, { color: c.ink, borderColor: c.lineStrong, backgroundColor: c.bg }]}
        autoFocus={!initial}
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={save}
        selectionColor={COLORS[color].bg}
        accessibilityLabel="Nome da playlist"
      />

      {!initial ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {SUGGESTIONS.filter((x) => !taken.has(x.name.toLowerCase())).map((x) => {
            const on = name.trim().toLowerCase() === x.name.toLowerCase();
            return (
              <Pressable
                key={x.name}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setName(x.name);
                  if (!touchedColor) setColor(x.color);
                }}
                style={({ pressed }) => [s.chip, { borderColor: on ? COLORS[x.color].bg : c.line, backgroundColor: on ? COLORS[x.color].bg : 'transparent' }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel={`Usar o nome ${x.name}`}
              >
                <View style={[s.dot, { backgroundColor: on ? COLORS[x.color].ink : COLORS[x.color].bg }]} />
                <Text style={[s.chipText, { color: on ? COLORS[x.color].ink : c.ink }]}>{x.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={s.swatches} accessibilityRole="radiogroup" accessibilityLabel="Cor da capa">
        {COLOR_IDS.map((id) => {
          const on = id === color;
          return (
            <Pressable
              key={id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setColor(id);
                setTouchedColor(true);
              }}
              hitSlop={4}
              style={[s.swatch, { borderColor: on ? c.ink : 'transparent' }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={COLORS[id].label}
            >
              <View style={[s.swatchFill, { backgroundColor: COLORS[id].bg }]}>{on ? <Feather name="check" size={16} color={COLORS[id].ink} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button tone="neutral" label="Cancelar" onPress={onClose} />
        </View>
        <View style={{ flex: 1.4 }}>
          <Button tone="accent" icon={initial ? 'check' : 'plus'} label={initial ? 'Salvar' : 'Criar playlist'} disabled={!ok} onPress={save} />
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { fontFamily: font.bold, fontSize: 21, letterSpacing: -0.3 },
  sub: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  camBadge: { position: 'absolute', right: -6, bottom: -6, width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1 },
  smallText: { fontFamily: font.semibold, fontSize: 13 },
  input: { height: 54, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontFamily: font.semibold, fontSize: 17 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontFamily: font.semibold, fontSize: 14 },
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, padding: 3 },
  swatchFill: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

