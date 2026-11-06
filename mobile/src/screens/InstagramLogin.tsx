import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine from '../../modules/puxa-engine';
import { BackButton } from '../components/BackButton';
import { useToast } from '../components/Toasts';
import { accountChanged } from '../events';
import { instagramLoggedIn } from '../sources';
import { font, type Palette, usePalette } from '../theme';
import { LoginWebView } from './LoginWebView';

const LOGIN = 'https://www.instagram.com/accounts/login/';

/**
 * Login no próprio site do Instagram, dentro do app. A senha fica entre a pessoa e o Instagram;
 * o Puxa só usa o acesso que fica salvo (o mesmo que um navegador guarda) para ver o que a conta
 * já vê: stories, destaques e posts.
 */
export function InstagramLogin() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const done = useRef(false);

  // O login terminou quando o Instagram grava o cookie da sessão
  useEffect(() => {
    const t = setInterval(() => {
      if (done.current || !instagramLoggedIn()) return;
      done.current = true;
      PuxaEngine.flushWebCookies();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show({ title: 'Instagram conectado', tone: 'success' });
      accountChanged('instagram', true);
      router.back();
    }, 800);
    return () => clearInterval(t);
  }, [router, toast]);

  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + 10 }]}>
        <BackButton icon="close" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>Entrar no Instagram</Text>
          <View style={s.safe}>
            <Feather name="lock" size={12} color={c.muted} />
            <Text style={s.safeText} numberOfLines={1}>
              Site do Instagram. A senha não passa pelo Puxa.
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <LoginWebView uri={LOGIN} background={c.bg} onLoadEnd={() => setLoading(false)} />
        {loading ? (
          <View style={s.loading} pointerEvents="none">
            <ActivityIndicator color={c.accent} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
    title: { fontFamily: font.bold, fontSize: 19, color: c.ink },
    safe: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    safeText: { flex: 1, fontFamily: font.regular, fontSize: 13, color: c.muted },
    loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  });
