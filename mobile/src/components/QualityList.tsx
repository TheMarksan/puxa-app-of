import Feather from '@expo/vector-icons/Feather';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { QualityOption } from '../../modules/puxa-engine';
import { bytes } from '../format';
import { control, type Palette, radius, space, tabular, text, usePalette } from '../theme';

type Props = {
  options: QualityOption[];
  value: string | null;
  onChange: (id: string) => void;
};

/** As qualidades de um formato: o nome, para que serve e quanto pesa. A escolhida fica marcada. */
export function QualityList({ options, value, onChange }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.list} accessibilityRole="radiogroup" accessibilityLabel="Qualidade">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={({ pressed }) => [s.row, active ? s.rowOn : pressed ? s.rowPressed : null]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={[o.label, o.note, bytes(o.size)].filter(Boolean).join(', ')}
          >
            <View style={s.names}>
              <Text style={[s.label, active && { color: c.accentInk }]} numberOfLines={1}>
                {o.label}
              </Text>
              {o.note ? (
                <Text style={s.note} numberOfLines={1}>
                  {o.note}
                </Text>
              ) : null}
            </View>
            <Text style={s.size}>{o.size ? bytes(o.size) : ''}</Text>
            <View style={[s.mark, active && { backgroundColor: c.accent }]}>{active ? <Feather name="check" size={16} color={c.onAccent} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: { gap: space[1] },
    row: { minHeight: control.lg, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.lg },
    rowOn: { backgroundColor: c.accentSoft },
    rowPressed: { backgroundColor: c.sunken },
    names: { flex: 1, minWidth: 0 },
    label: { ...text.bodyBold, ...tabular, color: c.ink },
    note: { ...text.caption, color: c.muted },
    size: { ...text.caption, ...tabular, color: c.muted },
    mark: { width: 24, height: 24, borderRadius: radius.full, backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' },
  });
