import Feather from '@expo/vector-icons/Feather';
import { useIsFocused, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '../components/Aurora';
import { FloatingBar, type BarItem } from '../components/FloatingBar';
import { QuickMenu } from '../components/QuickMenu';
import { Home } from '../Home';
import { font, type Palette, usePalette } from '../theme';

/** Tela inicial: o Baixar. Criar, Figurinhas e Ajustes ficam na barra flutuante (ou no menu do topo). */
export function HomeScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const [barShown, setBarShown] = useState(true);

  const items: BarItem[] = [
    { key: 'criar', icon: 'plus-square', label: 'Criar', onPress: () => router.push('/criar') },
    { key: 'figurinhas', icon: 'smile', label: 'Figurinhas', onPress: () => router.push('/figurinhas') },
    { key: 'ajustes', icon: 'settings', label: 'Ajustes', onPress: () => router.push('/ajustes') },
  ];

  return (
    <View style={s.root}>
      <Aurora />
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <View style={s.brandRow}>
          <View style={s.logo}>
            <Feather name="download" size={18} color="#FFFFFF" />
          </View>
          <Text style={s.brand}>puxa</Text>
          <View style={{ flex: 1 }} />
          <QuickMenu items={items} visible={!barShown} />
        </View>
        <Text style={s.tagline}>Do YouTube, Instagram e X para o WhatsApp.</Text>
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
    header: { paddingHorizontal: 20, paddingBottom: 4 },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42 },
    logo: {
      width: 32,
      height: 32,
      borderRadius: 9,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.accent,
      shadowOpacity: 0.45,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    brand: { fontFamily: font.black, fontSize: 28, color: c.ink, letterSpacing: -1 },
    tagline: { fontFamily: font.regular, fontSize: 16, color: c.muted, marginTop: 6, marginBottom: 10 },
    body: { flex: 1 },
  });
