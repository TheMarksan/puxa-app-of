import { Text, View, type TextStyle as RNTextStyle } from 'react-native';

import { FONTS } from '../fonts';
import type { TextStyle } from '../types';

export type Highlight = { range: [number, number]; color: string } | null | undefined;

/** Divide o texto em antes / palavra em destaque / depois. */
function split(text: string, hl: Highlight): [string, string, string] | null {
  if (!hl) return null;
  const [a, b] = hl.range;
  if (a < 0 || b <= a || b > text.length) return null;
  return [text.slice(0, a), text.slice(a, b), text.slice(b)];
}

/**
 * Aparência do texto na prévia, o mais perto possível do PNG desenhado no aparelho
 * (Render.kt): mesmas folgas, caixas, contorno, brilho e palavra em destaque.
 */
export function TextVisual({
  text,
  style,
  fontSize,
  maxWidth,
  uppercase,
  highlight,
}: {
  text: string;
  style: TextStyle;
  fontSize: number;
  maxWidth: number;
  uppercase?: boolean;
  highlight?: Highlight;
}) {
  const family = (FONTS[style.font] ?? FONTS.archivo).family;
  const shown = uppercase ? text.toUpperCase() : text;
  const parts = split(shown, shown.length === text.length ? highlight : null);
  const base: RNTextStyle = { fontFamily: family, fontSize, lineHeight: fontSize * 1.25, color: style.color, textAlign: style.align };
  const content = (pad?: (s: string) => string) => {
    const f = pad ?? ((s: string) => s);
    if (!parts) return f(shown);
    return (
      <>
        {f(parts[0])}
        <Text style={{ color: highlight!.color }}>{f(parts[1])}</Text>
        {f(parts[2])}
      </>
    );
  };

  const bg = style.background;
  if (bg === 'box' || bg === 'pill') {
    return (
      <View
        style={{
          maxWidth,
          backgroundColor: style.bgColor,
          borderRadius: bg === 'pill' ? 999 : fontSize * 0.28,
          paddingHorizontal: fontSize * (bg === 'pill' ? 0.62 : 0.38),
          paddingVertical: fontSize * 0.2,
        }}
      >
        <Text style={base}>{content()}</Text>
      </View>
    );
  }
  if (bg === 'line') {
    // Uma caixa por linha: o fundo do próprio texto, com um espaço de folga em cada ponta
    const pad = (s: string) => s.replace(/\n/g, ' \n ');
    return (
      <Text style={[base, { maxWidth, paddingVertical: fontSize * 0.2 }]}>
        <Text style={{ backgroundColor: style.bgColor }}>
          {' '}
          {content(pad)}{' '}
        </Text>
      </Text>
    );
  }
  const box = { maxWidth, paddingHorizontal: fontSize * (bg === 'glow' ? 0.3 : 0.16), paddingVertical: fontSize * (bg === 'glow' ? 0.24 : 0.12) };
  if (bg === 'outline') {
    // Contorno de verdade: cópias do texto na cor do contorno, deslocadas em 8 direções
    const d = Math.max(1, fontSize * 0.07);
    const k = d * 0.71;
    const ring = [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
      [k, k],
      [-k, k],
      [k, -k],
      [-k, -k],
    ];
    const stroke = style.bgColor.slice(0, 7);
    return (
      <View style={box}>
        {ring.map(([x, y], i) => (
          <Text key={i} style={[base, { position: 'absolute', left: box.paddingHorizontal + x, right: box.paddingHorizontal - x, top: box.paddingVertical + y, color: stroke }]}>
            {shown}
          </Text>
        ))}
        <Text style={base}>{content()}</Text>
      </View>
    );
  }
  const shadow: RNTextStyle =
    bg === 'shadow'
      ? { textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: fontSize * 0.18, textShadowOffset: { width: 0, height: fontSize * 0.06 } }
      : bg === 'glow'
        ? { textShadowColor: style.bgColor.slice(0, 7), textShadowRadius: fontSize * 0.45, textShadowOffset: { width: 0, height: 0 } }
        : {};
  return (
    <View style={box}>
      <Text style={[base, shadow]}>{content()}</Text>
    </View>
  );
}
