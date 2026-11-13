import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Highlight, SocialItem, SocialPost, SocialProfile } from '../sources';
import { clock } from '../format';
import { NAMES } from '../sources/social';
import { type Palette, radius, space, tabular, text, usePalette } from '../theme';

/**
 * Peças do Instagram e do X no Baixar: a tira para escolher o item (carrossel, stories, várias
 * mídias num post) e o cabeçalho do perfil com stories e destaques.
 */

/** Tira de miniaturas: o escolhido ganha o anel azul; vídeo mostra a duração, foto um ícone. */
export function MediaStrip({ items, index, onPick, label, tall }: { items: SocialItem[]; index: number; onPick: (i: number) => void; label: string; tall?: boolean }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const w = tall ? 66 : 76;
  const h = tall ? 112 : 76;
  return (
    <View style={{ gap: space[2] }}>
      <View style={s.stripHead}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.count}>{index >= 0 ? `${index + 1} de ${items.length}` : `${items.length}`}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: space[1] }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {items.map((it, i) => {
          const on = i === index;
          return (
            <Pressable
              key={`${it.id}-${i}`}
              onPress={() => {
                if (on) return;
                Haptics.selectionAsync().catch(() => {});
                onPick(i);
              }}
              style={[s.thumb, { width: w, height: h }, on && s.thumbOn]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${it.kind === 'video' ? 'Vídeo' : 'Foto'} ${i + 1} de ${items.length}${it.kind === 'video' && it.duration ? `, ${clock(it.duration)}` : ''}`}
            >
              {it.thumbnail ? <Image source={{ uri: it.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
              <View style={s.tag}>
                {it.kind === 'video' ? (
                  <>
                    <Feather name="play" size={12} color={c.onMedia} />
                    {it.duration ? <Text style={s.tagText}>{clock(it.duration)}</Text> : null}
                  </>
                ) : (
                  <Feather name="image" size={12} color={c.onMedia} />
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Publicações do perfil: a capa de cada post, com a marca de vídeo, foto ou carrossel. */
export function PostStrip({ posts, selected, busy, onPick, label }: { posts: SocialPost[]; selected: string | null; busy: string | null; onPick: (p: SocialPost) => void; label: string }) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={{ gap: space[2] }}>
      <View style={s.stripHead}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.count}>{posts.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: space[1] }} accessibilityLabel={label}>
        {posts.map((p) => {
          const first = p.items[0];
          const on = selected === p.id;
          const many = p.items.length > 1;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                if (on) return;
                Haptics.selectionAsync().catch(() => {});
                onPick(p);
              }}
              style={[s.thumb, { width: 84, height: 84 }, on && s.thumbOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on, busy: busy === p.id }}
              accessibilityLabel={`${many ? `Carrossel com ${p.items.length}` : first?.kind === 'video' ? 'Vídeo' : 'Foto'}: ${p.title}`}
            >
              {first?.thumbnail ? <Image source={{ uri: first.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
              <View style={s.tag}>
                {many ? (
                  <>
                    <Feather name="layers" size={12} color={c.onMedia} />
                    <Text style={s.tagText}>{p.items.length}</Text>
                  </>
                ) : first?.kind === 'video' ? (
                  <>
                    <Feather name="play" size={12} color={c.onMedia} />
                    {first.duration ? <Text style={s.tagText}>{clock(first.duration)}</Text> : null}
                  </>
                ) : (
                  <Feather name="image" size={12} color={c.onMedia} />
                )}
              </View>
              {busy === p.id ? (
                <View style={s.hlBusy}>
                  <ActivityIndicator size="small" color={c.onMedia} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Perfil do Instagram ou do X: foto, nome e as publicações recentes com mídia, abertas sem login.
 * No Instagram, com a conta conectada, também os stories de agora e os destaques.
 */
export function ProfileHeader({
  profile,
  selectedPost,
  postBusy,
  onPost,
  storyIndex,
  onStory,
  onHighlight,
  highlightBusy,
  highlightOpen,
  onLogin,
}: {
  profile: SocialProfile;
  selectedPost: string | null;
  postBusy: string | null;
  onPost: (p: SocialPost) => void;
  storyIndex: number | null;
  onStory: (i: number) => void;
  onHighlight: (h: Highlight) => void;
  highlightBusy: string | null;
  highlightOpen: string | null;
  onLogin: () => void;
}) {
  const c = usePalette();
  const s = useMemo(() => makeStyles(c), [c]);
  const instagram = profile.source === 'instagram';
  const needsLogin = instagram && profile.stories === null;
  return (
    <View style={s.profile}>
      <View style={s.profileTop}>
        <View style={[s.avatarRing, profile.stories?.length ? { borderColor: c.accent } : null]}>
          {profile.avatar ? <Image source={{ uri: profile.avatar }} style={s.avatar} /> : <Feather name="user" size={24} color={c.muted} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.username} numberOfLines={1}>
            @{profile.username}
          </Text>
          <Text style={s.fullName} numberOfLines={1}>
            {[profile.fullName, NAMES[profile.source]].filter(Boolean).join(' · ')}
          </Text>
          {profile.isPrivate ? (
            <View style={s.private}>
              <Feather name="lock" size={12} color={c.muted} />
              <Text style={s.privateText}>{instagram ? 'Conta privada' : 'Conta protegida'}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {profile.posts.length ? (
        <PostStrip posts={profile.posts} selected={selectedPost} busy={postBusy} onPick={onPost} label={instagram ? 'Publicações' : 'Posts com mídia'} />
      ) : (
        <Text style={s.none}>
          {profile.isPrivate ? 'Só quem segue vê as publicações desta conta.' : instagram ? 'Nada com foto ou vídeo nas publicações recentes.' : 'Nada com foto ou vídeo nos posts recentes.'}
        </Text>
      )}

      {instagram && !needsLogin ? (
        <>
          {profile.stories?.length ? (
            <MediaStrip items={profile.stories} index={storyIndex ?? -1} onPick={onStory} label="Stories de agora" tall />
          ) : (
            <Text style={s.none}>{profile.isPrivate ? 'Conta privada: só quem segue vê os stories.' : 'Sem stories no ar agora.'}</Text>
          )}
          {profile.highlights?.length ? (
            <View style={{ gap: space[2] }}>
              <Text style={s.label}>Destaques</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[4] }}>
                {profile.highlights.map((h) => {
                  const on = highlightOpen === h.id;
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() => onHighlight(h)}
                      style={s.hl}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, busy: highlightBusy === h.id }}
                      accessibilityLabel={`Destaque ${h.title}`}
                    >
                      <View style={[s.hlRing, on && { borderColor: c.accent }]}>
                        {h.cover ? <Image source={{ uri: h.cover }} style={s.hlImg} /> : <Feather name="circle" size={20} color={c.muted} />}
                        {highlightBusy === h.id ? (
                          <View style={s.hlBusy}>
                            <ActivityIndicator size="small" color={c.onMedia} />
                          </View>
                        ) : null}
                      </View>
                      <Text style={[s.hlText, on && { color: c.accentInk }]} numberOfLines={1}>
                        {h.title || 'Destaque'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </>
      ) : null}

      {needsLogin ? (
        <View style={s.login}>
          <Feather name="lock" size={16} color={c.muted} />
          <Text style={s.loginText}>Stories e destaques pedem login no Instagram.</Text>
          <Text style={s.loginLink} onPress={onLogin} accessibilityRole="button">
            Entrar
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stripHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { ...text.overline, color: c.muted },
    count: { ...text.captionBold, ...tabular, color: c.muted },
    thumb: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.sk, borderWidth: 2, borderColor: 'transparent' },
    thumbOn: { borderColor: c.accent },
    tag: { position: 'absolute', left: space[1], bottom: space[1], flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[1], height: 20, borderRadius: radius.full, backgroundColor: c.mediaScrim },
    tagText: { ...text.captionBold, ...tabular, lineHeight: 16, color: c.onMedia },
    profile: { gap: space[4], padding: space[4], borderRadius: radius.xl, backgroundColor: c.surface, boxShadow: c.shadow1 },
    profileTop: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
    avatarRing: { width: 64, height: 64, borderRadius: radius.full, borderWidth: 2, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatar: { width: 56, height: 56, borderRadius: radius.full },
    username: { ...text.bodyBold, color: c.ink },
    fullName: { ...text.caption, color: c.muted },
    private: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: space[1] },
    privateText: { ...text.caption, color: c.muted },
    login: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.lg, backgroundColor: c.sunken },
    loginText: { ...text.caption, flex: 1, color: c.muted },
    loginLink: { ...text.captionBold, color: c.accentInk, paddingVertical: space[2], paddingHorizontal: space[1] },
    none: { ...text.caption, color: c.muted },
    hl: { alignItems: 'center', gap: space[1], width: 68 },
    hlRing: { width: 64, height: 64, borderRadius: radius.full, borderWidth: 2, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    hlImg: { width: 56, height: 56, borderRadius: radius.full },
    hlBusy: { ...StyleSheet.absoluteFill, backgroundColor: c.mediaScrim, alignItems: 'center', justifyContent: 'center' },
    hlText: { ...text.caption, color: c.ink },
  });
