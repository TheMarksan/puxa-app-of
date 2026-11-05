# Puxa para Android

App em React Native (Expo) que baixa áudio e vídeo do YouTube direto no celular e manda no WhatsApp. No áudio dá para mandar o arquivo inteiro ou só um trecho, escolhido numa forma de onda com prévia.

Tudo roda no aparelho. A extração usa o [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor), o mesmo motor do app NewPipe, num módulo nativo em Kotlin. Como o pedido sai do IP do próprio celular (residencial ou de operadora), o YouTube libera a mídia, o que não acontece com servidores em nuvem.

## Como usar

- **Pelo YouTube:** no vídeo, toque em Compartilhar e escolha Puxa. O link chega no app e a busca começa sozinha.
- **Colando:** copie o link e toque em Colar.
- Escolha **Áudio** (M4A) ou **Vídeo** (MP4 com som, até 1080p) e a qualidade, e toque em Baixar.
- Pronto o arquivo: **Enviar no WhatsApp** abre o WhatsApp direto na escolha da conversa; **Salvar** copia para `Download/Puxa`; o ícone de compartilhar abre o menu do Android para outros apps.
- No áudio, o envio pergunta se vai **inteiro ou só um trecho**. As alças da onda escolhem início e fim (arrastar o meio move a seleção inteira; quando uma alça empurra a outra, a seleção desliza mantendo a duração), os botões − e + ajustam de 1 em 1 segundo e o play toca só o trecho.

## Formatos

- **Áudio sai em M4A (AAC), não em MP3.** É o formato que o YouTube entrega; o Android não tem codificador de MP3, e recodificar perderia qualidade. O WhatsApp, os players e os PCs tocam M4A normalmente.
- **Vídeo** é o MP4 (H.264) do YouTube junto com o melhor áudio M4A, sem recodificar: só reempacotado com o `MediaMuxer` do Android. Leva segundos.
- **Corte do áudio** também é sem recodificar, então começa no quadro de áudio mais próximo (precisão de uns 20 ms).
- **Limite do WhatsApp:** acima de 16 MB ele pode mandar como documento. O app avisa e sugere um trecho ou uma qualidade menor.

## Instalar o APK

O APK pronto é para celulares ARM de 64 bits (praticamente todos os Android de 2017 para cá), Android 8 ou mais novo.

1. Copie o `.apk` para o celular e toque nele.
2. O Android vai pedir para permitir instalar apps desta fonte (o navegador ou o gerenciador de arquivos). Permita só para essa instalação.
3. O Play Protect pode avisar que o app é desconhecido; é porque ele não veio da Play Store. Toque em "Instalar mesmo assim".

Esse APK é assinado com a chave de depuração padrão. Para atualizações futuras instalarem por cima, gere as próximas versões pelo EAS (abaixo), que guarda uma chave fixa da sua conta; a primeira instalação vinda do EAS pede para desinstalar esta antes.

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

Requisitos: Node 20+, JDK 17 ou 21 e o Android SDK (`ANDROID_HOME` apontando para ele).

```bash
npm install
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK em android/app/build/outputs/apk/release/app-release.apk
```

A pasta `android/` é gerada pelo `prebuild` e não vai para o git: ajustes nativos ficam em `app.json` e em `plugins/with-puxa-android.js` (receber links do menu Compartilhar e o *desugaring* que o NewPipeExtractor precisa).

## Estrutura

```
App.tsx                       fontes, tema, toasts
src/Home.tsx                  tela: link, resultado, formato, qualidade, rodapé
src/components/               Dock (ação, etapas, pronto, erro), SendSheet (inteiro ou trecho),
                              Trimmer (onda e alças), QualityList, Segmented, Toasts, Button
modules/puxa-engine/          módulo nativo
  android/.../Engine.kt       NewPipeExtractor, escolha de streams, download em blocos de 1 MB
                              com Range e 3 conexões, nova tentativa e link renovado no erro 403
  android/.../Media.kt        remux (MediaExtractor + MediaMuxer), corte e picos da onda (MediaCodec)
  android/.../PuxaEngineModule.kt  API para o JavaScript, progresso por eventos, salvar e compartilhar
  src/PuxaEngineModule.web.ts prévia web com dados de exemplo, só para ver a interface no navegador
plugins/with-puxa-android.js  ajustes do AndroidManifest e do Gradle
```

## Quando algo falha

As mensagens aparecem em português no próprio app. As mais comuns:

- **"O YouTube pediu para confirmar que não é um robô"**: acontece em redes muito usadas (Wi-Fi público, VPN). Troque entre Wi-Fi e dados ou espere alguns minutos.
- **Vídeo com restrição de idade, privado ou só para membros**: o NewPipeExtractor não faz login, então esses não baixam.
- **O YouTube muda com frequência.** Quando a extração quebrar para todo mundo, o conserto costuma ser subir a versão do NewPipeExtractor em `modules/puxa-engine/android/build.gradle` e gerar o APK de novo.

## Antes de distribuir

Os Termos de Serviço do YouTube não permitem baixar conteúdo sem autorização, fora os recursos oficiais. Use para vídeos seus, com licença livre ou com permissão de quem fez.
