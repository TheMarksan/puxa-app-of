import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Highlight, SocialItem, SocialPost, SocialProfile } from '../sources';
import { clock } from '../format';
import { NAMES } from '../sources/social';
import { font, type Palette, radius, usePalette } from '../theme';

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
    <View style={{ gap: 8 }}>
      <View style={s.stripHead}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.count}>{index >= 0 ? `${index + 1} de ${items.length}` : `${items.length}`}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
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
                    <Feather name="play" size={9} color="#fff" />
                    {it.duration ? <Text style={s.tagText}>{clock(it.duration)}</Text> : null}
                  </>
                ) : (
                  <Feather name="image" size={10} color="#fff" />
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
    <View style={{ gap: 8 }}>
      <View style={s.stripHead}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.count}>{posts.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityLabel={label}>
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
                    <Feather name="layers" size={10} color="#fff" />
                    <Text style={s.tagText}>{p.items.length}</Text>
                  </>
                ) : first?.kind === 'video' ? (
                  <>
                    <Feather name="play" size={9} color="#fff" />
                    {first.duration ? <Text style={s.tagText}>{clock(first.duration)}</Text> : null}
                  </>
                ) : (
                  <Feather name="image" size={10} color="#fff" />
                )}
              </View>
              {busy === p.id ? (
                <View style={s.hlBusy}>
                  <ActivityIndicator size="small" color="#fff" />
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
          {profile.avatar ? <Image source={{ uri: profile.avatar }} style={s.avatar} /> : <Feather name="user" size={26} color={c.muted} />}
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
              <Feather name="lock" size={11} color={c.muted} />
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
            <View style={{ gap: 8 }}>
              <Text style={s.label}>Destaques</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
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
                            <ActivityIndicator size="small" color="#fff" />
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
          <Feather name="lock" size={15} color={c.muted} />
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
    label: { fontFamily: font.semibold, fontSize: 14, color: c.muted },
    count: { fontFamily: font.semibold, fontSize: 13, color: c.muted, fontVariant: ['tabular-nums'] },
    thumb: { borderRadius: 12, overflow: 'hidden', backgroundColor: c.sk, borderWidth: 2.5, borderColor: 'transparent' },
    thumbOn: { borderColor: c.accent },
    tag: { position: 'absolute', left: 5, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: 'rgba(10,12,15,0.72)' },
    tagText: { fontFamily: font.semibold, fontSize: 10, color: '#fff', fontVariant: ['tabular-nums'] },
    profile: { gap: 16, padding: 14, borderRadius: radius.slot, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
    profileTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatarRing: { width: 66, height: 66, borderRadius: 33, borderWidth: 2.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatar: { width: 58, height: 58, borderRadius: 29 },
    username: { fontFamily: font.bold, fontSize: 18, color: c.ink },
    fullName: { fontFamily: font.regular, fontSize: 14, color: c.muted, marginTop: 1 },
    private: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    privateText: { fontFamily: font.medium, fontSize: 12, color: c.muted },
    login: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.list, backgroundColor: c.bg },
    loginText: { flex: 1, fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: c.muted },
    loginLink: { fontFamily: font.semibold, fontSize: 14, color: c.accentInk, paddingVertical: 6, paddingHorizontal: 4 },
    none: { fontFamily: font.regular, fontSize: 14, color: c.muted },
    hl: { alignItems: 'center', gap: 6, width: 68 },
    hlRing: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    hlImg: { width: 54, height: 54, borderRadius: 27 },
    hlBusy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    hlText: { fontFamily: font.medium, fontSize: 12, color: c.ink },
  });
