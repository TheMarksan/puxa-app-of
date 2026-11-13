import { useIsFocused, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingBar, type BarItem } from '../components/FloatingBar';
import { QuickMenu } from '../components/QuickMenu';
import { Wordmark } from '../components/ui';
import { Home } from '../Home';
import { gutter, type Palette, space, usePalette } from '../theme';

/** Tela inicial: o Baixar. Playlists, Figurinhas e Ajustes ficam na barra flutuante (ou no menu do topo). */
export function HomeScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const [barShown, setBarShown] = useState(true);

  const items: BarItem[] = [
    { key: 'playlist', icon: 'music', label: 'Playlists', onPress: () => router.push('/playlist') },
    { key: 'figurinhas', icon: 'smile', label: 'Figurinhas', onPress: () => router.push('/figurinhas') },
    { key: 'ajustes', icon: 'settings', label: 'Ajustes', onPress: () => router.push('/ajustes') },
  ];

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + space[2] }]}>
        <Wordmark height={24} color={c.ink} />
        <QuickMenu items={items} visible={!barShown} />
      </View>
      <View style={s.body}>
        <Home
          header={null}
          active={focused}
          onSharedLink={() => {
            // Chegou um link pelo Compartilhar com outra tela aberta: volta para o Baixar
            if (router.canDismiss()) router.dismissAll();
          }}
          onBarVisible={setBarShown}
          renderBar={(visible) => <FloatingBar visible={visible} items={items} />}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: gutter, minHeight: 48, paddingBottom: space[2] },
    body: { flex: 1 },
  });
