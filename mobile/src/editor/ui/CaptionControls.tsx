import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { clock as fmtClock } from '../../format';
import { CAPTION_LOOKS, isFree, lookOf } from '../captionLayout';
import { MOTIONS } from '../captionMotion';
import type { CaptionMotion, CaptionStyle, Cue } from '../types';
import { Chip, Row, ui } from './kit';
import { E } from './palette';
import { TextVisual } from './TextVisual';

/** Aplica um estilo pronto mantendo a fonte escolhida, a não ser que o estilo traga a dele. */
export function applyLook(style: CaptionStyle, id: string): CaptionStyle {
  const look = CAPTION_LOOKS.find((l) => l.id === id);
  return look ? { ...style, ...look.style, font: look.style.font ?? style.font } : style;
}

/** Cartões com cada estilo pronto desenhado de verdade (mesma letra e fundo do vídeo). */
export function LookPicker({ style, onPick }: { style: CaptionStyle; onPick: (s: CaptionStyle) => void }) {
  const current = lookOf(style);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.looks}>
      {CAPTION_LOOKS.map((l) => {
        const st = applyLook(style, l.id);
        const active = current === l.id;
        return (
          <Pressable
            key={l.id}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onPick(st);
            }}
            style={[styles.look, active && styles.lookOn]}
            accessibilityRole="button"
            accessibilityLabel={`Estilo ${l.label}`}
            accessibilityState={{ selected: active }}
          >
            <View style={styles.lookStage}>
              <TextVisual text="Legenda" style={{ ...st, align: 'center' }} fontSize={15} maxWidth={96} uppercase={st.uppercase} />
            </View>
            <Text style={[styles.lookLabel, active && { color: E.ink }]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const MOTION_ICONS: Record<CaptionMotion, keyof typeof Feather.glyphMap> = {
  none: 'minus',
  fade: 'sunrise',
  rise: 'arrow-up',
  pop: 'zap',
  words: 'align-left',
  karaoke: 'mic',
  single: 'type',
};

export function MotionPicker({ value, onPick }: { value: CaptionMotion | undefined; onPick: (m: CaptionMotion) => void }) {
  return (
    <Row scroll>
      {MOTIONS.map((m) => (
        <Chip key={m.id} icon={MOTION_ICONS[m.id]} label={m.label} active={(value ?? 'none') === m.id} onPress={() => onPick(m.id)} />
      ))}
    </Row>
  );
}

/** Em cima, no meio, embaixo, ou onde a pessoa arrastou. */
export function PositionPicker({ style, onChange }: { style: CaptionStyle; onChange: (s: CaptionStyle) => void }) {
  const free = isFree(style);
  const preset = (position: CaptionStyle['position']) => {
    const { x: _x, y: _y, ...rest } = style;
    onChange({ ...rest, position });
  };
  return (
    <>
      <Row scroll>
        <Chip label="Em cima" active={!free && style.position === 'top'} onPress={() => preset('top')} />
        <Chip label="No meio" active={!free && style.position === 'middle'} onPress={() => preset('middle')} />
        <Chip label="Embaixo" active={!free && style.position === 'bottom'} onPress={() => preset('bottom')} />
        {free ? <Chip icon="move" label="Arrastada" active onPress={() => {}} /> : null}
        {free && style.x !== 0.5 ? <Chip icon="align-center" label="Centralizar" onPress={() => onChange({ ...style, x: 0.5 })} /> : null}
      </Row>
      <Text style={[ui.body, styles.hint]}>Arraste a legenda na prévia para pôr onde quiser; as linhas rosa mostram quando ela está no centro.</Text>
    </>
  );
}

/**
 * Lista das legendas para corrigir o texto, apagar ou criar novas no ponto atual do vídeo.
 * [offset] desloca os horários mostrados (no envio de trecho, conta a partir do início dele).
 */
export function CueList({
  cues,
  time,
  offset = 0,
  onSeek,
  onEdit,
  onEditStart,
  onEditEnd,
  onDelete,
  onAdd,
}: {
  cues: Cue[];
  time: number;
  offset?: number;
  onSeek: (t: number) => void;
  onEdit: (index: number, text: string) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={onAdd} style={styles.add} accessibilityRole="button">
        <Feather name="plus" size={16} color={E.accent} />
        <Text style={styles.addText}>Nova legenda em {fmtClock(Math.max(0, time - offset))}</Text>
      </Pressable>
      {!cues.length ? <Text style={[ui.body, styles.hint]}>Nenhuma legenda ainda. Toque em play, pare onde quer o texto e adicione.</Text> : null}
      {cues.map((c, i) => {
        const now = time >= c.start && time < c.end;
        return (
          <View key={`${i}-${c.start}`} style={[styles.cue, now && styles.cueNow]}>
            <Pressable onPress={() => onSeek(c.start)} style={styles.cueTime} accessibilityLabel={`Ir para ${fmtClock(c.start - offset)}`}>
              <Text style={styles.cueTimeText}>{fmtClock(Math.max(0, c.start - offset))}</Text>
            </Pressable>
            <TextInput
              value={c.text}
              onChangeText={(t) => onEdit(i, t)}
              onFocus={onEditStart}
              onBlur={onEditEnd}
              multiline
              placeholder="Escreva a legenda"
              placeholderTextColor={E.faint}
              selectionColor={E.accent}
              style={styles.cueInput}
            />
            <Pressable onPress={() => onDelete(i)} hitSlop={8} style={styles.cueDel} accessibilityLabel="Apagar legenda">
              <Feather name="trash-2" size={16} color={E.muted} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  looks: { gap: 10, paddingVertical: 2, paddingRight: 8 },
  look: { width: 108, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', backgroundColor: E.raised },
  lookOn: { borderColor: E.accent },
  lookStage: { height: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3B4252', borderBottomWidth: 1, borderBottomColor: E.line },
  lookLabel: { fontFamily: 'Archivo_600SemiBold', fontSize: 12, color: E.muted, textAlign: 'center', paddingVertical: 6 },
  hint: { color: E.faint, fontSize: 12, marginTop: 6 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: E.accentSoft },
  addText: { fontFamily: 'Archivo_600SemiBold', fontSize: 14, color: E.ink },
  cue: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 8, borderRadius: 12, backgroundColor: E.raised, borderWidth: 1, borderColor: 'transparent' },
  cueNow: { borderColor: E.accent },
  cueTime: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: E.raised2 },
  cueTimeText: { fontFamily: 'Archivo_600SemiBold', fontSize: 12, color: E.ink, fontVariant: ['tabular-nums'] },
  cueInput: { flex: 1, minHeight: 34, color: E.ink, fontFamily: 'Archivo_500Medium', fontSize: 15, paddingVertical: 4 },
  cueDel: { padding: 6 },
});
