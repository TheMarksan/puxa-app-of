# Puxa

Site para colar um link do YouTube, escolher MP3 ou MP4 e a qualidade, e então salvar no aparelho ou mandar direto no WhatsApp. No MP3 dá para mandar o áudio inteiro ou só um trecho, escolhido numa forma de onda com prévia.

Backend em Python (FastAPI + yt-dlp + ffmpeg). Frontend em HTML, CSS e JavaScript puros, sem etapa de build. A única parte com build é a demo animada do estado vazio (veja abaixo), que já vai pronta em `static/demo/`.

## Interface

- **Movimento com causa.** Seguindo as regras da skill stageshow: o resultado chega em sequência depois da busca (o único momento orquestrado), o destaque de MP3/MP4 e o da qualidade escolhida deslizam, a lista muda de altura junto quando troca o formato, a etapa do preparo rola em vez de piscar, a porcentagem gira dígito a dígito, o check se desenha, painéis abrem com a altura e o botão de envio confirma em si mesmo ("Enviado"). Tudo respeita `prefers-reduced-motion`.
- **Etapas do preparo.** Baixar, Converter (ou Juntar, no MP4) e Pronto; a linha entre as duas primeiras é a própria barra de download.
- **Toasts** para o que acontece fora do campo de visão: download iniciado (com "Enviar no WhatsApp"), entregue ao WhatsApp, preparo cancelado (com "Recomeçar"), arquivo pronto com a aba em segundo plano, queda e volta da internet. Pilha no canto (embaixo no celular), no máximo 3 visíveis no desktop e 2 no celular, tempo pausado com ponteiro ou foco, arrastar para o lado dispensa, Esc fecha, `role="status"` para sucesso e `role="alert"` para erro. Erros de um campo continuam no próprio campo.
- **No celular**, ações, progresso e o bloco Pronto ficam presos ao rodapé enquanto a lista de qualidade empurra o lugar deles para baixo, e os toasts sobem para não cobri-los.
- **Editor de trecho** com o tempo sob cada alça; quando uma alça empurra a outra, a seleção desliza mantendo a duração.

## Demo do estado vazio

Uma cena animada em `demo/`, feita com o kit da skill [stageshow](https://github.com/benjitaylor/skills) (React): o dedo arrasta a alça do trecho, toca em Enviar, a folha de compartilhar sobe e chega o toast "Entregue ao WhatsApp". Carrega só no estado vazio e sai da página quando um vídeo é buscado. Notas de filmagem em `demo/REHEARSAL.md`.

```bash
cd demo
npm install
npm run build       # gera static/demo/demo.js, demo.css e kit/stageshow.css
CHROME_PATH=/usr/bin/google-chrome node scripts/film.mjs "http://localhost:8000/" --select "#puxa-demo" --gate
```

A skill está registrada em `skills-lock.json`; para reinstalar: `npx skills add benjitaylor/skills --skill stageshow`.

## Rodar localmente

Requisitos: Python 3.11 ou mais novo, `ffmpeg` no PATH e um runtime de JavaScript (Deno de preferência; Node 20+ ou Bun também servem). O YouTube exige esse runtime para liberar todos os formatos.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Abra http://localhost:8000.

Com Docker:

```bash
docker build -t puxa .
docker run -p 8000:8000 puxa
```

### Modo demonstração

`PUXA_DEMO=1 uvicorn app.main:app --reload`

As informações do vídeo continuam vindo do YouTube, mas o arquivo é gerado no servidor com tom de teste (MP3) ou barras de cor (MP4), com progresso simulado. Serve para mexer na interface, no corte e no envio sem depender do YouTube liberar a mídia. Uma faixa no topo da página avisa quando esse modo está ligado.

## Enviar no WhatsApp

O site entrega o próprio arquivo ao WhatsApp pelo menu de compartilhar do sistema (Web Share API). A pessoa toca em "Enviar no WhatsApp", o menu abre e ela escolhe o WhatsApp e a conversa.

- **Precisa de HTTPS.** Em `http://192.168.x.x` o navegador desliga o compartilhamento de arquivos e o site cai no modo "salvar e anexar". `localhost` conta como seguro, mas o celular não acessa o `localhost` do computador. Para testar no celular, publique o site ou abra um túnel, por exemplo `cloudflared tunnel --url http://localhost:8000`, que gera um endereço https.
- **Funciona** no Chrome do Android e no Safari do iPhone. No desktop depende do sistema; onde não há suporte, o botão vira "Salvar" e aparece o atalho para o WhatsApp Web.
- **O toque vale por pouco tempo.** O navegador só abre o menu logo depois de um toque. Arquivos até 64 MB já são baixados para a memória quando o painel abre, então o envio sai num toque só. Se a preparação demorar (um trecho sendo cortado, um vídeo grande), o site pede um segundo toque com o arquivo pronto.
- **Limite de 16 MB.** Acima disso o WhatsApp pode mandar como documento em vez de áudio ou vídeo. A interface avisa e sugere um trecho menor ou uma qualidade mais baixa.

O corte de MP3 é feito no servidor com `ffmpeg -c copy`: não recodifica, mantém qualidade, capa e título, e leva menos de um segundo.

## Quando o YouTube recusa o download

Os metadados quase sempre chegam, mas o YouTube costuma recusar a mídia (erro 403) para IPs de data center. Na prática:

1. **Rodar em casa** (no seu computador, numa conexão residencial) é o que mais funciona.
2. **Manter o yt-dlp atualizado**: `pip install -U "yt-dlp[default]"` ou reconstruir a imagem Docker. O YouTube muda com frequência.
3. **Cookies**: exporte os cookies de uma conta do YouTube em formato Netscape e aponte `PUXA_COOKIES_FILE` para o arquivo. Use uma conta secundária; o YouTube pode restringir contas usadas assim.
4. **PO token**: o guia "PO Token Guide" da wiki do yt-dlp explica os plugins que geram esse token, que destrava downloads em servidores.

O site mostra essas recusas como mensagens legíveis, nunca como rastro de erro.

## Configuração

| Variável | Padrão | O que faz |
|---|---|---|
| `PUXA_DATA_DIR` | `/tmp/puxa` | Onde os arquivos temporários ficam |
| `PUXA_FILE_TTL` | `1800` | Segundos até um arquivo pronto ser apagado |
| `PUXA_MAX_DURATION` | `10800` | Duração máxima aceita, em segundos |
| `PUXA_MAX_JOBS` | `2` | Downloads simultâneos; os demais esperam na fila |
| `PUXA_INFO_CACHE` | `600` | Segundos de cache das informações de cada vídeo |
| `PUXA_COOKIES_FILE` | vazio | Arquivo de cookies para o yt-dlp |
| `PUXA_DEMO` | desligado | Liga o modo demonstração |

## API

| Rota | Uso |
|---|---|
| `GET /api/info?url=` | Título, canal, duração, capa e opções de qualidade com tamanho estimado |
| `POST /api/jobs` | `{url, format: "mp3"\|"mp4", quality}` inicia o preparo e devolve o pedido |
| `GET /api/jobs/{id}` | Etapa, progresso, velocidade, tempo restante, erro |
| `DELETE /api/jobs/{id}` | Cancela |
| `GET /api/jobs/{id}/file` | O arquivo (`?inline=1` para tocar no navegador, com suporte a Range) |
| `GET /api/jobs/{id}/waveform` | Picos da forma de onda (só MP3) |
| `POST /api/jobs/{id}/clips` | `{start, end}` em segundos corta um trecho (só MP3) |
| `GET /api/jobs/{id}/clips/{clip}/file` | O trecho cortado |

Documentação interativa em `/api/docs`.

Só links do YouTube são aceitos: o servidor extrai o ID do vídeo e monta o endereço canônico, então não dá para usá-lo para buscar URLs arbitrárias. Os IDs dos pedidos são aleatórios e os arquivos expiram.

## Testes

```bash
pip install -r requirements-dev.txt
pytest
```

Os testes não acessam a rede: o download e a consulta ao YouTube são simulados, e o ffmpeg gera áudio de verdade para testar onda e corte.

## Antes de publicar

Os Termos de Serviço do YouTube não permitem baixar conteúdo sem autorização, fora os recursos oficiais. Use para vídeos seus, com licença livre ou com permissão de quem fez. Se for deixar aberto na internet, coloque limite de requisições (no proxy reverso, por exemplo) para o servidor não virar um baixador público.
