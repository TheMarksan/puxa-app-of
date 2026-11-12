import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { addLinks } from '../../playlist/downloads';
import { font, usePalette } from '../../theme';
import { useToast } from '../Toasts';

/**
 * Campo de links de uma lista: colar (um ou vários) e cada link vira música. Tudo numa linha:
 * o campo, o colar e o adicionar.
 */
export function AddLinks({ listId, tint, tintInk }: { listId?: string; tint: string; tintInk: string }) {
  const c = usePalette();
  const toast = useToast();
  const [text, setText] = useState('');

  const add = (raw: string) => {
    const r = addLinks(raw, listId);
    if (r.invalid) {
      toast.show({ title: 'Nenhum link aqui', body: 'Cole links do YouTube, do Instagram ou do X.', tone: 'info' });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setText('');
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

  const has = !!text.trim();
  return (
    <View style={[s.bar, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Feather name="link-2" size={18} color={c.muted} style={{ marginLeft: 14 }} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Cole links para virar música"
        placeholderTextColor={c.disabledInk}
        style={[s.input, { color: c.ink }]}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={() => has && add(text)}
        selectionColor={tint}
        accessibilityLabel="Links para virar música"
      />
      <Pressable
        onPress={() => (has ? add(text) : paste())}
        style={({ pressed }) => [s.go, { backgroundColor: tint }, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={has ? 'Adicionar' : 'Colar link'}
      >
        <Feather name={has ? 'plus' : 'clipboard'} size={18} color={tintInk} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, borderRadius: 27, borderWidth: 1, paddingRight: 5 },
  input: { flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 15, paddingVertical: 10 },
  go: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
