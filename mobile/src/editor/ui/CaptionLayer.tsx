import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { captionCenter, captionPlacement, clampCaptionX, clampCaptionY } from '../captionLayout';
import { frameAt, type CaptionFrame } from '../captionMotion';
import { sizeUnit } from '../timeline';
import type { CaptionStyle, Cue } from '../types';
import { E } from './palette';
import { TextVisual } from './TextVisual';

/** Linhas de centro, como no Canva: aparecem ao arrastar e acendem quando a peça encaixa. */
export type GuideState = { active: boolean; v: boolean; h: boolean };
export const NO_GUIDES: GuideState = { active: false, v: false, h: false };

export const GUIDE_COLOR = '#FF3DAE';

export function Guides({ state, cw, ch }: { state: GuideState; cw: number; ch: number }) {
  if (!state.active) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.v, { left: cw / 2 - 0.75 }, state.v ? styles.on : styles.off]} />
      <View style={[styles.h, { top: ch / 2 - 0.75 }, state.h ? styles.on : styles.off]} />
    </View>
  );
}

/** Ímã nas linhas de centro (até [px] pontos de distância). */
export function snapToCenter(x: number, y: number, cw: number, ch: number, px = 8): { x: number; y: number; v: boolean; h: boolean } {
  const v = Math.abs(x - 0.5) * cw < px;
  const h = Math.abs(y - 0.5) * ch < px;
  return { x: v ? 0.5 : x, y: h ? 0.5 : y, v, h };
}

type Props = {
  cue: Cue | null;
  /** Início da legenda seguinte (sem saída animada quando ela vem colada). */
  next?: number;
  time: number;
  style: CaptionStyle;
  cw: number;
  ch: number;
  selected?: boolean;
  onSelect?: () => void;
  onMoveStart?: () => void;
  /** Novo centro (frações do quadro) enquanto arrasta. */
  onMove?: (x: number, y: number) => void;
  onMoveEnd?: () => void;
  onGuides?: (g: GuideState) => void;
};

/**
 * A legenda do instante atual, com a animação escolhida, na mesma faixa e posição que o vídeo
 * final usa. Arrastar move a legenda (com ímã no centro); um toque só seleciona.
 */
export function CaptionLayer({ cue, next, time, style, cw, ch, selected, onSelect, onMoveStart, onMove, onMoveEnd, onGuides }: Props) {
  const pl = captionPlacement(style, cw, ch);
  const live = cue ? frameAt(cue, style.motion, time, { next, rise: ch * 0.04 }) : null;
  const [held, setHeld] = useState<CaptionFrame | null>(null);
  // Enquanto o dedo está na legenda, ela fica parada no quadro inteiro (não some se o vídeo andar)
  const frame = held ?? live;
  const boxH = useRef(0);
  const props = useRef({ style, cw, ch, frame: live, onSelect, onMoveStart, onMove, onMoveEnd, onGuides });
  useEffect(() => {
    props.current = { style, cw, ch, frame: live, onSelect, onMoveStart, onMove, onMoveEnd, onGuides };
  });

  // eslint-disable-next-line react-hooks/refs -- PanResponder.create só guarda os callbacks; os refs são lidos nos toques
  const [responder] = useState(() => {
    let origin = { x: 0.5, y: 0.8 };
    let moved = false;
    let snapped = { v: false, h: false };
    const end = () => {
      const r = props.current;
      setHeld(null);
      r.onGuides?.({ active: false, v: false, h: false });
      if (moved) r.onMoveEnd?.();
      else r.onSelect?.();
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const r = props.current;
        origin = captionCenter(r.style, boxH.current, r.cw, r.ch);
        moved = false;
        snapped = { v: false, h: false };
        if (r.frame) setHeld({ ...r.frame, opacity: 1, scale: 1, dy: 0 });
      },
      onPanResponderMove: (_, g) => {
        const r = props.current;
        if (!r.onMove) return;
        if (!moved && Math.hypot(g.dx, g.dy) < 4) return;
        if (!moved) {
          moved = true;
          r.onMoveStart?.();
        }
        const s = snapToCenter(clampCaptionX(origin.x + g.dx / r.cw), clampCaptionY(origin.y + g.dy / r.ch), r.cw, r.ch);
        if ((s.v && !snapped.v) || (s.h && !snapped.h)) Haptics.selectionAsync().catch(() => {});
        snapped = { v: s.v, h: s.h };
        r.onGuides?.({ active: true, v: s.v, h: s.h });
        r.onMove(s.x, s.y);
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  });

  if (!frame) return null;
  const fontSize = style.size * sizeUnit(cw, ch);
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: pl.x,
        top: pl.y,
        width: pl.width,
        height: pl.height,
        paddingVertical: pl.margin,
        alignItems: 'center',
        justifyContent: pl.valign === 'top' ? 'flex-start' : pl.valign === 'center' ? 'center' : 'flex-end',
      }}
    >
      <View
        {...responder.panHandlers}
        hitSlop={14}
        onLayout={(e) => {
          boxH.current = e.nativeEvent.layout.height;
        }}
        style={[{ opacity: frame.opacity, transform: [{ translateY: frame.dy }, { scale: frame.scale }] }, (selected || held) && styles.selected]}
      >
        <TextVisual
          text={frame.text}
          style={style}
          fontSize={fontSize}
          maxWidth={pl.maxWidth}
          uppercase={style.uppercase}
          highlight={frame.hl ? { range: frame.hl, color: style.highlight ?? '#FFD60A' } : null}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  v: { position: 'absolute', top: 0, bottom: 0, width: 1.5 },
  h: { position: 'absolute', left: 0, right: 0, height: 1.5 },
  on: { backgroundColor: GUIDE_COLOR },
  off: { backgroundColor: 'rgba(255,255,255,0.22)' },
  selected: { borderWidth: 1.5, borderColor: E.accent, borderStyle: 'dashed', borderRadius: 4 },
});
