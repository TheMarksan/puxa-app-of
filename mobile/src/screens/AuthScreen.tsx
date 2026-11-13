import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityError, type SignupInput } from '../community/core';
import { TEST_ACCOUNTS, TEST_PASSWORD } from '../community/seed';
import { login, signup } from '../community/store';
import { Avatar } from '../community/ui';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { ScreenHeader } from '../components/ScreenHeader';
import { Segmented } from '../components/Segmented';
import { useToast } from '../components/Toasts';
import { Overline } from '../components/ui';
import { gutter, type Palette, radius, space, text, usePalette } from '../theme';

type Mode = 'entrar' | 'criar';
type Errors = Partial<Record<'name' | 'username' | 'email' | 'password' | 'identifier' | 'form', string>>;

/**
 * Entrar ou criar conta. A conta serve para seguir criadores, curtir e publicar pacotes; o resto
 * do app funciona sem ela. Enquanto o servidor não existe, há duas contas de teste prontas.
 */
export function AuthScreen() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ modo?: string }>();
  const [mode, setMode] = useState<Mode>(params.modo === 'criar' ? 'criar' : 'entrar');
  const [identifier, setIdentifier] = useState('');
  const [form, setForm] = useState<SignupInput>({ name: '', username: '', email: '', password: '' });
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  const done = (name: string, fresh: boolean) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.show({ title: fresh ? `Bem-vindo, ${name.split(' ')[0]}` : `Oi, ${name.split(' ')[0]}`, body: fresh ? 'Agora dá para seguir criadores e publicar seus pacotes.' : undefined, tone: 'success' });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const submit = async () => {
    if (busy) return;
    setErrors({});
    setBusy(true);
    try {
      if (mode === 'entrar') {
        await login(identifier, password);
        const id = identifier.trim().toLowerCase();
        done(TEST_ACCOUNTS.find((a) => a.email === id)?.label ?? id.replace(/^@/, '').split('@')[0], false);
      } else {
        await signup(form);
        done(form.name.trim(), true);
      }
    } catch (e) {
      const err = e as CommunityError;
      setErrors({ [err.field ?? 'form']: err.message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof SignupInput) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={mode === 'entrar' ? 'Entrar' : 'Criar conta'} subtitle="Para seguir criadores, curtir e publicar seus pacotes de figurinhas." />
        <View style={s.body}>
          <Segmented<Mode>
            accessibilityLabel="Entrar ou criar conta"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setErrors({});
            }}
            options={[
              { value: 'entrar', label: 'Entrar' },
              { value: 'criar', label: 'Criar conta' },
            ]}
          />

          {mode === 'entrar' ? (
            <View style={s.fields}>
              <Field
                label="E-mail ou nome de usuário"
                value={identifier}
                onChangeText={(v) => {
                  setIdentifier(v);
                  if (errors.identifier) setErrors((e) => ({ ...e, identifier: undefined }));
                }}
                error={errors.identifier}
                placeholder="voce@email.com ou @usuario"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <Field
                ref={passwordRef}
                label="Senha"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
                }}
                error={errors.password}
                secureTextEntry
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>
          ) : (
            <View style={s.fields}>
              <Field label="Seu nome" value={form.name} onChangeText={set('name')} error={errors.name} placeholder="Como quer aparecer" autoComplete="name" maxLength={40} />
              <Field label="Nome de usuário" prefix="@" value={form.username} onChangeText={set('username')} error={errors.username} placeholder="seunome" autoCapitalize="none" autoCorrect={false} maxLength={20} hint="Letras, números, ponto e sublinhado." />
              <Field label="E-mail" value={form.email} onChangeText={set('email')} error={errors.email} placeholder="voce@email.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
              <Field label="Senha" value={form.password} onChangeText={set('password')} error={errors.password} secureTextEntry autoComplete="new-password" hint="6 caracteres ou mais." returnKeyType="go" onSubmitEditing={submit} />
            </View>
          )}
          {errors.form ? <Text style={s.formError}>{errors.form}</Text> : null}

          {mode === 'entrar' ? (
            <View style={s.test}>
              <Overline>Contas de teste</Overline>
              <Text style={s.testBody}>Enquanto o servidor não existe, os dados são simulados no celular. Senha das duas: {TEST_PASSWORD}</Text>
              {TEST_ACCOUNTS.map((a) => (
                <View key={a.id} style={s.testRow}>
                  <Avatar user={{ name: a.label, avatar: { art: a.id === 'u-marcos' ? 'pessoas/marcos' : 'pessoas/ana' } }} size={40} />
                  <View style={s.testText}>
                    <Text style={s.testName}>{a.label}</Text>
                    <Text style={s.testMeta}>{a.email}</Text>
                  </View>
                  <Button
                    size="sm"
                    tone="neutral"
                    label="Usar"
                    accessibilityLabel={`Preencher com a conta de teste de ${a.label}`}
                    onPress={() => {
                      setIdentifier(a.email);
                      setPassword(TEST_PASSWORD);
                      setErrors({});
                    }}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: insets.bottom + space[4] }]}>
        <Button label={mode === 'entrar' ? 'Entrar' : 'Criar conta'} busy={busy} onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { paddingBottom: space[8] },
    body: { paddingHorizontal: gutter, gap: space[6] },
    fields: { gap: space[4] },
    formError: { ...text.caption, color: c.danger },
    test: { gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: c.accentSoft },
    testBody: { ...text.caption, color: c.body },
    testRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    testText: { flex: 1, minWidth: 0 },
    testName: { ...text.bodyBold, color: c.ink },
    testMeta: { ...text.caption, color: c.muted },
    footer: { paddingHorizontal: gutter, paddingTop: space[3], backgroundColor: c.bg },
  });
