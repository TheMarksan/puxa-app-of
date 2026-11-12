import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { clamp } from '../timeline';
import { E } from './palette';

/**
 * Para VideoView: no navegador o <video> ignora left/right/top/bottom = 0 e fica no tamanho
 * natural; largura e altura explícitas funcionam nas duas plataformas.
 */
export const videoFill: ViewStyle = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' };

export const ui = {
  label: { fontFamily: 'Archivo_600SemiBold', fontSize: 12, color: E.muted, letterSpacing: 0.3 } as const,
  body: { fontFamily: 'Archivo_400Regular', fontSize: 14, color: E.ink, lineHeight: 20 } as const,
  title: { fontFamily: 'Archivo_700Bold', fontSize: 16, color: E.ink } as const,
};

export function Section({ label, children, right }: { label: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={ui.label}>{label.toUpperCase()}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  detail,
  disabled,
  style,
  fontFamily,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  detail?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fontFamily?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!active) Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && !active && { backgroundColor: E.raised2 }, disabled && { opacity: 0.4 }, style]}
    >
      {icon ? <Feather name={icon} size={15} color={active ? '#fff' : E.ink} /> : null}
      <Text style={[styles.chipText, fontFamily ? { fontFamily, fontSize: 15 } : null, active && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? <Text style={[styles.chipDetail, active && { color: 'rgba(255,255,255,0.75)' }]}>{detail}</Text> : null}
    </Pressable>
  );
}

export function Row({ children, scroll }: { children: ReactNode; scroll?: boolean }) {
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.row, { flexWrap: 'wrap' }]}>{children}</View>;
}

/**
 * Controle deslizante: arrastar ajusta ao vivo (live = true) e soltar confirma.
 * [marks] destaca valores especiais (1×, 100%) com um "ímã".
 */
export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onStart,
  onEnd,
  format,
  marks = [],
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  format?: (v: number) => string;
  marks?: number[];
}) {
  const [w, setW] = useState(0);
  const live = useRef({ value, min, max, step, onChange, onStart, onEnd, marks, w });
  useEffect(() => {
    live.current = { value, min, max, step, onChange, onStart, onEnd, marks, w };
  });
  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let x0 = 0;
    let lastMark: number | null = null;
    const set = (x: number) => {
      const r = live.current;
      if (r.w <= 0) return;
      let v = r.min + clamp(x / r.w, 0, 1) * (r.max - r.min);
      v = Math.round(v / r.step) * r.step;
      const mark = r.marks.find((m) => Math.abs(m - v) <= (r.max - r.min) * 0.025);
      if (mark != null) v = mark;
      if (mark != null && mark !== lastMark) Haptics.selectionAsync().catch(() => {});
      lastMark = mark ?? null;
      r.onChange(clamp(v, r.min, r.max));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        live.current.onStart?.();
        x0 = e.nativeEvent.locationX;
        set(x0);
      },
      onPanResponderMove: (_, g) => set(x0 + g.dx),
      onPanResponderRelease: () => live.current.onEnd?.(),
      onPanResponderTerminate: () => live.current.onEnd?.(),
    });
  });
  const f = (clamp(value, min, max) - min) / (max - min || 1);
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderHit} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...responder.panHandlers}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${f * 100}%` }]} />
        </View>
        {marks.map((m) => (
          <View key={m} pointerEvents="none" style={[styles.mark, { left: `${((m - min) / (max - min)) * 100}%` }]} />
        ))}
        <View pointerEvents="none" style={[styles.thumb, { left: Math.max(0, f * w - 11) }]} />
      </View>
      {format ? <Text style={styles.sliderValue}>{format(value)}</Text> : null}
    </View>
  );
}

export const SWATCHES = ['#FFFFFF', '#111318', '#FFD60A', '#FF4D4D', '#FF8A00', '#34C759', '#2EC4FF', '#4F6BFF', '#B26CFF', '#FF5FA2'];

export function Swatches({ value, onChange, colors = SWATCHES }: { value: string; onChange: (c: string) => void; colors?: string[] }) {
  const v = value.slice(0, 7).toUpperCase();
  return (
    <Row scroll>
      {colors.map((c) => (
        <Pressable
          key={c}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(c);
          }}
          accessibilityLabel={`Cor ${c}`}
          style={[styles.swatch, { backgroundColor: c }, v === c && styles.swatchOn]}
        />
      ))}
    </Row>
  );
}

export function Toggle({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1 }}>
        <Text style={ui.body}>{label}</Text>
        {detail ? <Text style={styles.toggleDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

export function PrimaryButton({ label, icon, onPress, busy, disabled, tone = 'accent' }: { label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: 'accent' | 'wa' | 'plain' }) {
  const bg = tone === 'wa' ? E.wa : tone === 'plain' ? E.raised2 : E.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primary, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}
    >
      {busy ? <ActivityIndicator color="#fff" size="small" /> : icon ? <Feather name={icon} size={18} color="#fff" /> : null}
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function Progress({ label, fraction }: { label: string; fraction: number | null }) {
  return (
    <View style={styles.progress}>
      <View style={styles.progressHead}>
        <ActivityIndicator size="small" color={E.accent} />
        <Text style={[ui.body, { flex: 1 }]} numberOfLines={2}>
          {label}
        </Text>
        {fraction != null ? <Text style={styles.sliderValue}>{Math.round(fraction * 100)}%</Text> : null}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: fraction == null ? '30%' : `${Math.max(2, fraction * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginBottom: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: E.raised,
    borderWidth: 1,
    borderColor: E.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: { backgroundColor: E.accent, borderColor: E.accent },
  chipText: { fontFamily: 'Archivo_600SemiBold', fontSize: 14, color: E.ink },
  chipDetail: { fontFamily: 'Archivo_400Regular', fontSize: 12, color: E.muted },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  sliderHit: { flex: 1, height: 36, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: E.lineStrong, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: E.accent },
  mark: { position: 'absolute', top: 12, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: E.muted },
  thumb: {
    position: 'absolute',
    top: 7,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  sliderValue: { minWidth: 48, textAlign: 'right', fontFamily: 'Archivo_600SemiBold', fontSize: 13, color: E.ink, fontVariant: ['tabular-nums'] },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: E.line },
  swatchOn: { borderColor: '#fff', transform: [{ scale: 1.12 }] },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  toggleDetail: { fontFamily: 'Archivo_400Regular', fontSize: 12, color: E.muted, marginTop: 2 },
  switch: { width: 46, height: 28, borderRadius: 14, backgroundColor: E.lineStrong, padding: 3 },
  switchOn: { backgroundColor: E.accent },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { transform: [{ translateX: 18 }] },
  primary: { minHeight: 50, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  primaryText: { fontFamily: 'Archivo_600SemiBold', fontSize: 16, color: '#fff' },
  progress: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: E.raised, borderWidth: 1, borderColor: E.line },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
