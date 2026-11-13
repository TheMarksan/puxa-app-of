import { useMemo, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { control, type Palette, radius, space, tabular, text, usePalette } from '../theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
  /** Texto fixo antes do que se digita (o @ do nome de usuário). */
  prefix?: string;
  /** Linha de ajuda embaixo, quando não há erro. */
  hint?: string;
  /** Mostra quantos caracteres faltam (com [maxLength]). */
  counter?: boolean;
  right?: ReactNode;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

/**
 * Campo de formulário: o nome em cima (sempre visível, nunca só o texto de exemplo), o poço
 * onde se digita, e embaixo o erro (em vermelho, colado no campo) ou a ajuda.
 */
export function Field({ label, error, prefix, hint, counter, right, multiline, maxLength, value, ref, ...input }: Props) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const [focused, setFocused] = useState(false);
  const left = maxLength && value != null ? maxLength - value.length : null;
  return (
    <View style={s.root}>
      <Text style={s.label} nativeID={`campo-${label}`}>
        {label}
      </Text>
      <View style={[s.well, multiline && s.multi, focused && { borderColor: c.accent }, !!error && { borderColor: c.danger }]}>
        {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput
          {...input}
          ref={ref}
          value={value}
          maxLength={maxLength}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          placeholderTextColor={c.muted}
          selectionColor={c.accent}
          style={[s.input, multiline && s.inputMulti]}
          accessibilityLabel={label}
          accessibilityLabelledBy={`campo-${label}`}
        />
        {right}
      </View>
      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint || (counter && left != null) ? (
        <View style={s.foot}>
          <Text style={s.hint}>{hint ?? ''}</Text>
          {counter && left != null ? <Text style={s.hint}>{left}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { gap: space[2] },
    label: { ...text.captionBold, color: c.body },
    well: { flexDirection: 'row', alignItems: 'center', minHeight: control.lg, borderRadius: radius.lg, borderWidth: 2, borderColor: 'transparent', backgroundColor: c.sunken, paddingHorizontal: space[4], gap: space[1] },
    multi: { alignItems: 'flex-start', paddingVertical: space[3] },
    prefix: { ...text.body, color: c.muted },
    input: { ...text.body, flex: 1, minWidth: 0, color: c.ink, paddingVertical: 0, minHeight: control.lg - space[1] },
    inputMulti: { minHeight: 72, textAlignVertical: 'top' },
    error: { ...text.caption, color: c.danger },
    foot: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
    hint: { ...text.caption, ...tabular, color: c.muted },
  });
