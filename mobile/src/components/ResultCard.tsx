import Feather from '@expo/vector-icons/Feather';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import type { VideoInfo } from '../../modules/puxa-engine';
import { NAMES } from '../sources/social';
import { clock, date, views } from '../format';
import { ms, reduceMotion } from '../motion';
import { type Palette, radius, space, tabular, text, usePalette } from '../theme';

const ICONS = { youtube: 'youtube', instagram: 'instagram', x: 'twitter' } as const;

/**
 * O que o link trouxe: a capa em destaque (é ela que confirma que é o vídeo certo), o título e
 * de quem é. [aspect] é a proporção da mídia; a capa fica entre o quadrado e o 16:9.
 */
export function ResultCard({ info, aspect }: { info: VideoInfo; aspect?: number }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const source = info.source ?? 'youtube';
  const meta = [info.channel, views(info.viewCount), date(info.uploadDate)].filter(Boolean).join(' · ');
  const ratio = Math.min(16 / 9, Math.max(1, aspect && isFinite(aspect) && aspect > 0 ? aspect : 16 / 9));
  return (
    <View style={s.card}>
      <View style={[s.thumbWrap, { aspectRatio: ratio }]}>
        <Image source={{ uri: info.thumbnail }} style={s.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={[s.badge, s.badgeLeft]}>
          <Feather name={ICONS[source]} size={12} color={c.onMedia} />
          <Text style={s.badgeText}>{source === 'youtube' ? 'YouTube' : NAMES[source]}</Text>
        </View>
        {info.image || info.duration > 0 ? (
          <View style={[s.badge, s.badgeRight]}>
            <Text style={s.badgeText}>{info.image ? 'Foto' : clock(info.duration)}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.text}>
        <Text style={s.title} numberOfLines={2}>
          {info.title}
        </Text>
        {meta ? (
          <Text style={s.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Esqueleto enquanto a rede responde: mesma forma do resultado, pulsando devagar. */
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
    <Animated.View style={[s.card, { opacity: pulse }]} accessibilityLabel="Buscando o link" accessible>
      <View style={[s.thumbWrap, { aspectRatio: 16 / 9 }]} />
      <View style={s.text}>
        <View style={[s.bone, { width: '92%' }]} />
        <View style={[s.bone, { width: '48%' }]} />
      </View>
    </Animated.View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { gap: space[3] },
    thumbWrap: { width: '100%', borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.sk },
    thumb: { width: '100%', height: '100%' },
    badge: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: space[1], height: 24, paddingHorizontal: space[2], borderRadius: radius.full, backgroundColor: c.mediaScrim },
    badgeLeft: { left: space[3], top: space[3] },
    badgeRight: { right: space[3], bottom: space[3] },
    badgeText: { ...text.captionBold, ...tabular, lineHeight: 16, color: c.onMedia },
    text: { gap: space[1] },
    title: { ...text.bodyBold, color: c.ink },
    meta: { ...text.caption, ...tabular, color: c.muted },
    bone: { height: 16, borderRadius: radius.sm, backgroundColor: c.sk },
  });
