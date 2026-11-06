import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { patchLayer } from '../../actions';
import { FONT_IDS, FONTS } from '../../fonts';
import { store } from '../../store';
import type { Background, FacecamLayer, ImageLayer, StickerLayer, TextLayer, TextStyle } from '../../types';
import { Chip, Row, Section, Slider, Swatches, Toggle, ui } from '../kit';
import { E } from '../palette';

const BACKGROUNDS: { v: Background; label: string }[] = [
  { v: 'shadow', label: 'Sombra' },
  { v: 'line', label: 'Faixa' },
  { v: 'box', label: 'Caixa' },
  { v: 'pill', label: 'Pílula' },
  { v: 'outline', label: 'Contorno' },
  { v: 'glow', label: 'Neon' },
  { v: 'none', label: 'Nenhum' },
];

/** Contorno e neon usam a cor sem transparência. */
const solidBg = (b: Background) => b === 'outline' || b === 'glow';

/** Editor de estilo usado por textos e legendas. */
export function StyleEditor({ style, onChange, onLive }: { style: TextStyle; onChange: (s: Partial<TextStyle>) => void; onLive: (s: Partial<TextStyle>) => void }) {
  const needsBg = style.background !== 'none' && style.background !== 'shadow';
  return (
    <>
      <Section label="Fonte">
        <Row scroll>
          {FONT_IDS.map((f) => (
            <Chip key={f} label={FONTS[f].label} fontFamily={FONTS[f].family} active={style.font === f} onPress={() => onChange({ font: f })} />
          ))}
        </Row>
      </Section>
      <Section label="Tamanho">
        <Slider
          value={style.size}
          min={0.03}
          max={0.16}
          step={0.002}
          format={(v) => `${Math.round(v * 1000)}`}
          onStart={() => store.checkpoint()}
          onChange={(size) => onLive({ size })}
          onEnd={() => store.settle()}
        />
      </Section>
      <Section label="Cor do texto">
        <Swatches value={style.color} onChange={(color) => onChange({ color })} />
      </Section>
      <Section label="Fundo">
        <Row scroll>
          {BACKGROUNDS.map((b) => (
            <Chip
              key={b.v}
              label={b.label}
              active={style.background === b.v}
              onPress={() => onChange({ background: b.v, bgColor: b.v === 'outline' ? '#000000FF' : b.v === 'glow' ? '#FF2BD6FF' : solidBg(style.background) ? '#000000B3' : style.bgColor })}
            />
          ))}
        </Row>
        {needsBg ? (
          <>
            <Swatches
              value={style.bgColor}
              onChange={(c) => onChange({ bgColor: c + (solidBg(style.background) ? 'FF' : style.bgColor.length === 9 ? style.bgColor.slice(7) : 'CC') })}
            />
            {!solidBg(style.background) ? (
              <Slider
                value={parseInt(style.bgColor.slice(7, 9) || 'CC', 16) / 255}
                min={0.2}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onStart={() => store.checkpoint()}
                onChange={(a) =>
                  onLive({
                    bgColor:
                      style.bgColor.slice(0, 7) +
                      Math.round(a * 255)
                        .toString(16)
                        .padStart(2, '0')
                        .toUpperCase(),
                  })
                }
                onEnd={() => store.settle()}
              />
            ) : null}
          </>
        ) : null}
      </Section>
      <Section label="Alinhamento">
        <Row>
          <Chip icon="align-left" label="Esquerda" active={style.align === 'left'} onPress={() => onChange({ align: 'left' })} />
          <Chip icon="align-center" label="Centro" active={style.align === 'center'} onPress={() => onChange({ align: 'center' })} />
          <Chip icon="align-right" label="Direita" active={style.align === 'right'} onPress={() => onChange({ align: 'right' })} />
        </Row>
      </Section>
    </>
  );
}

export function TextPanel({ layer }: { layer: TextLayer }) {
  const set = (s: Partial<TextStyle>, live = false) => patchLayer(layer.id, { style: { ...layer.style, ...s } } as Partial<TextLayer>, live);
  return (
    <>
      <Section label="Texto">
        <TextInput
          value={layer.text}
          onFocus={() => store.checkpoint()}
          onChangeText={(text) => patchLayer(layer.id, { text } as Partial<TextLayer>, true)}
          onBlur={() => store.settle()}
          multiline
          placeholder="Escreva aqui"
          placeholderTextColor={E.faint}
          selectionColor={E.accent}
          style={styles.input}
        />
      </Section>
      <StyleEditor style={layer.style} onChange={(s) => set(s)} onLive={(s) => set(s, true)} />
      <Toggle label="Entrar e sair suave" detail="Aparece e some em 0,25 s" value={layer.fade} onChange={(fade) => patchLayer(layer.id, { fade })} />
    </>
  );
}

export const EMOJIS = [
  '🔥', '😂', '😍', '🤯', '😎', '🥹', '😭', '🤔', '👏', '🙌', '👀', '💯',
  '❤️', '💙', '💚', '💛', '⭐', '✨', '⚡', '🎉', '🎵', '🎬', '📍', '📌',
  '👉', '👈', '👆', '👇', '✅', '❌', '⚠️', '💬', '🗣️', '📢', '🔔', '⏰',
  '🌅', '🌊', '🌴', '☀️', '🌙', '🍀', '🍕', '☕', '⚽', '🏆', '🚀', '💡',
];

export function StickerGrid({ onPick, current }: { onPick: (e: string) => void; current?: string }) {
  return (
    <View style={styles.grid}>
      {EMOJIS.map((e) => (
        <Pressable key={e} onPress={() => onPick(e)} style={({ pressed }) => [styles.cell, current === e && styles.cellOn, pressed && { backgroundColor: E.raised2 }]} accessibilityLabel={`Figurinha ${e}`}>
          <Text style={styles.emoji}>{e}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function StickerPanel({ layer }: { layer: StickerLayer }) {
  return (
    <>
      <Section label="Trocar figurinha">
        <StickerGrid current={layer.emoji} onPick={(emoji) => patchLayer(layer.id, { emoji } as Partial<StickerLayer>)} />
      </Section>
      <Toggle label="Entrar e sair suave" value={layer.fade} onChange={(fade) => patchLayer(layer.id, { fade })} />
    </>
  );
}

export function ImageLayerPanel({ layer }: { layer: ImageLayer }) {
  return (
    <>
      <Text style={[ui.body, { color: E.muted, marginBottom: 10 }]}>Arraste a imagem na prévia; com dois dedos, mude o tamanho e o ângulo.</Text>
      <Toggle label="Cantos arredondados" value={layer.rounded} onChange={(rounded) => patchLayer(layer.id, { rounded } as Partial<ImageLayer>)} />
      <Toggle label="Borda branca" value={layer.border} onChange={(border) => patchLayer(layer.id, { border } as Partial<ImageLayer>)} />
      <Toggle label="Entrar e sair suave" value={layer.fade} onChange={(fade) => patchLayer(layer.id, { fade })} />
    </>
  );
}

export function FacecamPanel({ layer }: { layer: FacecamLayer }) {
  const set = (p: Partial<FacecamLayer>, live = false) => patchLayer(layer.id, p, live);
  return (
    <>
      <Text style={[ui.body, { color: E.muted, marginBottom: 10 }]}>Arraste a facecam para qualquer lugar do vídeo; com dois dedos, mude o tamanho.</Text>
      <Section label="Formato">
        <Row>
          <Chip label="Círculo" active={layer.shape === 'circle'} onPress={() => set({ shape: 'circle' })} />
          <Chip label="Arredondado" active={layer.shape === 'rounded'} onPress={() => set({ shape: 'rounded' })} />
          <Chip label="Quadrado" active={layer.shape === 'square'} onPress={() => set({ shape: 'square' })} />
        </Row>
      </Section>
      <Section label="Tamanho">
        <Slider value={layer.scale} min={0.4} max={2.4} step={0.01} marks={[1]} format={(v) => `${Math.round(v * 100)}%`} onStart={() => store.checkpoint()} onChange={(scale) => set({ scale }, true)} onEnd={() => store.settle()} />
      </Section>
      <Section label="Posição rápida">
        <Row scroll>
          <Chip label="↖ Topo" onPress={() => set({ x: 0.22, y: 0.16 })} />
          <Chip label="↗ Topo" onPress={() => set({ x: 0.78, y: 0.16 })} />
          <Chip label="↙ Base" onPress={() => set({ x: 0.22, y: 0.8 })} />
          <Chip label="↘ Base" onPress={() => set({ x: 0.78, y: 0.8 })} />
          <Chip label="Centro" onPress={() => set({ x: 0.5, y: 0.5 })} />
        </Row>
      </Section>
      <Toggle label="Borda" value={layer.border} onChange={(border) => set({ border })} />
      {layer.border ? <Swatches value={layer.borderColor} onChange={(borderColor) => set({ borderColor })} /> : null}
      <Toggle label="Espelhar" detail="Como você se vê na câmera frontal" value={layer.mirror} onChange={(mirror) => set({ mirror })} />
      <Section label="Volume da sua voz">
        <Slider value={layer.volume} min={0} max={2} step={0.01} marks={[1]} format={(v) => `${Math.round(v * 100)}%`} onStart={() => store.checkpoint()} onChange={(volume) => set({ volume }, true)} onEnd={() => store.settle()} />
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 64,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: E.lineStrong,
    backgroundColor: E.raised,
    color: E.ink,
    fontFamily: 'Archivo_500Medium',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: E.raised },
  cellOn: { borderWidth: 2, borderColor: E.accent },
  emoji: { fontSize: 28 },
});
