import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CommunityError,
  compact,
  countDownload,
  countsOf,
  feed,
  follow,
  follows,
  login,
  logout,
  looksLikeLink,
  me,
  publish,
  rememberSearch,
  search,
  signup,
  toggleLike,
  unfollow,
  unpublish,
  updateProfile,
} from '../src/community/core';
import { CATEGORIES, seed, SEED_NOW, TEST_PASSWORD, TRENDING } from '../src/community/seed';

const cat = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id;

test('comunidade: entrar com e-mail ou usuário, e a senha confere', () => {
  const db = seed();
  assert.equal(me(login(db, 'marcos@puxa.app', TEST_PASSWORD))?.username, 'marcos');
  assert.equal(me(login(db, '@analima', TEST_PASSWORD))?.name, 'Ana Lima');
  assert.equal(me(login(db, 'ANALIMA', TEST_PASSWORD))?.id, 'u-ana');
  assert.throws(() => login(db, 'marcos', 'errada'), (e: CommunityError) => e.field === 'password');
  assert.throws(() => login(db, 'ninguem@puxa.app', TEST_PASSWORD), (e: CommunityError) => e.field === 'identifier');
  // Os criadores dos dados de teste não têm senha: não dá para entrar como eles
  assert.throws(() => login(db, 'puxa', TEST_PASSWORD), CommunityError);
  assert.equal(me(logout(login(db, 'marcos', TEST_PASSWORD))), null);
});

test('comunidade: criar conta confere nome, usuário, e-mail e senha', () => {
  const db = seed();
  const ok = signup(db, { name: 'Joana', username: '@Joana.Dev', email: 'Joana@Mail.com', password: 'segredo' }, 1, 'u-joana');
  assert.equal(me(ok)?.username, 'joana.dev');
  assert.equal(me(login(logout(ok), 'joana@mail.com', 'segredo'))?.id, 'u-joana');
  const bad = (input: Partial<Parameters<typeof signup>[1]>, field: string) =>
    assert.throws(() => signup(db, { name: 'Joana', username: 'joana', email: 'j@mail.com', password: 'segredo', ...input }, 1, 'x'), (e: CommunityError) => e.field === field);
  bad({ name: ' ' }, 'name');
  bad({ username: 'ab' }, 'username');
  bad({ username: 'marcos' }, 'username');
  bad({ email: 'sem-arroba' }, 'email');
  bad({ email: 'ana@puxa.app' }, 'email');
  bad({ password: '123' }, 'password');
});

test('comunidade: editar o perfil não deixa pegar o usuário de outra pessoa', () => {
  const db = login(seed(), 'marcos', TEST_PASSWORD);
  const next = updateProfile(db, { name: 'Marcos Melo', bio: 'Oi', avatar: { uri: '/foto.jpg' } });
  assert.equal(me(next)?.name, 'Marcos Melo');
  assert.deepEqual(me(next)?.avatar, { uri: '/foto.jpg' });
  assert.throws(() => updateProfile(db, { username: 'analima' }), (e: CommunityError) => e.field === 'username');
  assert.throws(() => updateProfile(logout(db), { name: 'X Y' }), CommunityError);
});

test('comunidade: seguir e deixar de seguir mudam os números dos dois lados', () => {
  let db = login(seed(), 'marcos', TEST_PASSWORD);
  const before = countsOf(db, 'u-ana');
  db = follow(db, 'u-ana');
  assert.ok(follows(db, 'u-marcos', 'u-ana'));
  assert.equal(countsOf(db, 'u-ana').followers, before.followers + 1);
  // Seguir de novo, ou seguir a si mesmo, não muda nada
  assert.equal(follow(db, 'u-ana').follows.length, db.follows.length);
  assert.equal(follow(db, 'u-marcos').follows.length, db.follows.length);
  db = unfollow(db, 'u-ana');
  assert.equal(countsOf(db, 'u-ana').followers, before.followers);
  assert.throws(() => follow(logout(db), 'u-ana'), CommunityError);
});

test('comunidade: curtir alterna e o número acompanha', () => {
  let db = login(seed(), 'marcos', TEST_PASSWORD);
  const likes = () => db.packs.find((p) => p.id === 'p-gatinhos')!.likes;
  const start = likes();
  db = toggleLike(db, 'p-gatinhos');
  assert.equal(likes(), start + 1);
  db = toggleLike(db, 'p-gatinhos');
  assert.equal(likes(), start);
  db = countDownload(db, 'p-gatinhos');
  assert.equal(db.packs.find((p) => p.id === 'p-gatinhos')!.downloads, 12_901);
});

test('comunidade: a busca acha sem acento, por figurinha, pacote e pessoa', () => {
  const db = seed();
  const r = search(db, 'reuniao', cat);
  assert.equal(r.stickers[0].sticker.id, 'trabalho/reuniao');
  assert.equal(search(db, 'Gatinho', cat).packs[0].id, 'p-gatinhos');
  assert.equal(search(db, 'oxe', cat).packs[0].id, 'p-nordeste');
  assert.equal(search(db, 'ana', cat).people[0].id, 'u-ana');
  assert.equal(search(db, 'nordeste', cat).packs[0].id, 'p-nordeste');
  assert.deepEqual(search(db, '   ', cat), { stickers: [], packs: [], people: [] });
  // Toda pesquisa em alta tem resultado
  for (const t of TRENDING) assert.ok(search(db, t, cat).stickers.length + search(db, t, cat).packs.length > 0, t);
});

test('comunidade: buscas recentes sem repetir, as novas primeiro', () => {
  let db = seed();
  for (const q of ['oxe', 'bom dia', 'Oxe', 'a', 'gato']) db = rememberSearch(db, q);
  assert.deepEqual(db.searches, ['gato', 'Oxe', 'bom dia']);
});

test('comunidade: publicar pede conta, nome e pelo menos 3 figurinhas', () => {
  const db = login(seed(), 'analima', TEST_PASSWORD);
  const st = (n: number) => Array.from({ length: n }, (_, i) => ({ img: { uri: `/f${i}.webp` }, emojis: [], label: `Figurinha ${i}` }));
  const next = publish(db, { name: 'Meu pacote', category: 'reacoes', tags: ['Teste'], animated: false, stickers: st(3) }, SEED_NOW + 1, 'p-novo');
  const p = next.packs[0];
  assert.equal(p.author, 'u-ana');
  assert.deepEqual(p.stickers[0].emojis, ['😀']);
  assert.ok(p.tags.includes('teste') && p.tags.includes('pacote'));
  assert.equal(feed(next).fresh[0].id, 'p-novo');
  assert.throws(() => publish(db, { name: 'X', category: 'reacoes', tags: [], animated: false, stickers: st(3) }, 5, 'y'), CommunityError);
  assert.throws(() => publish(db, { name: 'Pouco', category: 'reacoes', tags: [], animated: false, stickers: st(2) }, 5, 'y'), CommunityError);
  assert.throws(() => publish(logout(db), { name: 'Sem conta', category: 'reacoes', tags: [], animated: false, stickers: st(3) }, 5, 'y'), CommunityError);
  assert.equal(unpublish(next, 'p-novo').packs.length, db.packs.length);
  assert.throws(() => unpublish(next, 'p-nordeste'), CommunityError);
});

test('comunidade: o Início mostra destaque, em alta, populares, novos e quem você segue', () => {
  const db = seed();
  const f = feed(db);
  assert.equal(f.featured?.id, 'p-nordeste');
  assert.ok(!f.trending.some((p) => p.id === f.featured?.id));
  assert.equal(f.popular[0].id, 'p-bomdia');
  assert.equal(f.following.length, 0);
  const ana = feed(login(db, 'analima', TEST_PASSWORD));
  assert.ok(ana.following.length > 0 && ana.following.every((p) => ['u-marcos', 'u-puxa', 'u-bia', 'u-gatices'].includes(p.author)));
});

test('comunidade: os dados de teste batem com as regras do WhatsApp', () => {
  const db = seed();
  for (const p of db.packs) {
    assert.ok(p.stickers.length >= 3 && p.stickers.length <= 30, p.id);
    assert.ok(CATEGORIES.some((c) => c.id === p.category), p.id);
    assert.ok(db.users.some((u) => u.id === p.author), p.id);
    if (p.animated) assert.ok(p.stickers.every((s) => s.poster), `${p.id}: animada sem quadro`);
  }
  assert.equal(new Set(db.users.map((u) => u.username)).size, db.users.length);
});

test('comunidade: link ou busca', () => {
  for (const l of ['https://youtu.be/abc', 'youtube.com/watch?v=x', 'www.instagram.com/p/x', 'x.com/a/status/1', 'http://a.co']) assert.ok(looksLikeLink(l), l);
  for (const q of ['bom dia', 'oxe', 'kkkk', 'te amo', 'gato.', '']) assert.ok(!looksLikeLink(q), q);
});

test('comunidade: números curtos', () => {
  assert.equal(compact(999), '999');
  assert.equal(compact(1_000), '1 mil');
  assert.equal(compact(1_250), '1,2 mil');
  assert.equal(compact(12_400), '12 mil');
  assert.equal(compact(2_500_000), '2,5 mi');
});

test('arte: dois arquivos nunca viram o mesmo recurso no Android (o build quebra)', () => {
  // No APK, assets/acervo/animadas/pulando.webp e pulando.png seriam os dois "assets_acervo_animadas_pulando"
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const { join, relative, extname } = require('node:path') as typeof import('node:path');
  const root = join(__dirname, '..');
  const seen = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const rel = relative(root, p);
        const key = rel.slice(0, -extname(rel).length).replace(/\//g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
        assert.ok(!seen.has(key), `${rel} e ${seen.get(key)} viram o mesmo recurso`);
        seen.set(key, rel);
      }
    }
  };
  walk(join(root, 'assets'));
});
