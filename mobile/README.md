# Puxa para Android

App em React Native (Expo). A tela inicial é o **Baixar**. No começo, uma barra flutuante azul leva à **Playlist**, às **Figurinhas** e aos **Ajustes**; com um vídeo aberto ela sai de cena e o botão de menu no topo leva aos mesmos lugares. Limpar o link ou tocar em voltar retorna ao começo.

- **Baixar:** vídeos e Shorts do YouTube (MP3, M4A ou MP4 até 1080p), Reels, posts, fotos e perfis do Instagram, e posts e perfis do X. Assim que o link abre, aparecem **Compartilhar**, **Figurinha**, **Baixar** e **Playlist**; o arquivo baixa para o armazenamento do app quando você escolhe uma delas. Vai para o WhatsApp inteiro, só um trecho, com legenda gravada na imagem, dublado com vozes de IA ou como figurinha.
- **Playlist:** cole links (um ou vários de uma vez) e cada um vira uma música guardada no celular. Toca em fila com a tela desligada, com os controles na notificação e na tela de bloqueio.
- **Figurinhas:** pastas com nome (Memes, Família...). Cada pasta vira um pacote no WhatsApp, separado em paradas e animadas.
- **Ajustes:** aparência (automático, claro ou escuro), contas (Instagram, só para stories e destaques, e a chave da ElevenLabs, para transcrição e dublagem na nuvem), espaço ocupado com limpeza por tipo de arquivo, e os termos de uso.

O app não tem servidor próprio: todo pedido sai do próprio celular. A extração do YouTube usa o [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor), o motor do app NewPipe, num módulo nativo em Kotlin. Como o pedido sai do IP do próprio celular (residencial ou de operadora), o YouTube libera a mídia, o que não acontece com servidores em nuvem. O Instagram e o X entregam a mídia pronta (MP4 com som ou foto): o app pede como o site faz para quem visita sem conta e, se a rede barrar esse pedido, abre a página pública num navegador invisível dentro do app e lê a mídia dali. A montagem dos vídeos usa o FFmpeg (FFmpegKit), a transcrição no celular usa o whisper.cpp e a tradução usa o ML Kit do Google, tudo no aparelho. Só a transcrição e a dublagem pela ElevenLabs saem do celular, e só quando você coloca a sua chave.

## Baixar

- **Pelo app da rede:** no YouTube, no Instagram ou no X, toque em Compartilhar e escolha Puxa. O link chega no app e a busca começa sozinha. Também dá para colar o link (ou um @ do Instagram).
- **Ações na hora:** com o link lido, o rodapé já mostra **Compartilhar** (abre o envio, com trecho, legenda e dublagem), **Figurinha**, **Baixar** (salva em `Download/Puxa`) e **Playlist** (manda o áudio para a fila da playlist, sem prender a tela). Na primeira ação o arquivo baixa para o armazenamento do app, com as etapas no próprio rodapé, e as outras ações usam o mesmo arquivo. Formato (áudio ou vídeo) e qualidade ficam logo abaixo do resultado para quem quiser trocar.
- **No envio:** **Enviar no WhatsApp** abre o WhatsApp direto na escolha da conversa; **Outros apps** abre o menu do Android.
- **Perfil do Instagram sem login:** o pedido direto do perfil hoje responde "página não encontrada" para quem não está logado, mesmo com a conta existindo. O app não trata mais isso como conta inexistente: abre a página pública do perfil no navegador invisível e lê dali a conta e a grade (só as capas; ao tocar numa publicação, o post inteiro é buscado). Com a conta conectada, se os pedidos diretos de stories e destaques falharem, o app abre no navegador invisível (com a mesma sessão do login) a página de stories da conta ou a do destaque, como no site, e lê os stories dali; se a página pedir um toque em "Ver story", o app toca sozinho. A lista de destaques do perfil vem da própria página do perfil quando a API não responde.
- **Instagram:** Reels, posts, carrosséis (escolha a foto ou o vídeo na tira de miniaturas), fotos e perfis abrem **sem login**, como no site para quem não tem conta. O perfil mostra as publicações recentes com foto ou vídeo; toque numa para abrir. **Stories e destaques** o Instagram só mostra para quem está logado: em Ajustes > Contas, entre pelo próprio site do Instagram dentro do app (a senha vai só para o Instagram) e o perfil passa a mostrar também os stories de agora e os destaques. O app só vê o que a sua conta já vê: conta privada, só se você segue.
- **X:** posts com vídeo, GIF ou foto, e perfis (os posts recentes com mídia, sem repostagens), sem login.
- **Trecho de áudio:** as alças da onda escolhem início e fim (arrastar o meio move a seleção inteira), os botões − e + ajustam de 1 em 1 segundo e o play toca só o trecho.
- **Trecho de vídeo:** a tira de miniaturas mostra o vídeo inteiro, as alças escolhem o trecho e os **capítulos** do YouTube (quando o vídeo tem) viram atalhos de um toque.
- **Legenda gravada no vídeo:** usa a legenda do YouTube (original ou em português; se o YouTube recusar a tradução, o app traduz no aparelho), **transcreve a fala** quando o vídeo não tem legenda (e nos vídeos do Instagram e do X), ou você **escreve** a sua.
- **Transcrição:** **No celular** (Whisper, sem internet depois de baixar o modelo) ou pela **ElevenLabs** (Scribe, a mais precisa, principalmente em outros idiomas, usando a sua conta). No celular há três modelos: Rápida, Precisa (padrão) e Máxima. Escolher o idioma falado, em vez de Automático, melhora bastante vídeos curtos, com música ou com sotaque. A escolha fica guardada para os próximos vídeos.
- **Dublar:** a quarta ferramenta do envio de vídeo. A ElevenLabs transcreve separando quem fala, o app traduz e lê com duas vozes de IA (Sarah, feminina, e Liam, masculino): a primeira pessoa fica com a voz escolhida e a segunda com a outra. Cada fala é encaixada no tempo da original (acelera um pouco se precisar). Dá para ouvir antes, deixar o som original baixinho ao fundo ou tirar, e usar a legenda **Da dublagem**. Para português, inglês ou espanhol. Precisa da chave da ElevenLabs (o próprio painel pede); o botão mostra quantos créditos a dublagem deve gastar.
- **Ajustar na tela:** abre o vídeo em tela cheia com a legenda de verdade por cima. Arraste a legenda para onde quiser: linhas rosa no centro, como no Canva, mostram quando ela está centralizada na vertical ou na horizontal. Ali ficam 10 formatos prontos (faixa, clássica, contorno, impacto, amarela, marca-texto, pílula, cartão, neon, simples), 7 animações (surgir, subir, pop, palavra a palavra, karaokê, uma palavra por vez), 15 fontes, cores, tamanho e a lista dos textos para corrigir, apagar ou criar legendas.
- **Linhas da legenda:** logo abaixo do cartão da legenda, escolha **1, 2 ou 3 linhas** (padrão: 2). Uma frase que ocuparia mais linhas vira duas ou mais legendas seguidas, com o tempo da fala dividido pelo tamanho de cada pedaço, igual na prévia e no vídeo. A mesma escolha fica em Ajustar na tela > Letra e cor. A posição (em cima, no meio, embaixo ou arrastada) continua na aba Posição.
- **Enquadramento:** o vídeo vai como veio (padrão) ou com zoom, arrastando para escolher a parte da imagem.
- **Envio:** três cartões no topo escolhem o que sai: **Vídeo**, figurinha **Animada** (um trecho de até 10 s, limite do WhatsApp) ou figurinha **Parada** (um quadro, com passos de 0,1 s). No vídeo, as ferramentas **Cortar**, **Legenda** e **Zoom** abrem só quando você toca nelas; segurar o Zoom volta ao enquadramento original. Arrastar a alça da folha para baixo fecha o envio.
- **Figurinha:** **Recorte** (com os **cantos** ajustáveis do reto ao círculo: arraste a barra ou toque em Retos, Suaves, Redondos ou Círculo) ou **Inteiro** (o quadro todo, sem cortar), e o contorno branco; texto com posição e cor no mesmo campo; o emoji pelo qual o WhatsApp sugere a figurinha; e a **pasta** onde ela entra (ou **Nova**, ali mesmo). A prévia mostra o recorte sobre o fundo da conversa do WhatsApp; arrastar escolhe a parte do vídeo e dois dedos aproximam. Fotos do Instagram e do X também viram figurinha.
- O formato, os cantos e o contorno escolhidos ficam guardados para a próxima figurinha.
- **Vídeos do Instagram e do X:** esses MP4 vêm fragmentados; o app os reempacota ao baixar, então o tamanho, a duração e o primeiro quadro saem certos em todos os formatos de figurinha.

## Figurinhas

- **Pastas:** cada figurinha entra na pasta escolhida no envio. No WhatsApp, cada pasta vira dois pacotes, **Memes** (paradas) e **Memes · animadas**, porque ele não aceita os dois tipos no mesmo pacote. A pasta **Puxa** já vem criada e guarda as figurinhas das versões anteriores.
- **Adicionar ao WhatsApp** abre a confirmação do próprio WhatsApp; depois disso, as figurinhas novas entram sozinhas no pacote.
- O WhatsApp pede **pelo menos 3 figurinhas por pacote**. Enquanto houver menos, as que existem aparecem repetidas; as repetições somem quando você faz as próximas. Cada pasta guarda até 30 paradas e 30 animadas; cheia, o app pede outra pasta.
- Na tela **Figurinhas** (barra flutuante), as pastas aparecem com a capa das últimas figurinhas. Dentro de uma pasta: renomear, apagar a pasta, adicionar ao WhatsApp e, tocando numa figurinha, mandar em outro app, mover para outra pasta ou apagar (com alguns segundos para desfazer).

## Playlist

- **Adicionar:** cole um link ou uma mensagem inteira com vários; o app pega os links do YouTube, do Instagram e do X e ignora o resto. Um link que já está na lista não entra de novo (o mesmo vídeo do YouTube em formatos diferentes de link conta como um só). No Baixar, o botão **Playlist** do rodapé manda o vídeo aberto, já com nome e capa.
- **Baixar:** um link por vez, em fila, mesmo fora da tela da Playlist. Do YouTube vem o M4A original; do Instagram e do X, o áudio AAC do próprio vídeo, copiado sem recodificar (se não der, vira MP3). A capa fica guardada junto. Um link que falhar mostra o motivo e **Tentar de novo**; ao abrir o app, o que estava na fila continua.
- **Notificações:** na primeira vez que o app abre (Android 13 ou mais novo), ele pede a permissão de notificações, que o Android exige para mostrar o player na barra de notificação. Se ela foi negada, o app pede de novo ao tocar uma música.
- **Tocar:** toque numa música para tocar; a fila segue a ordem da lista. O player fica embaixo, com a barra de tempo (tocar ou arrastar), anterior (volta ao começo depois de 3 s), tocar/pausar, próxima e repetir (a lista, só esta música ou nada). Com a tela desligada, a notificação e a tela de bloqueio mostram nome, capa e os controles. Se a fila do player não começar a tocar (ou der erro), o app refaz a fila uma vez e, se ainda assim não tocar, passa a tocar uma música por vez num player simples; nesse modo a notificação traz tocar/pausar e voltar ou avançar 10 s. Um erro ao tocar aparece no próprio player.
- **Cada música:** no ⋮, mandar no WhatsApp ou em outro app, salvar em `Download/Puxa`, subir, descer ou remover (apaga o arquivo).
- Os arquivos ficam em `files/playlist` e a lista em `files/playlist.json`. Em Ajustes > Armazenamento, **Playlist** apaga tudo (com um segundo toque).

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
- **Figurinhas:** WebP 512x512, até 100 KB a parada e 500 KB a animada, que repete sem parar. Na animada, o app começa com 8 a 15 quadros por segundo (conforme a duração) e baixa qualidade e quadros até caber; trechos curtos que sobram espaço ganham uma segunda passada com mais qualidade.
- **Permissões:** nenhuma que o Android pergunte. Sem câmera, microfone ou acesso aos arquivos: o "Baixar" grava em `Download/Puxa`. A playlist usa o serviço de mídia do Android (tocar em segundo plano) para continuar com a tela desligada.

## Instalar o APK

O APK pronto é para celulares ARM de 64 bits (praticamente todos os Android de 2017 para cá), Android 8 ou mais novo. As bibliotecas nativas vão comprimidas dentro do APK, que fica bem menor para baixar e mandar; o Android as descompacta na instalação.

1. Copie o `.apk` para o celular e toque nele.
2. O Android vai pedir para permitir instalar apps desta fonte (o navegador ou o gerenciador de arquivos). Permita só para essa instalação.
3. O Play Protect pode avisar que o app é desconhecido; é porque ele não veio da Play Store. Toque em "Instalar mesmo assim".

Esse APK é assinado com a chave de depuração padrão, a mesma da versão anterior, então instala por cima dela. Para atualizações futuras, gere as próximas versões pelo EAS (abaixo), que guarda uma chave fixa da sua conta; a primeira instalação vinda do EAS pede para desinstalar esta antes.

## O que testar no celular

O código foi conferido aqui com verificação de tipos, lint, testes das legendas, das figurinhas, dos links e respostas do Instagram e do X, da dublagem e da playlist, e as figurinhas de ponta a ponta com o mesmo FFmpeg 6.1.1 do app (cantos de 0 ao círculo, inteiro, contorno, texto, e vídeos do X em MP4 fragmentado), conferidas nas regras do WhatsApp: 512x512, peso, repetição, duração dos quadros. A interface foi conferida na prévia web, em claro e escuro. O login do Instagram foi conferido renderizando a página com o mesmo navegador do app. O X e a ElevenLabs só foram testados com respostas gravadas. Estas partes só rodam num aparelho de verdade:

1. Na primeira abertura, aceitar a permissão de notificações. Baixar áudio em MP3 e um vídeo em 720p; mandar no WhatsApp. Conferir que Compartilhar, Figurinha, Baixar e Playlist aparecem logo que o link abre.
2. Instagram sem login: um Reel, um carrossel (escolher a 2ª foto), um perfil público (abrir uma publicação da lista). Um link de story sem login deve abrir o perfil com o aviso de login.
3. Instagram com login (Ajustes > Contas > Entrar): o formulário aparece (não o convite "Abrir Instagram"), o login volta sozinho para os Ajustes com "Conectado", e os stories de agora e um destaque de um perfil que você segue abrem.
4. X: um post com vídeo, um com foto, um link curto t.co e um perfil.
5. Figurinhas: criar uma pasta no envio, fazer duas figurinhas nela, adicionar ao WhatsApp, renomear a pasta e mover uma figurinha para a Puxa.
6. Com a chave da ElevenLabs: transcrever um vídeo em inglês pela ElevenLabs e pelo celular (modelo Precisa, idioma Inglês) e comparar; dublar um trecho de 15 s para português com o som original baixinho e mandar no WhatsApp.
7. Mandar um trecho de vídeo com legenda do YouTube em português e outro com legenda transcrita; em "Ajustar na tela", arrastar a legenda até as guias, trocar formato, fonte e animação (karaokê e pop) e conferir que o vídeo enviado ficou igual à prévia.
8. Playlist: colar uma mensagem com dois links do YouTube e um Reel; esperar baixar, tocar (o som sai e o player aparece na barra de notificação), bloquear a tela e usar próxima e anterior pela notificação; trocar a ordem e remover uma.
9. No Baixar, abrir um vídeo do X e tocar em Playlist; conferir que entra com nome e capa e que o botão vira "Na playlist".
10. Num Reel e num vídeo do X, fazer uma figurinha animada em Recorte com cantos Retos, Suaves e Círculo, e uma em Inteiro; conferir que a prévia mostra o vídeo em todas. Fazer uma de um quadro em círculo; tocar em Adicionar ao WhatsApp e mandar numa conversa.
11. Nos Ajustes, trocar para escuro e para claro, limpar os temporários e conferir que o Baixar continua funcionando.
12. Instagram sem login: digitar @ de um perfil público (deve abrir a grade) e tocar numa publicação. Com login: abrir um link de story (instagram.com/stories/…).
13. Legenda com 1 linha e com 3 linhas num vídeo com fala longa: conferir que nunca aparecem mais linhas que o escolhido.

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
npm test                                         # legendas, figurinhas, links e respostas do Instagram e do X, dublagem, playlist
npx tsx tests/sticker.e2e.ts <mídia> <saída>     # gera figurinhas e confere as regras do WhatsApp
npx expo export -p web                           # prévia da interface no navegador (dados de exemplo)
```

## Estrutura

```
src/app/                      rotas: início, playlist, figurinhas (pastas e figurinhas/[id]), ajustes, instagram
                              (login)
src/Home.tsx                  modo Baixar: link, resultado, perfil, formato, qualidade, rodapé com as ações
src/screens/                  telas: início, Playlist, Figurinhas (pastas), pasta, Ajustes, login
src/settings.ts               preferências guardadas (aparência, pasta, transcrição, voz)
src/sources/                  links: YouTube, Instagram e X (index.ts decide), leitura das respostas sem
                              React Native (instagramParse.ts, x.ts, json.ts), navegador invisível (harvest.ts)
src/ai/                       ElevenLabs (chave, transcrição Scribe, vozes), plano da dublagem (dubPlan.ts)
                              e a montagem do áudio dublado (dub.ts)
src/components/               Dock (ações), FloatingBar e QuickMenu, Social (perfil, tiras de posts e
                              stories), Harvester, SendSheet (áudio), VideoSendSheet (vídeo, foto, trecho,
                              legenda, dublagem e figurinha), DubPanel, StickerPanel, CaptionStudio, Trimmer
src/playlist/                 playlist: lista guardada (store.ts), fila de downloads (downloads.ts), player com
                              a notificação (player.ts) e leitura dos links sem React Native (links.ts)
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
plugins/with-puxa-android.js  menu Compartilhar, desugaring do NewPipeExtractor e WebP animado
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

- **NewPipeExtractor** é GPL-3.0. Se for distribuir o app publicamente, o código do app também precisa ser publicado sob a GPL-3.0. O arquivo `LICENSE` atual veio do modelo do Expo e deve ser trocado nesse caso.
- **FFmpeg / FFmpegKit** (build `ffmpeg-kit-16kb` 6.1.1, compilado com `--enable-gpl`) é GPL-3.0, com LAME (MP3), OpenH264 e libwebp (figurinhas).
- **whisper.cpp / whisper.rn** e os modelos Whisper são MIT. **ML Kit** segue os termos do Google. **React Native WebView** e **expo-secure-store** são MIT.
- **ElevenLabs:** a transcrição e as vozes seguem os termos da ElevenLabs e usam a conta de quem coloca a chave.
- **Fontes** (Archivo, Montserrat, Poppins, Nunito, Fredoka, Bebas Neue, Anton, Oswald, Lora, Playfair Display, Caveat, Permanent Marker, Pacifico, Bangers, Space Mono) são SIL Open Font License, menos Permanent Marker, que é Apache 2.0.
- Dentro do app, os Termos de uso (Ajustes > Sobre) citam esses componentes de software livre e as licenças de cada um.
