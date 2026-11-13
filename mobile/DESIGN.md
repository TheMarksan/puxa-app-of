# Sistema de design do Puxa

O Puxa 2.0 nasceu com a linguagem do **pôster**: cor chapada, letra condensada em maiúsculas e peças em forma de pílula. Desde a 2.1.2 o pôster fica para o nome das telas e as capas das playlists; o conteúdo (acervo e playlists) segue o tom sóbrio dos apps de mídia (veja **Mídia**, abaixo). Tudo o que uma tela usa sai de `src/theme` (um ponto de entrada: `import { … } from '../theme'`). O teste `tests/design.test.ts` lê o código e falha se alguma tela escolher letra, espaço, canto, cor ou sombra por conta própria.

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
| `display` | Anton, maiúsculas | 40 / 48 | título de tela, número grande, letra da música |
| `title` | Archivo 700 | 22 / 28 | título de folha, de tela vazia, nome no perfil, nome no topo de playlist, pacote e categoria |
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

## Acervo

- **Figurinha sobre o poço** (`sunken`), nunca sobre o branco (a borda branca dela some). O fundo de conversa (`chat`) fica só para a prévia grande de uma figurinha e para a fileira do publicar, onde a pergunta é "como fica na conversa".
- **Um botão principal por tela:** no pacote, **Adicionar ao WhatsApp** (azul, preso embaixo); nas listas, cada pacote leva o **símbolo do WhatsApp com um + azul no canto** (o + vira um visto verde quando o pacote já está lá), num círculo azul claro, para deixar claro para onde ele vai sem ter dez botões azuis competindo.
- **Formulários** (`Field`): o nome do campo sempre em cima, o poço para digitar, o erro colado embaixo em vermelho. Nunca só o texto de exemplo.
- **Atalhos da busca:** um painel claro colado no campo (12 abaixo dele), com até três linhas: a peça do tipo (cor da categoria, foto da pessoa, capa do pacote), o nome com o pedaço digitado em negrito e embaixo o que é ("Categoria · 2 pacotes"). O mais certeiro em cima. Os resultados vêm um grupo abaixo.
- **Categoria troca ali mesmo:** a fileira de todas as categorias logo abaixo do topo, a escolhida cheia (`inverse`), as outras no poço.
- **Peça na borda:** botão ou foto que fica entre a capa e o corpo (tocar e aleatório na playlist, foto e Editar perfil/Seguir no perfil, foto no editar perfil) tem o **centro na linha** da borda, um anel de 4 da cor do fundo e fundo opaco (metade fica sobre a capa).
- **Topo das telas:** barra de 48 a 8 da área segura em todas (Início, telas com título, topos de mídia, perfil): o voltar, o menu e a foto da conta ficam com o centro a 32 do topo.
- **Botões no fim da linha** de um grupo (Ajustes) com a mesma largura mínima (96): a coluna deles alinha nas duas bordas.
- **Topo do Início:** Colar link é uma linha (círculo de 40, texto a 64 da margem); o exemplo é só um link discreto embaixo, com o ícone no eixo do círculo e o texto na coluna do título.
- **Leve no Início:** nas listas a figurinha animada aparece parada (`still`, o primeiro quadro); anima só no pacote e na prévia. Toda figurinha decodifica do tamanho da peça (`resizeMethod="resize"`), nunca os 512x512 inteiros. O acervo fica montado enquanto se busca (some da tela, não sai da memória).
- **Leve em todas as telas:** lista que pode crescer (as músicas de uma playlist, a biblioteca no escolher) é `FlatList`, com linhas memorizadas. Tela de lista usa `usePlayerCore` (o player sem o tempo): só o miniplayer e a barra de tempo se redesenham a cada segundo. Toda `<Image>` decodifica do tamanho da peça (`resizeMethod="resize"`), e nas grades das pastas a figurinha animada aparece parada.

## Mídia (acervo e playlists)

O tom dos apps de música: o colorido vem do conteúdo (as figurinhas, as capas), e a interface fica neutra em volta.

- **Topo** (`MediaHeader`): um véu da cor (`listSoft`: a cor a 14% no claro e 22% no escuro) sobre o fundo, a capa no meio e, embaixo dela, o tipo (`overline`), o nome (`title`) e os números (`caption`), alinhados à esquerda. Botões do topo brancos (elevados no escuro). Nada de cor chapada de ponta a ponta, anéis ou figurinhas inclinadas.
- **Capas:** pacote é a primeira figurinha num quadrado claro de 160 (canto 24); categoria é a figurinha num círculo; playlist é a capa dela com 176 e sombra, como um álbum.
- **Categorias em círculos** de 64 com o nome embaixo (`CategoryCircle`), num véu da cor dela. O primeiro é **Criar a sua**.
- **Pacote numa lista** (`PackRow`): linha de 72, capa de 56, nome, `@autor · tamanho · ⤓ adições`, o botão do WhatsApp com + no fim. Vale para o Início, a busca, a categoria e o perfil.
- **Carrossel** (`PackTile`): capa de 120 (cabem dois e meio), nome e autor em letra pequena. Sem selo de posição nem de animada: a ordem já diz.
- **Biblioteca de músicas** em linhas iguais às dos pacotes: Todas as músicas, as playlists e Nova playlist.
- **Player:** o fundo é a cor funda da playlist (`deep`) com um brilho fraco da cor por cima.

## Onde o sistema abre exceção

- **Arte feita com conta** (a capa da playlist, o desenho do pôster, a legenda gravada no vídeo): `components/music/Cover.tsx`, `editor/ui/CaptionLayer.tsx` e `editor/ui/TextVisual.tsx` ficam fora da conferência.
- **Uma linha que desenha conteúdo** (a forma da figurinha, que sai da escolha da pessoa) pode se isentar com um comentário na própria linha dizendo o motivo: `/* arte: o canto vem da escolha da pessoa */`.
- **Uma correção ótica:** o triângulo do play vai um tico para a direita (`PlayIcon`).
