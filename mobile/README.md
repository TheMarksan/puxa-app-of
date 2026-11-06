# Puxa para Android

App em React Native (Expo). A tela inicial é o **Baixar**. No começo, uma barra flutuante azul leva ao **Criar**, às **Figurinhas** e aos **Ajustes**; com um vídeo aberto ela sai de cena e o botão de menu no topo leva aos mesmos lugares. Limpar o link ou tocar em voltar retorna ao começo.

- **Baixar:** vídeos e Shorts do YouTube (MP3, M4A ou MP4 até 1080p), Reels, posts, fotos e perfis do Instagram, e posts e perfis do X. Assim que o link abre, aparecem **Compartilhar**, **Figurinha**, **Baixar** e **Editar**; o arquivo baixa para o armazenamento do app quando você escolhe uma delas. Vai para o WhatsApp inteiro, só um trecho, com legenda gravada na imagem, dublado com vozes de IA ou como figurinha.
- **Criar:** um editor de vídeo no próprio aparelho. Junta trechos de vários vídeos do YouTube e da galeria, muda formato e enquadramento, coloca transições, textos, figurinhas, legendas, trilha sonora, narração e facecam, e monta o MP4 final no celular.
- **Figurinhas:** pastas com nome (Memes, Família...). Cada pasta vira um pacote no WhatsApp, separado em paradas e animadas.
- **Ajustes:** aparência (automático, claro ou escuro), contas (Instagram, só para stories e destaques, e a chave da ElevenLabs, para transcrição e dublagem na nuvem), espaço ocupado com limpeza por tipo de arquivo, e sobre o app.

O app não tem servidor próprio: todo pedido sai do próprio celular. A extração do YouTube usa o [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor), o motor do app NewPipe, num módulo nativo em Kotlin. Como o pedido sai do IP do próprio celular (residencial ou de operadora), o YouTube libera a mídia, o que não acontece com servidores em nuvem. O Instagram e o X entregam a mídia pronta (MP4 com som ou foto): o app pede como o site faz para quem visita sem conta e, se a rede barrar esse pedido, abre a página pública num navegador invisível dentro do app e lê a mídia dali. A montagem dos vídeos usa o FFmpeg (FFmpegKit), a transcrição no celular usa o whisper.cpp e a tradução usa o ML Kit do Google, tudo no aparelho. Só a transcrição e a dublagem pela ElevenLabs saem do celular, e só quando você coloca a sua chave.

## Baixar

- **Pelo app da rede:** no YouTube, no Instagram ou no X, toque em Compartilhar e escolha Puxa. O link chega no app e a busca começa sozinha. Também dá para colar o link (ou um @ do Instagram).
- **Ações na hora:** com o link lido, o rodapé já mostra **Compartilhar** (abre o envio, com trecho, legenda e dublagem), **Figurinha**, **Baixar** (salva em `Download/Puxa`) e **Editar** (abre no Criar). Na primeira ação o arquivo baixa para o armazenamento do app, com as etapas no próprio rodapé, e as outras ações usam o mesmo arquivo. Formato (áudio ou vídeo) e qualidade ficam logo abaixo do resultado para quem quiser trocar.
- **No envio:** **Enviar no WhatsApp** abre o WhatsApp direto na escolha da conversa; **Outros apps** abre o menu do Android.
- **Instagram:** Reels, posts, carrosséis (escolha a foto ou o vídeo na tira de miniaturas), fotos e perfis abrem **sem login**, como no site para quem não tem conta. O perfil mostra as publicações recentes com foto ou vídeo; toque numa para abrir. **Stories e destaques** o Instagram só mostra para quem está logado: em Ajustes > Contas, entre pelo próprio site do Instagram dentro do app (a senha vai só para o Instagram) e o perfil passa a mostrar também os stories de agora e os destaques. O app só vê o que a sua conta já vê: conta privada, só se você segue.
- **X:** posts com vídeo, GIF ou foto, e perfis (os posts recentes com mídia, sem repostagens), sem login.
- **Trecho de áudio:** as alças da onda escolhem início e fim (arrastar o meio move a seleção inteira), os botões − e + ajustam de 1 em 1 segundo e o play toca só o trecho.
- **Trecho de vídeo:** a tira de miniaturas mostra o vídeo inteiro, as alças escolhem o trecho e os **capítulos** do YouTube (quando o vídeo tem) viram atalhos de um toque.
- **Legenda gravada no vídeo:** usa a legenda do YouTube (original ou em português; se o YouTube recusar a tradução, o app traduz no aparelho), **transcreve a fala** quando o vídeo não tem legenda (e nos vídeos do Instagram e do X), ou você **escreve** a sua.
- **Transcrição:** **No celular** (Whisper, sem internet depois de baixar o modelo) ou pela **ElevenLabs** (Scribe, a mais precisa, principalmente em outros idiomas, usando a sua conta). No celular há três modelos: Rápida, Precisa (padrão) e Máxima. Escolher o idioma falado, em vez de Automático, melhora bastante vídeos curtos, com música ou com sotaque. A escolha fica guardada para os próximos vídeos.
- **Dublar:** a quarta ferramenta do envio de vídeo. A ElevenLabs transcreve separando quem fala, o app traduz e lê com duas vozes de IA (Sarah, feminina, e Liam, masculino): a primeira pessoa fica com a voz escolhida e a segunda com a outra. Cada fala é encaixada no tempo da original (acelera um pouco se precisar). Dá para ouvir antes, deixar o som original baixinho ao fundo ou tirar, e usar a legenda **Da dublagem**. Para português, inglês ou espanhol. Precisa da chave da ElevenLabs (o próprio painel pede); o botão mostra quantos créditos a dublagem deve gastar.
- **Ajustar na tela:** abre o vídeo em tela cheia com a legenda de verdade por cima. Arraste a legenda para onde quiser: linhas rosa no centro, como no Canva, mostram quando ela está centralizada na vertical ou na horizontal. Ali ficam 10 formatos prontos (faixa, clássica, contorno, impacto, amarela, marca-texto, pílula, cartão, neon, simples), 7 animações (surgir, subir, pop, palavra a palavra, karaokê, uma palavra por vez), 15 fontes, cores, tamanho e a lista dos textos para corrigir, apagar ou criar legendas.
- **Enquadramento:** o vídeo vai como veio (padrão) ou com zoom, arrastando para escolher a parte da imagem.
- **Envio:** três cartões no topo escolhem o que sai: **Vídeo**, figurinha **Animada** (um trecho de até 10 s, limite do WhatsApp) ou figurinha **Parada** (um quadro, com passos de 0,1 s). No vídeo, as ferramentas **Cortar**, **Legenda** e **Zoom** abrem só quando você toca nelas; segurar o Zoom volta ao enquadramento original. Arrastar a alça da folha para baixo fecha o envio.
- **Figurinha:** formatos desenhados com o próprio quadro do vídeo (quadrado, círculo ou inteiro) e o contorno branco; texto com posição e cor no mesmo campo; o emoji pelo qual o WhatsApp sugere a figurinha; e a **pasta** onde ela entra (ou **Nova**, ali mesmo). A prévia mostra o recorte sobre o fundo da conversa do WhatsApp; arrastar escolhe a parte do vídeo e dois dedos aproximam. Fotos do Instagram e do X também viram figurinha.
- **Editar no modo Criar** abre o vídeo baixado num projeto novo.

## Figurinhas

- **Pastas:** cada figurinha entra na pasta escolhida no envio. No WhatsApp, cada pasta vira dois pacotes, **Memes** (paradas) e **Memes · animadas**, porque ele não aceita os dois tipos no mesmo pacote. A pasta **Puxa** já vem criada e guarda as figurinhas das versões anteriores.
- **Adicionar ao WhatsApp** abre a confirmação do próprio WhatsApp; depois disso, as figurinhas novas entram sozinhas no pacote.
- O WhatsApp pede **pelo menos 3 figurinhas por pacote**. Enquanto houver menos, as que existem aparecem repetidas; as repetições somem quando você faz as próximas. Cada pasta guarda até 30 paradas e 30 animadas; cheia, o app pede outra pasta.
- Na tela **Figurinhas** (barra flutuante), as pastas aparecem com a capa das últimas figurinhas. Dentro de uma pasta: renomear, apagar a pasta, adicionar ao WhatsApp e, tocando numa figurinha, mandar em outro app, mover para outra pasta ou apagar (com alguns segundos para desfazer).

## Criar

- **Mídia:** vídeos por link do YouTube (com escolha de qualidade), vídeos e fotos da galeria. Cada clipe pode ser cortado nas alças da linha do tempo, dividido no ponto atual, duplicado, reordenado e acelerado ou desacelerado (0,25x a 4x). Fotos ganham um zoom lento.
- **Formato:** 9:16 (Status, Reels), 1:1, 4:5, 16:9 ou o do vídeo original, em 720p ou 1080p.
- **Enquadrar:** preencher, encaixar ou encaixar com fundo desfocado; zoom e posição arrastando e pinçando na prévia; girar 90° e espelhar. Assim o vídeo não precisa sair como veio. Vídeo deitado num formato em pé (ou o contrário) entra com fundo desfocado, para nada ficar cortado.
- **Filtros de cor** (vívido, quente, frio, P&B, cinema, retrô). Na prévia a cor é aproximada; o vídeo exportado usa o filtro completo.
- **Transições** entre clipes: dissolver, pelo preto, deslizar, cortina, círculo, zoom e outras, com duração ajustável.
- **Textos, figurinhas e imagens:** arraste para posicionar (com guias de centro), use dois dedos para mudar tamanho e ângulo, e ajuste início e fim na linha do tempo. Textos têm 15 fontes, cores e fundos (caixa, faixa, pílula, contorno, neon, sombra).
- **Legendas** do YouTube (originais ou em pt-BR), transcritas do áudio dos clipes ou escritas à mão, com os mesmos formatos, animações e fontes do envio. Na prévia, arraste a legenda (com as guias de centro) e corrija os textos no painel.
- **Trilha sonora:** gêneros com busca de músicas "sem direitos autorais" no YouTube (ou um link colado), ouvir antes, adicionar com um toque e depois ajustar trecho, volume, entrada e saída suaves e repetição.
- **Narração e facecam:** grava a sua voz, ou voz e câmera, enquanto o vídeo toca. Na gravação, as opções ficam numa barra baixa e a prévia do vídeo ocupa quase toda a tela, com a contagem regressiva e o tempo gravado por cima dela. A bolha da câmera fica onde você arrastar, em círculo, cantos arredondados ou quadrado, com borda e espelhamento. Com fone conectado, "Ouvir o vídeo" liga sozinho. A música abaixa sozinha quando há voz.
- Desfazer e refazer, salvamento automático e lista de projetos. Apagar um projeto apaga as mídias dele (com alguns segundos para desfazer).
- **Prévia:** o vídeo, a facecam, a narração e a música tocam juntos sem disputar o áudio do aparelho (antes, a trilha pausava o vídeo), e um vídeo que demora a começar não é mais reiniciado a cada quadro.

## Ajustes

- **Aparência:** automático (igual ao celular), claro ou escuro, escolhidos pela miniatura do celular em cada tema. O editor continua escuro.
- **Contas:** **Instagram** (Entrar abre o site do Instagram; Sair apaga a sessão do app) e **ElevenLabs** (a chave fica guardada com criptografia no aparelho e o app mostra os créditos que sobram). O link **Onde pego a chave?** abre a página das chaves no site da ElevenLabs.
- **Armazenamento:** quanto o app ocupa, por tipo (baixados, temporários, projetos, figurinhas e transcrição), com o botão de limpar cada um. Projetos e figurinhas pedem um segundo toque; um download em andamento não é apagado.
- **Sobre:** versão do app e, recolhidas, as licenças.
- Na tela **Figurinhas**, apagar uma figurinha dá alguns segundos para desfazer.
- **Exportar** monta o MP4 com o codificador de vídeo do próprio celular; se o aparelho recusar, refaz com o codificador por software. No fim: WhatsApp, Salvar ou outros apps.

## Formatos e limites

- **MP3** (192 kbps) é recodificado no aparelho com o FFmpeg e toca em qualquer lugar. **M4A** é o arquivo original do YouTube, sem perda e mais rápido.
- **Vídeo baixado** é o MP4 (H.264) do YouTube junto com o melhor áudio, sem recodificar (só reempacotado). Um trecho, ou o vídeo com legenda, é montado de novo no aparelho, com corte exato e em até 720p.
- **Animação das palavras:** palavra a palavra, karaokê e uma por vez estimam o tempo de cada palavra pelo tamanho dela dentro da legenda (o YouTube e a transcrição dão o tempo da frase, não de cada palavra).
- **Instagram e X:** o vídeo vai como a rede entrega (MP4 com som, na maior qualidade que ela oferece), sem recodificar; o MP3 é tirado dele. Fotos vão na maior resolução que a rede entrega. Os links da mídia vencem com o tempo: se um vencer com o item aberto, **Tentar de novo** lê o link outra vez.
- **Transcrição no celular:** na primeira vez o app baixa o modelo escolhido: Rápida (60 MB), Precisa (190 MB) ou Máxima (550 MB, a large-v3-turbo). Depois funciona sem internet. Em vídeos longos pode levar alguns minutos, conforme o celular; a Máxima pede um celular mais forte.
- **ElevenLabs:** a transcrição e a dublagem gastam créditos da sua conta. A voz gasta cerca de 1 crédito por letra falada (uns 140 a cada 10 s de fala), e o botão de dublar mostra a estimativa antes. Sem créditos, o app avisa.
- **Tradução no aparelho:** o primeiro uso baixa o pacote do idioma (cerca de 30 MB).
- **Limite do WhatsApp:** acima de 16 MB ele pode mandar como documento. O envio de trecho e a opção **Caber no WhatsApp** do modo Criar (ligada nos projetos novos) ajustam a qualidade para o vídeo ficar abaixo disso; se nem assim couber (vídeos de vários minutos), o app avisa.
- **Figurinhas:** WebP 512x512, até 100 KB a parada e 500 KB a animada, que repete sem parar. Na animada, o app começa com 8 a 15 quadros por segundo (conforme a duração) e baixa qualidade e quadros até caber; trechos curtos que sobram espaço ganham uma segunda passada com mais qualidade.
- **Permissões:** câmera e microfone, só para a narração e a facecam. O app não pede acesso aos arquivos: a galeria abre pelo seletor do Android e o "Baixar" grava em `Download/Puxa`.

## Instalar o APK

O APK pronto é para celulares ARM de 64 bits (praticamente todos os Android de 2017 para cá), Android 8 ou mais novo. As bibliotecas nativas vão comprimidas dentro do APK, que fica bem menor para baixar e mandar; o Android as descompacta na instalação.

1. Copie o `.apk` para o celular e toque nele.
2. O Android vai pedir para permitir instalar apps desta fonte (o navegador ou o gerenciador de arquivos). Permita só para essa instalação.
3. O Play Protect pode avisar que o app é desconhecido; é porque ele não veio da Play Store. Toque em "Instalar mesmo assim".

Esse APK é assinado com a chave de depuração padrão, a mesma da versão anterior, então instala por cima dela. Para atualizações futuras, gere as próximas versões pelo EAS (abaixo), que guarda uma chave fixa da sua conta; a primeira instalação vinda do EAS pede para desinstalar esta antes.

## O que testar no celular

O código foi conferido aqui com verificação de tipos, lint, testes do editor, das figurinhas, dos links e respostas do Instagram e do X e da dublagem, e uma montagem de ponta a ponta com o mesmo FFmpeg 6.1.1 do app (vídeos, fotos, filtros, transições, textos, facecam, legendas, mistura de áudio e as figurinhas, conferidas nas regras do WhatsApp: 512x512, peso, repetição, duração dos quadros). O Instagram, o X e a ElevenLabs não são acessíveis daqui, então essas partes só foram testadas com respostas gravadas. Estas partes só rodam num aparelho de verdade:

1. Baixar áudio em MP3 e um vídeo em 720p; mandar no WhatsApp. Conferir que Compartilhar, Figurinha, Baixar e Editar aparecem logo que o link abre.
2. Instagram sem login: um Reel, um carrossel (escolher a 2ª foto), um perfil público (abrir uma publicação da lista). Um link de story sem login deve abrir o perfil com o aviso de login.
3. Instagram com login (Ajustes > Contas > Entrar): stories de agora e um destaque de um perfil que você segue.
4. X: um post com vídeo, um com foto, um link curto t.co e um perfil.
5. Figurinhas: criar uma pasta no envio, fazer duas figurinhas nela, adicionar ao WhatsApp, renomear a pasta e mover uma figurinha para a Puxa.
6. Com a chave da ElevenLabs: transcrever um vídeo em inglês pela ElevenLabs e pelo celular (modelo Precisa, idioma Inglês) e comparar; dublar um trecho de 15 s para português com o som original baixinho e mandar no WhatsApp.
7. Mandar um trecho de vídeo com legenda do YouTube em português e outro com legenda transcrita; em "Ajustar na tela", arrastar a legenda até as guias, trocar formato, fonte e animação (karaokê e pop) e conferir que o vídeo enviado ficou igual à prévia.
8. No Criar: dois vídeos do YouTube e uma foto, formato 9:16 com fundo desfocado, uma transição, um texto e uma música; exportar.
9. Gravar narração e facecam (com e sem fone), conferindo que o vídeo aparece grande e toca durante a gravação; arrastar a bolha para outro canto e exportar de novo.
10. Num vídeo baixado, fazer uma figurinha animada de 3 s com texto e uma de um quadro em círculo; tocar em Adicionar ao WhatsApp e mandar as duas numa conversa.
11. Nos Ajustes, trocar para escuro e para claro, limpar os temporários e conferir que o Baixar continua funcionando.

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
npm test                                         # editor, figurinhas, links e respostas do Instagram e do X, dublagem
npx tsx tests/render.e2e.ts <mídia> <saída>      # monta projetos com o ffmpeg do computador
npx tsx tests/sticker.e2e.ts <mídia> <saída>     # gera figurinhas e confere as regras do WhatsApp
npx expo export -p web                           # prévia da interface no navegador (dados de exemplo)
```

## Estrutura

```
src/app/                      rotas: início, criar, figurinhas (pastas e figurinhas/[id]), ajustes, instagram
                              (login), editor/[id], render/[id]
src/Home.tsx                  modo Baixar: link, resultado, perfil, formato, qualidade, rodapé com as ações
src/screens/                  telas: início, Criar (projetos), Figurinhas (pastas), pasta, Ajustes, login
src/settings.ts               preferências guardadas (aparência, pasta, transcrição, voz)
src/sources/                  links: YouTube, Instagram e X (index.ts decide), leitura das respostas sem
                              React Native (instagramParse.ts, x.ts, json.ts), navegador invisível (harvest.ts)
src/ai/                       ElevenLabs (chave, transcrição Scribe, vozes), plano da dublagem (dubPlan.ts)
                              e a montagem do áudio dublado (dub.ts)
src/components/               Dock (ações), FloatingBar e QuickMenu, Social (perfil, tiras de posts e
                              stories), Harvester, SendSheet (áudio), VideoSendSheet (vídeo, foto, trecho,
                              legenda, dublagem e figurinha), DubPanel, StickerPanel, CaptionStudio, Trimmer
src/stickers/                 figurinhas: geometria e comandos do FFmpeg (sticker.ts), tentativas até caber
                              no limite (make.ts), pastas (folders.ts) e a ponte com o aparelho (device.ts)
src/editor/                   modo Criar, sem React Native nos arquivos de lógica:
  types.ts, timeline.ts       modelo do projeto e geometria (a mesma na prévia e no vídeo final)
  render.ts                   projeto → comando do FFmpeg (filter_complex)
  captions.ts, subtitles.ts   legendas do YouTube, transcrição (whisper.rn) e tradução
  captionLayout.ts            posição da legenda (fixa ou arrastada) e os formatos prontos
  captionMotion.ts            animações das legendas, iguais na prévia e no vídeo final
  store.ts, actions.ts        estado com desfazer, salvamento automático
  ui/                         editor, prévia, linha do tempo, painéis e tela de exportação
modules/puxa-engine/          módulo nativo (Kotlin)
  Engine.kt                   NewPipeExtractor, streams, download em blocos, busca, legendas
  Direct.kt                   download direto da mídia do Instagram e do X (com retomada) e MP3
  Media.kt                    remux, corte e picos da onda
  Render.kt                   FFmpegKit, miniaturas e desenho das camadas em PNG
  Translate.kt                tradução no aparelho (ML Kit) e downloads de modelos
  Stickers.kt                 pastas, pacotes de figurinhas e o ContentProvider que o WhatsApp lê
  Storage.kt                  espaço ocupado por tipo e limpeza (Ajustes)
plugins/with-puxa-android.js  menu Compartilhar, desugaring do NewPipeExtractor e WebP animado
tests/                        testes do editor e montagem de ponta a ponta
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

## Licenças e direitos

- **NewPipeExtractor** é GPL-3.0. Se for distribuir o app publicamente, o código do app também precisa ser publicado sob a GPL-3.0. O arquivo `LICENSE` atual veio do modelo do Expo e deve ser trocado nesse caso.
- **FFmpeg / FFmpegKit** (build `ffmpeg-kit-16kb` 6.1.1, compilado com `--enable-gpl`) é GPL-3.0, com LAME (MP3), OpenH264 e libwebp (figurinhas).
- **whisper.cpp / whisper.rn** e os modelos Whisper são MIT. **ML Kit** segue os termos do Google. **React Native WebView** e **expo-secure-store** são MIT.
- **ElevenLabs:** a transcrição e as vozes seguem os termos da ElevenLabs e usam a conta de quem coloca a chave.
- **Fontes** (Archivo, Montserrat, Poppins, Nunito, Fredoka, Bebas Neue, Anton, Oswald, Lora, Playfair Display, Caveat, Permanent Marker, Pacifico, Bangers, Space Mono) são SIL Open Font License, menos Permanent Marker, que é Apache 2.0.
- **Músicas:** "sem direitos autorais" no YouTube nem sempre quer dizer livre de tudo; muitas pedem crédito ao autor. Confira a descrição do vídeo antes de publicar.
- Os Termos de Serviço do YouTube, do Instagram e do X não permitem baixar conteúdo sem autorização, fora os recursos oficiais. Use para vídeos seus, com licença livre ou com permissão de quem fez. O app só abre o que a rede já mostra publicamente ou para a sua conta.
