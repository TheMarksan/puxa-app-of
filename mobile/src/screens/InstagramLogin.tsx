import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine from '../../modules/puxa-engine';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { useToast } from '../components/Toasts';
import { EmptyState } from '../components/ui';
import { accountChanged } from '../events';
import { instagramLoggedIn } from '../sources';
import { gutter, type Palette, space, text, usePalette } from '../theme';
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const done = useRef(false);

  // O login terminou quando o Instagram grava o cookie da sessão
  const check = useCallback(() => {
    if (done.current || !instagramLoggedIn()) return;
    done.current = true;
    PuxaEngine.flushWebCookies();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.show({ title: 'Instagram conectado', tone: 'success' });
    accountChanged('instagram', true);
    router.back();
  }, [router, toast]);

  useEffect(() => {
    const t = setInterval(check, 700);
    return () => clearInterval(t);
  }, [check]);

  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + space[2] }]}>
        <BackButton icon="close" />
        <View style={s.topText}>
          <Text style={s.title} numberOfLines={1}>
            Entrar no Instagram
          </Text>
          <View style={s.safe}>
            <Feather name="lock" size={12} color={c.muted} />
            <Text style={s.safeText} numberOfLines={1}>
              Site do Instagram. A senha não passa pelo Puxa.
            </Text>
          </View>
        </View>
      </View>
      <View style={s.web}>
        {failed ? (
          <View style={s.failed}>
            <EmptyState icon="wifi-off" title="O Instagram não abriu" body="Confira a internet e tente de novo.">
              <Button
                icon="refresh-cw"
                label="Tentar de novo"
                onPress={() => {
                  setFailed(false);
                  setLoading(true);
                  setAttempt((n) => n + 1);
                }}
              />
            </EmptyState>
          </View>
        ) : (
          <LoginWebView
            key={attempt}
            uri={LOGIN}
            background={c.bg}
            onLoadEnd={() => {
              setLoading(false);
              check();
            }}
            onNavigate={check}
            onFail={() => {
              setLoading(false);
              setFailed(true);
            }}
          />
        )}
        {loading && !failed ? (
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
    top: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: gutter, paddingBottom: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.lineStrong },
    topText: { flex: 1, minWidth: 0 },
    title: { ...text.title, color: c.ink },
    safe: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    safeText: { ...text.caption, flex: 1, color: c.muted },
    web: { flex: 1 },
    loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    failed: { flex: 1, justifyContent: 'center' },
  });
