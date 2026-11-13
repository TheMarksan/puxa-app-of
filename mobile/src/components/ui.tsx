import Feather from '@expo/vector-icons/Feather';
import type { ReactNode } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { control, hit, radius, space, tabular, text, usePalette } from '../theme';
import { Button, Press } from './Button';

const MARK = require('../../assets/mark.png');
const WORDMARK = require('../../assets/wordmark.png');
/** Largura do logotipo sobre a altura (vem do desenho). */
const WORDMARK_RATIO = 595 / 240;

/** O símbolo: o P com a perna virando seta. */
export function Mark({ size, color }: { size: number; color: string }) {
  return <Image source={MARK} style={{ width: size, height: size, tintColor: color }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/** Quanto a ponta da seta do P sai para a esquerda da haste (parte da altura). */
const WING = 310 / 1760;

/**
 * O logotipo PUXA, na cor pedida. Recuado para a esquerda o tanto da ponta da seta: assim a
 * haste do P, e não a ponta, alinha com o texto de baixo.
 */
export function Wordmark({ height, color }: { height: number; color: string }) {
  return (
    <Image
      source={WORDMARK}
      style={{ width: Math.round(height * WORDMARK_RATIO), height, tintColor: color, marginLeft: -Math.round(height * WING) }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Puxa"
      accessibilityIgnoresInvertColors
    />
  );
}

/** O símbolo dentro do bloco azul, como no ícone do app. */
export function AppMark({ size = 40 }: { size?: number }) {
  const c = usePalette();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', boxShadow: c.sheen }}>
      <Mark size={Math.round(size * 0.72)} color={c.onAccent} />
    </View>
  );
}

/**
 * Tocar ou pausar. O triângulo do play parece torto no centro exato do círculo: aqui ele vai um
 * tico para a direita (a única correção ótica do app, feita num lugar só).
 */
export function PlayIcon({ playing, size, color }: { playing: boolean; size: 12 | 16 | 20 | 24 | 32; color: string }) {
  return <Feather name={playing ? 'pause' : 'play'} size={size} color={color} style={playing ? null : { transform: [{ translateX: size / 12 }] }} />;
}

/** Nome de seção: pequeno, em maiúsculas, no tom de apoio. */
export function Overline({ children, style, nativeID }: { children: ReactNode; style?: StyleProp<TextStyle>; nativeID?: string }) {
  const c = usePalette();
  return (
    <Text style={[text.overline, { color: c.muted }, style]} nativeID={nativeID} accessibilityRole="header">
      {children}
    </Text>
  );
}

type IconButtonProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
  /** well: no poço (padrão). plain: só o ícone. media: sobre foto, vídeo ou cor forte. */
  tone?: 'well' | 'plain' | 'media';
  /** Cores próprias (por exemplo, a da playlist). */
  tint?: { bg: string; ink: string };
  size?: 40 | 48;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Botão redondo só com ícone. O toque sempre alcança 48, mesmo com o círculo de 40. */
export function IconButton({ icon, label, onPress, tone = 'well', tint, size = control.sm, disabled, style }: IconButtonProps) {
  const c = usePalette();
  const bg = tint?.bg ?? (tone === 'well' ? c.sunken : tone === 'media' ? c.mediaScrim : 'transparent');
  const ink = tint?.ink ?? (tone === 'media' ? c.onMedia : c.ink);
  return (
    <Press onPress={onPress} disabled={disabled} scaleTo={0.92} hitSlop={hit(size)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} containerStyle={style}>
      {(pressed) => (
        <View style={[styles.round, { width: size, height: size, backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.72 : 1 }]}>
          <Feather name={icon} size={20} color={ink} />
        </View>
      )}
    </Press>
  );
}

type EmptyProps = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  /** Cor do desenho (a da playlist, quando houver); sem ela, o azul claro. */
  tint?: { bg: string; ink: string };
  /** Desenho próprio no lugar do ícone (a capa da playlist, por exemplo). */
  art?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Tela vazia: um desenho simples, o que falta e o que fazer. O botão, quando tem, vem em `children`. */
export function EmptyState({ icon, title, body, tint, art, children, style }: EmptyProps) {
  const c = usePalette();
  const bg = tint?.bg ?? c.accentSoft;
  const ink = tint?.ink ?? c.accentInk;
  return (
    <View style={[styles.empty, style]}>
      {art ? (
        <View style={styles.emptyOwn}>{art}</View>
      ) : (
        <View style={styles.emptyArt}>
          <View style={[styles.emptyRing, { borderColor: bg }]} />
          <View style={[styles.emptyDisc, { backgroundColor: bg }]}>
            <Feather name={icon} size={32} color={ink} />
          </View>
        </View>
      )}
      <Text style={[text.title, styles.center, { color: c.ink }]}>{title}</Text>
      <Text style={[text.body, styles.center, { color: c.muted }]}>{body}</Text>
      {children ? <View style={styles.emptyAction}>{children}</View> : null}
    </View>
  );
}

/** Grupo de linhas: um bloco branco sobre o papel, sem contorno; as linhas se separam por um fio. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  return <View style={[styles.group, { backgroundColor: c.surface, boxShadow: c.shadow1 }, style]}>{children}</View>;
}

/** Fio entre as linhas de um grupo. */
export function Hairline({ inset = space[4] }: { inset?: number }) {
  const c = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.lineStrong, marginLeft: inset }} />;
}

/** Trabalho em andamento numa folha: o que está sendo feito, quanto falta e como parar. */
export function BusyCard({ label, fraction, onCancel }: { label: string; fraction: number | null; onCancel: () => void }) {
  const c = usePalette();
  return (
    <View style={styles.busy} accessibilityLiveRegion="polite">
      <View style={styles.busyHead}>
        <Text style={[text.bodyBold, styles.busyLabel, { color: c.ink }]} numberOfLines={1}>
          {label}
        </Text>
        {fraction == null ? <ActivityIndicator color={c.accentInk} /> : <Text style={[text.bodyBold, tabular, { color: c.ink }]}>{Math.round(fraction * 100)}%</Text>}
      </View>
      <View style={[styles.busyTrack, { backgroundColor: c.sunken }]}>
        <View style={[styles.busyFill, { width: fraction == null ? '35%' : `${Math.max(3, fraction * 100)}%`, backgroundColor: c.accent }]} />
      </View>
      <Button tone="neutral" size="md" label="Cancelar" onPress={onCancel} />
    </View>
  );
}

type SendRowProps = {
  label: string;
  onSend: () => void;
  onOther: () => void;
  /** Qual dos dois está em andamento. */
  busy?: 'send' | 'other' | null;
  disabled?: boolean;
};

/** Rodapé de envio: mandar no WhatsApp ocupa a largura; os outros apps ficam no botão redondo ao lado. */
export function SendRow({ label, onSend, onOther, busy, disabled }: SendRowProps) {
  const c = usePalette();
  return (
    <View style={styles.sendRow}>
      <Button whatsapp label={label} onPress={onSend} busy={busy === 'send'} disabled={disabled || busy === 'other'} style={styles.sendMain} />
      <Press onPress={onOther} disabled={disabled || !!busy} scaleTo={0.92} accessibilityRole="button" accessibilityLabel="Enviar por outros apps" accessibilityState={{ disabled: !!(disabled || busy), busy: busy === 'other' }}>
        {(pressed) => (
          <View style={[styles.sendOther, { backgroundColor: pressed ? c.lineStrong : c.sunken, opacity: disabled || busy === 'send' ? 0.4 : 1 }]}>
            {busy === 'other' ? <ActivityIndicator color={c.ink} size="small" /> : <Feather name="share-2" size={20} color={c.ink} />}
          </View>
        )}
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: space[6], paddingVertical: space[8], gap: space[2] },
  emptyArt: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: space[4] },
  emptyRing: { position: 'absolute', width: 128, height: 128, borderRadius: radius.full, borderWidth: 2 },
  emptyOwn: { marginBottom: space[4] },
  emptyDisc: { width: 88, height: 88, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  emptyAction: { marginTop: space[4], alignSelf: 'stretch', alignItems: 'center' },
  center: { textAlign: 'center' },
  group: { borderRadius: radius.xl, overflow: 'hidden' },
  busy: { gap: space[3] },
  busyHead: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 24 },
  busyLabel: { flex: 1 },
  busyTrack: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  busyFill: { height: 8, borderRadius: radius.full },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  sendMain: { flex: 1 },
  sendOther: { width: control.lg, height: control.lg, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
