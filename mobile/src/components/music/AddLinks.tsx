import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { addLinks } from '../../playlist/downloads';
import { control, radius, space, text, usePalette } from '../../theme';
import { useToast } from '../Toasts';

/**
 * Campo de links de uma lista: colar (um ou vários) e cada link vira música. Tudo numa linha:
 * o campo, o colar e o adicionar.
 */
export function AddLinks({ listId, tint, tintInk }: { listId?: string; tint: string; tintInk: string }) {
  const c = usePalette();
  const toast = useToast();
  const [value, setValue] = useState('');

  const add = (raw: string) => {
    const r = addLinks(raw, listId);
    if (r.invalid) {
      toast.show({ title: 'Nenhum link aqui', body: 'Cole links do YouTube, do Instagram ou do X.', tone: 'info' });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setValue('');
    const n = r.added + r.reused;
    if (n) {
      toast.show({
        title: r.added ? (r.added === 1 ? 'Virando música…' : `${r.added} links virando música`) : r.reused === 1 ? 'Entrou na playlist' : `${r.reused} músicas entraram`,
        body: r.added && r.reused ? `${r.reused} já estava${r.reused > 1 ? 'm' : ''} no celular e entr${r.reused > 1 ? 'aram' : 'ou'} direto.` : r.duplicates ? `${r.duplicates} já estava${r.duplicates > 1 ? 'm' : ''} aqui.` : undefined,
        tone: 'success',
      });
    } else toast.show({ title: 'Já está aqui', tone: 'info' });
  };

  const paste = async () => {
    const got = (await Clipboard.getStringAsync()).trim();
    if (!got) {
      toast.show({ title: 'Nada copiado', body: 'Copie o link no app da rede e toque em colar de novo.', tone: 'info' });
      return;
    }
    add(got);
  };

  const has = !!value.trim();
  return (
    <View style={[s.bar, { backgroundColor: c.sunken }]}>
      <Feather name="link" size={20} color={c.muted} />
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Cole links para virar música"
        placeholderTextColor={c.muted}
        style={[s.input, { color: c.ink }]}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={() => has && add(value)}
        selectionColor={tint}
        accessibilityLabel="Links para virar música"
      />
      <Pressable
        onPress={() => (has ? add(value) : paste())}
        style={({ pressed }) => [s.go, { backgroundColor: tint }, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={has ? 'Adicionar' : 'Colar link'}
      >
        <Feather name={has ? 'plus' : 'clipboard'} size={20} color={tintInk} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: control.lg, borderRadius: radius.full, paddingLeft: space[4], paddingRight: space[2] },
  input: { ...text.body, flex: 1, minWidth: 0, height: '100%', paddingVertical: 0 },
  go: { width: control.sm, height: control.sm, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
