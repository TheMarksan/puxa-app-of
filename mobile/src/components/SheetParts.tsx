import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { ms } from '../motion';
import { control, ease, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { Press } from './Button';

/** Conteúdo que acabou de abrir: sobe um pouco e aparece (troca de modo, seção revelada). */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: ms(240), delay: ms(delay), easing: ease.arrive, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

/**
 * Arrastar a alça da folha para baixo fecha a folha. O gesto fica só na alça e no topo, para não
 * brigar com a rolagem do conteúdo.
 */
export function useSheetDrag(onClose: () => void, enabled: boolean) {
  const [drag] = useState(() => new Animated.Value(0));
  const live = useRef({ onClose, enabled });
  useEffect(() => {
    live.current = { onClose, enabled };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => live.current.enabled && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 1.1) {
          Haptics.selectionAsync().catch(() => {});
          Animated.timing(drag, { toValue: 900, duration: ms(170), easing: ease.exit, useNativeDriver: true }).start(() => live.current.onClose());
        } else Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    }),
  );
  return { handlers: responder.panHandlers, drag, reset: () => drag.setValue(0) };
}

export type Mode<T extends string> = { value: T; label: string; hint: string; art: 'video' | 'animated' | 'still' | 'photo'; a11y: string };

/** Escolha do que mandar: três cartões desenhados, cada um com a cara do que sai. */
export function ModeTiles<T extends string>({ modes, value, onChange }: { modes: Mode<T>[]; value: T; onChange: (v: T) => void }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.tiles} accessibilityRole="radiogroup" accessibilityLabel="O que mandar">
      {modes.map((m) => {
        const on = m.value === value;
        return (
          <Press
            key={m.value}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(m.value);
            }}
            containerStyle={{ flex: 1 }}
            scaleTo={0.96}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={m.a11y}
            style={[s.tile, on && s.tileOn]}
          >
            <Art kind={m.art} on={on} c={c} />
            <View style={s.tileText}>
              <Text style={[s.tileLabel, on && { color: c.accentInk }]} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={s.tileHint} numberOfLines={1}>
                {m.hint}
              </Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

/** Desenho de cada modo: um quadro de vídeo ou uma figurinha (com contorno branco). */
function Art({ kind, on, c }: { kind: Mode<string>['art']; on: boolean; c: Palette }) {
  const tint = on ? c.accent : c.faint;
  const ink = on ? c.onAccent : c.bg;
  if (kind === 'video' || kind === 'photo') {
    return (
      <View style={[art.video, { backgroundColor: tint }]}>
        {kind === 'video' ? <Feather name="play" size={12} color={ink} /> : <Feather name="image" size={16} color={ink} />}
      </View>
    );
  }
  return (
    <View style={art.wrap}>
      <View style={[art.sticker, { backgroundColor: tint, borderColor: c.onMedia, boxShadow: c.shadow1, transform: [{ rotate: kind === 'animated' ? '-6deg' : '0deg' }] }]}>
        <Feather name={kind === 'animated' ? 'smile' : 'image'} size={16} color={ink} />
      </View>
      {kind === 'animated' ? (
        <View style={[art.badge, { backgroundColor: c.ink, borderColor: c.onMedia }]}>
          <Feather name="repeat" size={12} color={c.bg} />
        </View>
      ) : null}
    </View>
  );
}

const art = StyleSheet.create({
  video: { width: 40, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginVertical: space[1] },
  wrap: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  sticker: { width: 32, height: 32, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});

/** Ferramenta liga/desliga (Cortar, Legenda, Zoom): ícone redondo e o nome embaixo. */
export function ToolToggle({
  icon,
  label,
  active,
  onPress,
  onLongPress,
  hint,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  hint?: string;
}) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Press
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onLongPress={onLongPress}
      scaleTo={0.92}
      containerStyle={{ flex: 1 }}
      style={s.tool}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <View style={[s.toolIcon, active && s.toolIconOn]}>
        <Feather name={icon} size={20} color={active ? c.onAccent : c.ink} />
      </View>
      <Text style={[s.toolLabel, active && { color: c.accentInk }]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    tiles: { flexDirection: 'row', gap: space[2] },
    // A escolhida ganha o azul bem claro e um fio azul; as outras ficam no poço, sem contorno
    tile: { alignItems: 'center', paddingVertical: space[3], gap: space[1], borderRadius: radius.lg, borderWidth: 2, borderColor: 'transparent', backgroundColor: c.sunken },
    tileOn: { borderColor: c.accentLine, backgroundColor: c.accentSoft },
    tileText: { alignItems: 'center' },
    tileLabel: { ...text.bodyBold, color: c.ink },
    tileHint: { ...text.caption, color: c.muted },
    tool: { alignItems: 'center', gap: space[1] },
    toolIcon: { width: control.lg, height: control.lg, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken },
    toolIconOn: { backgroundColor: c.accent, boxShadow: c.sheen },
    toolLabel: { ...text.captionBold, ...tabular, color: c.ink },
  });
