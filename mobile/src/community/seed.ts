import type { ArtKey } from './art';
import { hashSecret } from './core';
import type { Category, DB, Pack, Sticker, User } from './types';

/**
 * Os dados de teste da comunidade, enquanto não existe o servidor. Duas contas para testar
 * (a do Marcos e a da Ana, com a mesma senha) e sete criadores com pacotes de figurinhas
 * originais, desenhados por código (scripts/acervo/gen.py).
 */

export const TEST_PASSWORD = 'puxa123';
export const TEST_ACCOUNTS = [
  { id: 'u-marcos', email: 'marcos@puxa.app', label: 'Marcos' },
  { id: 'u-ana', email: 'ana@puxa.app', label: 'Ana' },
] as const;

const DAY = 86_400_000;
/** Data de referência dos dados de teste (os "há X dias" contam a partir dela). */
export const SEED_NOW = Date.UTC(2026, 10, 10);
const ago = (days: number) => SEED_NOW - days * DAY;

export const CATEGORIES: Category[] = [
  { id: 'reacoes', name: 'Reações', color: 'amarelo', cover: 'bolinhas/rindo' },
  { id: 'bomdia', name: 'Bom dia', color: 'coral', cover: 'bomdia/bom-dia' },
  { id: 'nordeste', name: 'Nordeste', color: 'azul', cover: 'nordeste/oxe' },
  { id: 'amor', name: 'Amor', color: 'rosa', cover: 'amor/coracao' },
  { id: 'bichinhos', name: 'Bichinhos', color: 'verde', cover: 'gatinhos/apaixonado' },
  { id: 'animadas', name: 'Animadas', color: 'roxo', cover: 'animadas/coracao#quadro' },
  { id: 'festa', name: 'Festa', color: 'lima', cover: 'festa/baloes' },
  { id: 'trabalho', name: 'Trabalho', color: 'grafite', cover: 'trabalho/ok' },
  { id: 'frases', name: 'Frases', color: 'azul', cover: 'puxa/puxa' },
];

export const TRENDING = ['bom dia', 'kkkk', 'oxe', 'gatinho', 'sextou', 'te amo', 'parabéns', 'reunião', 'bolinhas', 'animadas'];

const people: User[] = [
  { id: 'u-marcos', username: 'marcos', name: 'Marcos', bio: 'Fiz o Puxa. Maceió, AL.', avatar: { art: 'pessoas/marcos' }, cover: { art: 'capas/marcos' }, joined: ago(160) },
  { id: 'u-ana', username: 'analima', name: 'Ana Lima', bio: 'Figurinha para toda conversa.', avatar: { art: 'pessoas/ana' }, cover: { art: 'capas/ana' }, joined: ago(90) },
  { id: 'u-puxa', username: 'puxa', name: 'Puxa', bio: 'Figurinhas oficiais do Puxa.', avatar: { art: 'pessoas/puxa' }, cover: { art: 'capas/puxa' }, verified: true, joined: ago(200), extraFollowers: 12_400 },
  { id: 'u-oxente', username: 'oxente', name: 'Oxente Stickers', bio: 'Figurinhas com sotaque nordestino.', avatar: { art: 'pessoas/oxente' }, cover: { art: 'capas/oxente' }, joined: ago(140), extraFollowers: 8_930 },
  { id: 'u-bolinhas', username: 'bolinhas', name: 'Bolinhas', bio: 'Um rosto para cada humor.', avatar: { art: 'pessoas/bolinhas' }, cover: { art: 'capas/bolinhas' }, joined: ago(120), extraFollowers: 6_210 },
  { id: 'u-gatices', username: 'gatices', name: 'Gatices', bio: 'Miau.', avatar: { art: 'pessoas/gatices' }, cover: { art: 'capas/gatices' }, joined: ago(80), extraFollowers: 3_480 },
  { id: 'u-bia', username: 'biafrases', name: 'Bia Frases', bio: 'Bom dia, boa noite e tudo no meio.', avatar: { art: 'pessoas/bia' }, cover: { art: 'capas/bia' }, joined: ago(110), extraFollowers: 9_870 },
  { id: 'u-firma', username: 'firma', name: 'Firma', bio: 'Para o grupo do trabalho.', avatar: { art: 'pessoas/firma' }, cover: { art: 'capas/firma' }, joined: ago(60), extraFollowers: 1_120 },
  { id: 'u-festaja', username: 'festaja', name: 'Festa Já', bio: 'Toda conversa merece uma festa.', avatar: { art: 'pessoas/festaja' }, cover: { art: 'capas/festaja' }, joined: ago(45), extraFollowers: 2_050 },
];

/** Figurinhas de um pacote a partir da arte: [nome do arquivo, emoji, palavras para a busca]. */
function stickers(pack: string, list: [string, string, string][], animated = false): Sticker[] {
  return list.map(([name, emoji, tags]) => ({
    id: `${pack}/${name}`,
    img: { art: `${pack}/${name}` as ArtKey },
    ...(animated ? { poster: { art: `${pack}/${name}#quadro` as ArtKey } } : null),
    emojis: [emoji],
    tags: tags.split(' '),
  }));
}

const packs: Pack[] = [
  {
    id: 'p-nordeste',
    name: 'Oxente',
    author: 'u-oxente',
    category: 'nordeste',
    animated: false,
    tags: ['nordeste', 'sotaque', 'oxe', 'vixe', 'eita', 'arretado'],
    downloads: 24_100,
    week: 3_900,
    likes: 5_400,
    created: ago(52),
    stickers: stickers('nordeste', [
      ['oxe', '😮', 'oxe surpresa'],
      ['vixe', '😱', 'vixe maria susto'],
      ['arretado', '😤', 'arretado bravo'],
      ['oxente', '🤨', 'oxente duvida'],
      ['eita', '😳', 'eita surpresa'],
      ['massa', '😎', 'massa legal top'],
      ['avie', '🏃', 'avie pressa anda'],
      ['visse', '👉', 'bora visse convite'],
    ]),
  },
  {
    id: 'p-bomdia',
    name: 'Bom dia e boa noite',
    author: 'u-bia',
    category: 'bomdia',
    animated: false,
    tags: ['bom dia', 'boa noite', 'boa tarde', 'cafe', 'sextou', 'familia', 'grupo'],
    downloads: 31_500,
    week: 2_700,
    likes: 4_100,
    created: ago(70),
    stickers: stickers('bomdia', [
      ['bom-dia', '☀️', 'bom dia manha sol'],
      ['boa-tarde', '🌤️', 'boa tarde'],
      ['boa-noite', '🌙', 'boa noite lua dormir'],
      ['cafe', '☕', 'cafe manha'],
      ['sextou', '🎉', 'sextou sexta fim de semana'],
      ['fim-de-semana', '😌', 'bom fim de semana sabado domingo'],
      ['benca', '🙏', 'benca mainha mae familia'],
    ]),
  },
  {
    id: 'p-bolinhas',
    name: 'Bolinhas',
    author: 'u-bolinhas',
    category: 'reacoes',
    animated: false,
    tags: ['reacoes', 'rostos', 'carinhas', 'humor', 'emoji'],
    downloads: 18_400,
    week: 2_200,
    likes: 3_200,
    created: ago(40),
    stickers: stickers('bolinhas', [
      ['feliz', '😊', 'feliz sorriso alegre'],
      ['rindo', '😂', 'rindo kkkk risada'],
      ['chorando', '😭', 'chorando triste'],
      ['bravo', '😠', 'bravo raiva'],
      ['apaixonado', '😍', 'apaixonado amor'],
      ['chocado', '😮', 'chocado surpresa'],
      ['sono', '😴', 'sono dormir cansado'],
      ['descolado', '😎', 'descolado oculos top'],
      ['pensando', '🤔', 'pensando duvida hmm'],
      ['piscando', '😉', 'piscando piscadinha'],
    ]),
  },
  {
    id: 'p-animadas',
    name: 'Bolinhas animadas',
    author: 'u-puxa',
    category: 'animadas',
    animated: true,
    tags: ['animadas', 'movimento', 'reacoes', 'kkkk', 'coracao'],
    downloads: 15_600,
    week: 3_100,
    likes: 2_600,
    created: ago(12),
    stickers: stickers(
      'animadas',
      [
        ['pulando', '🥳', 'pulando feliz animada'],
        ['piscando', '😉', 'piscando animada'],
        ['kkkk', '😂', 'kkkk risada rindo animada'],
        ['coracao', '❤️', 'coracao amor batendo animada'],
        ['sextou', '🎉', 'sextou sexta animada'],
        ['gato-dormindo', '😴', 'gato gatinho dormindo sono animada'],
      ],
      true,
    ),
  },
  {
    id: 'p-gatinhos',
    name: 'Gatinhos',
    author: 'u-gatices',
    category: 'bichinhos',
    animated: false,
    tags: ['gato', 'gatinho', 'gatos', 'bichinhos', 'miau', 'pet'],
    downloads: 12_900,
    week: 1_400,
    likes: 2_100,
    created: ago(33),
    stickers: stickers('gatinhos', [
      ['oi', '👋', 'oi ola gato gatinho'],
      ['miau', '🐱', 'miau gato gatinho'],
      ['dormindo', '😴', 'dormindo sono gato gatinho'],
      ['bravo', '😾', 'bravo humpf gato gatinho'],
      ['surpreso', '🙀', 'surpreso susto gato gatinho'],
      ['apaixonado', '😻', 'apaixonado amor gato gatinho'],
      ['piscando', '😉', 'piscando gato gatinho'],
      ['fome', '🍽️', 'fome comida gato gatinho'],
    ]),
  },
  {
    id: 'p-amor',
    name: 'Meu bem',
    author: 'u-bia',
    category: 'amor',
    animated: false,
    tags: ['amor', 'te amo', 'saudade', 'coracao', 'namoro'],
    downloads: 9_800,
    week: 900,
    likes: 1_900,
    created: ago(28),
    stickers: stickers('amor', [
      ['te-amo', '❤️', 'te amo amor coracao'],
      ['coracao', '❤️', 'coracao amor'],
      ['dois-coracoes', '💕', 'coracoes amor casal'],
      ['saudade', '🥺', 'saudade falta'],
      ['meu-bem', '😘', 'meu bem amor'],
      ['amo-muito', '😍', 'amo muito amor'],
    ]),
  },
  {
    id: 'p-trabalho',
    name: 'Grupo da firma',
    author: 'u-firma',
    category: 'trabalho',
    animated: false,
    tags: ['trabalho', 'firma', 'reuniao', 'ok', 'escritorio'],
    downloads: 7_600,
    week: 600,
    likes: 900,
    created: ago(20),
    stickers: stickers('trabalho', [
      ['ok', '✅', 'ok certo feito'],
      ['feito', '✅', 'feito pronto ok'],
      ['reuniao', '📅', 'reuniao call'],
      ['ciente', '👍', 'ciente ok entendido'],
      ['ja-volto', '⏳', 'ja volto espera'],
      ['pode-ser', '🤷', 'pode ser talvez'],
      ['segue', '🕺', 'segue o baile'],
    ]),
  },
  {
    id: 'p-festa',
    name: 'Bora comemorar',
    author: 'u-festaja',
    category: 'festa',
    animated: false,
    tags: ['festa', 'parabens', 'aniversario', 'comemorar', 'baloes'],
    downloads: 5_400,
    week: 1_100,
    likes: 800,
    created: ago(9),
    stickers: stickers('festa', [
      ['parabens', '🎉', 'parabens aniversario festa'],
      ['aniversario', '🎂', 'feliz aniversario parabens'],
      ['baloes', '🎈', 'baloes festa'],
      ['comemorar', '🥳', 'bora comemorar festa'],
      ['uhul', '🙌', 'uhul comemorar'],
      ['partiu', '🚀', 'partiu bora'],
    ]),
  },
  {
    id: 'p-puxa',
    name: 'Puxa',
    author: 'u-puxa',
    category: 'frases',
    animated: false,
    tags: ['puxa', 'oficial', 'link', 'playlist', 'baixar'],
    downloads: 4_200,
    week: 500,
    likes: 700,
    created: ago(15),
    stickers: stickers('puxa', [
      ['puxa', '⬇️', 'puxa oficial'],
      ['simbolo', '⬇️', 'puxa simbolo logo'],
      ['manda-o-link', '🔗', 'manda o link'],
      ['baixei', '📥', 'baixei pronto'],
      ['playlist', '🎵', 'playlist musica'],
    ]),
  },
  {
    id: 'p-marcos',
    name: 'Do Marcos',
    author: 'u-marcos',
    category: 'frases',
    animated: false,
    tags: ['maceio', 'praia', 'calor', 'busao', 'codigo'],
    downloads: 120,
    week: 40,
    likes: 35,
    created: ago(6),
    stickers: stickers('marcos', [
      ['partiu-praia', '🏖️', 'partiu praia maceio mar'],
      ['calor', '🥵', 'calor maceio'],
      ['busao', '🚌', 'busao onibus atrasado'],
      ['codigo-rodou', '💻', 'codigo rodou programacao'],
    ]),
  },
  {
    id: 'p-ana',
    name: 'Reações da Ana',
    author: 'u-ana',
    category: 'reacoes',
    animated: false,
    tags: ['reacoes', 'amamos', 'chocada'],
    downloads: 340,
    week: 90,
    likes: 60,
    created: ago(3),
    stickers: stickers('ana', [
      ['oi', '👋', 'oi ola feliz'],
      ['amamos', '😍', 'amamos amor'],
      ['nao-acredito', '😱', 'nao acredito chocada'],
      ['chocada', '😮', 'chocada surpresa'],
    ]),
  },
];

const follows: [string, string][] = [
  ['u-ana', 'u-marcos'],
  ['u-ana', 'u-puxa'],
  ['u-ana', 'u-bia'],
  ['u-ana', 'u-gatices'],
  ['u-marcos', 'u-puxa'],
  ['u-marcos', 'u-oxente'],
  ['u-oxente', 'u-marcos'],
  ['u-bia', 'u-ana'],
  ['u-bolinhas', 'u-puxa'],
  ['u-gatices', 'u-puxa'],
  ['u-firma', 'u-puxa'],
  ['u-festaja', 'u-puxa'],
  ['u-festaja', 'u-bia'],
];

/** O banco do zero: sem ninguém entrado, sem buscas e sem pacote instalado. */
export function seed(): DB {
  return {
    version: 1,
    users: people.map((u) => ({ ...u })),
    secrets: { 'u-marcos': hashSecret(TEST_PASSWORD), 'u-ana': hashSecret(TEST_PASSWORD) },
    emails: Object.fromEntries(TEST_ACCOUNTS.map((a) => [a.id, a.email])),
    packs: packs.map((p) => ({ ...p, stickers: p.stickers.map((s) => ({ ...s })) })),
    follows: follows.map(([from, to]) => ({ from, to })),
    liked: { 'u-ana': ['p-marcos', 'p-gatinhos'], 'u-marcos': ['p-nordeste'] },
    session: null,
    searches: [],
    installed: {},
  };
}
