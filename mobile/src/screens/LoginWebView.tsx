import { WebView } from 'react-native-webview';

import { IG_UA } from '../sources';

/** O site de login do Instagram (só no celular; na web há o arquivo .web ao lado). */
export function LoginWebView({ uri, background, onLoadEnd }: { uri: string; background: string; onLoadEnd: () => void }) {
  return (
    <WebView
      source={{ uri }}
      userAgent={IG_UA}
      thirdPartyCookiesEnabled
      sharedCookiesEnabled
      setSupportMultipleWindows={false}
      onLoadEnd={onLoadEnd}
      // Links que abririam o app do Instagram (ou outro app) ficam de fora
      onShouldStartLoadWithRequest={(r) => /^https?:\/\//i.test(r.url)}
      style={{ flex: 1, backgroundColor: background }}
    />
  );
}
