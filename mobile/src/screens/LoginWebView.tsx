import { useState } from 'react';
import { WebView } from 'react-native-webview';

import { IG_LOGIN_UA } from '../sources';

/** Esquemas que abririam outro app (o do Instagram, a loja…): ficam de fora do login. */
const outside = (url: string) => !/^(https?|about|data|blob|javascript):/i.test(url);

/** O site de login do Instagram (só no celular; na web há o arquivo .web ao lado). */
export function LoginWebView({
  uri,
  background,
  onLoadEnd,
  onNavigate,
  onFail,
}: {
  uri: string;
  background: string;
  onLoadEnd: () => void;
  /** Cada página nova: a tela confere se a sessão já foi gravada. */
  onNavigate?: (url: string) => void;
  onFail?: () => void;
}) {
  const [life, setLife] = useState(0);
  return (
    <WebView
      key={life}
      source={{ uri }}
      // Chrome de celular: com o de computador o Instagram troca o formulário pelo convite do app
      userAgent={IG_LOGIN_UA}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      sharedCookiesEnabled
      setSupportMultipleWindows={false}
      cacheEnabled
      onLoadEnd={onLoadEnd}
      onNavigationStateChange={(n) => onNavigate?.(n.url)}
      onError={() => onFail?.()}
      onHttpError={(e) => {
        if (e.nativeEvent.statusCode >= 500) onFail?.();
      }}
      // O sistema fechou o navegador por falta de memória: carrega de novo em vez de ficar em branco
      onRenderProcessGone={() => setLife((n) => n + 1)}
      onShouldStartLoadWithRequest={(r) => !outside(r.url)}
      style={{ flex: 1, backgroundColor: background }}
    />
  );
}
