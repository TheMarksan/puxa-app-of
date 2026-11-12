import { useEffect, useMemo, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import type { VideoInfo } from '../../modules/puxa-engine';
import { NAMES } from '../sources/social';
import { clock, date, views } from '../format';
import { ms, reduceMotion } from '../motion';
import { font, Palette, radius, usePalette } from '../theme';

/** Cartão compacto: a capa confirma o vídeo (ou a foto), e o espaço fica para formato e qualidade. */
export function ResultCard({ info }: { info: VideoInfo }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const network = info.source && info.source !== 'youtube' ? NAMES[info.source] : null;
  const meta = [network, views(info.viewCount), date(info.uploadDate)].filter(Boolean).join(' · ');
  return (
    <View style={s.card}>
      <View style={s.thumbWrap}>
        <Image source={{ uri: info.thumbnail }} style={s.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
        {info.image || info.duration > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{info.image ? 'Foto' : clock(info.duration)}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.text}>
        <Text style={s.title} numberOfLines={3}>
          {info.title}
        </Text>
        <Text style={s.channel} numberOfLines={1}>
          {info.channel}
        </Text>
        {meta ? (
          <Text style={s.meta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Esqueleto enquanto o YouTube responde: mesma forma do cartão, pulsando devagar. */
export function ResultSkeleton() {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const pulse = useState(() => new Animated.Value(0.6))[0];
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: ms(700), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6, duration: ms(700), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={[s.card, { opacity: pulse }]} accessibilityLabel="Buscando o vídeo" accessible>
      <View style={s.thumbWrap} />
      <View style={s.text}>
        <View style={[s.bone, { width: '96%', height: 15 }]} />
        <View style={[s.bone, { width: '70%', height: 15 }]} />
        <View style={[s.bone, { width: '45%', height: 12, marginTop: 8 }]} />
      </View>
    </Animated.View>
  );
}

const THUMB_W = 136;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      gap: 14,
      padding: 10,
      borderRadius: radius.slot,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
    },
    thumbWrap: { width: THUMB_W, aspectRatio: 16 / 9, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: c.sk, alignSelf: 'flex-start' },
    thumb: { width: '100%', height: '100%' },
    badge: {
      position: 'absolute',
      right: 5,
      bottom: 5,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 5,
      backgroundColor: 'rgba(10, 12, 15, 0.82)',
    },
    badgeText: { fontFamily: font.semibold, fontSize: 12, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
    text: { flex: 1, gap: 3, paddingVertical: 2, paddingRight: 4 },
    title: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: c.ink, letterSpacing: -0.1 },
    channel: { fontFamily: font.medium, fontSize: 13, color: c.muted, marginTop: 2 },
    meta: { fontFamily: font.regular, fontSize: 12, color: c.muted, fontVariant: ['tabular-nums'] },
    bone: { borderRadius: 6, backgroundColor: c.sk, marginTop: 4 },
  });
