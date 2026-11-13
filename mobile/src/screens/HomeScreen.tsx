import { useIsFocused, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../community/store';
import { Avatar } from '../community/ui';
import { Press } from '../components/Button';
import { FloatingBar, type BarItem } from '../components/FloatingBar';
import { QuickMenu } from '../components/QuickMenu';
import { IconButton, Wordmark } from '../components/ui';
import { Home } from '../Home';
import { control, gutter, hit, type Palette, space, usePalette } from '../theme';

/**
 * Tela inicial: o acervo de figurinhas e o campo que busca ou abre um link. Playlists, Figurinhas e
 * Ajustes ficam na barra flutuante (ou no menu do topo); a conta, na foto do canto.
 */
export function HomeScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const [barShown, setBarShown] = useState(true);
  const user = useMe();

  const items: BarItem[] = [
    { key: 'playlist', icon: 'music', label: 'Playlists', onPress: () => router.push('/playlist') },
    { key: 'figurinhas', icon: 'smile', label: 'Figurinhas', onPress: () => router.push('/figurinhas') },
    { key: 'ajustes', icon: 'settings', label: 'Ajustes', onPress: () => router.push('/ajustes') },
  ];

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + space[2] }]}>
        <Wordmark height={24} color={c.ink} />
        <View style={s.actions}>
          <QuickMenu items={items} visible={!barShown} />
          {user ? (
            <Press onPress={() => router.push('/perfil/eu')} scaleTo={0.92} hitSlop={hit(control.sm)} accessibilityRole="button" accessibilityLabel={`Seu perfil, ${user.name}`}>
              {() => <Avatar user={user} size={40} />}
            </Press>
          ) : (
            <IconButton icon="user" label="Entrar ou criar conta" onPress={() => router.push('/entrar')} />
          )}
        </View>
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
    actions: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    body: { flex: 1 },
  });
