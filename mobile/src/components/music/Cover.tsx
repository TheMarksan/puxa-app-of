import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

import { ms } from '../../motion';
import { COLORS, coverPad, motifOf, titleSize, type ListColor } from '../../playlist/colors';
import { alpha } from '../../theme/palette';

const POSTER_FONT = 'Anton_400Regular';

/**
 * Capa de playlist: um pôster de cor chapada, com o nome em letra condensada e um desenho de
 * fundo que sai do nome (anéis, listras, pontos ou um sol).
 */
export function PlaylistCover({ name, color, size, radius = 18, label, image }: { name: string; color: ListColor; size: number; radius?: number; label?: string; image?: string | null }) {
  const k = COLORS[color];
  if (image) {
    // Capa escolhida pela pessoa: a imagem inteira, com uma faixa da cor da playlist embaixo
    const band = Math.max(3, Math.round(size * 0.035));
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: k.bg, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image resizeMethod="resize" source={{ uri: imageUri(image) }} style={{ position: 'absolute', left: 0, top: 0, width: size, height: size - band }} resizeMode="cover" />
      </View>
    );
  }
  const motif = motifOf(name);
  const fs = titleSize(name, size);
  const pad = coverPad(size);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: k.bg, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Motif kind={motif} size={size} ink={k.ink} />
      {label ? (
        <Text style={{ position: 'absolute', top: pad, left: pad, fontFamily: POSTER_FONT, fontSize: Math.max(9, size * 0.075), letterSpacing: 1.2, color: k.ink, opacity: 0.75 }} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
      ) : null}
      <Text
        style={{ position: 'absolute', left: pad, right: pad, bottom: pad * 0.7, fontFamily: POSTER_FONT, fontSize: fs, lineHeight: fs * 1.08, color: k.ink, textTransform: 'uppercase', includeFontPadding: false }}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {name}
      </Text>
    </View>
  );
}

function Motif({ kind, size, ink }: { kind: number; size: number; ink: string }) {
  const o = 0.17;
  if (kind === 0) {
    // Anéis no canto de cima
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[1.25, 0.9, 0.55].map((f, i) => (
          <View key={i} style={{ position: 'absolute', width: size * f, height: size * f, borderRadius: size, borderWidth: Math.max(2, size * 0.035), borderColor: ink, opacity: o, right: -size * f * 0.35, top: -size * f * 0.35 }} />
        ))}
      </View>
    );
  }
  if (kind === 1) {
    // Listras na diagonal
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ position: 'absolute', width: size * 1.6, height: size * 0.07, backgroundColor: ink, left: -size * 0.2, top: size * (0.05 + i * 0.16), transform: [{ rotate: '-28deg' }] }} />
        ))}
      </View>
    );
  }
  if (kind === 2) {
    // Grade de pontos
    const n = 5;
    const d = size * 0.05;
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o + 0.05 }]}>
        {Array.from({ length: n * 3 }, (_, i) => (
          <View key={i} style={{ position: 'absolute', width: d, height: d, borderRadius: d, backgroundColor: ink, left: size * 0.12 + (i % n) * size * 0.18, top: size * 0.12 + Math.floor(i / n) * size * 0.14 }} />
        ))}
      </View>
    );
  }
  // Sol nascendo
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o }]}>
      <View style={{ position: 'absolute', width: size * 0.9, height: size * 0.9, borderRadius: size, backgroundColor: ink, right: -size * 0.25, top: size * 0.05 }} />
    </View>
  );
}

/**
 * O desenho do pôster no topo da playlist: o mesmo da capa, em tamanho de tela. [width] é a
 * largura do pôster; os desenhos se medem por ela.
 */
export function HeroMotif({ kind, ink, width }: { kind: number; ink: string; width: number }) {
  const o = 0.14;
  const u = width / 400;
  if (kind === 0)
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[1.05, 0.75, 0.45].map((f, i) => {
          const d = width * f;
          return <View key={i} style={{ position: 'absolute', width: d, height: d, borderRadius: d, borderWidth: 16 * u, borderColor: ink, opacity: o, right: -d * 0.3, top: -d * 0.35 }} />;
        })}
      </View>
    );
  if (kind === 1)
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ position: 'absolute', width: width * 1.8, height: 24 * u, backgroundColor: ink, left: -width * 0.3, top: (8 + i * 64) * u, transform: [{ rotate: '-28deg' }] }} />
        ))}
      </View>
    );
  if (kind === 2)
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o + 0.04 }]}>
        {Array.from({ length: 24 }, (_, i) => (
          <View key={i} style={{ position: 'absolute', width: 12 * u, height: 12 * u, borderRadius: 12 * u, backgroundColor: ink, right: (24 + (i % 6) * 32) * u, top: (72 + Math.floor(i / 6) * 32) * u }} />
        ))}
      </View>
    );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o }]}>
      <View style={{ position: 'absolute', width: width * 0.8, height: width * 0.8, borderRadius: width, backgroundColor: ink, right: -width * 0.22, top: 8 * u }} />
    </View>
  );
}

/** Três barrinhas que dançam enquanto a música toca (paradas quando pausa). */
export function Equalizer({ on, color }: { on: boolean; color: string }) {
  const [vals] = useState(() => [new Animated.Value(0.4), new Animated.Value(0.8), new Animated.Value(0.55)]);
  useEffect(() => {
    if (!on) {
      vals.forEach((v) => v.stopAnimation());
      return;
    }
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: ms(280 + i * 90), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: ms(320 + i * 70), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [on, vals]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: color, transform: [{ scaleY: v }], transformOrigin: 'bottom' }} />
      ))}
    </View>
  );
}

/** Capa de uma música: a miniatura do vídeo, ou uma nota quando não tem. */
export function TrackArt({ uri, size, radius = 8, tint, ink = '#FFFFFF' }: { uri?: string; size: number; radius?: number; tint: string; ink?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image resizeMethod="resize" source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Feather name="music" size={size * 0.38} color={alpha(ink, 0.8)} />}
    </View>
  );
}

/** Caminho local ou link → endereço para a imagem. */
export const imageUri = (p: string | null | undefined) => (p ? (p.startsWith('/') && !p.startsWith('/preview') ? `file://${p}` : p) : undefined);
