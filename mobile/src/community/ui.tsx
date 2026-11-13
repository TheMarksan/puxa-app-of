import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button, Press } from '../components/Button';
import { Overline } from '../components/ui';
import { listSoft } from '../playlist/colors';
import { useFolders } from '../stickers/folders';
import { control, hit, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { ART } from './art';
import { compact } from './core';
import { imgSource } from './images';
import { installedCount } from './install';
import { useDB } from './store';
import type { Category, Img, Pack, Sticker, User } from './types';

/**
 * As peças do acervo, no tom dos apps de mídia: capas pequenas sobre um quadrado neutro (a borda
 * branca da figurinha aparece sobre ele), categorias em círculos, pacotes em linhas de 56. O
 * colorido vem das figurinhas; a cor da categoria entra só como um véu.
 */

// ---------- Pessoa ----------

export type AvatarSize = 32 | 40 | 48 | 64 | 96;

export function Avatar({ user, size, ring }: { user: Pick<User, 'name' | 'avatar'> | null; size: AvatarSize; ring?: string }) {
  const c = usePalette();
  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const style = { width: size, height: size, borderRadius: radius.full, borderWidth: ring ? 4 : 0, borderColor: ring };
  if (user?.avatar) return <Image source={imgSource(user.avatar)} style={[style, { backgroundColor: c.sunken }]} resizeMethod="resize" accessibilityIgnoresInvertColors />;
  return (
    <View style={[style, styles.center, { backgroundColor: c.accentSoft }]}>
      <Text style={[size >= 64 ? text.title : size >= 40 ? text.bodyBold : text.captionBold, { color: c.accentInk }]}>{initials}</Text>
    </View>
  );
}

/** Nome com o selo de verificada (contas oficiais). */
export function UserName({ user, style, numberOfLines = 1, size = 'body' }: { user: Pick<User, 'name' | 'verified'>; style: StyleProp<ViewStyle>; numberOfLines?: number; size?: 'body' | 'title' }) {
  const c = usePalette();
  return (
    <View style={[styles.nameRow, style]}>
      <Text style={[size === 'title' ? text.title : text.bodyBold, styles.shrink, { color: c.ink }]} numberOfLines={numberOfLines}>
        {user.name}
      </Text>
      {user.verified ? <Feather name="check-circle" size={size === 'title' ? 20 : 16} color={c.accentInk} accessibilityLabel="Conta verificada" /> : null}
    </View>
  );
}

export function FollowButton({ following, onPress, size = 'sm', tone = 'accent' }: { following: boolean; onPress: () => void; size?: 'sm' | 'md'; tone?: 'accent' | 'soft' }) {
  return following ? (
    <Button size={size} tone="neutral" icon="check" label="Seguindo" onPress={onPress} accessibilityLabel="Seguindo. Toque para deixar de seguir" />
  ) : (
    <Button size={size} tone={tone} icon="user-plus" label="Seguir" onPress={onPress} />
  );
}

// ---------- Figurinhas ----------

/**
 * A figurinha na medida em que aparece: "resize" decodifica do tamanho da peça, e não os
 * 512x512 inteiros (cem figurinhas no Início seriam mais de 100 MB de imagem na memória).
 */
export function StickerImage({ img, size }: { img: Img; size: number }) {
  return <Image source={imgSource(img)} style={{ width: size, height: size }} resizeMode="contain" resizeMethod="resize" fadeDuration={0} accessibilityIgnoresInvertColors />;
}

/** Nas listas, a animada aparece parada (o primeiro quadro): dezenas de animações juntas travam a tela. Anima no pacote e na prévia. */
export const still = (s: Sticker): Img => s.poster ?? s.img;

/**
 * A capa de um pacote: a primeira figurinha (parada) sobre um quadrado neutro. Uma figurinha só,
 * e não o pacote inteiro: nas listas a peça é pequena e o colorido vem das próprias figurinhas.
 */
export function PackThumb({ pack, size }: { pack: Pack; size: number }) {
  const c = usePalette();
  const first = pack.stickers[0];
  return <View style={[styles.thumb, size > 64 ? styles.thumbLarge : styles.thumbSmall, { width: size, height: size, backgroundColor: c.sunken }]}>{/* Pequena, a figurinha ocupa quase tudo para ser lida; grande, sobra mais margem e a capa fica calma */}
      {first ? <StickerImage img={still(first)} size={Math.round(size * (size > 64 ? 0.62 : 0.78))} /> : null}</View>;
}

/** Grade de figurinhas que se toca uma a uma (abre a prévia). [animate] só na tela do pacote. */
export function StickerGrid({ items, width, columns = 4, animate = false, onPress }: { items: { sticker: Sticker; pack: Pack }[]; width: number; columns?: number; animate?: boolean; onPress: (sticker: Sticker, pack: Pack) => void }) {
  const c = usePalette();
  const cell = Math.floor((width - space[2] * (columns - 1)) / columns);
  return (
    <View style={styles.grid}>
      {items.map(({ sticker, pack }) => (
        <Pressable
          key={sticker.id}
          onPress={() => onPress(sticker, pack)}
          style={({ pressed }) => [styles.cell, { width: cell, height: cell, backgroundColor: c.sunken }, pressed && { opacity: 0.72 }]}
          accessibilityRole="button"
          accessibilityLabel={`Figurinha ${sticker.tags.slice(0, 2).join(' ')} do pacote ${pack.name}`}
        >
          <StickerImage img={animate ? sticker.img : still(sticker)} size={cell - space[2] * 2} />
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Pacotes ----------

const authorOf = (users: User[], pack: Pack) => users.find((u) => u.id === pack.author);

/** Instalado inteiro (todas as figurinhas na pasta do pacote). */
export function useInstalled(pack: Pack): boolean {
  const folders = useFolders();
  useDB();
  return installedCount(pack, folders) >= pack.stickers.length;
}

type AddProps = { pack: Pack; busy: boolean; onAdd: () => void };

/** O botão redondo de adicionar o pacote ao WhatsApp (vira um visto quando já está). */
export function AddButton({ pack, busy, onAdd }: AddProps) {
  const c = usePalette();
  const done = useInstalled(pack);
  return (
    <Press
      onPress={onAdd}
      disabled={busy}
      scaleTo={0.92}
      hitSlop={hit(control.sm)}
      accessibilityRole="button"
      accessibilityLabel={done ? `${pack.name} já está no WhatsApp. Abrir de novo` : `Adicionar ${pack.name} ao WhatsApp`}
      accessibilityState={{ busy }}
    >
      {(pressed) => (
        <View style={[styles.round, { backgroundColor: done ? c.successSoft : pressed ? c.accentLine : c.accentSoft }]}>
          {busy ? <ActivityIndicator size="small" color={c.accentInk} /> : <Feather name={done ? 'check' : 'plus'} size={20} color={done ? c.successInk : c.accentInk} />}
        </View>
      )}
    </Press>
  );
}

/**
 * Um pacote numa lista, como uma música num app de música: a capa de 56, o nome, de quem é e o
 * tamanho, e o + no fim da linha. A linha inteira abre o pacote.
 */
export function PackRow({ pack, busy, onAdd }: Omit<AddProps, 'pack'> & { pack: Pack }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const db = useDB();
  const author = authorOf(db.users, pack);
  const size = `${pack.stickers.length} ${pack.animated ? 'animadas' : 'figurinhas'}`;
  return (
    <View style={s.row}>
      <Pressable
        onPress={() => router.push(`/pacote/${pack.id}`)}
        style={({ pressed }) => [s.rowMain, pressed && { opacity: 0.72 }]}
        accessibilityRole="button"
        accessibilityLabel={`Pacote ${pack.name}, de ${author?.name ?? 'alguém'}, ${size}, ${compact(pack.downloads)} adições no WhatsApp`}
      >
        <PackThumb pack={pack} size={56} />
        <View style={s.rowText}>
          <Text style={s.packName} numberOfLines={1}>
            {pack.name}
          </Text>
          <View style={s.metaRow}>
            <Text style={s.metaShrink} numberOfLines={1}>
              @{author?.username ?? 'alguem'} · {size} ·
            </Text>
            <AddCount n={pack.downloads} />
          </View>
        </View>
      </Pressable>
      <AddButton pack={pack} busy={busy} onAdd={onAdd} />
    </View>
  );
}

/** Uma lista de pacotes em linhas, com o + de cada um. */
export function PackRows({ packs, busy, onAdd }: { packs: Pack[]; busy: string | null; onAdd: (pack: Pack) => void }) {
  return (
    <View style={styles.rows}>
      {packs.map((p) => (
        <PackRow key={p.id} pack={p} busy={busy === p.id} onAdd={() => onAdd(p)} />
      ))}
    </View>
  );
}

/** Quantas vezes o pacote foi posto no WhatsApp: a setinha de baixar diz o que é o número. */
function AddCount({ n }: { n: number }) {
  const c = usePalette();
  return (
    <View style={styles.adds} accessible accessibilityLabel={`${compact(n)} adições no WhatsApp`}>
      <Feather name="download" size={12} color={c.muted} />
      <Text style={[text.caption, tabular, { color: c.muted }]}>{compact(n)}</Text>
    </View>
  );
}

/** Lado da capa nos carrosséis: cabem dois e meio na tela, e a meia peça diz que dá para arrastar. */
export const TILE = 120;

/** Um pacote num carrossel: a capa, o nome e de quem é, em letra pequena. */
export function PackTile({ pack }: { pack: Pack }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const db = useDB();
  const author = authorOf(db.users, pack);
  return (
    <Pressable
      onPress={() => router.push(`/pacote/${pack.id}`)}
      style={({ pressed }) => [{ width: TILE }, pressed && { opacity: 0.72 }]}
      accessibilityRole="button"
      accessibilityLabel={`${pack.name}, de ${author?.name ?? 'alguém'}${pack.animated ? ', animadas' : ''}`}
    >
      <PackThumb pack={pack} size={TILE} />
      <Text style={s.tileName} numberOfLines={1}>
        {pack.name}
      </Text>
      <Text style={s.tileMeta} numberOfLines={1}>
        {pack.animated ? 'Animadas · ' : ''}@{author?.username ?? 'alguem'}
      </Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'success' }) {
  const c = usePalette();
  return (
    <View style={[styles.badge, { backgroundColor: tone === 'success' ? c.successSoft : c.accentSoft }]}>
      <Text style={[text.captionBold, styles.badgeText, { color: tone === 'success' ? c.successInk : c.accentInk }]}>{label}</Text>
    </View>
  );
}

// ---------- Categorias ----------

/** Lado do círculo de uma categoria. */
export const CIRCLE = 64;

/** A figurinha da categoria num círculo com um véu da cor dela (a cor cheia fica só no detalhe). */
export function CategoryArt({ category, size, bg }: { category: Category; size: number; bg?: string }) {
  const c = usePalette();
  return (
    <View style={[styles.circle, { width: size, height: size, backgroundColor: bg ?? listSoft(category.color, c.dark) }]}>
      <Image source={ART[category.cover]} style={{ width: Math.round(size * 0.68), height: Math.round(size * 0.68) }} resizeMode="contain" resizeMethod="resize" accessibilityIgnoresInvertColors />
    </View>
  );
}

/** Uma categoria no trilho do Início: o círculo e o nome embaixo, como os destaques de um perfil. */
export function CategoryCircle({ category }: { category: Category }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/categoria/${category.id}`)} style={({ pressed }) => [s.circleItem, pressed && { opacity: 0.72 }]} accessibilityRole="button" accessibilityLabel={`Categoria ${category.name}`}>
      <CategoryArt category={category} size={CIRCLE} />
      <Text style={s.circleLabel} numberOfLines={1}>
        {category.name}
      </Text>
    </Pressable>
  );
}

/** O primeiro círculo do trilho: criar a sua figurinha com foto ou vídeo do celular. */
export function CreateCircle({ onPress, busy }: { onPress: () => void; busy?: boolean }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [s.circleItem, pressed && { opacity: 0.72 }]}
      accessibilityRole="button"
      accessibilityLabel="Criar figurinha com foto ou vídeo do celular"
      accessibilityState={{ busy }}
    >
      <View style={[styles.circle, s.createCircle]}>{busy ? <ActivityIndicator size="small" color={c.accentInk} /> : <Feather name="plus" size={24} color={c.accentInk} />}</View>
      <Text style={s.circleLabel} numberOfLines={1}>
        Criar a sua
      </Text>
    </Pressable>
  );
}

// ---------- Seções ----------

export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = usePalette();
  return (
    <View style={styles.sectionHead}>
      <Overline>{title}</Overline>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={space[3]} accessibilityRole="button">
          <Text style={[text.captionBold, { color: c.accentInk }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Bloco cinza do esqueleto (enquanto a "rede" responde). */
export function Bone({ width, height, round }: { width: number | `${number}%`; height: number; round?: boolean }) {
  const c = usePalette();
  return <View style={[{ width, height, backgroundColor: c.sunken }, round ? styles.boneRound : styles.bone]} />;
}

/** Esqueleto de uma lista de pacotes (as linhas de 56). */
export function PackRowsSkeleton({ rows = 3 }: { rows?: number }) {
  const [list] = useState(() => Array.from({ length: rows }, (_, i) => i));
  return (
    <View style={styles.rows} accessibilityLabel="Carregando" accessibilityRole="progressbar">
      {list.map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Bone width={56} height={56} />
          <View style={styles.skeletonText}>
            <Bone width="56%" height={16} />
            <Bone width="36%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Stat({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  const c = usePalette();
  const body = (
    <>
      <Text style={[text.bodyBold, tabular, { color: c.ink }]}>{value}</Text>
      <Text style={[text.caption, { color: c.muted }]}>{label}</Text>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={space[2]} style={({ pressed }) => [styles.stat, pressed && { opacity: 0.72 }]} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  shrink: { flexShrink: 1 },
  thumb: { alignItems: 'center', justifyContent: 'center' },
  thumbSmall: { borderRadius: radius.md },
  thumbLarge: { borderRadius: radius.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  rows: { gap: space[2] },
  adds: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  cell: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  round: { width: control.sm, height: control.sm, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  circle: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: { height: 24, paddingHorizontal: space[2], borderRadius: radius.full, justifyContent: 'center' },
  badgeText: { lineHeight: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[1] },
  skeletonText: { flex: 1, gap: space[2] },
  // Colunas iguais: os números começam a cada quarto da linha, e não espalhados pelo tamanho do rótulo
  stat: { flex: 1, alignItems: 'flex-start' },
  bone: { borderRadius: radius.md },
  boneRound: { borderRadius: radius.full },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    // Linha de 72: 8 em cima e embaixo da capa de 56
    row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 72 },
    rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
    rowText: { flex: 1, minWidth: 0, gap: space[1] },
    packName: { ...text.bodyBold, color: c.ink },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    metaShrink: { ...text.caption, ...tabular, color: c.muted, flexShrink: 1 },
    tileName: { ...text.captionBold, color: c.ink, marginTop: space[2] },
    tileMeta: { ...text.caption, color: c.muted },
    // 72 de largura para o nome caber embaixo do círculo de 64
    circleItem: { width: CIRCLE + space[2], alignItems: 'center', gap: space[2] },
    circleLabel: { ...text.caption, color: c.ink, textAlign: 'center' },
    createCircle: { width: CIRCLE, height: CIRCLE, backgroundColor: c.accentSoft },
  });
