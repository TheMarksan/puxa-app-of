import { useEffect } from 'react';
import { Text } from 'react-native';

/** Prévia web: o login do Instagram só abre no celular. */
export function LoginWebView({ onLoadEnd }: { uri: string; background: string; onLoadEnd: () => void; onNavigate?: (url: string) => void; onFail?: () => void }) {
  useEffect(() => onLoadEnd(), [onLoadEnd]);
  return <Text style={{ textAlign: 'center', marginTop: 40, color: '#888' }}>O login abre só no celular.</Text>;
}
