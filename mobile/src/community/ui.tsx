import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button, Press } from '../components/Button';
import { Overline } from '../components/ui';
import { COLORS } from '../playlist/colors';
import { useFolders } from '../stickers/folders';
import { alpha, control, hit, type Palette, radius, space, tabular, text, usePalette } from '../theme';
import { ART } from './art';
import { compact } from './core';
import { imgSource } from './images';
import { installedCount } from './install';
import { CATEGORIES } from './seed';
import { useDB } from './store';
import type { Category, Img, Pack, Sticker, User } from './types';

/**
 * As peças do acervo. As figurinhas sempre aparecem sobre o fundo de conversa (o bege do
 * WhatsApp no claro, o verde-escuro no escuro): é assim que elas vão ser vistas, e a borda
 * branca delas some sobre o branco.
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

/** Fileira de figurinhas do pacote (as primeiras [count]) sobre o fundo de conversa. */
export function PackStrip({ pack, width, count = 5 }: { pack: Pack; width: number; count?: number }) {
  const c = usePalette();
  const cell = Math.floor((width - space[2] * 2 - space[1] * (count - 1)) / count);
  return (
    <View style={[styles.strip, { backgroundColor: c.chat, width }]}>
      {pack.stickers.slice(0, count).map((st) => (
        <StickerImage key={st.id} img={still(st)} size={cell} />
      ))}
    </View>
  );
}

/** Mosaico 2x2 do pacote (a capa nos carrosséis). */
export function PackMosaic({ pack, size }: { pack: Pack; size: number }) {
  const c = usePalette();
  const cell = (size - space[2] * 2 - space[1]) / 2;
  return (
    <View style={[styles.mosaic, { width: size, height: size, backgroundColor: c.chat }]}>
      {pack.stickers.slice(0, 4).map((st) => (
        <StickerImage key={st.id} img={still(st)} size={cell} />
      ))}
    </View>
  );
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
          style={({ pressed }) => [styles.cell, { width: cell, height: cell, backgroundColor: c.chat }, pressed && { opacity: 0.72 }]}
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

/** Um pacote numa lista: nome, de quem é, quantas e a fileira de figurinhas. */
export function PackRow({ pack, width, busy, onAdd }: { pack: Pack; width: number } & Omit<AddProps, 'pack'>) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const db = useDB();
  const author = authorOf(db.users, pack);
  return (
    <View style={s.row}>
      <View style={s.rowHead}>
        <Pressable onPress={() => router.push(`/pacote/${pack.id}`)} style={s.rowText} accessibilityRole="button" accessibilityLabel={`Pacote ${pack.name}, de ${author?.name ?? 'alguém'}, ${pack.stickers.length} figurinhas`}>
          <View style={s.titleLine}>
            <Text style={s.packName} numberOfLines={1}>
              {pack.name}
            </Text>
            {pack.animated ? <Badge label="Animadas" /> : null}
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaShrink} numberOfLines={1}>
              @{author?.username ?? 'alguem'} · {pack.stickers.length} figurinhas ·
            </Text>
            <AddCount n={pack.downloads} />
          </View>
        </Pressable>
        <AddButton pack={pack} busy={busy} onAdd={onAdd} />
      </View>
      <Pressable onPress={() => router.push(`/pacote/${pack.id}`)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <PackStrip pack={pack} width={width} />
      </Pressable>
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

/** Altura da figurinha da capa num cartão de [width]. */
const leadHeight = (width: number) => Math.round(width * 0.72);
/** Lado de cada uma das três miniaturas embaixo da capa. */
const thumbSide = (width: number) => Math.floor((width - space[1] * 2) / 3);

/**
 * Um pacote na grade de duas colunas: a figurinha da capa grande, mais três miniaturas embaixo,
 * o nome e uma linha que diz de quem é ([meta] "author", quando quem olha não sabe) ou o tamanho
 * do pacote ("counts", no perfil de quem fez). O + fica no canto da capa.
 */
export function PackCard({ pack, width, meta, busy, onAdd }: { pack: Pack; width: number; meta: 'author' | 'counts' } & Omit<AddProps, 'pack'>) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const db = useDB();
  const author = authorOf(db.users, pack);
  const lead = leadHeight(width);
  const thumb = thumbSide(width);
  const [first, ...rest] = pack.stickers;
  const count = `${pack.stickers.length} figurinhas`;
  return (
    <View style={{ width }}>
      <Pressable
        onPress={() => router.push(`/pacote/${pack.id}`)}
        style={({ pressed }) => pressed && { opacity: 0.72 }}
        accessibilityRole="button"
        accessibilityLabel={`Pacote ${pack.name}, de ${author?.name ?? 'alguém'}, ${count}${pack.animated ? ', animadas' : ''}, ${compact(pack.downloads)} adições no WhatsApp`}
      >
        <View style={[s.cardLead, { height: lead, backgroundColor: c.chat }]}>
          {first ? <StickerImage img={still(first)} size={lead - space[4] * 2} /> : null}
          {pack.animated ? (
            <View style={s.cardPlay}>
              <Feather name="play" size={12} color={c.onMedia} />
            </View>
          ) : null}
        </View>
        <View style={s.cardThumbs}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[s.cardThumb, { width: thumb, height: thumb, backgroundColor: c.chat }]}>
              {rest[i] ? <StickerImage img={still(rest[i])} size={thumb - space[2] * 2} /> : null}
            </View>
          ))}
        </View>
        {meta === 'author' ? (
          <View style={s.cardBy}>
            <Avatar user={author ?? null} size={32} />
            <View style={s.cardByText}>
              <Text style={s.packName} numberOfLines={1}>
                {pack.name}
              </Text>
              <Text style={s.packMeta} numberOfLines={1}>
                @{author?.username ?? 'alguem'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={s.cardText}>
            <Text style={s.packName} numberOfLines={1}>
              {pack.name}
            </Text>
            <View style={s.metaRow}>
              <Text style={s.metaShrink} numberOfLines={1}>
                {count} ·
              </Text>
              <AddCount n={pack.downloads} />
            </View>
          </View>
        )}
      </Pressable>
      <View style={[s.cardAdd, { top: lead - control.sm - space[2] }]}>
        <AddButton pack={pack} busy={busy} onAdd={onAdd} />
      </View>
    </View>
  );
}

/** A grade de pacotes em duas colunas, na largura útil [width]. */
export function PackCards({ packs, width, meta, busy, onAdd }: { packs: Pack[]; width: number; meta: 'author' | 'counts'; busy: string | null; onAdd: (pack: Pack) => void }) {
  const card = Math.floor((width - space[3]) / 2);
  return (
    <View style={styles.cards}>
      {packs.map((p) => (
        <PackCard key={p.id} pack={p} width={card} meta={meta} busy={busy === p.id} onAdd={() => onAdd(p)} />
      ))}
    </View>
  );
}

/** Um pacote num carrossel: o mosaico e o nome. [rank] numera o "em alta". */
export function PackTile({ pack, size = 152, rank }: { pack: Pack; size?: number; rank?: number }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const db = useDB();
  const author = authorOf(db.users, pack);
  return (
    <Pressable
      onPress={() => router.push(`/pacote/${pack.id}`)}
      style={({ pressed }) => [{ width: size }, pressed && { opacity: 0.72 }]}
      accessibilityRole="button"
      accessibilityLabel={`${rank ? `Número ${rank}: ` : ''}${pack.name}, de ${author?.name ?? 'alguém'}`}
    >
      <View>
        <PackMosaic pack={pack} size={size} />
        {rank ? (
          <View style={s.rank}>
            <Text style={s.rankText}>{rank}</Text>
          </View>
        ) : null}
        {pack.animated ? (
          <View style={s.play}>
            <Feather name="play" size={12} color={c.onMedia} />
          </View>
        ) : null}
      </View>
      <Text style={s.tileName} numberOfLines={1}>
        {pack.name}
      </Text>
      <Text style={s.packMeta} numberOfLines={1}>
        @{author?.username ?? 'alguem'}
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

/** O pacote em destaque, como um pôster na cor da categoria. */
export function FeaturedPoster({ pack }: { pack: Pack }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const db = useDB();
  const author = authorOf(db.users, pack);
  const cat = CATEGORIES.find((x) => x.id === pack.category) ?? CATEGORIES[0];
  const k = COLORS[cat.color];
  const shown = pack.stickers.slice(0, 3);
  return (
    <Pressable
      onPress={() => router.push(`/pacote/${pack.id}`)}
      style={({ pressed }) => [s.poster, { backgroundColor: k.bg }, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityLabel={`Em alta agora: ${pack.name}, de ${author?.name ?? 'alguém'}`}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {[1, 0.66, 0.36].map((f, i) => (
          <View key={i} style={[s.posterRing, { borderColor: alpha(k.ink, 0.1), width: 320 * f, height: 320 * f, right: -96 * f, top: -96 * f }]} />
        ))}
      </View>
      <View style={s.posterArt} pointerEvents="none">
        {shown.map((st, i) => (
          <View key={st.id} style={[s.posterSticker, { transform: [{ rotate: `${[-10, 8, -4][i]}deg` }], right: [space[16] + space[4], space[2], space[12]][i], top: [space[2], space[8], space[16] + space[6]][i] }]}>
            <StickerImage img={still(st)} size={96} />
          </View>
        ))}
      </View>
      <View style={s.posterText}>
        <Text style={[text.overline, { color: alpha(k.ink, 0.8) }]}>Em alta agora</Text>
        <Text style={[text.display, { color: k.ink }]} numberOfLines={2}>
          {pack.name}
        </Text>
        <Text style={[text.captionBold, tabular, { color: alpha(k.ink, 0.8) }]} numberOfLines={1}>
          @{author?.username ?? 'alguem'} · {compact(pack.downloads)} no WhatsApp
        </Text>
      </View>
    </Pressable>
  );
}

// ---------- Categorias ----------

export function CategoryTile({ category }: { category: Category }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const k = COLORS[category.color];
  return (
    <Pressable onPress={() => router.push(`/categoria/${category.id}`)} style={({ pressed }) => [s.cat, { backgroundColor: k.bg }, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel={`Categoria ${category.name}`}>
      <View style={s.catArt} pointerEvents="none">
        <Image source={ART[category.cover]} style={s.catImage} resizeMode="contain" resizeMethod="resize" accessibilityIgnoresInvertColors />
      </View>
      <Text style={[text.poster, { color: k.ink }]} numberOfLines={1}>
        {category.name}
      </Text>
    </Pressable>
  );
}

/** A primeira peça do trilho de categorias: criar a sua figurinha com foto ou vídeo do celular. */
export function CreateTile({ onPress, busy }: { onPress: () => void; busy?: boolean }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [s.cat, { backgroundColor: c.inverse }, pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityLabel="Criar figurinha com foto ou vídeo do celular"
      accessibilityState={{ busy }}
    >
      <View style={[s.createIcon, { backgroundColor: c.accent }]}>{busy ? <ActivityIndicator size="small" color={c.onAccent} /> : <Feather name="plus" size={20} color={c.onAccent} />}</View>
      <Text style={[text.poster, { color: c.onInverse }]} numberOfLines={1}>
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

/** Esqueleto de uma lista de pacotes. */
export function PackRowsSkeleton({ width, rows = 3 }: { width: number; rows?: number }) {
  const [list] = useState(() => Array.from({ length: rows }, (_, i) => i));
  return (
    <View style={styles.skeleton} accessibilityLabel="Carregando" accessibilityRole="progressbar">
      {list.map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Bone width="60%" height={20} />
          <Bone width={width} height={Math.floor((width - space[2] * 2 - space[1] * 4) / 5) + space[2] * 2} />
        </View>
      ))}
    </View>
  );
}

/** Esqueleto da grade de pacotes. */
export function PackCardsSkeleton({ width, count = 4 }: { width: number; count?: number }) {
  const [list] = useState(() => Array.from({ length: count }, (_, i) => i));
  const card = Math.floor((width - space[3]) / 2);
  return (
    <View style={styles.cards} accessibilityLabel="Carregando" accessibilityRole="progressbar">
      {list.map((i) => (
        <View key={i} style={[styles.skeletonRow, { width: card }]}>
          <Bone width={card} height={leadHeight(card) + space[1] + thumbSide(card)} />
          <Bone width="72%" height={20} />
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
  strip: { flexDirection: 'row', gap: space[1], padding: space[2], borderRadius: radius.lg },
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1], padding: space[2], borderRadius: radius.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  cards: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: space[6] },
  adds: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  cell: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  round: { width: control.sm, height: control.sm, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  badge: { height: 24, paddingHorizontal: space[2], borderRadius: radius.full, justifyContent: 'center' },
  badgeText: { lineHeight: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skeleton: { gap: space[6] },
  skeletonRow: { gap: space[3] },
  stat: { alignItems: 'flex-start' },
  bone: { borderRadius: radius.lg },
  boneRound: { borderRadius: radius.full },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { gap: space[3] },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    rowText: { flex: 1, minWidth: 0 },
    titleLine: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    packName: { ...text.bodyBold, flexShrink: 1, color: c.ink },
    packMeta: { ...text.caption, ...tabular, color: c.muted },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    metaShrink: { ...text.caption, ...tabular, color: c.muted, flexShrink: 1 },
    tileName: { ...text.bodyBold, color: c.ink, marginTop: space[2] },
    cardLead: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    cardPlay: { position: 'absolute', left: space[2], top: space[2], width: 24, height: 24, borderRadius: radius.full, backgroundColor: c.mediaScrim, alignItems: 'center', justifyContent: 'center' },
    cardThumbs: { flexDirection: 'row', gap: space[1], marginTop: space[1] },
    cardThumb: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
    cardAdd: { position: 'absolute', right: space[2] },
    cardText: { marginTop: space[2] },
    cardBy: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[2] },
    cardByText: { flex: 1, minWidth: 0 },
    rank: { position: 'absolute', left: space[2], top: space[2], minWidth: 24, height: 24, paddingHorizontal: space[1], borderRadius: radius.full, backgroundColor: c.inverse, alignItems: 'center', justifyContent: 'center' },
    rankText: { ...text.captionBold, ...tabular, lineHeight: 16, color: c.onInverse },
    play: { position: 'absolute', right: space[2], top: space[2], width: 24, height: 24, borderRadius: radius.full, backgroundColor: c.mediaScrim, alignItems: 'center', justifyContent: 'center' },
    poster: { minHeight: 208, borderRadius: radius.xl, overflow: 'hidden', padding: space[4], justifyContent: 'flex-end' },
    posterRing: { position: 'absolute', borderRadius: radius.full, borderWidth: 16 },
    posterArt: { ...StyleSheet.absoluteFill },
    posterSticker: { position: 'absolute' },
    posterText: { maxWidth: '64%' },
    cat: { width: 144, height: 96, borderRadius: radius.lg, overflow: 'hidden', padding: space[3], justifyContent: 'flex-end' },
    catArt: { position: 'absolute', right: -space[2], top: -space[2], transform: [{ rotate: '10deg' }] },
    catImage: { width: 72, height: 72 },
    createIcon: { position: 'absolute', top: space[3], left: space[3], width: control.sm, height: control.sm, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  });
