import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { fail, harvesterMounted, hookScript, report, useHarvestJob } from '../sources/harvest';

/**
 * O navegador invisível da leitura de perfis sem login. Fica atrás das telas (o app cobre), com
 * tamanho de celular para a página carregar como carregaria de verdade.
 */
export function Harvester() {
  const job = useHarvestJob();
  useEffect(() => {
    harvesterMounted(true);
    return () => harvesterMounted(false);
  }, []);
  if (!job) return null;
  return (
    <View pointerEvents="none" style={s.box} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <WebView
        key={job.id}
        source={{ uri: job.url }}
        userAgent={job.userAgent}
        injectedJavaScriptBeforeContentLoaded={hookScript(job.pattern, job.html, job.tap)}
        onMessage={(e) => report(job.id, e.nativeEvent.data)}
        onError={() => fail(job.id)}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) fail(job.id);
        }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction
        onShouldStartLoadWithRequest={(r) => /^https?:\/\//i.test(r.url)}
        style={s.web}
      />
    </View>
  );
}

const s = StyleSheet.create({
  box: { position: 'absolute', left: 0, top: 0, width: 392, height: 844, opacity: 0.01 },
  web: { flex: 1 },
});
