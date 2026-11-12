/**
 * Cores e desenhos das capas das playlists. Cada playlist é um pôster: uma cor chapada, o nome
 * em letra condensada e um desenho de fundo que sai do próprio nome (sem foto de ninguém).
 */

export type ListColor = 'azul' | 'coral' | 'verde' | 'roxo' | 'rosa' | 'amarelo' | 'grafite' | 'lima';

/** [ink]: letra sobre a cor (o nome vem grande, então 3:1 já é legível). [deep]: fundo do player. */
export const COLORS: Record<ListColor, { label: string; bg: string; ink: string; deep: string }> = {
  azul: { label: 'Azul', bg: '#2547D0', ink: '#FFFFFF', deep: '#0F1C55' },
  coral: { label: 'Coral', bg: '#EE4B32', ink: '#FFFFFF', deep: '#5A1A10' },
  verde: { label: 'Verde', bg: '#0F8F5F', ink: '#FFFFFF', deep: '#073A27' },
  roxo: { label: 'Roxo', bg: '#6D35E0', ink: '#FFFFFF', deep: '#2A1259' },
  rosa: { label: 'Rosa', bg: '#D93A82', ink: '#FFFFFF', deep: '#561433' },
  amarelo: { label: 'Amarelo', bg: '#F5C518', ink: '#1B1600', deep: '#4A3A00' },
  lima: { label: 'Lima', bg: '#B5DE45', ink: '#152100', deep: '#2F420A' },
  grafite: { label: 'Grafite', bg: '#2B2F36', ink: '#FFFFFF', deep: '#121418' },
};

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
