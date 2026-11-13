import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { COLOR_IDS, COLORS, nextColor, SUGGESTIONS, type ListColor } from '../../playlist/colors';
import { colorOfImage, dropCover, pickCover } from '../../playlist/covers';
import { getLists } from '../../playlist/lists';
import { control, gutter, radius, space, text, usePalette } from '../../theme';
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
          <PlaylistCover name={shown} color={color} size={112} radius={radius.xl} image={cover} />
          <View style={[s.camBadge, { backgroundColor: c.dark ? c.raised : c.surface, boxShadow: c.shadow2 }]}>
            {picking ? <ActivityIndicator size="small" color={c.ink} /> : <Feather name="image" size={16} color={c.ink} />}
          </View>
        </Pressable>
        <View style={s.headText}>
          <Text style={[s.title, { color: c.ink }]} accessibilityRole="header">
            {initial ? 'Editar playlist' : 'Nova playlist'}
          </Text>
          <View style={s.headButtons}>
            <Button tone="neutral" size="sm" icon="image" label={cover ? 'Trocar imagem' : 'Usar imagem'} disabled={picking} onPress={choose} />
            {cover ? (
              <Button
                tone="neutral"
                size="sm"
                icon="x"
                label="Tirar"
                accessibilityLabel="Voltar para a capa de cor"
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCover(null);
                }}
              />
            ) : null}
          </View>
          <Text style={[s.sub, { color: c.muted }]}>{cover ? 'A cor abaixo pinta o topo e o player.' : 'Sem imagem, a capa sai do nome e da cor.'}</Text>
        </View>
      </View>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nome da playlist"
        placeholderTextColor={c.muted}
        style={[s.input, { color: c.ink, backgroundColor: c.sunken }]}
        autoFocus={!initial}
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={save}
        selectionColor={COLORS[color].bg}
        accessibilityLabel="Nome da playlist"
      />

      {!initial ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={s.chipsRail} keyboardShouldPersistTaps="handled">
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
                style={({ pressed }) => [s.chip, { backgroundColor: on ? COLORS[x.color].bg : c.sunken }, pressed && { opacity: 0.72 }]}
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
              {/* Cor que quase some no fundo (o grafite no escuro) ganha um fio em volta */}
              <View style={[s.swatchFill, { backgroundColor: COLORS[id].bg }, c.dark && id === 'grafite' && { borderWidth: 1, borderColor: c.lineStrong }]}>
                {on ? <Feather name="check" size={16} color={COLORS[id].ink} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={s.foot}>
        <Button tone="neutral" label="Cancelar" onPress={onClose} style={s.cancel} />
        <Button tone="accent" icon={initial ? 'check' : 'plus'} label={initial ? 'Salvar' : 'Criar playlist'} disabled={!ok} onPress={save} style={s.confirm} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingBottom: space[2], gap: space[4] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  headText: { flex: 1, minWidth: 0, gap: space[2] },
  headButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  title: { ...text.title },
  sub: { ...text.caption },
  camBadge: { position: 'absolute', right: -space[2], bottom: -space[2], width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  input: { ...text.bodyBold, height: control.lg, borderRadius: radius.full, paddingHorizontal: space[4] },
  chipsRail: { marginHorizontal: -gutter },
  chips: { gap: space[2], paddingHorizontal: gutter },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  chipText: { ...text.captionBold },
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { width: 40, height: 40, borderRadius: radius.full, borderWidth: 2, padding: space[1] },
  swatchFill: { flex: 1, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', gap: space[2], paddingTop: space[2] },
  cancel: { flex: 1 },
  confirm: { flex: 1.4 },
});
