import type { Category, CategoryId, DB, Img, Pack, Sticker, User } from './types';

/**
 * As regras da comunidade, sem tela e sem arquivo: entrar, criar conta, seguir, curtir, buscar
 * e montar o Início. Recebem o banco e devolvem um banco novo (nada é alterado no lugar), para
 * dar para testar no computador e trocar pelo servidor depois.
 */

export class CommunityError extends Error {
  /** Campo do formulário com o problema, quando há um. */
  field?: 'name' | 'username' | 'email' | 'password' | 'identifier';
  constructor(message: string, field?: CommunityError['field']) {
    super(message);
    this.field = field;
  }
}

// ---------- Texto ----------

/** Minúsculas e sem acento: "Reunião" acha "reuniao". */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Resumo da senha (FNV-1a em duas voltas). Só os dados de teste usam: o servidor terá o dele. */
export function hashSecret(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ s.charCodeAt(s.length - 1 - i), 0x811c9dc5) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** Parece um link (YouTube, Instagram, X ou qualquer endereço), e não uma busca? */
export function looksLikeLink(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return true;
  return /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(t);
}

// ---------- Contas ----------

const USERNAME = /^[a-z0-9._]{3,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Nome de usuário a partir do que foi digitado: sem @, minúsculo, sem acento, sem espaço. */
export const cleanUsername = (s: string) =>
  fold(s)
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._]/g, '');

export type SignupInput = { name: string; username: string; email: string; password: string };

export function validateSignup(db: DB, input: SignupInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new CommunityError('Diga como quer ser chamado.', 'name');
  const username = cleanUsername(input.username);
  if (!USERNAME.test(username)) throw new CommunityError('Use de 3 a 20 letras, números, ponto ou sublinhado.', 'username');
  if (db.users.some((u) => u.username === username)) throw new CommunityError('Esse nome de usuário já tem dono.', 'username');
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new CommunityError('Confira o e-mail.', 'email');
  if (Object.values(db.emails).includes(email)) throw new CommunityError('Já existe uma conta com esse e-mail. Entre com ele.', 'email');
  if (input.password.length < 6) throw new CommunityError('A senha precisa de 6 caracteres ou mais.', 'password');
  return { name, username, email };
}

export function signup(db: DB, input: SignupInput, now: number, id: string): DB {
  const { name, username, email } = validateSignup(db, input);
  const user: User = { id, username, name, bio: '', avatar: null, cover: null, joined: now };
  return {
    ...db,
    users: [...db.users, user],
    secrets: { ...db.secrets, [id]: hashSecret(input.password) },
    emails: { ...db.emails, [id]: email },
    session: id,
  };
}

/** Entra com e-mail ou nome de usuário (com ou sem @). */
export function login(db: DB, identifier: string, password: string): DB {
  const id = identifier.trim().toLowerCase();
  if (!id) throw new CommunityError('Digite seu e-mail ou nome de usuário.', 'identifier');
  const user = id.includes('@') && !id.startsWith('@') ? db.users.find((u) => db.emails[u.id] === id) : db.users.find((u) => u.username === cleanUsername(id));
  if (!user || !db.secrets[user.id]) throw new CommunityError('Não achamos uma conta com esse e-mail ou usuário.', 'identifier');
  if (db.secrets[user.id] !== hashSecret(password)) throw new CommunityError('Senha errada. Confira e tente de novo.', 'password');
  return { ...db, session: user.id };
}

export const logout = (db: DB): DB => ({ ...db, session: null });

export const me = (db: DB): User | null => (db.session ? (db.users.find((u) => u.id === db.session) ?? null) : null);

export type ProfilePatch = Partial<Pick<User, 'name' | 'username' | 'bio' | 'avatar' | 'cover'>>;

export function updateProfile(db: DB, patch: ProfilePatch): DB {
  const user = me(db);
  if (!user) throw new CommunityError('Entre na sua conta primeiro.');
  const next: User = { ...user };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2) throw new CommunityError('Diga como quer ser chamado.', 'name');
    next.name = name;
  }
  if (patch.username !== undefined) {
    const username = cleanUsername(patch.username);
    if (!USERNAME.test(username)) throw new CommunityError('Use de 3 a 20 letras, números, ponto ou sublinhado.', 'username');
    if (db.users.some((u) => u.username === username && u.id !== user.id)) throw new CommunityError('Esse nome de usuário já tem dono.', 'username');
    next.username = username;
  }
  if (patch.bio !== undefined) next.bio = patch.bio.trim().slice(0, 160);
  if (patch.avatar !== undefined) next.avatar = patch.avatar;
  if (patch.cover !== undefined) next.cover = patch.cover;
  return { ...db, users: db.users.map((u) => (u.id === user.id ? next : u)) };
}

// ---------- Seguir e curtir ----------

export const follows = (db: DB, from: string, to: string) => db.follows.some((f) => f.from === from && f.to === to);

export function follow(db: DB, to: string): DB {
  const user = me(db);
  if (!user) throw new CommunityError('Entre na sua conta para seguir.');
  if (to === user.id || follows(db, user.id, to) || !db.users.some((u) => u.id === to)) return db;
  return { ...db, follows: [...db.follows, { from: user.id, to }] };
}

export function unfollow(db: DB, to: string): DB {
  const user = me(db);
  if (!user) return db;
  return { ...db, follows: db.follows.filter((f) => !(f.from === user.id && f.to === to)) };
}

export const followersOf = (db: DB, id: string) => db.follows.filter((f) => f.to === id).map((f) => f.from);
export const followingOf = (db: DB, id: string) => db.follows.filter((f) => f.from === id).map((f) => f.to);

export type Counts = { packs: number; followers: number; following: number; downloads: number };

export function countsOf(db: DB, id: string): Counts {
  const user = db.users.find((u) => u.id === id);
  const own = db.packs.filter((p) => p.author === id);
  return {
    packs: own.length,
    followers: followersOf(db, id).length + (user?.extraFollowers ?? 0),
    following: followingOf(db, id).length,
    downloads: own.reduce((n, p) => n + p.downloads, 0),
  };
}

export const likedBy = (db: DB, userId: string | null, packId: string) => !!userId && (db.liked[userId] ?? []).includes(packId);

export function toggleLike(db: DB, packId: string): DB {
  const user = me(db);
  if (!user) throw new CommunityError('Entre na sua conta para curtir.');
  const on = likedBy(db, user.id, packId);
  const list = db.liked[user.id] ?? [];
  return {
    ...db,
    liked: { ...db.liked, [user.id]: on ? list.filter((x) => x !== packId) : [...list, packId] },
    packs: db.packs.map((p) => (p.id === packId ? { ...p, likes: Math.max(0, p.likes + (on ? -1 : 1)) } : p)),
  };
}

/** Alguém pôs o pacote no WhatsApp: conta para o total e para o "em alta". */
export const countDownload = (db: DB, packId: string): DB => ({
  ...db,
  packs: db.packs.map((p) => (p.id === packId ? { ...p, downloads: p.downloads + 1, week: p.week + 1 } : p)),
});

// ---------- Publicar ----------

export type PublishInput = { name: string; category: CategoryId; tags: string[]; animated: boolean; stickers: { img: Img; poster?: Img; emojis: string[]; label: string }[] };

export const MIN_PACK = 3;
export const MAX_PACK = 30;

export function publish(db: DB, input: PublishInput, now: number, id: string): DB {
  const user = me(db);
  if (!user) throw new CommunityError('Entre na sua conta para publicar.');
  const name = input.name.trim();
  if (name.length < 2) throw new CommunityError('Dê um nome ao pacote.', 'name');
  if (input.stickers.length < MIN_PACK) throw new CommunityError(`O WhatsApp pede pelo menos ${MIN_PACK} figurinhas num pacote.`);
  if (input.stickers.length > MAX_PACK) throw new CommunityError(`Um pacote leva até ${MAX_PACK} figurinhas.`);
  const words = (s: string) =>
    fold(s)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1);
  const stickers: Sticker[] = input.stickers.map((s, i) => ({ id: `${id}/${i}`, img: s.img, poster: s.poster, emojis: s.emojis.length ? s.emojis : ['😀'], tags: words(s.label) }));
  const pack: Pack = {
    id,
    name,
    author: user.id,
    category: input.category,
    animated: input.animated,
    stickers,
    tags: [...new Set([...input.tags.map(fold).filter(Boolean), ...words(name)])],
    downloads: 0,
    week: 0,
    likes: 0,
    created: now,
  };
  return { ...db, packs: [pack, ...db.packs] };
}

export function unpublish(db: DB, packId: string): DB {
  const user = me(db);
  const pack = db.packs.find((p) => p.id === packId);
  if (!user || !pack || pack.author !== user.id) throw new CommunityError('Só quem publicou pode tirar o pacote.');
  return { ...db, packs: db.packs.filter((p) => p.id !== packId) };
}

// ---------- Buscas recentes ----------

export const MAX_SEARCHES = 8;

export function rememberSearch(db: DB, query: string): DB {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return db;
  return { ...db, searches: [q, ...db.searches.filter((s) => fold(s) !== fold(q))].slice(0, MAX_SEARCHES) };
}

export const forgetSearch = (db: DB, query: string): DB => ({ ...db, searches: db.searches.filter((s) => s !== query) });
export const clearSearches = (db: DB): DB => ({ ...db, searches: [] });

// ---------- Busca ----------

export type StickerHit = { sticker: Sticker; pack: Pack };
export type SearchResult = { stickers: StickerHit[]; packs: Pack[]; people: User[] };

/** Quanto [text] combina com [q] (0 = nada): começo de palavra vale mais que o meio. */
function score(text: string, q: string, words: string[]): number {
  const t = fold(text);
  if (!t) return 0;
  if (t === q) return 10;
  if (t.startsWith(q)) return 7;
  if (t.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 5;
  if (t.includes(q)) return 3;
  // Todas as palavras da busca aparecem (em qualquer ordem)
  if (words.length > 1 && words.every((w) => t.includes(w))) return 2;
  return 0;
}

const best = (texts: string[], q: string, words: string[]) => texts.reduce((m, t) => Math.max(m, score(t, q, words)), 0);

export function search(db: DB, query: string, categoryName: (id: CategoryId) => string): SearchResult {
  const q = fold(query).replace(/\s+/g, ' ');
  if (q.length < 1) return { stickers: [], packs: [], people: [] };
  const words = q.split(' ').filter(Boolean);
  const authorOf = (p: Pack) => db.users.find((u) => u.id === p.author);
  // Popularidade só desempata (e pesa pouco): o que combina vem antes
  const pop = (p: Pack) => Math.log10(10 + p.downloads);

  const packs = db.packs
    .map((p) => {
      const a = authorOf(p);
      const s = Math.max(best([p.name], q, words) * 1.4, best(p.tags, q, words), best([categoryName(p.category)], q, words), a ? best([a.name, a.username], q, words) * 0.8 : 0);
      return { p, s };
    })
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s + pop(y.p) * 0.3 - (x.s + pop(x.p) * 0.3))
    .map((x) => x.p);

  const stickers = db.packs
    .flatMap((p) => p.stickers.map((s) => ({ sticker: s, pack: p, s: Math.max(best(s.tags, q, words) * 1.2, best([p.name, ...p.tags], q, words) * 0.7) })))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s + pop(y.pack) * 0.3 - (x.s + pop(x.pack) * 0.3))
    .map(({ sticker, pack }) => ({ sticker, pack }));

  const people = db.users
    .map((u) => ({ u, s: Math.max(best([u.name, u.username], q, words) * 1.2, best([u.bio], q, words) * 0.5) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || countsOf(db, y.u.id).followers - countsOf(db, x.u.id).followers)
    .map((x) => x.u);

  return { stickers, packs, people };
}

/** Um atalho no topo da busca: ir direto para a categoria, o perfil ou o pacote com esse nome. */
export type Shortcut = { kind: 'category'; category: Category; packs: number } | { kind: 'person'; user: User } | { kind: 'pack'; pack: Pack };

const KIND_ORDER: Record<Shortcut['kind'], number> = { category: 0, person: 1, pack: 2 };

/**
 * Os atalhos: categorias, pessoas e pacotes cujo NOME começa com o que foi digitado (ou tem uma
 * palavra que começa). O mais certeiro vem primeiro; no empate, categoria, pessoa e pacote, e
 * entre iguais o mais seguido ou o mais adicionado. Uma letra só ainda não sugere nada.
 */
export function shortcuts(db: DB, query: string, categories: Category[], max = 3): Shortcut[] {
  const q = fold(query).replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const words = q.split(' ').filter(Boolean);
  // 5 = começo de uma palavra do nome; "meio de palavra" fica só nos resultados
  const STRONG = 5;
  const found: { item: Shortcut; s: number; pop: number }[] = [];
  for (const category of categories) {
    const s = score(category.name, q, words);
    if (s >= STRONG) found.push({ item: { kind: 'category', category, packs: db.packs.filter((p) => p.category === category.id).length }, s, pop: 0 });
  }
  for (const user of db.users) {
    const s = Math.max(score(user.name, q, words), score(user.username, q, words));
    if (s >= STRONG) found.push({ item: { kind: 'person', user }, s, pop: countsOf(db, user.id).followers });
  }
  for (const pack of db.packs) {
    const s = score(pack.name, q, words);
    if (s >= STRONG) found.push({ item: { kind: 'pack', pack }, s, pop: pack.downloads });
  }
  return found
    .sort((a, b) => b.s - a.s || KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || b.pop - a.pop)
    .slice(0, max)
    .map((x) => x.item);
}

/**
 * Onde [query] aparece em [text], sem olhar acento nem maiúscula, para pôr esse pedaço em negrito.
 * Começo de palavra ganha do meio. Se o texto muda de tamanho ao tirar os acentos (acento já
 * separado da letra), não marca nada, para não errar a posição.
 */
export function matchAt(text: string, query: string): [number, number] | null {
  const q = fold(query).replace(/\s+/g, ' ');
  if (!q) return null;
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (t.length !== text.length) return null;
  let first = -1;
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(t[i - 1])) return [i, i + q.length];
    if (first === -1) first = i;
  }
  return first === -1 ? null : [first, first + q.length];
}

// ---------- Início ----------

export type Feed = {
  featured: Pack | null;
  trending: Pack[];
  popular: Pack[];
  fresh: Pack[];
  /** Pacotes de quem a pessoa segue (vazio sem conta). */
  following: Pack[];
};

export function feed(db: DB): Feed {
  const byWeek = [...db.packs].sort((a, b) => b.week - a.week);
  const featured = byWeek[0] ?? null;
  const user = me(db);
  const mine = user ? new Set(followingOf(db, user.id)) : new Set<string>();
  return {
    featured,
    trending: byWeek.slice(1, 7),
    popular: [...db.packs].sort((a, b) => b.downloads - a.downloads).slice(0, 6),
    fresh: [...db.packs].sort((a, b) => b.created - a.created).slice(0, 6),
    following: [...db.packs]
      .filter((p) => mine.has(p.author))
      .sort((a, b) => b.created - a.created)
      .slice(0, 4),
  };
}

export const packsIn = (db: DB, category: CategoryId) => db.packs.filter((p) => p.category === category).sort((a, b) => b.downloads - a.downloads);
export const packsBy = (db: DB, userId: string) => db.packs.filter((p) => p.author === userId).sort((a, b) => b.created - a.created);
export const userById = (db: DB, id: string) => db.users.find((u) => u.id === id) ?? null;
export const userByName = (db: DB, username: string) => db.users.find((u) => u.username === cleanUsername(username)) ?? null;

// ---------- Números ----------

/** 1.234 → "1,2 mil"; 12.400 → "12 mil"; 1.200.000 → "1,2 mi". */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? String(Math.floor(k * 10) / 10).replace('.', ',') : Math.floor(k)} mil`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? String(Math.floor(m * 10) / 10).replace('.', ',') : Math.floor(m)} mi`;
}

export const plural = (n: number, one: string, many: string) => `${compact(n)} ${n === 1 ? one : many}`;
