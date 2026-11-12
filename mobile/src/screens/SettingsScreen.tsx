import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine, { type StorageKind, type StorageUsage } from '../../modules/puxa-engine';
import { account } from '../ai/elevenlabs';
import { setElevenKey, useElevenKey } from '../ai/key';
import { Press } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal } from '../components/SheetParts';
import { useToast } from '../components/Toasts';
import { forgetThumbs } from '../editor/media';
import { accountChanged, onAccountChanged, storageCleared } from '../events';
import { bytes } from '../format';
import { setSettings, useSettings, type ThemePref } from '../settings';
import { instagramLoggedIn } from '../sources';
import { dark as darkPalette, font, light as lightPalette, type Palette, radius, usePalette } from '../theme';

type Row = { kind: StorageKind; icon: keyof typeof Feather.glyphMap; title: string; action: string; confirm?: boolean; color: string };

const ROWS: Row[] = [
  { kind: 'downloads', icon: 'download', title: 'Baixados', action: 'Apagar', color: '#2547D0' },
  { kind: 'temp', icon: 'clock', title: 'Temporários', action: 'Limpar', color: '#0E9F6E' },
  { kind: 'playlist', icon: 'music', title: 'Playlist', action: 'Apagar', confirm: true, color: '#C2410C' },
  { kind: 'stickers', icon: 'smile', title: 'Figurinhas', action: 'Apagar', confirm: true, color: '#DB2777' },
  { kind: 'models', icon: 'mic', title: 'Transcrição', action: 'Apagar', color: '#7C3AED' },
];

/** Termos de uso: curtos, em linguagem do dia a dia. */
const TERMS: { title: string; body: string }[] = [
  { title: 'O que é o Puxa', body: 'Um app independente, sem ligação com YouTube, Instagram, X, WhatsApp ou ElevenLabs. Os nomes dessas marcas aparecem só para dizer de onde vem cada link.' },
  { title: 'Como funciona', body: 'O app fala direto com o site do link, do seu celular. Não existe servidor do Puxa no meio: nada do que você baixa passa por nós.' },
  { title: 'Seus dados', body: 'Downloads, figurinhas e a playlist ficam só no aparelho. O login do Instagram é o mesmo de um navegador e sai quando você toca em Sair. A chave da ElevenLabs fica guardada no aparelho e só vai para a ElevenLabs.' },
  { title: 'Uso', body: 'Você é responsável pelo que baixa, guarda e compartilha, seguindo as regras de cada rede e a lei do seu país.' },
  { title: 'Sem garantia', body: 'O Puxa é oferecido como está. As redes mudam sem aviso e algum link pode parar de funcionar até a próxima versão.' },
  { title: 'Software livre', body: 'O Puxa usa NewPipe Extractor (GPLv3), FFmpeg (GPL), whisper.cpp (MIT), Expo e React Native (MIT), entre outros, cada um sob a própria licença.' },
];

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

/** Ajustes: aparência, contas (Instagram e ElevenLabs), espaço ocupado com a limpeza, e sobre o app. */
export function SettingsScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { theme } = useSettings();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [working, setWorking] = useState<StorageKind | null>(null);
  const [confirming, setConfirming] = useState<StorageKind | null>(null);
  const [terms, setTerms] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const [instagram, setInstagram] = useState(() => instagramLoggedIn());
  const key = useElevenKey();
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [credits, setCredits] = useState<{ used: number; limit: number } | null>(null);

  const refresh = useCallback(() => {
    PuxaEngine.storageUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
    setInstagram(instagramLoggedIn());
  }, []);
  useEffect(() => onAccountChanged((a) => a === 'instagram' && setInstagram(instagramLoggedIn())), []);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    account(key)
      .then((r) => alive && setCredits({ used: r.used, limit: r.limit }))
      .catch(() => alive && setCredits(null));
    return () => {
      alive = false;
    };
  }, [key]);

  const saveKey = async () => {
    const k = draft.trim();
    if (!k) return;
    setChecking(true);
    try {
      await account(k);
      await setElevenKey(k);
      setDraft('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show({ title: 'ElevenLabs conectada', tone: 'success' });
    } catch (e) {
      toast.show({ title: 'Chave recusada', body: (e as Error).message, tone: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const leaveInstagram = async () => {
    await PuxaEngine.clearWebCookies().catch(() => {});
    setInstagram(false);
    accountChanged('instagram', false);
    toast.show({ title: 'Saiu do Instagram', tone: 'info' });
  };
  useFocusEffect(refresh);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const clear = async (row: Row) => {
    if (row.confirm && confirming !== row.kind) {
      // Playlist e figurinhas pedem um segundo toque
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setConfirming(row.kind);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirming(null), 4000);
      return;
    }
    setConfirming(null);
    setWorking(row.kind);
    try {
      const freed = await PuxaEngine.clearStorage(row.kind);
      if (row.kind === 'temp') forgetThumbs();
      storageCleared(row.kind);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show({ title: freed > 0 ? `${bytes(freed)} liberados` : 'Já estava vazio', tone: 'success' });
    } catch (e) {
      toast.show({ title: 'Não deu para apagar', body: (e as Error).message, tone: 'error' });
    } finally {
      setWorking(null);
      refresh();
    }
  };

  const total = usage ? Object.values(usage).reduce((a, b) => a + b, 0) : 0;
  const version = Constants.expoConfig?.version ?? '';
  const build = Constants.expoConfig?.android?.versionCode;

  return (
    <View style={s.root}>
      <ScreenHeader title="Ajustes" />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={s.section}>Aparência</Text>
        <View style={s.themes} accessibilityRole="radiogroup" accessibilityLabel="Aparência">
          {THEMES.map((t) => {
            const on = theme === t.value;
            return (
              <Press
                key={t.value}
                onPress={() => {
                  if (on) return;
                  Haptics.selectionAsync().catch(() => {});
                  setSettings({ theme: t.value });
                }}
                containerStyle={{ flex: 1 }}
                scaleTo={0.96}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t.label}
                style={[s.theme, on && s.themeOn]}
              >
                <PhoneArt kind={t.value} frame={c.dark ? '#5A616B' : '#16191D'} />
                <Text style={[s.themeLabel, on && { color: c.accentInk }]}>{t.label}</Text>
              </Press>
            );
          })}
        </View>

        <Text style={s.section}>Contas</Text>
        <View style={s.list}>
          <View style={s.account}>
            <View style={[s.tile, { backgroundColor: c.dark ? '#3A1F2E' : '#FCE7F3' }]}>
              <Feather name="instagram" size={20} color={c.dark ? '#F9A8D4' : '#BE185D'} />
            </View>
            <View style={s.accountText}>
              <Text style={s.rowTitle} numberOfLines={1}>
                Instagram
              </Text>
              <View style={s.status}>
                {instagram ? <View style={[s.statusDot, { backgroundColor: c.waInk }]} /> : null}
                <Text style={s.rowSub} numberOfLines={1}>
                  {instagram ? 'Conectado' : 'Para stories e destaques'}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => (instagram ? leaveInstagram() : router.push('/instagram'))}
              hitSlop={6}
              style={({ pressed }) => [s.btn, !instagram && s.btnAccent, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
              accessibilityLabel={instagram ? 'Sair do Instagram' : 'Entrar no Instagram'}
            >
              <Text style={[s.btnText, !instagram && { color: c.onAccent }]}>{instagram ? 'Sair' : 'Entrar'}</Text>
            </Pressable>
          </View>
          <View style={s.divider} />
          <View style={s.account}>
            <View style={[s.tile, { backgroundColor: c.dark ? '#2A2430' : '#F1EEF6' }]}>
              <Feather name="zap" size={20} color={c.dark ? '#C4B5FD' : '#6D28D9'} />
            </View>
            <View style={s.accountText}>
              <Text style={s.rowTitle} numberOfLines={1}>
                ElevenLabs
              </Text>
              <View style={s.status}>
                {key ? <View style={[s.statusDot, { backgroundColor: c.waInk }]} /> : null}
                <Text style={s.rowSub} numberOfLines={1}>
                  {key
                    ? credits && credits.limit > 0
                      ? `${Math.max(0, credits.limit - credits.used).toLocaleString('pt-BR')} créditos sobrando`
                      : `Chave •••• ${key.slice(-4)}`
                    : 'Transcrição precisa e dublagem'}
                </Text>
              </View>
            </View>
            {key ? (
              <Pressable
                onPress={() => {
                  setElevenKey(null).catch(() => {});
                  setCredits(null);
                }}
                hitSlop={6}
                style={({ pressed }) => [s.btn, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel="Remover a chave da ElevenLabs"
              >
                <Text style={s.btnText}>Remover</Text>
              </Pressable>
            ) : null}
          </View>
          {key === '' ? (
            <View style={s.keyBox}>
              <View style={s.keyRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Cole a chave da API"
                  placeholderTextColor={c.disabledInk}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={s.keyInput}
                  selectionColor={c.accent}
                  accessibilityLabel="Chave da API da ElevenLabs"
                />
                <Pressable
                  onPress={saveKey}
                  disabled={!draft.trim() || checking}
                  style={({ pressed }) => [s.btn, s.btnAccent, (!draft.trim() || checking) && { opacity: 0.45 }, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Salvar a chave"
                >
                  {checking ? <ActivityIndicator size="small" color={c.onAccent} /> : <Text style={[s.btnText, { color: c.onAccent }]}>Salvar</Text>}
                </Pressable>
              </View>
              <Text style={s.link} onPress={() => Linking.openURL('https://elevenlabs.io/app/settings/api-keys').catch(() => {})} accessibilityRole="link">
                Onde pego a chave?
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={s.section}>Armazenamento</Text>
        <View style={s.card}>
          <Text style={s.total}>
            {usage ? bytes(total) || '0 KB' : '…'} <Text style={s.totalLabel}>em uso</Text>
          </Text>
          <View style={s.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {usage && total > 0 ? ROWS.filter((r) => usage[r.kind] > 0).map((r) => <View key={r.kind} style={{ flex: usage[r.kind] / total, backgroundColor: r.color, minWidth: 3 }} />) : null}
          </View>
          {ROWS.map((r, i) => {
            const size = usage?.[r.kind] ?? 0;
            const empty = !usage || size <= 0;
            const confirm = confirming === r.kind;
            return (
              <View key={r.kind} style={[s.row, i > 0 && s.rowLine]}>
                <View style={[s.dot, { backgroundColor: r.color }]} />
                <Feather name={r.icon} size={18} color={c.muted} />
                <Text style={s.rowTitle} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={s.rowSize}>{usage ? bytes(size) || 'vazio' : ''}</Text>
                {working === r.kind ? (
                  <ActivityIndicator color={c.accent} style={{ width: 84 }} />
                ) : (
                  <Pressable
                    onPress={() => clear(r)}
                    disabled={empty || !!working}
                    hitSlop={6}
                    style={({ pressed }) => [s.btn, confirm && s.btnDanger, pressed && { opacity: 0.75 }, empty && { opacity: 0.38 }]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: empty }}
                    accessibilityLabel={`${confirm ? 'Confirmar' : r.action}: ${r.title}`}
                  >
                    <Text style={[s.btnText, confirm && { color: '#fff' }]}>{confirm ? 'Confirmar' : r.action}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <Text style={s.section}>Sobre</Text>
        <View style={s.card}>
          <View style={s.about}>
            <View style={s.logo}>
              <Feather name="download" size={20} color="#FFFFFF" />
            </View>
            <Text style={s.appName}>Puxa</Text>
            <Text style={s.version}>
              {version}
              {build ? ` (${build})` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => setTerms((v) => !v)}
            style={({ pressed }) => [s.row, s.rowLine, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: terms }}
          >
            <Feather name="file-text" size={18} color={c.muted} />
            <Text style={s.rowTitle}>Termos de uso</Text>
            <Feather name={terms ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} />
          </Pressable>
          {terms ? (
            <Reveal>
              <View style={s.terms}>
                {TERMS.map((t) => (
                  <View key={t.title} style={{ gap: 3 }}>
                    <Text style={s.termTitle}>{t.title}</Text>
                    <Text style={s.termBody}>{t.body}</Text>
                  </View>
                ))}
              </View>
            </Reveal>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** Miniatura de um celular no tema: claro, escuro ou meio a meio (automático). */
function PhoneArt({ kind, frame }: { kind: ThemePref; frame: string }) {
  const half = kind === 'system';
  const screen = (p: Palette) => (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: 7, paddingHorizontal: 5, gap: 4 }}>
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: p.accent }} />
      <View style={{ height: 12, borderRadius: 3, backgroundColor: p.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: p.line }} />
      <View style={{ height: 3, borderRadius: 2, backgroundColor: p.line, width: '80%' }} />
      <View style={{ height: 3, borderRadius: 2, backgroundColor: p.line, width: '60%' }} />
      <View style={{ marginTop: 'auto', marginBottom: 5, height: 6, borderRadius: 3, backgroundColor: p.accent, marginHorizontal: 4 }} />
    </View>
  );
  return (
    <View style={[phone.frame, { borderColor: frame }]}>
      {half ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <View style={{ width: 44, flex: 1 }}>{screen(lightPalette)}</View>
          </View>
          <View style={{ flex: 1, overflow: 'hidden', alignItems: 'flex-end' }}>
            <View style={{ width: 44, flex: 1 }}>{screen(darkPalette)}</View>
          </View>
        </View>
      ) : (
        screen(kind === 'dark' ? darkPalette : lightPalette)
      )}
    </View>
  );
}

const phone = StyleSheet.create({
  frame: { width: 46, height: 78, borderRadius: 10, borderWidth: 2, borderColor: '#16191D', overflow: 'hidden', marginBottom: 10 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { paddingHorizontal: 20, paddingTop: 4 },
    section: { fontFamily: font.semibold, fontSize: 14, color: c.muted, marginTop: 20, marginBottom: 10 },
    themes: { flexDirection: 'row', gap: 10 },
    theme: { alignItems: 'center', paddingTop: 14, paddingBottom: 12, borderRadius: 16, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface },
    themeOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    themeLabel: { fontFamily: font.semibold, fontSize: 14, color: c.ink },
    card: { borderRadius: radius.list + 4, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 14 },
    total: { fontFamily: font.black, fontSize: 28, color: c.ink, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
    totalLabel: { fontFamily: font.regular, fontSize: 15, color: c.muted, letterSpacing: 0 },
    bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.sk, marginTop: 12, marginBottom: 4, gap: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
    rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    dot: { width: 8, height: 8, borderRadius: 4 },
    rowTitle: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: c.ink },
    rowSub: { flexShrink: 1, fontFamily: font.regular, fontSize: 13, color: c.muted },
    btnAccent: { backgroundColor: c.accent, borderColor: c.accent },
    keyBox: { gap: 6, marginLeft: 52, paddingBottom: 14 },
    keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    keyInput: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.bg, fontFamily: font.medium, fontSize: 15, color: c.ink },
    link: { alignSelf: 'flex-start', fontFamily: font.semibold, fontSize: 13, color: c.accentInk, paddingVertical: 6 },
    rowSize: { fontFamily: font.regular, fontSize: 14, color: c.muted, fontVariant: ['tabular-nums'] },
    btn: { minWidth: 84, height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' },
    btnDanger: { backgroundColor: c.danger, borderColor: c.danger },
    btnText: { fontFamily: font.semibold, fontSize: 14, color: c.ink },
    about: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
    logo: { width: 40, height: 40, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    appName: { flex: 1, fontFamily: font.black, fontSize: 19, color: c.ink, letterSpacing: -0.4 },
    version: { fontFamily: font.medium, fontSize: 14, color: c.muted, fontVariant: ['tabular-nums'] },
    terms: { gap: 14, paddingTop: 4, paddingBottom: 12 },
    termTitle: { fontFamily: font.semibold, fontSize: 15, color: c.ink },
    termBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: c.muted },
    list: { borderRadius: radius.list + 4, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14 },
    account: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 68 },
    tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    accountText: { flex: 1, minWidth: 0, gap: 2 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: 52 },
  });
