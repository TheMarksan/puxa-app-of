import Feather from '@expo/vector-icons/Feather';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { ms, reduceMotion } from '../motion';
import { COLORS } from '../playlist/colors';
import { dark, ease, light, type Palette, radius, space, text, usePalette } from '../theme';

export type ToastInput = {
  title: string;
  body?: string;
  tone?: 'success' | 'error' | 'info';
  action?: { label: string; onPress: () => void };
  /** Em ms; padrão 4 s (erro, 6 s). */
  duration?: number;
  /** O ponto alto de uma tarefa (entregue, figurinha no WhatsApp): o aviso chega com uma pequena festa. */
  celebrate?: boolean;
};

type ToastItem = ToastInput & { id: number };

type ToastApi = {
  show: (t: ToastInput) => void;
  /** Distância do fundo da tela até onde os toasts começam (acima do rodapé de ações). */
  setBottomInset: (px: number) => void;
};

const Ctx = createContext<ToastApi>({ show: () => {}, setBottomInset: () => {} });

export const useToast = () => useContext(Ctx);

const MAX_VISIBLE = 2;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [bottom, setBottom] = useState(24);
  const lift = useState(() => new Animated.Value(24))[0];
  const nextId = useRef(1);

  const show = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setItems((list) => [...list, { ...t, id }].slice(-MAX_VISIBLE - 1));
    AccessibilityInfo.announceForAccessibility([t.title, t.body].filter(Boolean).join('. '));
  }, []);

  const remove = useCallback((id: number) => setItems((list) => list.filter((i) => i.id !== id)), []);

  const setBottomInset = useCallback((px: number) => setBottom(px), []);

  // A pilha sobe e desce junto com o rodapé, para nunca ficar por cima dos botões
  useEffect(() => {
    Animated.timing(lift, { toValue: bottom, duration: ms(240), easing: ease.ios, useNativeDriver: false }).start();
  }, [bottom, lift]);

  const api = useMemo(() => ({ show, setBottomInset }), [show, setBottomInset]);
  const visible = items.slice(-MAX_VISIBLE);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host, { paddingBottom: lift }]}>
        {visible.map((item) => (
          <Toast key={item.id} item={item} onGone={remove} />
        ))}
      </Animated.View>
    </Ctx.Provider>
  );
}

function Toast({ item, onGone }: { item: ToastItem; onGone: (id: number) => void }) {
  const c = usePalette();
  // O aviso é uma peça invertida (escura no tema claro, clara no escuro): usa a paleta oposta
  const k = c.dark ? light : dark;
  const s = useMemo(() => makeStyles(c, k), [c, k]);
  const enter = useState(() => new Animated.Value(0))[0];
  const dx = useState(() => new Animated.Value(0))[0];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);

  const leave = useCallback(
    (toX = 0) => {
      if (leaving.current) return;
      leaving.current = true;
      if (timer.current) clearTimeout(timer.current);
      Animated.parallel([
        Animated.timing(enter, { toValue: 0, duration: ms(180), easing: ease.exit, useNativeDriver: false }),
        Animated.timing(dx, { toValue: toX, duration: ms(180), easing: ease.exit, useNativeDriver: false }),
      ]).start(() => onGone(item.id));
    },
    [dx, enter, item.id, onGone],
  );

  const pause = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => leave(), item.duration ?? (item.tone === 'error' ? 6000 : 4000));
  }, [item.duration, item.tone, leave]);

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: ms(280), easing: ease.arrive, useNativeDriver: false }).start();
    arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [arm, enter]);

  // Arrastar para o lado dispensa; enquanto o dedo está no toast, o tempo para.
  // Tudo no driver JS: o PanResponder não roda no nativo e os valores se misturam no estilo.
  const pan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => pause(),
        onPanResponderMove: Animated.event([null, { dx }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) > 90 || Math.abs(g.vx) > 0.6) leave(g.dx > 0 ? 420 : -420);
          else {
            Animated.spring(dx, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
            arm();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dx, { toValue: 0, useNativeDriver: false }).start();
          arm();
        },
      }),
    [arm, dx, leave, pause],
  );

  const tone = item.tone ?? 'info';
  const iconName = tone === 'success' ? 'check' : tone === 'error' ? 'alert-circle' : 'info';
  const iconColor = tone === 'success' ? k.successInk : tone === 'error' ? k.danger : k.accentInk;
  const iconBg = tone === 'success' ? k.successSoft : tone === 'error' ? k.dangerSoft : k.accentSoft;

  return (
    <Animated.View
      {...pan.panHandlers}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={[
        s.toast,
        {
          opacity: Animated.multiply(enter, dx.interpolate({ inputRange: [-240, 0, 240], outputRange: [0.2, 1, 0.2] })),
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { translateX: dx }],
        },
      ]}
    >
      <View style={[s.icon, { backgroundColor: iconBg }]}>
        {item.celebrate ? <Burst /> : null}
        <Feather name={iconName} size={16} color={iconColor} />
      </View>
      <View style={s.text}>
        <Text style={s.title} numberOfLines={1}>
          {item.title}
        </Text>
        {item.body ? (
          <Text style={s.body} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
      </View>
      {item.action ? (
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          onPress={() => {
            item.action?.onPress();
            leave();
          }}
          style={({ pressed }) => [s.action, pressed && { backgroundColor: k.sunken }]}
        >
          <Text style={s.actionLabel}>{item.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const SPARKS = [COLORS.amarelo.bg, COLORS.coral.bg, COLORS.lima.bg, COLORS.rosa.bg, COLORS.azul.bg, COLORS.roxo.bg, COLORS.amarelo.bg, COLORS.verde.bg];

/**
 * A pequena festa do ponto alto: oito pontos nas cores das playlists saem do ícone e somem.
 * Dura menos de um segundo e não aparece para quem pediu menos movimento.
 */
function Burst() {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion()) return;
    Animated.timing(t, { toValue: 1, duration: 720, delay: 160, easing: ease.arrive, useNativeDriver: true }).start();
  }, [t]);
  if (reduceMotion()) return null;
  return (
    <View pointerEvents="none" style={styles.burst}>
      {SPARKS.map((color, i) => {
        const angle = (i / SPARKS.length) * Math.PI * 2 - Math.PI / 2;
        const reach = i % 2 ? 28 : 40;
        return (
          <Animated.View
            key={i}
            style={[
              styles.spark,
              {
                backgroundColor: color,
                opacity: t.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * reach] }) },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * reach] }) },
                  { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.6] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { justifyContent: 'flex-end', paddingHorizontal: space[4], gap: space[2] },
  burst: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', width: 8, height: 8, borderRadius: radius.full },
});

const makeStyles = (c: Palette, k: Palette) =>
  StyleSheet.create({
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[3],
      paddingLeft: space[3],
      paddingRight: space[2],
      minHeight: 56,
      borderRadius: radius.xl,
      backgroundColor: c.inverse,
      boxShadow: c.shadow2,
    },
    icon: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, gap: 0 },
    title: { ...text.bodyBold, color: k.ink },
    body: { ...text.caption, color: k.muted },
    action: { paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.full },
    actionLabel: { ...text.bodyBold, color: k.accentInk },
  });
