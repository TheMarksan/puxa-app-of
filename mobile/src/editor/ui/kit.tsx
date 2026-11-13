import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { clamp } from '../timeline';
import { E, SWATCHES } from './palette';
import { control, radius, space, tabular, text } from '../../theme';

export { SWATCHES };

/**
 * Para VideoView: no navegador o <video> ignora left/right/top/bottom = 0 e fica no tamanho
 * natural; largura e altura explícitas funcionam nas duas plataformas.
 */
export const videoFill: ViewStyle = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' };

export const ui = {
  label: { ...text.overline, color: E.muted } as const,
  body: { ...text.caption, color: E.ink } as const,
  title: { ...text.bodyBold, color: E.ink } as const,
};

export function Section({ label, children, right }: { label: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={ui.label}>{label}</Text>
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
      {icon ? <Feather name={icon} size={16} color={active ? E.onAccent : E.ink} /> : null}
      <Text style={[styles.chipText, fontFamily ? { ...text.body, fontFamily } : null, active && { color: E.onAccent }]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? <Text style={[styles.chipDetail, active && { color: E.onAccentSoft }]}>{detail}</Text> : null}
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
        <View pointerEvents="none" style={[styles.thumb, { left: Math.max(0, f * w - space[3]) }]} />
      </View>
      {format ? <Text style={styles.sliderValue}>{format(value)}</Text> : null}
    </View>
  );
}

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
      <View style={styles.toggleText}>
        <Text style={ui.body}>{label}</Text>
        {detail ? <Text style={styles.toggleDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

export function PrimaryButton({ label, icon, onPress, busy, disabled, tone = 'accent' }: { label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: 'accent' | 'plain' }) {
  const bg = tone === 'plain' ? E.raised2 : E.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primary, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.88 : 1 }]}
    >
      {busy ? <ActivityIndicator color={E.onAccent} size="small" /> : icon ? <Feather name={icon} size={20} color={E.onAccent} /> : null}
      <Text style={styles.primaryText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Progress({ label, fraction }: { label: string; fraction: number | null }) {
  return (
    <View style={styles.progress}>
      <View style={styles.progressHead}>
        <ActivityIndicator size="small" color={E.accent} />
        <Text style={[ui.body, styles.grow]} numberOfLines={2}>
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
  section: { gap: space[3], marginBottom: space[4] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: space[2], alignItems: 'center' },
  // Sem contorno: a peça se separa do painel pelo tom
  chip: { minHeight: control.sm, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: E.raised, flexDirection: 'row', alignItems: 'center', gap: space[2] },
  chipActive: { backgroundColor: E.accent },
  chipText: { ...text.captionBold, color: E.ink },
  chipDetail: { ...text.caption, color: E.muted },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  sliderHit: { flex: 1, height: control.sm, justifyContent: 'center' },
  track: { height: 4, borderRadius: radius.full, backgroundColor: E.lineStrong, overflow: 'hidden' },
  fill: { height: 4, borderRadius: radius.full, backgroundColor: E.accent },
  mark: { position: 'absolute', top: space[4] - space[1], width: 2, height: 12, marginLeft: -space[1], borderRadius: radius.full, backgroundColor: E.muted },
  thumb: { position: 'absolute', top: space[2], width: 24, height: 24, borderRadius: radius.full, backgroundColor: E.ink, boxShadow: E.knob },
  sliderValue: { ...text.captionBold, ...tabular, minWidth: 48, textAlign: 'right', color: E.ink },
  swatch: { width: 32, height: 32, borderRadius: radius.full, borderWidth: 2, borderColor: E.line },
  swatchOn: { borderColor: E.ink, transform: [{ scale: 1.12 }] },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: control.md, paddingVertical: space[2] },
  toggleText: { flex: 1 },
  toggleDetail: { ...text.caption, color: E.muted },
  switch: { width: 52, height: 32, borderRadius: radius.full, backgroundColor: E.lineStrong, padding: space[1] },
  switchOn: { backgroundColor: E.accent },
  knob: { width: 24, height: 24, borderRadius: radius.full, backgroundColor: E.ink },
  knobOn: { transform: [{ translateX: 20 }] },
  primary: { minHeight: control.md, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], paddingHorizontal: space[6] },
  primaryText: { ...text.bodyBold, color: E.onAccent },
  progress: { gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: E.raised },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  grow: { flex: 1 },
});
