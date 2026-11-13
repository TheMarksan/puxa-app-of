import type { ListColor } from '../playlist/colors';
import type { ArtKey } from './art';

/**
 * A comunidade de figurinhas: pessoas, pacotes e quem segue quem. Por enquanto tudo é simulado
 * no aparelho (src/community/store.ts); os tipos são os que o servidor vai devolver.
 */

/** Uma imagem: da arte de teste que vem no app ou um arquivo do aparelho. */
export type Img = { art: ArtKey } | { uri: string };

export type CategoryId = 'reacoes' | 'bomdia' | 'amor' | 'bichinhos' | 'nordeste' | 'trabalho' | 'festa' | 'animadas' | 'frases';

export type Category = {
  id: CategoryId;
  name: string;
  /** Cor do pôster da categoria (a das playlists). */
  color: ListColor;
  /** Figurinha que representa a categoria. */
  cover: ArtKey;
};

export type User = {
  id: string;
  /** Sem @, minúsculas, letras, números, ponto e sublinhado. */
  username: string;
  name: string;
  bio: string;
  avatar: Img | null;
  cover: Img | null;
  verified?: boolean;
  joined: number;
  /** Seguidores que existem fora dos dados de teste (só para os números parecerem reais). */
  extraFollowers?: number;
};

export type Sticker = {
  id: string;
  img: Img;
  /** Primeiro quadro em PNG (animadas): vira o ícone do pacote no WhatsApp. */
  poster?: Img;
  emojis: string[];
  tags: string[];
};

export type Pack = {
  id: string;
  name: string;
  author: string;
  category: CategoryId;
  animated: boolean;
  stickers: Sticker[];
  tags: string[];
  downloads: number;
  /** Adições nos últimos 7 dias: decide o que está em alta. */
  week: number;
  likes: number;
  created: number;
};

export type Follow = { from: string; to: string };

/** O "banco" simulado inteiro, gravado num arquivo do app. */
export type DB = {
  version: number;
  users: User[];
  /** Senha de cada conta, guardada só como resumo (nunca o texto). */
  secrets: Record<string, string>;
  /** E-mail de cada conta (fora do perfil público). */
  emails: Record<string, string>;
  packs: Pack[];
  follows: Follow[];
  /** Pacotes curtidos por cada pessoa. */
  liked: Record<string, string[]>;
  session: string | null;
  /** Buscas recentes deste aparelho (a mais nova primeiro). */
  searches: string[];
  /** Pacote do acervo → pasta de figurinhas em que ele foi instalado neste aparelho. */
  installed: Record<string, string>;
};
