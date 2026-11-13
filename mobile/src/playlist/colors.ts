/**
 * Cores e desenhos das capas das playlists. Cada playlist é um pôster: uma cor chapada, o nome
 * em letra condensada e um desenho de fundo que sai do próprio nome (sem foto de ninguém).
 */

export type ListColor = 'azul' | 'coral' | 'verde' | 'roxo' | 'rosa' | 'amarelo' | 'grafite' | 'lima';

/**
 * [ink]: letra sobre a cor, sempre com contraste de 4,5:1 ou mais. [deep]: fundo do player.
 * [onLight] e [onDark]: a mesma cor para texto e ícones sobre o fundo do app (o papel claro e o
 * fundo escuro), escurecida ou clareada só o necessário para passar de 4,5:1.
 */
export const COLORS: Record<ListColor, { label: string; bg: string; ink: string; deep: string; onLight: string; onDark: string }> = {
  azul: { label: 'Azul', bg: '#2B4BFF', ink: '#FFFFFF', deep: '#0E1A5C', onLight: '#2B4BFF', onDark: '#6F85FF' },
  coral: { label: 'Coral', bg: '#D8371F', ink: '#FFFFFF', deep: '#5A1A10', onLight: '#BE301B', onDark: '#E26957' },
  verde: { label: 'Verde', bg: '#0D8658', ink: '#FFFFFF', deep: '#073A27', onLight: '#0B754D', onDark: '#3D9E79' },
  roxo: { label: 'Roxo', bg: '#6D35E0', ink: '#FFFFFF', deep: '#2A1259', onLight: '#6D35E0', onDark: '#9F7AEB' },
  rosa: { label: 'Rosa', bg: '#D4357D', ink: '#FFFFFF', deep: '#561433', onLight: '#B82E6D', onDark: '#DE639B' },
  amarelo: { label: 'Amarelo', bg: '#F5C518', ink: '#1B1600', deep: '#4A3A00', onLight: '#7A620C', onDark: '#F5C518' },
  lima: { label: 'Lima', bg: '#B5DE45', ink: '#152100', deep: '#2F420A', onLight: '#596D22', onDark: '#B5DE45' },
  grafite: { label: 'Grafite', bg: '#2B2F36', ink: '#FFFFFF', deep: '#121418', onLight: '#2B2F36', onDark: '#B9BBBE' },
};

/** A cor da playlist para texto e ícones sobre o fundo do app. */
export const listInk = (color: ListColor, dark: boolean) => (dark ? COLORS[color].onDark : COLORS[color].onLight);

export const COLOR_IDS = Object.keys(COLORS) as ListColor[];

export const isColor = (v: unknown): v is ListColor => typeof v === 'string' && v in COLORS;

/** Sugestões para começar: nome e cor que combinam. */
export const SUGGESTIONS: { name: string; color: ListColor }[] = [
  { name: 'Treino', color: 'coral' },
  { name: 'Estudos', color: 'azul' },
  { name: 'Relaxar', color: 'verde' },
  { name: 'Viagem', color: 'amarelo' },
  { name: 'Festa', color: 'rosa' },
  { name: 'Foco', color: 'grafite' },
];

/** Desenho de fundo da capa (0 a 3), escolhido pelo nome: a mesma playlist sempre igual. */
export function motifOf(name: string): number {
  // FNV-1a: espalha bem até nomes parecidos
  let h = 0x811c9dc5;
  for (const ch of name.trim().toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % 4;
}

/** Cor da próxima playlist: a primeira que ainda não está em uso. */
export function nextColor(used: ListColor[]): ListColor {
  return COLOR_IDS.find((c) => !used.includes(c) && c !== 'grafite') ?? COLOR_IDS[used.length % COLOR_IDS.length];
}

/** Margem da capa em volta do nome. */
export const coverPad = (side: number) => Math.max(5, side * 0.08);

/**
 * Tamanho da letra do nome na capa: nomes curtos bem grandes, longos menores. A palavra mais
 * longa cabe inteira na largura (a letra condensada tem ~0,46 da altura de largura por letra).
 */
export function titleSize(name: string, side: number): number {
  const words = name.trim().split(/\s+/);
  const longest = Math.max(...words.map((w) => w.length), 1);
  const room = side - 2 * coverPad(side);
  const byWidth = room / (longest * 0.46);
  const byLines = (side * 0.62) / (Math.min(3, words.length) * 1.08);
  return Math.max(7, Math.min(side * 0.34, byWidth, byLines));
}

/** Matiz (0 a 360), saturação e luminosidade (0 a 1) de uma cor. */
export function hsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];

/**
 * Cor da playlist que combina com uma imagem: a matiz que mais aparece entre os pontos coloridos
 * (pesando pela saturação), levada para a cor mais perto da paleta. Imagem sem cor (preto e
 * branco, cinza) fica no grafite.
 */
export function colorFromPixels(rgb: ArrayLike<number>): ListColor {
  let x = 0;
  let y = 0;
  let weight = 0;
  let n = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const c = hsl(rgb[i], rgb[i + 1], rgb[i + 2]);
    n++;
    // Pontos quase pretos ou quase brancos não contam como cor
    const w = c.s * (1 - Math.abs(2 * c.l - 1));
    if (w <= 0.05) continue;
    const a = (c.h * Math.PI) / 180;
    x += w * Math.cos(a);
    y += w * Math.sin(a);
    weight += w;
  }
  if (!n || weight / n < 0.08 || Math.hypot(x, y) / n < 0.06) return 'grafite';
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  let best: ListColor = 'azul';
  let gap = Infinity;
  for (const id of COLOR_IDS) {
    if (id === 'grafite') continue;
    const [r, g, b] = hex(COLORS[id].bg);
    const d = Math.abs(((hsl(r, g, b).h - hue + 540) % 360) - 180);
    if (d < gap) {
      gap = d;
      best = id;
    }
  }
  return best;
}
