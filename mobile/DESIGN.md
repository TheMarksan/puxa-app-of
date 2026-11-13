# Sistema de design do Puxa

O Puxa 2.0 tem uma linguagem só, a do **pôster**: cor chapada, letra condensada em maiúsculas e peças em forma de pílula. Tudo o que uma tela usa sai de `src/theme` (um ponto de entrada: `import { … } from '../theme'`). O teste `tests/design.test.ts` lê o código e falha se alguma tela escolher letra, espaço, canto, cor ou sombra por conta própria.

## Marca

- **Símbolo:** o P da Anton com a perna virando uma seta para baixo. Arquivos em `assets/` (`mark.png` e `wordmark.png` são brancos, para pintar com `tintColor`). O mesmo desenho, em vetor, vai para a barra de status pelo plugin `plugins/with-puxa-android.js`.
- **Logotipo:** PUXA com esse P. No topo do Início ele recua o tanto da ponta da seta, para a haste do P alinhar com o texto de baixo (`Wordmark` em `src/components/ui.tsx`).
- **Ícone do app:** símbolo branco no azul `#2B4BFF`, com a versão monocromática para o ícone temático do Android 13.

## Cor: 60 / 30 / 10

| Papel | Claro | Escuro | Onde |
|---|---|---|---|
| Fundo (60%) | `#F4F2EC` papel | `#0F1012` | telas |
| Superfície | `#FFFFFF` | `#191B1F` / `#23262B` | grupos, folhas, menus |
| Nanquim (30%) | `#15161A` | `#F2F1EC` | texto, barra flutuante, pílulas escolhidas |
| Azul (10%) | `#2B4BFF` | `#3A5BFF` | a ação principal da tela, e só ela |

- **Hierarquia do texto por opacidade do nanquim:** título 100%, texto corrido 80% (`body`), apoio 64% (`muted`), desativado 40% (`faint`).
- **Poço** (`sunken`): nanquim a 6%, translúcido. Campos, trilhos, botões neutros e pílulas não escolhidas. Sem contorno: as peças se separam pelo tom.
- **Verde** só quer dizer "deu certo" (salvo, no WhatsApp). O botão de mandar no WhatsApp é azul, com o símbolo do WhatsApp.
- **Vermelho** só para erro e para apagar.
- **Cores das playlists** (`src/playlist/colors.ts`): cada uma tem a cor do pôster (`bg`), a letra sobre ela (`ink`), o fundo do player (`deep`) e a versão para texto sobre o fundo do app (`onLight` e `onDark`, via `listInk`).
- **Sobre foto e vídeo** (`media`): branco sobre um véu escuro, igual nos dois temas.
- **Editor** (`src/editor/ui/palette.ts`): sempre escuro, derivado do tema escuro.
- **Contraste:** todo texto passa de 4,5:1 nos dois temas, nos fundos, nos poços e nas peças de cor; o teste confere.

## Letra

Duas famílias: **Anton** (pôster) e **Archivo** (leitura), esta em dois pesos. Quatro tamanhos no app inteiro.

| Estilo | Família | Tamanho / linha | Uso |
|---|---|---|---|
| `display` | Anton, maiúsculas | 40 / 48 | título de tela, pôster, letra da música |
| `title` | Archivo 700 | 22 / 28 | título de folha, de tela vazia |
| `body` / `bodyBold` | Archivo 400 / 700 | 16 / 24 | texto corrido, nome de item, botão |
| `caption` / `captionBold` | Archivo 400 / 700 | 13 / 20 | apoio, metadados, botão pequeno |
| `overline` | Archivo 700, maiúsculas | 13 / 16 | nome de seção |

Números que mudam (tempo, tamanho, porcentagem) usam `tabular`.

## Espaço, tamanho e canto

- **Grade de 4:** `space` = 4, 8, 12, 16, 24, 32, 48, 64. Margem das telas e folhas: `gutter` (24). O que é parente fica perto (4 a 12); grupos se separam por 24; seções por 32 ou mais.
- **Controles:** 40, 48 e 56 de altura (`control`). O toque nunca tem menos de 48 (`hit()` completa o que falta).
- **Ícones:** 16, 20, 24 e 32 (12 só em selos).
- **Cantos:** 4, 8 (miniaturas), 12 (peças pequenas), 16 (blocos e campos), 24 (cartões e folhas) e pílula. Cantos aninhados são concêntricos: o de dentro é o de fora menos a folga.

## Sombra e movimento

- Sombras são `boxShadow` com a cor do fundo (marrom bem escuro no claro, preto no escuro), em três alturas: `shadow1` (grupos), `shadow2` (o que flutua), `shadow3` (folhas). O botão principal tem `glow` (fio de luz por dentro e a sombra na cor do azul).
- Movimento em `motion.ts`: entrar devagar e sair rápido; o toque encolhe a peça (0,97 em botões, 0,92 em botões redondos). Linhas largas não encolhem, só mudam de fundo.

## Peças

- `Button`: `accent` (uma por tela), `soft`, `neutral`, `ghost`, `danger`, `inverse`; tamanhos `lg` (56), `md` (48), `sm` (40); `whatsapp` troca o ícone; `tint` pinta com a cor da playlist.
- `IconButton`, `BackButton`: círculo de 40 com toque de 48.
- `Group` + `Hairline`: listas de configuração (um bloco branco, linhas separadas por fio, sem cartão em cada linha).
- `EmptyState`: desenho, o que falta, o que fazer. Toda tela tem vazio, carregando, erro e pronto.
- `BusyCard` e `SendRow`: o rodapé das folhas de envio, preso embaixo.
- `ScreenHeader`: voltar e ações em cima, título em `display` embaixo.

## Onde o sistema abre exceção

- **Arte feita com conta** (a capa da playlist, o desenho do pôster, a legenda gravada no vídeo): `components/music/Cover.tsx`, `editor/ui/CaptionLayer.tsx` e `editor/ui/TextVisual.tsx` ficam fora da conferência.
- **Uma linha que desenha conteúdo** (a forma da figurinha, que sai da escolha da pessoa) pode se isentar com um comentário na própria linha dizendo o motivo: `/* arte: o canto vem da escolha da pessoa */`.
- **Uma correção ótica:** o triângulo do play vai um tico para a direita (`PlayIcon`).
