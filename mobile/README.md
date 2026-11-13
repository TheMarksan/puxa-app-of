# Puxa para Android

App em React Native (Expo). A tela inicial é o **Início**: um campo só que busca figurinhas ou abre um link, o **acervo de figurinhas** logo abaixo, a ação principal (**Colar link**) embaixo, ao alcance do polegar, e uma barra flutuante escura que leva às **Playlists**, às **Figurinhas** e aos **Ajustes**. A foto no canto de cima leva à sua conta. Com um vídeo aberto a barra sai de cena e o botão de menu no topo leva aos mesmos lugares. Limpar o campo ou tocar em voltar retorna ao começo.

## Acervo e comunidade (2.1)

> Ainda não existe servidor: contas, perfis, seguidores, curtidas e pacotes são **simulados no celular** (`src/community/store.ts`), com uma pequena espera de rede de mentira. Os tipos e as funções já têm a forma que o servidor vai ter; quando ele existir, só esse arquivo muda.

- **Um campo, duas coisas:** um link (YouTube, Instagram, X) abre o vídeo como antes; qualquer outro texto busca figurinhas na hora. Com o campo vazio e tocado, aparecem as **buscas recentes** (dá para tirar uma ou limpar) e as **pesquisas em alta**.
- **Resultado em três abas:** Figurinhas (soltas, numa grade), Pacotes e Pessoas. A busca ignora acento e maiúsculas e procura no nome, nas palavras do pacote e das figurinhas, na categoria e em quem fez.
- **Início:** categorias em pôster (Reações, Bom dia, Nordeste, Amor, Bichinhos, Animadas, Festa, Trabalho, Frases), o pacote em alta como pôster, os mais adicionados da semana, de quem você segue, os mais adicionados e os novos. Cada pacote tem o botão **+**, que põe o pacote inteiro no WhatsApp.
- **Pacote:** pôster na cor da categoria, quem fez (com Seguir), curtidas, as figurinhas na grade e **Adicionar ao WhatsApp** preso embaixo. O pacote vira uma pasta em Figurinhas e de lá vai para o WhatsApp; adicionar de novo reaproveita a pasta. Tocar numa figurinha abre a prévia, para pôr só ela numa pasta sua.
- **Conta:** entrar com e-mail ou @usuário, ou criar conta (nome, @usuário, e-mail e senha). Perfil com capa, foto, nome, @, sobre você, pacotes publicados e curtidos, e os números de pacotes, seguidores, seguindo e adições. Seguir e deixar de seguir, listas de seguidores e seguindo, e editar o perfil (foto e capa da galeria).
- **Publicar:** numa pasta de Figurinhas, menu **⋮ > Publicar na comunidade**: nome, categoria e palavras para a busca. O WhatsApp pede de 3 a 30 figurinhas de um tipo só, então uma pasta com paradas e animadas publica uma das duas. O pacote publicado aparece na busca, nos Novos e no seu perfil; quem publicou pode tirar.
- **Contas de teste** (as duas com a senha `puxa123`): `marcos@puxa.app` (Marcos, @marcos) e `ana@puxa.app` (Ana Lima, @analima). A tela de entrar tem os botões **Usar** que preenchem cada uma. A Ana já segue o Marcos e o Marcos segue o Puxa e o Oxente, para dar para testar seguir, seguidores e "De quem você segue". Em **Ajustes > Armazenamento > Comunidade (teste)**, **Restaurar** volta tudo ao começo.
- **Arte de teste:** 11 pacotes originais (71 figurinhas, 6 delas animadas), avatares e capas, desenhados por código em `scripts/acervo/gen.py` (Python com Pillow; ele também escreve `src/community/art.ts`). Nenhum personagem ou marca de terceiros.

## Figurinha com foto ou vídeo do celular (2.1)

- Em **Figurinhas**, no botão **Criar com foto ou vídeo** (embaixo), no **+** de uma pasta ou na peça **Criar a sua** das categorias do Início.
- Abre a galeria do Android (sem pedir permissão). Foto vira figurinha parada; vídeo e GIF viram animada (o GIF passa antes por um MP4, para dar para escolher o trecho). Depois é o mesmo editor do Início: recorte, cantos, contorno, texto, emoji e a pasta.
- Dentro de uma pasta, o **+** já deixa essa pasta escolhida.

- **Baixar:** vídeos e Shorts do YouTube (MP3, M4A ou MP4 até 1080p), Reels, posts, fotos e perfis do Instagram, e posts e perfis do X. Assim que o link abre, aparecem **Compartilhar**, **Figurinha**, **Baixar** e **Playlist**; o arquivo baixa para o armazenamento do app quando você escolhe uma delas. Vai para o WhatsApp inteiro, só um trecho, com legenda gravada na imagem, dublado com vozes de IA ou como figurinha.
- **Playlists:** cole links (um ou vários de uma vez) e cada um vira uma música guardada no celular. Separe em playlists (Treino, Estudos...), cada uma com a sua capa, toque em fila ou no aleatório com a tela desligada (controles na notificação e na tela de bloqueio) e veja a letra sincronizada, como no Spotify.
- **Figurinhas:** pastas com nome (Memes, Família...). Cada pasta vira um pacote no WhatsApp, separado em paradas e animadas.
- **Ajustes:** aparência (automático, claro ou escuro), contas (Instagram, só para stories e destaques, e a chave da ElevenLabs, para transcrição e dublagem na nuvem), espaço ocupado com limpeza por tipo de arquivo, e os termos de uso.

O app não tem servidor próprio: todo pedido sai do próprio celular. A extração do YouTube usa o [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor), o motor do app NewPipe, num módulo nativo em Kotlin. Como o pedido sai do IP do próprio celular (residencial ou de operadora), o YouTube libera a mídia, o que não acontece com servidores em nuvem. O Instagram e o X entregam a mídia pronta (MP4 com som ou foto): o app pede como o site faz para quem visita sem conta e, se a rede barrar esse pedido, abre a página pública num navegador invisível dentro do app e lê a mídia dali. A montagem dos vídeos usa o FFmpeg (FFmpegKit), a transcrição no celular usa o whisper.cpp e a tradução usa o ML Kit do Google, tudo no aparelho. Só a transcrição e a dublagem pela ElevenLabs saem do celular, e só quando você coloca a sua chave.

## Visual (2.0)

- **Marca nova:** o símbolo é um P de pôster com a perna virando uma seta para baixo (puxar). Ele está no ícone do app (com fundo azul e o ícone temático do Android 13), na abertura, no topo do Início, nos Ajustes, na barra de status quando a música toca e na arte da notificação.
- **Pôster:** a linguagem das capas das playlists vale para o app inteiro. Os títulos das telas usam a letra condensada **Anton** em maiúsculas; o resto usa a **Archivo** em dois pesos. São quatro tamanhos de letra no app todo (40, 22, 16 e 13).
- **Cores:** papel claro e quente no fundo (60%), nanquim no texto e nas peças escuras (30%) e um azul só (10%) para a ação principal. O verde do WhatsApp saiu dos botões: verde agora só quer dizer "deu certo". O escuro tem as mesmas regras. Todo texto passa de 4,5:1 de contraste nos dois temas, conferido em teste; as cores das playlists também têm uma versão para texto sobre o fundo do app.
- **Grade de 4:** todo espaço, tamanho e canto sai da mesma escala (4, 8, 12, 16, 24, 32, 48, 64), com 24 de margem nas telas. Os cantos são concêntricos: o player pequeno tem 24 por fora e a capa 16 por dentro, com 8 de folga.
- **Ações no polegar:** no Início, nas pastas de figurinhas e nas folhas de envio, o botão principal fica embaixo, preso no rodapé; nas folhas, o conteúdo rola por cima dele.
- **Links recentes:** o Início guarda os últimos 12 vídeos puxados (só no aparelho). Tocar abre de novo; segurar tira da lista; **Limpar** apaga todos. Em Ajustes > Armazenamento, **Links recentes** também limpa.
- **Telas vazias, carregando e erro:** cada tela tem as quatro. Sem links recentes, o Início ensina em três passos e oferece um vídeo de exemplo; voltar do WhatsApp depois de mandar comemora com um toque de cor e já oferece um novo link.
- As regras do sistema estão em [DESIGN.md](DESIGN.md) e são conferidas no `npm test`: nenhuma tela pode usar letra, espaço, canto, cor ou sombra fora de `src/theme`.

## Baixar

- **Pelo app da rede:** no YouTube, no Instagram ou no X, toque em Compartilhar e escolha Puxa. O link chega no app e a busca começa sozinha. Também dá para colar o link (ou um @ do Instagram).
- **Ações na hora:** com o link lido, o rodapé já mostra **Compartilhar** (abre o envio, com trecho, legenda e dublagem), **Figurinha**, **Baixar** (salva em `Download/Puxa`) e **Playlist** (manda o áudio para a fila da playlist, sem prender a tela). Na primeira ação o arquivo baixa para o armazenamento do app, com as etapas no próprio rodapé, e as outras ações usam o mesmo arquivo. Formato (áudio ou vídeo) e qualidade ficam logo abaixo do resultado para quem quiser trocar.
- **No envio:** **Enviar no WhatsApp** abre o WhatsApp direto na escolha da conversa; **Outros apps** abre o menu do Android.
- **Perfil do Instagram sem login:** o pedido direto do perfil hoje responde "página não encontrada" para quem não está logado, mesmo com a conta existindo. O app não trata mais isso como conta inexistente: abre a página pública do perfil no navegador invisível e lê dali a conta e a grade (só as capas; ao tocar numa publicação, o post inteiro é buscado). Com a conta conectada, se os pedidos diretos de stories e destaques falharem, o app abre no navegador invisível (com a mesma sessão do login) a página de stories da conta ou a do destaque, como no site, e lê os stories dali; se a página pedir um toque em "Ver story", o app toca sozinho. A lista de destaques do perfil vem da própria página do perfil quando a API não responde.
- **Instagram:** Reels, posts, carrosséis (escolha a foto ou o vídeo na tira de miniaturas), fotos e perfis abrem **sem login**, como no site para quem não tem conta. O perfil mostra as publicações recentes com foto ou vídeo; toque numa para abrir. **Stories e destaques** o Instagram só mostra para quem está logado: em Ajustes > Contas, entre pelo próprio site do Instagram dentro do app (a senha vai só para o Instagram) e o perfil passa a mostrar também os stories de agora e os destaques. O app só vê o que a sua conta já vê: conta privada, só se você segue.
- **X:** posts com vídeo, GIF ou foto, e perfis (os posts recentes com mídia, sem repostagens), sem login.
- **Áudio no idioma original:** vídeos do YouTube com dublagem (inclusive a dublagem automática do próprio YouTube) trazem uma faixa de áudio por idioma. O app sempre usa a faixa original, no MP3, no M4A, no vídeo e na Playlist; antes ele pegava a de maior qualidade, que muitas vezes era a dublagem em inglês. Instagram e X têm uma faixa só.
- **Trecho de áudio:** as alças da onda escolhem início e fim (arrastar o meio move a seleção inteira), os botões − e + ajustam de 1 em 1 segundo e o play toca só o trecho.
- **Trecho de vídeo:** a tira de miniaturas mostra o vídeo inteiro, as alças escolhem o trecho e os **capítulos** do YouTube (quando o vídeo tem) viram atalhos de um toque.
- **Legenda gravada no vídeo:** usa a legenda do YouTube (original ou em português; se o YouTube recusar a tradução, o app traduz no aparelho), **transcreve a fala** quando o vídeo não tem legenda (e nos vídeos do Instagram e do X), ou você **escreve** a sua.
- **Transcrição:** **No celular** (Whisper, sem internet depois de baixar o modelo) ou pela **ElevenLabs** (Scribe, a mais precisa, principalmente em outros idiomas, usando a sua conta). No celular há três modelos: Rápida, Precisa (padrão) e Máxima. Escolher o idioma falado, em vez de Automático, melhora bastante vídeos curtos, com música ou com sotaque. A escolha fica guardada para os próximos vídeos.
- **Transcrição mais rápida:** no celular a decodificação é gulosa (a palavra mais provável de cada vez), várias vezes mais rápida que a busca em feixe de antes, e só os trechos que saem estranhos são refeitos. O modelo já começa a carregar quando as opções da legenda aparecem, a transcrição começa sozinha ao tocar em **Transcrever** (se o modelo já está no celular) e as legendas vão aparecendo na prévia enquanto saem. Se a internet cair no meio do download do modelo, o próximo toque continua de onde parou.
- **Dublar:** a quarta ferramenta do envio de vídeo. A ElevenLabs transcreve separando quem fala, o app traduz e lê com duas vozes de IA (Sarah, feminina, e Liam, masculino): a primeira pessoa fica com a voz escolhida e a segunda com a outra. Cada fala é encaixada no tempo da original (acelera um pouco se precisar). Dá para ouvir antes, deixar o som original baixinho ao fundo ou tirar, e usar a legenda **Da dublagem**. Para português, inglês ou espanhol. Precisa da chave da ElevenLabs (o próprio painel pede); o botão mostra quantos créditos a dublagem deve gastar.
- **Ajustar na tela:** abre o vídeo em tela cheia com a legenda de verdade por cima. Arraste a legenda para onde quiser: linhas rosa no centro, como no Canva, mostram quando ela está centralizada na vertical ou na horizontal. Ali ficam 10 formatos prontos (faixa, clássica, contorno, impacto, amarela, marca-texto, pílula, cartão, neon, simples), 7 animações (surgir, subir, pop, palavra a palavra, karaokê, uma palavra por vez), 15 fontes, cores, tamanho e a lista dos textos para corrigir, apagar ou criar legendas.
- **Linhas da legenda:** logo abaixo do cartão da legenda, escolha **1, 2 ou 3 linhas** (padrão: 2). Uma frase que ocuparia mais linhas vira duas ou mais legendas seguidas, com o tempo da fala dividido pelo tamanho de cada pedaço, igual na prévia e no vídeo. A mesma escolha fica em Ajustar na tela > Letra e cor. A posição (em cima, no meio, embaixo ou arrastada) continua na aba Posição.
- **Enquadramento:** o vídeo vai como veio (padrão) ou com zoom, arrastando para escolher a parte da imagem.
- **Envio:** três cartões no topo escolhem o que sai: **Vídeo**, figurinha **Animada** (um trecho de até 10 s, limite do WhatsApp) ou figurinha **Parada** (um quadro, com passos de 0,1 s). No vídeo, as ferramentas **Cortar**, **Legenda** e **Zoom** abrem só quando você toca nelas; segurar o Zoom volta ao enquadramento original. Arrastar a alça da folha para baixo fecha o envio.
- **Prévia do envio:** é um player de verdade, no formato do vídeo: mostra o trecho, o zoom e a legenda como vão sair, com tocar/pausar (o botão mostra o estado), a barra de tempo do trecho para arrastar e o tempo (0:04 / 0:30). Tocando, os controles somem para a legenda aparecer inteira e fica só uma linha do progresso; tocar no vídeo pausa. O trecho toca em repetição. O botão do canto abre em tela cheia.
- **Legenda na figurinha:** com a legenda ligada no vídeo, as abas Animada e Parada mostram a mesma legenda por cima da prévia, já no recorte, e a figurinha sai com ela gravada (o trecho é montado com a legenda antes de virar figurinha). O botão **Legenda**, ao lado do Contorno, tira a legenda só da figurinha. O trecho da figurinha começa onde começa o corte do vídeo.
- **Figurinha:** **Recorte** (com os **cantos** ajustáveis do reto ao círculo: arraste a barra ou toque em Retos, Suaves, Redondos ou Círculo) ou **Inteiro** (o quadro todo, sem cortar), e o contorno branco; texto com posição e cor no mesmo campo; o emoji pelo qual o WhatsApp sugere a figurinha; e a **pasta** onde ela entra (ou **Nova**, ali mesmo). A prévia mostra o recorte sobre o fundo da conversa do WhatsApp; arrastar escolhe a parte do vídeo e dois dedos aproximam. Fotos do Instagram e do X também viram figurinha.
- O formato, os cantos e o contorno escolhidos ficam guardados para a próxima figurinha.
- **Vídeos do Instagram e do X:** esses MP4 vêm fragmentados; o app os reempacota ao baixar, então o tamanho, a duração e o primeiro quadro saem certos em todos os formatos de figurinha.

## Figurinhas

- **Pastas:** cada figurinha entra na pasta escolhida no envio. No WhatsApp, cada pasta vira dois pacotes, **Memes** (paradas) e **Memes · animadas**, porque ele não aceita os dois tipos no mesmo pacote. A pasta **Puxa** já vem criada e guarda as figurinhas das versões anteriores.
- **Adicionar ao WhatsApp** abre a confirmação do próprio WhatsApp; depois disso, as figurinhas novas entram sozinhas no pacote.
- O WhatsApp pede **pelo menos 3 figurinhas por pacote**. Enquanto houver menos, as que existem aparecem repetidas; as repetições somem quando você faz as próximas. Cada pasta guarda até 30 paradas e 30 animadas; cheia, o app pede outra pasta.
- Na tela **Figurinhas** (barra flutuante), as pastas aparecem com a capa das últimas figurinhas. Dentro de uma pasta: renomear, apagar a pasta, adicionar ao WhatsApp e, tocando numa figurinha, mandar em outro app, mover para outra pasta ou apagar (com alguns segundos para desfazer).

## Playlists

- **Biblioteca e playlists:** a tela abre com **Todas as músicas** (tudo que já virou música no celular) e as suas playlists como pôsteres: cada uma tem uma cor e um desenho de fundo que sai do nome, com o nome em letra grande. **Nova playlist** pede o nome (com sugestões: Treino, Estudos, Relaxar, Viagem, Festa, Foco, cada uma com a cor que combina) e a cor, com a capa mudando junto. Nas opções da playlist (⋯ no topo) dá para trocar nome, cor e capa ou apagar a playlist (as músicas continuam no celular).
- **Capa própria:** na criação ou em Editar, **Usar imagem** abre a galeria (o seletor de fotos do Android, sem pedir permissão) com recorte quadrado. A imagem vira a capa, com uma faixa fina da cor da playlist embaixo, e aparece grande no topo da playlist. A cor continua valendo: pinta o topo, o player pequeno, o player inteiro e a letra. Se a cor ainda não foi escolhida, o app escolhe a da paleta que mais combina com a imagem. **Tirar** volta para o pôster de cor. A imagem fica guardada no app (`files/covers`) e sai quando a playlist é apagada ou a capa trocada.
- **Adicionar:** cole um link ou uma mensagem inteira com vários; o app pega os links do YouTube, do Instagram e do X e ignora o resto. Colado numa playlist, o link entra nela (e na biblioteca); um link que já virou música entra na playlist sem baixar de novo. Numa playlist vazia ou com espaço, **Escolher da biblioteca** marca músicas que já estão no celular. No Baixar, o botão **Playlist** do rodapé manda o vídeo aberto, já com nome e capa; com playlists criadas, abre **Salvar em** para escolher em quais ele entra.
- **Baixar:** um link por vez, em fila, mesmo fora da tela. Do YouTube vem o M4A original; do Instagram e do X, o áudio AAC do próprio vídeo, copiado sem recodificar (se não der, vira MP3). A capa fica guardada junto. Um link que falhar mostra o motivo; tocar nele tenta de novo; ao abrir o app, o que estava na fila continua.
- **Notificações:** na primeira vez que o app abre (Android 13 ou mais novo), ele pede a permissão de notificações, que o Android exige para mostrar o player na barra de notificação. Se ela foi negada, o app pede de novo ao tocar uma música.
- **Tocar:** toque numa música para tocar a playlist a partir dela; o botão grande no topo toca do começo, e **Aleatório** embaralha (a música atual continua). Ao terminar uma música, a próxima começa sozinha; com repetir na lista, depois da última volta para a primeira. O player pequeno flutua embaixo, na cor da playlist, com tocar/pausar, próxima e a linha do tempo; tocar nele abre o player inteiro, com a capa grande, a barra de tempo, anterior (volta ao começo depois de 3 s), próxima, aleatório e repetir (a lista, só esta música ou nada), e **Salvar em** para pôr a música em outra playlist. Com a tela desligada, a notificação e a tela de bloqueio mostram nome, capa e os controles.
- **Notificação com a cara do app:** a arte da notificação é montada no celular: a capa da música num quadro da cor da playlist, com cantos arredondados (sem capa, a cor da playlist com a seta do Puxa). No Android 11 ou mais novo o player da notificação pinta o fundo a partir dessa arte, então ele fica na cor da playlist, como as telas. A barra de status mostra a seta do Puxa no lugar do "play" genérico, os botões (Android 12 ou mais antigo) usam o mesmo desenho dos ícones do app, a linha de baixo traz o nome da playlist e o canal aparece nas configurações como **Player de música**. A arte fica no cache e é feita de novo se a playlist mudar de cor ou capa.
- **Como o player toca:** tocar uma música monta uma fila nova que começa nela (a lista girada até ela, ou embaralhada com ela na frente), então escolher outra música sempre toca a escolhida. Se o player do aparelho parar no fim de uma música ou repetir em vez de seguir, o app passa para a próxima ele mesmo. Música nova que termina de baixar entra na fila sem parar o que está tocando. Se a fila do player não começar a tocar, o app refaz uma vez e, se ainda assim não tocar, passa a tocar uma música por vez num player simples (a notificação traz tocar/pausar e voltar ou avançar 10 s).
- **Letra:** no player inteiro, o cartão **Letra** (na cor da playlist) mostra as linhas em volta da que está tocando; tocar abre a letra inteira, que acende a linha atual e rola sozinha (se você rolar, ela espera alguns segundos antes de voltar a seguir), e tocar numa linha leva a música para aquele ponto. A letra vem do **LRCLIB**, um banco aberto de letras com o tempo de cada linha: o app tira do título do vídeo o nome da música e do artista (sem "Official Video", "Ao Vivo", "feat."...) e compara a duração. Se não achar, usa a legenda feita à mão do próprio vídeo do YouTube. Se não achar nada ou achar a errada, **Buscar** deixa escrever o nome e escolher o resultado. A letra achada fica guardada com a música e abre sem internet depois.
- **Cada música:** segure a linha ou toque no ⋮: salvar em playlist, mandar no WhatsApp ou em outro app, salvar em `Download/Puxa`, subir, descer, tirar desta playlist ou apagar do celular (com um segundo toque).
- Os arquivos ficam em `files/playlist` (com as letras guardadas), a biblioteca em `files/playlist.json` e as playlists em `files/playlists.json`. Em Ajustes > Armazenamento, **Playlist** apaga tudo (com um segundo toque).

## Ajustes

- **Aparência:** automático (igual ao celular), claro ou escuro, escolhidos pela miniatura do celular em cada tema.
- **Contas:** **Instagram** (Entrar abre o site do Instagram, carregado como no Chrome de celular para o formulário de login aparecer; Sair apaga a sessão do app) e **ElevenLabs** (a chave fica guardada com criptografia no aparelho e o app mostra os créditos que sobram). O link **Onde pego a chave?** abre a página das chaves no site da ElevenLabs.
- **Armazenamento:** quanto o app ocupa, por tipo (baixados, temporários, playlist, figurinhas e transcrição), com o botão de limpar cada um. Playlist e figurinhas pedem um segundo toque; um download em andamento não é apagado.
- **Sobre:** versão do app e, recolhidos, os **Termos de uso** (o que é o app, como funciona, seus dados, uso, garantia e os créditos do software livre).
- Na tela **Figurinhas**, apagar uma figurinha dá alguns segundos para desfazer.

## Formatos e limites

- **MP3** (192 kbps) é recodificado no aparelho com o FFmpeg e toca em qualquer lugar. **M4A** é o arquivo original do YouTube, sem perda e mais rápido.
- **Vídeo baixado** é o MP4 (H.264) do YouTube junto com o melhor áudio, sem recodificar (só reempacotado). Um trecho, ou o vídeo com legenda, é montado de novo no aparelho, com corte exato e em até 720p.
- **Animação das palavras:** palavra a palavra, karaokê e uma por vez estimam o tempo de cada palavra pelo tamanho dela dentro da legenda (o YouTube e a transcrição dão o tempo da frase, não de cada palavra).
- **Instagram e X:** o vídeo vai como a rede entrega (MP4 com som, na maior qualidade que ela oferece), sem recodificar; o MP3 é tirado dele. Fotos vão na maior resolução que a rede entrega. Os links da mídia vencem com o tempo: se um vencer com o item aberto, **Tentar de novo** lê o link outra vez.
- **Transcrição no celular:** na primeira vez o app baixa o modelo escolhido: Rápida (60 MB), Precisa (190 MB) ou Máxima (550 MB, a large-v3-turbo). Depois funciona sem internet. Em vídeos longos pode levar alguns minutos, conforme o celular; a Máxima pede um celular mais forte.
- **ElevenLabs:** a transcrição e a dublagem gastam créditos da sua conta. A voz gasta cerca de 1 crédito por letra falada (uns 140 a cada 10 s de fala), e o botão de dublar mostra a estimativa antes. Sem créditos, o app avisa.
- **Tradução no aparelho:** o primeiro uso baixa o pacote do idioma (cerca de 30 MB).
- **Limite do WhatsApp:** acima de 16 MB ele pode mandar como documento. O envio de trecho ajusta a qualidade para o vídeo ficar abaixo disso; se nem assim couber (vídeos de vários minutos), o app avisa.
- **Figurinhas:** WebP 512x512, até 100 KB a parada e 500 KB a animada, que repete sem parar. O WebP animado guarda cada quadro inteiro, então o peso cresce com o número de quadros, quase sem depender da qualidade. Por isso a animada parte de um orçamento de cerca de 60 quadros: um trecho de 4 s sai com 15 quadros por segundo, um de 8 s com 7 e um de 10 s com 6 (formas com borda curva e contorno pesam mais e ganham menos quadros). Se ainda passar do limite, o app baixa um pouco a qualidade, depois tira quadros na proporção do excesso (até 4 por segundo) e só então diminui a imagem por dentro. Trechos curtos que sobram espaço ganham uma segunda passada com mais qualidade. Antes, trechos de 8 a 10 s de vídeos com muito detalhe davam erro de "pesada demais".
- **Permissões:** nenhuma que o Android pergunte. Sem câmera, microfone ou acesso aos arquivos: o "Baixar" grava em `Download/Puxa`. A playlist usa o serviço de mídia do Android (tocar em segundo plano) para continuar com a tela desligada.

## Instalar o APK

O APK pronto é para celulares ARM de 64 bits (praticamente todos os Android de 2017 para cá), Android 8 ou mais novo. As bibliotecas nativas vão comprimidas dentro do APK, que fica bem menor para baixar e mandar; o Android as descompacta na instalação.

1. Baixe o `.apk` da [última release](https://github.com/TheMarksan/puxa-app-of/releases/latest) direto no celular (ou copie do computador) e toque nele.
2. O Android vai pedir para permitir instalar apps desta fonte (o navegador ou o gerenciador de arquivos). Permita só para essa instalação.
3. O Play Protect pode avisar que o app é desconhecido; é porque ele não veio da Play Store. Toque em "Instalar mesmo assim".

Esse APK é assinado com a chave de depuração padrão, a mesma da versão anterior, então instala por cima dela. Para atualizações futuras, gere as próximas versões pelo EAS (abaixo), que guarda uma chave fixa da sua conta; a primeira instalação vinda do EAS pede para desinstalar esta antes.

## O que testar no celular

O código foi conferido aqui com verificação de tipos, lint, testes das legendas, das figurinhas, dos links e respostas do Instagram e do X, da dublagem e da playlist, e as figurinhas de ponta a ponta com o mesmo FFmpeg 6.1.1 do app (cantos de 0 ao círculo, inteiro, contorno, texto, e vídeos do X em MP4 fragmentado), conferidas nas regras do WhatsApp: 512x512, peso, repetição, duração dos quadros (inclusive animadas de 8 e 10 s de vídeos com muito detalhe). O sistema de design é conferido em teste (escala de letra, espaço, cantos, cores fora do tema e contraste nos dois temas), e a interface foi conferida tela por tela na prévia web, em claro e escuro. O login do Instagram foi conferido renderizando a página com o mesmo navegador do app. O X e a ElevenLabs só foram testados com respostas gravadas. Estas partes só rodam num aparelho de verdade:

1. Na primeira abertura, aceitar a permissão de notificações. Baixar áudio em MP3 e um vídeo em 720p; mandar no WhatsApp. Conferir que Compartilhar, Figurinha, Baixar e Playlist aparecem logo que o link abre.
2. Instagram sem login: um Reel, um carrossel (escolher a 2ª foto), um perfil público (abrir uma publicação da lista). Um link de story sem login deve abrir o perfil com o aviso de login.
3. Instagram com login (Ajustes > Contas > Entrar): o formulário aparece (não o convite "Abrir Instagram"), o login volta sozinho para os Ajustes com "Conectado", e os stories de agora e um destaque de um perfil que você segue abrem.
4. X: um post com vídeo, um com foto, um link curto t.co e um perfil.
5. Figurinhas: criar uma pasta no envio, fazer duas figurinhas nela, adicionar ao WhatsApp, renomear a pasta e mover uma figurinha para a Puxa.
6. Com a chave da ElevenLabs: transcrever um vídeo em inglês pela ElevenLabs e pelo celular (modelo Precisa, idioma Inglês) e comparar; dublar um trecho de 15 s para português com o som original baixinho e mandar no WhatsApp.
7. Mandar um trecho de vídeo com legenda do YouTube em português e outro com legenda transcrita; em "Ajustar na tela", arrastar a legenda até as guias, trocar formato, fonte e animação (karaokê e pop) e conferir que o vídeo enviado ficou igual à prévia.
8. Playlists: criar Treino e Estudos; colar em Treino uma mensagem com dois links do YouTube e um Reel; esperar baixar, tocar a segunda (deve tocar ela), deixar terminar (a próxima começa sozinha), tocar outra no meio de uma música, bloquear a tela e usar próxima e anterior pela notificação; ligar o aleatório; trocar a ordem e tirar uma.
9. No Baixar, abrir um vídeo do X e tocar em Playlist; conferir que entra com nome e capa, que **Salvar em** aparece e que o botão vira "Na playlist".
10. Num Reel e num vídeo do X, fazer uma figurinha animada em Recorte com cantos Retos, Suaves e Círculo, e uma em Inteiro; conferir que a prévia mostra o vídeo em todas. Fazer uma de um quadro em círculo; tocar em Adicionar ao WhatsApp e mandar numa conversa.
11. Nos Ajustes, trocar para escuro e para claro, limpar os temporários e conferir que o Baixar continua funcionando.
12. Instagram sem login: digitar @ de um perfil público (deve abrir a grade) e tocar numa publicação. Com login: abrir um link de story (instagram.com/stories/…).
13. Legenda com 1 linha e com 3 linhas num vídeo com fala longa: conferir que nunca aparecem mais linhas que o escolhido.
14. Letra: tocar uma música conhecida do YouTube (clipe oficial), abrir o player e conferir que a letra acende na linha certa e que tocar numa linha pula para ela. Numa música sem letra achada, usar Buscar.
15. Envio de vídeo: tocar e pausar a prévia (o botão muda), arrastar a barra de tempo, ligar a legenda transcrita no celular (as legendas aparecem enquanto saem) e passar para Animada: a legenda aparece na prévia da figurinha e sai gravada nela.
16. Áudio: abrir um vídeo do YouTube com dublagem automática (de um canal em outra língua) e conferir que o MP3, o vídeo e a música da Playlist saem no idioma original.
17. Capa: editar uma playlist, usar uma imagem da galeria, salvar e conferir a capa na lista, no topo e no player; tocar e ver a notificação com a arte na cor da playlist e o símbolo do Puxa na barra de status.
18. Figurinha animada longa: num vídeo com muito movimento, fazer figurinhas de 8 s e de 10 s (Recorte em Círculo e com contorno, e Inteiro). Devem sair sem o aviso de "pesada demais" e entrar no WhatsApp.
19. Visual 2.0: conferir o ícone novo na tela inicial do Android (e o temático, se usar), a abertura, as letras Anton e Archivo em todas as telas, as sombras dos botões e das folhas, e o claro e o escuro. No Início, puxar dois vídeos e voltar: os dois aparecem em Recentes; segurar um tira da lista.
20. Acervo: no Início, buscar "oxe", "gato" e "ana"; ver as três abas; tocar numa figurinha e pôr numa pasta; abrir um pacote e tocar em **Adicionar ao WhatsApp** (a pasta aparece em Figurinhas e o WhatsApp pede para confirmar).
21. Conta: entrar como Marcos (botão Usar), seguir a Ana, abrir o próprio perfil, editar foto e capa, sair; entrar como Ana e ver o Marcos em seguidores.
22. Publicar: numa pasta com 3 figurinhas ou mais, ⋮ > Publicar na comunidade; o pacote aparece no perfil e na busca.
23. Do celular: em Figurinhas, Criar com foto ou vídeo, com uma foto, um vídeo e um GIF.

Se algo falhar na montagem, a tela de erro tem **Copiar detalhes técnicos**: esse texto mostra o que o FFmpeg recusou.

## Gerar o APK no Expo (EAS)

Com a sua conta Expo:

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

No fim o EAS mostra um link e um QR code para baixar o APK no celular. O perfil `preview` gera APK; o `production` gera o `.aab` da Play Store, mas veja a observação abaixo.

**Play Store:** as políticas do Google Play não aceitam apps que baixam conteúdo do YouTube, então a distribuição é por APK (link do EAS, arquivo direto ou lojas alternativas como F-Droid ou Obtainium).

## Gerar localmente

Requisitos: Node 20+, JDK 17 ou 21 e o Android SDK com o NDK (`ANDROID_HOME` apontando para ele).

```bash
npm install
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK em android/app/build/outputs/apk/release/app-release.apk
```

A pasta `android/` é gerada pelo `prebuild` e não vai para o git: ajustes nativos ficam em `app.json` e em `plugins/with-puxa-android.js`.

Testes:

```bash
npm test                                         # legendas, figurinhas, links e respostas do Instagram e do X, dublagem, playlist, fila e letras
npx tsx tests/sticker.e2e.ts <mídia> <saída>     # gera figurinhas e confere as regras do WhatsApp
npx expo export -p web                           # prévia da interface no navegador (dados de exemplo)
```

## Estrutura

```
src/theme/                    o sistema de design: cores (palette.ts, claro e escuro), letras (typography.ts),
                              espaços, cantos e alturas (layout.ts) e movimento (motion.ts); regras em DESIGN.md
src/components/ui.tsx         peças do sistema: marca, botão redondo, telas vazias, grupos, rodapé de envio
src/recents.ts                links recentes do Início (a lista em si, testada, fica em recentList.ts)
src/community/                o acervo e a comunidade: core.ts (regras, sem tela, testadas), seed.ts (dados de teste),
                              store.ts (o "servidor" simulado), install.ts (pacote → pasta → WhatsApp), art.ts (gerado),
                              Acervo.tsx (Início e busca), ui.tsx (peças), StickerSheet, PublishSheet e PosterHero
src/stickers/fromDevice.tsx   figurinha a partir de foto, vídeo ou GIF da galeria
src/screens/                  + PackScreen, CategoryScreen, ProfileScreen (e seguidores), EditProfileScreen, AuthScreen
assets/acervo/                a arte de teste (figurinhas WebP 512x512, avatares e capas)
src/app/                      rotas: início, playlist (biblioteca e playlist/[id]), figurinhas (pastas e
                              figurinhas/[id]), ajustes, instagram
                              (login)
src/Home.tsx                  modo Baixar: link, resultado, perfil, formato, qualidade, rodapé com as ações
src/screens/                  telas: início, Playlists (LibraryScreen), playlist, Figurinhas (pastas), pasta,
                              Ajustes, login
src/settings.ts               preferências guardadas (aparência, pasta, transcrição, voz)
src/sources/                  links: YouTube, Instagram e X (index.ts decide), leitura das respostas sem
                              React Native (instagramParse.ts, x.ts, json.ts), navegador invisível (harvest.ts)
src/ai/                       ElevenLabs (chave, transcrição Scribe, vozes), plano da dublagem (dubPlan.ts)
                              e a montagem do áudio dublado (dub.ts)
src/components/               Dock (ações), FloatingBar e QuickMenu, Social (perfil, tiras de posts e
                              stories), Harvester, SendSheet (áudio), VideoSendSheet (vídeo, foto, trecho,
                              legenda, dublagem e figurinha), SendPreview (o player da prévia), DubPanel,
                              StickerPanel, CaptionStudio, Trimmer
src/components/music/         capas, player pequeno e inteiro, letra, folhas (nova playlist, salvar em,
                              opções da música)
src/playlist/                 biblioteca (store.ts), playlists (lists.ts, colors.ts, capas em covers.ts),
                              arte da notificação (artwork.ts, artworkArgs.ts), fila de downloads
                              (downloads.ts), player com a notificação (player.ts), contas da fila sem
                              React Native (queue.ts), letras (lyrics.ts e a busca em lyricsFetch.ts) e
                              leitura dos links (links.ts)
src/stickers/                 figurinhas: geometria e comandos do FFmpeg (sticker.ts), tentativas até caber
                              no limite (make.ts), pastas (folders.ts) e a ponte com o aparelho (device.ts)
src/editor/                   montagem do vídeo do envio, sem React Native nos arquivos de lógica:
  types.ts, timeline.ts       modelo do vídeo e geometria (a mesma na prévia e no vídeo final)
  render.ts, exporter.ts      vídeo → comando do FFmpeg (filter_complex) e a montagem no aparelho
  captions.ts, subtitles.ts   legendas do YouTube, transcrição (whisper.rn) e tradução
  captionLayout.ts            posição da legenda (fixa ou arrastada) e os formatos prontos
  captionMotion.ts            animações das legendas, iguais na prévia e no vídeo final
  ui/                         camada da legenda, controles e estilos usados no envio
modules/puxa-engine/          módulo nativo (Kotlin)
  Engine.kt                   NewPipeExtractor, streams, download em blocos, busca, legendas
  Direct.kt                   download direto da mídia do Instagram e do X (com retomada, reempacotado), MP3 e M4A
  Media.kt                    remux, corte e picos da onda
  Render.kt                   FFmpegKit, miniaturas e desenho das camadas em PNG
  Translate.kt                tradução no aparelho (ML Kit) e downloads de modelos
  Stickers.kt                 pastas, pacotes de figurinhas e o ContentProvider que o WhatsApp lê
  Storage.kt                  espaço ocupado por tipo e limpeza (Ajustes)
plugins/with-puxa-android.js  menu Compartilhar, desugaring do NewPipeExtractor, WebP animado e os ícones do
                              player na notificação (substituem os da Media3)
tests/                        testes de unidade e figurinhas de ponta a ponta
```

## Quando algo falha

As mensagens aparecem em português no próprio app. As mais comuns:

- **"O YouTube pediu para confirmar que não é um robô"** ou **"recusou o download nesta rede"**: acontece em redes muito usadas (Wi-Fi público, VPN). Troque entre Wi-Fi e dados ou espere alguns minutos.
- **"O YouTube limitou a tradução agora"**: o app traduz no aparelho em vez disso.
- **Vídeo com restrição de idade, privado ou só para membros**: o NewPipeExtractor não faz login, então esses não baixam.
- **O YouTube muda com frequência.** Quando a extração quebrar para todo mundo, o conserto costuma ser subir a versão do NewPipeExtractor em `modules/puxa-engine/android/build.gradle` e gerar o APK de novo.
- **"O Instagram não mostrou este post para visitantes agora"** ou **"às vezes barra visitas sem conta"**: o Instagram limita quantas páginas um aparelho vê sem login. Espere alguns minutos, troque de rede ou entre na conta.
- **"Entre na sua conta do Instagram pelo Puxa"**: stories e destaques, ou um post que o Instagram só mostra logado. O botão **Entrar no Instagram** aparece ali mesmo.
- **"O Instagram pediu para confirmar o login"**: abra o app do Instagram, confirme que foi você e tente de novo.
- **"O X não liberou o acesso de visitante agora"** ou **"limitou os pedidos"**: o X limita visitantes por rede; espere um pouco. Posts de contas protegidas ou marcados como sensíveis não abrem sem login.
- **O Instagram e o X também mudam.** Os pedidos e os identificadores das consultas ficam em `src/sources/instagram.ts`, `src/sources/instagramParse.ts` e `src/sources/x.ts`.
- **ElevenLabs:** **"não aceitou a chave"** (confira ou gere outra nos Ajustes), **"os créditos acabaram neste mês"** (espere a renovação ou mude de plano) e **"está cheia agora"** (tente de novo em instantes).

## Licenças

- **O app é GPL-3.0** (arquivo `LICENSE`), porque usa o NewPipeExtractor e o FFmpeg, que são GPL-3.0. Quem distribuir o APK precisa deixar o código disponível sob a mesma licença.
- **NewPipeExtractor** é GPL-3.0.
- **FFmpeg / FFmpegKit** (build `ffmpeg-kit-16kb` 6.1.1, compilado com `--enable-gpl`) é GPL-3.0, com LAME (MP3), OpenH264 e libwebp (figurinhas).
- **whisper.cpp / whisper.rn** e os modelos Whisper são MIT. **ML Kit** segue os termos do Google. **React Native WebView** e **expo-secure-store** são MIT.
- **ElevenLabs:** a transcrição e as vozes seguem os termos da ElevenLabs e usam a conta de quem coloca a chave.
- **Fontes** (Archivo, Montserrat, Poppins, Nunito, Fredoka, Bebas Neue, Anton, Oswald, Lora, Playfair Display, Caveat, Permanent Marker, Pacifico, Bangers, Space Mono) são SIL Open Font License, menos Permanent Marker, que é Apache 2.0.
- Dentro do app, os Termos de uso (Ajustes > Sobre) citam esses componentes de software livre e as licenças de cada um.
