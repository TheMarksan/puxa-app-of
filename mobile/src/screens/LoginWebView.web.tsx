import { useEffect } from 'react';
import { Text } from 'react-native';
import { space, text, usePalette } from '../theme';

/** Prévia web: o login do Instagram só abre no celular. */
export function LoginWebView({ onLoadEnd }: { uri: string; background: string; onLoadEnd: () => void; onNavigate?: (url: string) => void; onFail?: () => void }) {
  const c = usePalette();
  useEffect(() => onLoadEnd(), [onLoadEnd]);
  return <Text style={[text.body, { textAlign: 'center', marginTop: space[12], color: c.muted }]}>O login abre só no celular.</Text>;
}
