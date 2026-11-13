import { FONT_IDS, FONTS } from '../fonts';
import type { Background, TextStyle } from '../types';
import { Chip, Row, Section, Slider, Swatches } from './kit';
import { CAPTION_BG } from './palette';

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
          onChange={(size) => onLive({ size })}
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
              onPress={() => onChange({ background: b.v, bgColor: b.v === 'outline' ? CAPTION_BG.outline : b.v === 'glow' ? CAPTION_BG.glow : solidBg(style.background) ? CAPTION_BG.band : style.bgColor })}
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
