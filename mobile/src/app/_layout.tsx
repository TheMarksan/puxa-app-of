import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Harvester } from '../components/Harvester';
import { ToastProvider } from '../components/Toasts';
import { FONT_MAP } from '../editor/fonts';
import { resumeQueue } from '../playlist/downloads';
import { askOnFirstLaunch } from '../playlist/permissions';
import { applyTheme, getSettings } from '../settings';
import { usePalette } from '../theme';

// A escolha de claro/escuro dos Ajustes vale desde o primeiro quadro (o padrão já segue o sistema)
if (getSettings().theme !== 'system') applyTheme(getSettings().theme);

export default function RootLayout() {
  const c = usePalette();
  // Só os dois pesos usados: importar o pacote inteiro levaria os 18 arquivos da Archivo para o APK
  const [loaded] = useFonts({
    Archivo_400Regular: require('@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf'),
    Archivo_700Bold: require('@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf'),
    ...FONT_MAP,
  });

  // A playlist termina os downloads que ficaram na fila; na primeira entrada, pede as permissões
  useEffect(() => {
    resumeQueue();
    askOnFirstLaunch();
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  return (
    <SafeAreaProvider>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      {loaded ? (
        <ToastProvider>
          {/* Atrás das telas: o navegador invisível dos perfis sem login */}
          <Harvester />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: c.bg } }} />
        </ToastProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: c.bg }} />
      )}
    </SafeAreaProvider>
  );
}
