# Rehearsal: demo do estado vazio do Puxa

Gold: `phone-touch` (mantido: palco um pouco mais alto que largo, celular preso a um respiro de uma borda e cortado na outra, toque com `style: 'touch'`, curva do iOS `cubic-bezier(0.3, 0.75, 0.1, 1)`, botão com `States`. Mudado: o celular é cortado no topo em vez da base, porque o editor, o botão e a folha de compartilhar moram na metade de baixo; o topo cortado se dissolve sobre preenchimento).

Batidas: 1 o dedo arrasta a alça de início de 0:10 a 0:31 (o tempo segue o dedo; a duração do botão rola um tempo depois, de 0:48 para 0:27) … 2 toque em "Enviar trecho", "Cortando…" … 3 a folha de compartilhar sobe com "Aula 12 (trecho).mp3" e o toque vai em "Turma do violão" … desfecho: a folha desce e chega o toast "Entregue ao WhatsApp", igual ao do site. Loop de cerca de 11 s. O editor volta a 0:10 escondido sob a folha (`act.snap` com escopo `editor`).

Pôster: trecho 0:31 a 0:58, toast à vista, botão "Enviar trecho de 0:27".

Capturado: larguras 374 (palco do desktop) e 390 (`--width 390`, palco compacto de 350), estados por `act.mark`, movimento reduzido (`--reduced --still`).

Gate: `rehearsal passed (necessary, not sufficient: references/verify.md and the fresh eye in review.md still stand)`

Filmagem:
- `uneven gutters` (103 px nos lados, 22 px na base) → o palco era transparente e o detector media contra a seção da página → palco com chão próprio, 374 px de largura e 22 px de respiro nos lados e na base.
- `kit override` em `.ss-phone__*` → falso positivo: o CSS do kit estava empacotado junto com o da cena → kit servido à parte em `/demo/kit/stageshow.css`; o ícone do toast passou a ser um elemento da cena.
- `unclipped` → `overflow: hidden` no palco.
- `jump` da alça a cada 2,2 px durante o arraste → o valor ficou contínuo; só o texto arredonda.
- `uneven padding` no cartão da onda → padding igual em volta.
- `half-pixel glyph` (X de 15 px, spinner) → ícones de 16 px em caixas pares; rótulo com 20 px de altura.
- `lands on a transform` no botão e no contato → `will-change: transform`.
- Faixa vazia entre a onda e o botão → linha "Ouvir trecho", que existe na interface real.
- Texto da folha aparecendo abaixo do celular enquanto ela descia → `overflow: hidden` na tela.
- Fica: `jump` de 45 px da alça em [pick], que é o reset escondido sob a folha; `same-box content change` do tempo da alça, que é leitura ao vivo durante o arraste.

Suposições: o site não tem logo do WhatsApp disponível como asset, então a folha mostra conversas sugeridas sem o selo do app; o toque em "Turma do violão" representa a escolha de uma conversa do WhatsApp.

Não resolvido: nada que o gate aponte.

Não verificado: a revisão de olhos frescos com outro agente (`review.md`); filmagem com `--dark` (o palco tem chão escuro próprio, mas a tela do celular fica clara de propósito); Safari real.
