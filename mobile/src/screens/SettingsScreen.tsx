import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PuxaEngine, { type StorageKind, type StorageUsage } from '../../modules/puxa-engine';
import { account } from '../ai/elevenlabs';
import { setElevenKey, useElevenKey } from '../ai/key';
import { Button, Press } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal } from '../components/SheetParts';
import { useToast } from '../components/Toasts';
import { AppMark, Group, Hairline, Overline } from '../components/ui';
import { forgetThumbs } from '../editor/media';
import { accountChanged, onAccountChanged, storageCleared } from '../events';
import { bytes } from '../format';
import { COLORS } from '../playlist/colors';
import { logout, resetCommunity, useDB, useMe } from '../community/store';
import { Avatar } from '../community/ui';
import { clearRecents, useRecents } from '../recents';
import { setSettings, useSettings, type ThemePref } from '../settings';
import { instagramLoggedIn } from '../sources';
import { control, dark as darkPalette, gutter, light as lightPalette, type Palette, radius, space, tabular, text, usePalette } from '../theme';

type Row = { kind: StorageKind; icon: keyof typeof Feather.glyphMap; title: string; action: string; confirm?: boolean; color: string };

const ROWS: Row[] = [
  { kind: 'downloads', icon: 'download', title: 'Baixados', action: 'Apagar', color: COLORS.azul.bg },
  { kind: 'temp', icon: 'clock', title: 'Temporários', action: 'Limpar', color: COLORS.verde.bg },
  { kind: 'playlist', icon: 'music', title: 'Playlist', action: 'Apagar', confirm: true, color: COLORS.coral.bg },
  { kind: 'stickers', icon: 'smile', title: 'Figurinhas', action: 'Apagar', confirm: true, color: COLORS.rosa.bg },
  { kind: 'models', icon: 'mic', title: 'Transcrição', action: 'Apagar', color: COLORS.roxo.bg },
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
  const recents = useRecents();
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
  const me = useMe();
  const db = useDB();
  const version = Constants.expoConfig?.version ?? '';
  const build = Constants.expoConfig?.android?.versionCode;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[8] }}>
        <ScreenHeader title="Ajustes" />
        <View style={s.body}>
          <View style={s.section}>
            <Overline>Aparência</Overline>
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
                    containerStyle={s.themeSlot}
                    scaleTo={0.96}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={t.label}
                    style={[s.theme, on && s.themeOn]}
                  >
                    <PhoneArt kind={t.value} frame={c.ink} />
                    <Text style={[s.themeLabel, on && { color: c.accentInk }]}>{t.label}</Text>
                  </Press>
                );
              })}
            </View>
          </View>

          <View style={s.section}>
            <Overline>Contas</Overline>
            <Group>
              {me ? (
                <View style={s.row}>
                  <Avatar user={me} size={40} />
                  <View style={s.rowText}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      {me.name}
                    </Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      @{me.username} · conta do Puxa
                    </Text>
                  </View>
                  <Button size="sm" tone="neutral" label="Perfil" accessibilityLabel="Abrir seu perfil" onPress={() => router.push('/perfil/eu')} />
                  <Button
                    size="sm"
                    tone="ghost"
                    label="Sair"
                    accessibilityLabel="Sair da conta do Puxa"
                    onPress={() => {
                      logout();
                      toast.show({ title: 'Você saiu da conta', tone: 'info' });
                    }}
                  />
                </View>
              ) : (
                <View style={s.row}>
                  <View style={s.tile}>
                    <Feather name="user" size={20} color={c.ink} />
                  </View>
                  <View style={s.rowText}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      Conta do Puxa
                    </Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      Para seguir, curtir e publicar
                    </Text>
                  </View>
                  <Button size="sm" tone="neutral" label="Entrar" accessibilityLabel="Entrar ou criar conta do Puxa" onPress={() => router.push('/entrar')} />
                </View>
              )}
              <Hairline inset={space[4] + control.sm + space[3]} />
              <View style={s.row}>
                <View style={s.tile}>
                  <Feather name="instagram" size={20} color={c.ink} />
                </View>
                <View style={s.rowText}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    Instagram
                  </Text>
                  <View style={s.status}>
                    {instagram ? <View style={[s.statusDot, { backgroundColor: c.successInk }]} /> : null}
                    <Text style={s.rowSub} numberOfLines={1}>
                      {instagram ? 'Conectado' : 'Para stories e destaques'}
                    </Text>
                  </View>
                </View>
                <Button
                  size="sm"
                  tone={instagram ? 'neutral' : 'accent'}
                  label={instagram ? 'Sair' : 'Entrar'}
                  accessibilityLabel={instagram ? 'Sair do Instagram' : 'Entrar no Instagram'}
                  onPress={() => (instagram ? leaveInstagram() : router.push('/instagram'))}
                />
              </View>
              <Hairline inset={space[4] + control.sm + space[3]} />
              <View style={s.row}>
                <View style={s.tile}>
                  <Feather name="zap" size={20} color={c.ink} />
                </View>
                <View style={s.rowText}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    ElevenLabs
                  </Text>
                  <View style={s.status}>
                    {key ? <View style={[s.statusDot, { backgroundColor: c.successInk }]} /> : null}
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
                  <Button
                    size="sm"
                    tone="neutral"
                    label="Remover"
                    accessibilityLabel="Remover a chave da ElevenLabs"
                    onPress={() => {
                      setElevenKey(null).catch(() => {});
                      setCredits(null);
                    }}
                  />
                ) : null}
              </View>
              {key === '' ? (
                <View style={s.keyBox}>
                  <View style={s.keyRow}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder="Cole a chave da API"
                      placeholderTextColor={c.muted}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={s.keyInput}
                      selectionColor={c.accent}
                      accessibilityLabel="Chave da API da ElevenLabs"
                    />
                    <Button size="md" label="Salvar" accessibilityLabel="Salvar a chave" busy={checking} disabled={!draft.trim()} onPress={saveKey} />
                  </View>
                  <Text style={s.link} onPress={() => Linking.openURL('https://elevenlabs.io/app/settings/api-keys').catch(() => {})} accessibilityRole="link">
                    Onde pego a chave?
                  </Text>
                </View>
              ) : null}
            </Group>
          </View>

          <View style={s.section}>
            <Overline>Armazenamento</Overline>
            <Group>
              <View style={s.usage}>
                <Text style={s.total}>{usage ? bytes(total) || '0 KB' : '…'}</Text>
                <Text style={s.totalLabel}>em uso no aparelho</Text>
                <View style={s.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {usage && total > 0 ? ROWS.filter((r) => usage[r.kind] > 0).map((r) => <View key={r.kind} style={{ flex: usage[r.kind] / total, backgroundColor: r.color, minWidth: 4 }} />) : null}
                </View>
              </View>
              {ROWS.map((r) => {
                const size = usage?.[r.kind] ?? 0;
                const empty = !usage || size <= 0;
                const confirm = confirming === r.kind;
                return (
                  <View key={r.kind}>
                    <Hairline />
                    <View style={s.row}>
                      <View style={[s.dot, { backgroundColor: r.color }]} />
                      <View style={s.rowText}>
                        <Text style={s.rowTitle} numberOfLines={1}>
                          {r.title}
                        </Text>
                        <Text style={s.rowSub}>{usage ? bytes(size) || 'vazio' : ''}</Text>
                      </View>
                      <Button
                        size="sm"
                        tone={confirm ? 'danger' : 'neutral'}
                        label={confirm ? 'Confirmar' : r.action}
                        accessibilityLabel={`${confirm ? 'Confirmar' : r.action}: ${r.title}`}
                        busy={working === r.kind}
                        disabled={empty || (!!working && working !== r.kind)}
                        onPress={() => clear(r)}
                      />
                    </View>
                  </View>
                );
              })}
              <Hairline />
              <View style={s.row}>
                <View style={[s.dot, { backgroundColor: c.faint }]} />
                <View style={s.rowText}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    Links recentes
                  </Text>
                  <Text style={s.rowSub}>{recents.length ? `${recents.length} ${recents.length === 1 ? 'link' : 'links'} no Início` : 'vazio'}</Text>
                </View>
                <Button
                  size="sm"
                  tone="neutral"
                  label="Limpar"
                  accessibilityLabel="Limpar os links recentes"
                  disabled={!recents.length}
                  onPress={() => {
                    clearRecents();
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    toast.show({ title: 'Recentes limpos', tone: 'success' });
                  }}
                />
              </View>
              <Hairline />
              <View style={s.row}>
                <View style={[s.dot, { backgroundColor: c.faint }]} />
                <View style={s.rowText}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    Comunidade (teste)
                  </Text>
                  <Text style={s.rowSub}>{db.searches.length ? `${db.searches.length} buscas recentes · dados simulados` : 'Dados simulados no celular'}</Text>
                </View>
                <Button
                  size="sm"
                  tone="neutral"
                  label="Restaurar"
                  accessibilityLabel="Restaurar os dados de teste da comunidade"
                  onPress={() => {
                    resetCommunity();
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    toast.show({ title: 'Dados de teste restaurados', body: 'Contas, seguidores, curtidas e pacotes voltaram ao começo.', tone: 'success' });
                  }}
                />
              </View>
            </Group>
          </View>

          <View style={s.section}>
            <Overline>Sobre</Overline>
            <Group>
              <View style={s.row}>
                <AppMark size={40} />
                <View style={s.rowText}>
                  <Text style={s.rowTitle}>Puxa</Text>
                  <Text style={s.rowSub}>
                    Versão {version}
                    {build ? ` (${build})` : ''}
                  </Text>
                </View>
              </View>
              <Hairline />
              <Pressable
                onPress={() => setTerms((v) => !v)}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: c.sunken }]}
                accessibilityRole="button"
                accessibilityState={{ expanded: terms }}
              >
                <View style={s.tile}>
                  <Feather name="file-text" size={20} color={c.ink} />
                </View>
                <Text style={[s.rowTitle, s.rowText]}>Termos de uso</Text>
                <Feather name={terms ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} />
              </Pressable>
              {terms ? (
                <Reveal>
                  <View style={s.terms}>
                    {TERMS.map((t) => (
                      <View key={t.title} style={s.term}>
                        <Text style={s.termTitle}>{t.title}</Text>
                        <Text style={s.termBody}>{t.body}</Text>
                      </View>
                    ))}
                  </View>
                </Reveal>
              ) : null}
            </Group>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Miniatura de um celular no tema: claro, escuro ou meio a meio (automático). */
function PhoneArt({ kind, frame }: { kind: ThemePref; frame: string }) {
  const half = kind === 'system';
  const screen = (p: Palette) => (
    <View style={[phone.screen, { backgroundColor: p.bg }]}>
      <View style={[phone.line, { width: 16, backgroundColor: p.ink }]} />
      <View style={[phone.field, { backgroundColor: p.sunken }]} />
      <View style={[phone.line, { width: '80%', backgroundColor: p.lineStrong }]} />
      <View style={[phone.line, { width: '60%', backgroundColor: p.lineStrong }]} />
      <View style={[phone.cta, { backgroundColor: p.accent }]} />
    </View>
  );
  return (
    <View style={[phone.frame, { borderColor: frame }]}>
      {half ? (
        <View style={phone.halves}>
          <View style={phone.half}>
            <View style={phone.full}>{screen(lightPalette)}</View>
          </View>
          <View style={[phone.half, phone.right]}>
            <View style={phone.full}>{screen(darkPalette)}</View>
          </View>
        </View>
      ) : (
        screen(kind === 'dark' ? darkPalette : lightPalette)
      )}
    </View>
  );
}

const phone = StyleSheet.create({
  frame: { width: 48, height: 80, borderRadius: radius.md, borderWidth: 2, overflow: 'hidden' },
  screen: { flex: 1, paddingTop: space[2], paddingHorizontal: space[1], gap: space[1] },
  line: { height: 4, borderRadius: radius.full },
  field: { height: 12, borderRadius: radius.full },
  cta: { marginTop: 'auto', marginBottom: space[1], height: 8, borderRadius: radius.full },
  halves: { flex: 1, flexDirection: 'row' },
  half: { flex: 1, overflow: 'hidden' },
  right: { alignItems: 'flex-end' },
  full: { width: 44, flex: 1 },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    body: { paddingHorizontal: gutter, gap: space[8] },
    section: { gap: space[3] },
    themes: { flexDirection: 'row', gap: space[2] },
    themeSlot: { flex: 1 },
    theme: { alignItems: 'center', gap: space[3], paddingVertical: space[4], borderRadius: radius.xl, borderWidth: 2, borderColor: 'transparent', backgroundColor: c.surface, boxShadow: c.shadow1 },
    themeOn: { borderColor: c.accentLine, backgroundColor: c.accentSoft, boxShadow: undefined },
    themeLabel: { ...text.captionBold, color: c.ink },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingHorizontal: space[4], paddingVertical: space[3] },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: { ...text.bodyBold, color: c.ink },
    rowSub: { ...text.caption, ...tabular, flexShrink: 1, color: c.muted },
    tile: { width: control.sm, height: control.sm, borderRadius: radius.full, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' },
    status: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    statusDot: { width: 8, height: 8, borderRadius: radius.full },
    keyBox: { gap: space[1], paddingHorizontal: space[4], paddingBottom: space[3] },
    keyRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    keyInput: { ...text.body, flex: 1, minWidth: 0, minHeight: control.md, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: c.sunken, color: c.ink },
    link: { ...text.captionBold, alignSelf: 'flex-start', color: c.accentInk, paddingVertical: space[2] },
    usage: { padding: space[4], paddingBottom: space[4] },
    total: { ...text.display, ...tabular, color: c.ink },
    totalLabel: { ...text.caption, color: c.muted },
    bar: { flexDirection: 'row', height: 8, borderRadius: radius.full, overflow: 'hidden', backgroundColor: c.sk, marginTop: space[3] },
    dot: { width: 8, height: 8, borderRadius: radius.full },
    terms: { gap: space[4], paddingHorizontal: space[4], paddingBottom: space[4] },
    term: { gap: space[1] },
    termTitle: { ...text.bodyBold, color: c.ink },
    termBody: { ...text.caption, color: c.body },
  });
