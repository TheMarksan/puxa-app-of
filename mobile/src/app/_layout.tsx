import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold, useFonts } from '@expo-google-fonts/archivo';
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
import { preparePlayer } from '../playlist/player';
import { applyTheme, getSettings } from '../settings';
import { usePalette } from '../theme';

// A escolha de claro/escuro dos Ajustes vale desde o primeiro quadro (o padrão já segue o sistema)
if (getSettings().theme !== 'system') applyTheme(getSettings().theme);

export default function RootLayout() {
  const c = usePalette();
  const [loaded] = useFonts({ Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold, ...FONT_MAP });

  // A playlist volta de onde parou: termina os downloads e deixa os controles prontos
  useEffect(() => {
    resumeQueue();
    preparePlayer();
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
